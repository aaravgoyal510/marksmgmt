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
    await prisma.user.update({
      where: { id: decoded.userId },
      data: { passwordHash: newHash },
    });

    return NextResponse.json({
      message: "Password reset successfully using 15-minute token",
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
