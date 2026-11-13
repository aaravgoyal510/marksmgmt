import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth/guards";
import { generatePassword, hashPassword } from "@/utils/password";
import { AuthService } from "@/services/authService";
import { credentialStore } from "@/lib/credentialStore";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = verifyAuth(req, [Role.ADMIN]);
  if (!auth.ok) {
    return auth.error;
  }

  const userId = params.id;

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const newPasswordPlain = generatePassword(10);
    const newPasswordHash = await hashPassword(newPasswordPlain);

    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newPasswordHash },
    });

    AuthService.clearLockout(user.username);

    // Security AuditLog for admin password force reset event
    await prisma.auditLog.create({
      data: {
        entityType: "User",
        entityId: user.id,
        changedByUserId: auth.user.userId,
        oldValue: "ACTIVE",
        newValue: "FORCE_PASSWORD_RESET",
      },
    });

    credentialStore.set(user.id, {
      username: user.username,
      name: user.username,
      passwordPlain: newPasswordPlain,
    });

    return NextResponse.json(
      {
        message: `Password reset successfully for user ${user.username}`,
        credentials: {
          username: user.username,
          passwordPlain: newPasswordPlain,
        },
      },
      { status: 200 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to force reset password" },
      { status: 500 }
    );
  }
}
