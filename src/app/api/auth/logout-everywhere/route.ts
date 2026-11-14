import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = verifyAuth(req);
  if (!auth.ok) {
    return auth.error;
  }

  const userId = auth.user.userId;

  try {
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        tokenVersion: { increment: 1 },
      },
      select: {
        id: true,
        username: true,
        tokenVersion: true,
      },
    });

    try {
      await prisma.auditLog.create({
        data: {
          entityType: "User",
          entityId: userId,
          changedByUserId: userId,
          oldValue: "SESSION_ACTIVE",
          newValue: `LOGOUT_EVERYWHERE:tokenVersion=${updatedUser.tokenVersion}`,
        },
      });
    } catch {
      // Non-blocking audit log
    }

    const isProd = process.env.NODE_ENV === "production";
    const res = NextResponse.json({
      message: "Logged out from all devices successfully. All active refresh tokens revoked.",
      tokenVersion: updatedUser.tokenVersion,
    });

    res.cookies.set("refreshToken", "", {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? "strict" : "lax",
      maxAge: 0,
      path: "/",
    });

    res.cookies.set("accessToken", "", {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? "strict" : "lax",
      maxAge: 0,
      path: "/",
    });

    return res;
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to process logout everywhere" },
      { status: 500 }
    );
  }
}

