import { describe, it, expect, vi, beforeEach } from "vitest";
import { generatePassword } from "@/utils/password";
import { AuthService, MAX_FAILED_LOGIN_ATTEMPTS } from "@/services/authService";
import { prisma } from "@/lib/prisma";
import * as passwordUtil from "@/utils/password";

vi.mock("@/lib/prisma", () => {
  return {
    prisma: {
      user: {
        findUnique: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({}),
      },
    },
  };
});

describe("Auth & Lockout Security Logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    AuthService.clearAllLockouts();
  });

  it("generatePassword should create passwords excluding ambiguous characters (0/O, 1/l/I)", () => {
    const ambiguousChars = ["0", "O", "1", "l", "I"];

    for (let i = 0; i < 50; i++) {
      const pwd = generatePassword(12);
      expect(pwd).toHaveLength(12);
      for (const char of ambiguousChars) {
        expect(pwd.includes(char)).toBe(false);
      }
    }
  });

  it(`should trigger HTTP 423 lockout on ${MAX_FAILED_LOGIN_ATTEMPTS} consecutive failed login attempts for unknown users`, async () => {
    (prisma.user.findUnique as any).mockResolvedValue(null); // simulate invalid user

    const username = "unknown_lockout_user";

    // Attempts 1 to MAX_FAILED_LOGIN_ATTEMPTS - 1
    for (let i = 1; i < MAX_FAILED_LOGIN_ATTEMPTS; i++) {
      const res = await AuthService.login(username, "wrongpass");
      expect(res.status).toBe("INVALID_CREDENTIALS");
      expect(res.failedAttempts).toBe(i);
    }

    // Attempt MAX_FAILED_LOGIN_ATTEMPTS triggers lockout
    const finalAttempt = await AuthService.login(username, "wrongpass");
    expect(finalAttempt.status).toBe("LOCKED");
    expect(finalAttempt.lockoutOptions).toEqual(["request-password-reset", "wait-24h"]);

    // Subsequent attempt while locked remains LOCKED
    const subsequentAttempt = await AuthService.login(username, "wrongpass");
    expect(subsequentAttempt.status).toBe("LOCKED");

    // Clean up
    await AuthService.clearLockout(username);
  });

  it("updates DB failedLoginAttempts and locks user with lockedUntil when wrong password entered for existing user", async () => {
    vi.spyOn(passwordUtil, "comparePassword").mockResolvedValue(false);

    const mockDbUser = {
      id: "u-1",
      username: "faculty_user",
      passwordHash: "somehash",
      role: "FACULTY",
      failedLoginAttempts: 4, // 4 prior failures
      lockedUntil: null,
    };

    (prisma.user.findUnique as any).mockResolvedValue(mockDbUser);

    const res = await AuthService.login("faculty_user", "wrongpassword");

    expect(res.status).toBe("LOCKED");
    expect(res.lockoutOptions).toEqual(["request-password-reset", "wait-24h"]);

    // Verify DB update set failedLoginAttempts: 5 and lockedUntil
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "u-1" },
        data: expect.objectContaining({
          failedLoginAttempts: 5,
          lockedUntil: expect.any(Date),
        }),
      })
    );

    // Verify AUTH_LOCKOUT audit log
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entityType: "User",
          entityId: "u-1",
          newValue: "AUTH_LOCKOUT",
        }),
      })
    );
  });

  it("resets failedLoginAttempts to 0 and clears lockedUntil on successful login", async () => {
    vi.spyOn(passwordUtil, "comparePassword").mockResolvedValue(true);

    const mockDbUser = {
      id: "u-2",
      username: "recovering_user",
      passwordHash: "correcthash",
      role: "FACULTY",
      failedLoginAttempts: 3,
      lockedUntil: null,
    };

    (prisma.user.findUnique as any).mockResolvedValue(mockDbUser);

    const res = await AuthService.login("recovering_user", "correctpassword");

    expect(res.status).toBe("SUCCESS");
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "u-2" },
        data: expect.objectContaining({
          failedLoginAttempts: 0,
          lockedUntil: null,
          lastLoginAt: expect.any(Date),
        }),
      })
    );
  });
});
