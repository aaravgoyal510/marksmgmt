import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/utils/password";

export async function POST(req: NextRequest) {
  try {
    const { token, newPassword } = await req.json().catch(() => ({}));
    if (!token || !newPassword) {
      return NextResponse.json(
        { error: "Token and newPassword are required" },
        { status: 400 }
      );
    }

    let decoded: any;
    try {
      decoded = jwt.verify(
        token,
        process.env.JWT_SECRET || "your-32-char-random-jwt-access-secret-here"
      );
    } catch {
      return NextResponse.json(
        { error: "Invalid or expired password reset token (tokens expire after 15 minutes)" },
        { status: 401 }
      );
    }

    if (decoded?.purpose !== "PASSWORD_RESET") {
      return NextResponse.json(
        { error: "Invalid password reset token" },
        { status: 400 }
      );
    }

    const newHash = await hashPassword(newPassword);
    const updatedUser = await prisma.user.update({
      where: { id: decoded.userId },
      data: { passwordHash: newHash },
    });

    // Clear any active lockout state for this user
    if (updatedUser?.username) {
      const { AuthService } = await import("@/services/authService");
      AuthService.clearLockout(updatedUser.username);
    }

    return NextResponse.json({
      message: "Password reset successfully. You can now sign in with your new password.",
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
