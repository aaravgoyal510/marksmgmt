import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { prisma } from "@/lib/prisma";
import { EmailService } from "@/services/emailService";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { email, username } = await req.json().catch(() => ({}));
    const queryTerm = (email || username || "").toString().trim();

    if (!queryTerm) {
      return NextResponse.json(
        { error: "Email or username is required" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: queryTerm },
          { username: queryTerm },
        ],
      },
    });

    let resetToken: string | null = null;
    let resetLink: string | null = null;

    if (user && user.email) {
      resetToken = jwt.sign(
        { userId: user.id, purpose: "PASSWORD_RESET" },
        process.env.JWT_SECRET || "your-32-char-random-jwt-access-secret-here",
        { expiresIn: "15m" }
      );

      const origin = req.nextUrl?.origin || "http://localhost:3000";
      resetLink = `${origin}/reset-password?token=${encodeURIComponent(resetToken)}`;

      // Dispatch transactional email via Resend (fails gracefully if unconfigured)
      await EmailService.sendPasswordResetEmail(user.email, resetLink);
    }

    // Generic non-enumerating security message
    return NextResponse.json({
      message: "If an account with that email or username exists, a password reset link has been dispatched to its registered email.",
      ...(process.env.NODE_ENV !== "production" && resetToken ? { resetToken, resetLink } : {}),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
