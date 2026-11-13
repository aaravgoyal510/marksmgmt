import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json().catch(() => ({}));
    if (!email) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findFirst({ where: { email } });
    let resetToken: string | null = null;
    if (user) {
      resetToken = jwt.sign(
        { userId: user.id, purpose: "PASSWORD_RESET" },
        process.env.JWT_SECRET || "your-32-char-random-jwt-access-secret-here",
        { expiresIn: "15m" }
      );
    }

    return NextResponse.json({
      message: "Password reset link sent to registered email if account exists.",
      ...(process.env.NODE_ENV !== "production" && resetToken ? { resetToken } : {}),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
