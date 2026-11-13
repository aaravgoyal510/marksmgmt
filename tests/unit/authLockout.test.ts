import { describe, it, expect, vi } from "vitest";
import { generatePassword } from "@/utils/password";
import { AuthService } from "@/services/authService";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/prisma", () => {
  return {
    prisma: {
      user: {
        findUnique: vi.fn(),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({}),
      },
    },
  };
});

describe("Auth & Lockout Security Logic", () => {
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

  it("should trigger HTTP 423 lockout on 10 consecutive failed login attempts", async () => {
    (prisma.user.findUnique as any).mockResolvedValue(null); // simulate invalid user

    const username = "testuser_lockout";

    // First 9 failed attempts
    for (let i = 1; i <= 9; i++) {
      const res = await AuthService.login(username, "wrongpass");
      expect(res.status).toBe("INVALID_CREDENTIALS");
      expect(res.failedAttempts).toBe(i);
    }

    // 10th failed attempt triggers lockout
    const tenthAttempt = await AuthService.login(username, "wrongpass");
    expect(tenthAttempt.status).toBe("LOCKED");
    expect(tenthAttempt.lockoutOptions).toEqual(["request-password-reset", "wait-24h"]);

    // Subsequent 11th attempt while locked remains LOCKED
    const eleventhAttempt = await AuthService.login(username, "wrongpass");
    expect(eleventhAttempt.status).toBe("LOCKED");

    // Clean up
    AuthService.clearLockout(username);
  });
});
