import jwt from "jsonwebtoken";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { comparePassword, generatePassword, hashPassword } from "@/utils/password";

export const MAX_FAILED_LOGIN_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

// Fallback in-memory tracker for non-existent usernames (mitigates timing enumeration)
const unknownUserFailedAttemptsMap = new Map<string, { count: number; lockedUntil?: Date }>();

export interface LoginResult {
  status: "SUCCESS" | "INVALID_CREDENTIALS" | "LOCKED" | "DEACTIVATED";
  tokens?: {
    accessToken: string;
    refreshToken: string;
  };
  user?: {
    id: string;
    username: string;
    role: Role;
    email: string | null;
    facultyId?: string;
    studentId?: string;
    isHOD?: boolean;
    hodDepartmentId?: string | null;
    hodDepartmentName?: string | null;
  };
  failedAttempts?: number;
  lockoutOptions?: string[];
}

export class AuthService {
  private static getJwtSecret(): string {
    return process.env.JWT_SECRET || "your-32-char-random-jwt-access-secret-here";
  }

  private static getRefreshSecret(): string {
    return process.env.JWT_REFRESH_SECRET || "your-32-char-random-jwt-refresh-secret-here";
  }

  public static async login(username: string, password: string): Promise<LoginResult> {
    const cleanUsername = username.trim();
    const key = cleanUsername.toLowerCase();

    // 1. Check if non-existent username is temporarily throttled in fallback map
    const unknownRecord = unknownUserFailedAttemptsMap.get(key);
    if (unknownRecord?.lockedUntil) {
      if (new Date() < unknownRecord.lockedUntil) {
        return {
          status: "LOCKED",
          lockoutOptions: ["request-password-reset", "wait-24h"],
        };
      } else {
        unknownUserFailedAttemptsMap.delete(key);
      }
    }

    // 2. Query user with DB-backed failedLoginAttempts and lockedUntil
    const user = await prisma.user.findUnique({
      where: { username: cleanUsername },
      include: {
        facultyProfile: {
          include: {
            hodAssignments: {
              include: {
                department: true,
              },
            },
          },
        },
        studentProfile: true,
      },
    });

    // 3. User does not exist -> track via unknownUserFailedAttemptsMap
    if (!user) {
      const currentAttempts = (unknownRecord?.count || 0) + 1;
      if (currentAttempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
        const lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
        unknownUserFailedAttemptsMap.set(key, { count: currentAttempts, lockedUntil });
        return {
          status: "LOCKED",
          lockoutOptions: ["request-password-reset", "wait-24h"],
        };
      }
      unknownUserFailedAttemptsMap.set(key, { count: currentAttempts });
      return { status: "INVALID_CREDENTIALS", failedAttempts: currentAttempts };
    }

    // 4. Check if user account is deactivated
    if (user.isActive === false) {
      return { status: "DEACTIVATED" };
    }

    // 5. User exists -> check DB-backed lockout status
    if (user.lockedUntil) {
      if (new Date() < user.lockedUntil) {
        return {
          status: "LOCKED",
          lockoutOptions: ["request-password-reset", "wait-24h"],
        };
      } else {
        // Lockout window has elapsed: unlock and reset counter
        await prisma.user.update({
          where: { id: user.id },
          data: {
            lockedUntil: null,
            failedLoginAttempts: 0,
          },
        }).catch(() => null);
        user.lockedUntil = null;
        user.failedLoginAttempts = 0;
      }
    }

    // 5. Compare password
    const isMatch = await comparePassword(password, user.passwordHash);
    if (!isMatch) {
      const newAttempts = (user.failedLoginAttempts || 0) + 1;

      if (newAttempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
        const lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);

        await prisma.user.update({
          where: { id: user.id },
          data: {
            failedLoginAttempts: newAttempts,
            lockedUntil,
          },
        }).catch(() => null);

        await prisma.auditLog.create({
          data: {
            entityType: "User",
            entityId: user.id,
            changedByUserId: user.id,
            oldValue: `FAILED_ATTEMPTS_${newAttempts}`,
            newValue: "AUTH_LOCKOUT",
          },
        }).catch(() => null);

        return {
          status: "LOCKED",
          lockoutOptions: ["request-password-reset", "wait-24h"],
        };
      }

      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: newAttempts,
        },
      }).catch(() => null);

      return { status: "INVALID_CREDENTIALS", failedAttempts: newAttempts };
    }

    // 6. Successful authentication -> reset DB failed login attempts and record lastLoginAt
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      },
    }).catch(() => null);
    unknownUserFailedAttemptsMap.delete(key);

    const hodAssignment = user.facultyProfile?.hodAssignments?.[0];
    const isHOD = Boolean(hodAssignment);
    const hodDepartmentId = hodAssignment?.departmentId || null;
    const hodDepartmentName = hodAssignment?.department?.name || null;

    const payload = {
      userId: user.id,
      username: user.username,
      role: user.role,
      facultyId: user.facultyProfile?.id,
      studentId: user.studentProfile?.id,
      isHOD,
      hodDepartmentId,
    };

    const refreshPayload = {
      ...payload,
      tokenVersion: user.tokenVersion || 0,
    };

    const accessToken = jwt.sign(payload, AuthService.getJwtSecret(), { expiresIn: "15m" });
    const refreshToken = jwt.sign(refreshPayload, AuthService.getRefreshSecret(), { expiresIn: "7d" });

    return {
      status: "SUCCESS",
      tokens: { accessToken, refreshToken },
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        email: user.email,
        facultyId: user.facultyProfile?.id,
        studentId: user.studentProfile?.id,
        isHOD,
        hodDepartmentId,
        hodDepartmentName,
      },
    };
  }

  public static async clearLockout(username: string): Promise<void> {
    const cleanUsername = username.trim();
    const key = cleanUsername.toLowerCase();
    unknownUserFailedAttemptsMap.delete(key);

    try {
      await prisma.user.updateMany({
        where: { username: cleanUsername },
        data: {
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });
    } catch {
      // Ignored for resilient cleanup
    }
  }

  public static async clearAllLockouts(): Promise<void> {
    unknownUserFailedAttemptsMap.clear();
    try {
      await prisma.user.updateMany({
        data: {
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });
    } catch {
      // Ignored for resilient cleanup
    }
  }

  public static async refreshAccessToken(
    refreshToken: string
  ): Promise<{ accessToken: string } | null | "DEACTIVATED" | "INVALID_VERSION"> {
    try {
      const payload = jwt.verify(refreshToken, AuthService.getRefreshSecret()) as any;
      if (!payload?.userId) return null;

      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: { id: true, isActive: true, tokenVersion: true },
      });

      if (!user) return null;
      if (!user.isActive) return "DEACTIVATED";
      if ((user.tokenVersion || 0) > (payload.tokenVersion || 0)) {
        return "INVALID_VERSION";
      }

      delete payload.iat;
      delete payload.exp;
      delete payload.tokenVersion;

      const accessToken = jwt.sign(payload, AuthService.getJwtSecret(), { expiresIn: "15m" });
      return { accessToken };
    } catch {
      return null;
    }
  }
}
