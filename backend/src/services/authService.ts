import jwt from "jsonwebtoken";
import { PrismaClient, Role } from "@prisma/client";
import { comparePassword, generatePassword, hashPassword } from "../utils/password";

const prisma = new PrismaClient();

export const MAX_FAILED_LOGIN_ATTEMPTS = 10;

// In-memory failed attempts tracker (can be backed by DB/Redis)
const failedAttemptsMap = new Map<string, { count: number; lockedUntil?: Date }>();

export interface LoginResult {
  status: "SUCCESS" | "INVALID_CREDENTIALS" | "LOCKED";
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
    const key = username.toLowerCase().trim();
    const attempts = failedAttemptsMap.get(key);

    if (attempts?.lockedUntil) {
      if (new Date() < attempts.lockedUntil) {
        return {
          status: "LOCKED",
          lockoutOptions: ["request-password-reset", "wait-24h"],
        };
      } else {
        // Lockout expired
        failedAttemptsMap.delete(key);
      }
    }

    const user = await prisma.user.findUnique({
      where: { username },
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

    if (!user) {
      const currentAttempts = AuthService.recordFailedAttempt(key);
      if (currentAttempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
        const lockedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
        failedAttemptsMap.set(key, { count: currentAttempts, lockedUntil });
        return {
          status: "LOCKED",
          lockoutOptions: ["request-password-reset", "wait-24h"],
        };
      }
      return { status: "INVALID_CREDENTIALS", failedAttempts: currentAttempts };
    }

    const isMatch = await comparePassword(password, user.passwordHash);
    if (!isMatch) {
      const currentAttempts = AuthService.recordFailedAttempt(key);
      if (currentAttempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
        // Lock out for 24 hours
        const lockedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
        failedAttemptsMap.set(key, { count: currentAttempts, lockedUntil });
        await prisma.auditLog.create({
          data: {
            entityType: "User",
            entityId: user.id,
            changedByUserId: user.id,
            oldValue: "FAILED_ATTEMPTS",
            newValue: "AUTH_LOCKOUT",
          },
        }).catch(() => null);
        return {
          status: "LOCKED",
          lockoutOptions: ["request-password-reset", "wait-24h"],
        };
      }
      return { status: "INVALID_CREDENTIALS", failedAttempts: currentAttempts };
    }

    // Reset failed attempts on success
    failedAttemptsMap.delete(key);

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

    const accessToken = jwt.sign(payload, AuthService.getJwtSecret(), { expiresIn: "15m" });
    const refreshToken = jwt.sign(payload, AuthService.getRefreshSecret(), { expiresIn: "7d" });

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

  private static recordFailedAttempt(key: string): number {
    const record = failedAttemptsMap.get(key) || { count: 0 };
    record.count += 1;
    failedAttemptsMap.set(key, record);
    return record.count;
  }

  public static clearLockout(username: string): void {
    failedAttemptsMap.delete(username.toLowerCase().trim());
  }

  public static clearAllLockouts(): void {
    failedAttemptsMap.clear();
  }

  public static refreshAccessToken(refreshToken: string): string | null {
    try {
      const payload = jwt.verify(refreshToken, AuthService.getRefreshSecret()) as any;
      delete payload.iat;
      delete payload.exp;
      return jwt.sign(payload, AuthService.getJwtSecret(), { expiresIn: "15m" });
    } catch {
      return null;
    }
  }
}
