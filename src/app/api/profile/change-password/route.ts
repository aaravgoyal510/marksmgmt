import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth/guards";
import { comparePassword, hashPassword } from "@/utils/password";

export async function POST(req: NextRequest) {
  try {
    const auth = verifyAuth(req);
    if (!auth.ok) {
      return auth.error;
    }

    const userId = auth.user.userId;
    const body = await req.json().catch(() => ({}));
    const { currentPassword, newPassword } = body;

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: "currentPassword and newPassword are required" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const isMatch = await comparePassword(currentPassword, user.passwordHash);
    if (!isMatch) {
      return NextResponse.json(
        { error: "Incorrect current password" },
        { status: 400 }
      );
    }

    const newHash = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash },
    });

    // Security AuditLog for password change event
    await prisma.auditLog.create({
      data: {
        entityType: "User",
        entityId: userId,
        changedByUserId: userId,
        oldValue: "ACTIVE",
        newValue: "PASSWORD_CHANGED",
      },
    });

    return NextResponse.json({ message: "Password changed successfully" });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
