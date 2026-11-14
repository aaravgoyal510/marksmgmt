import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth/guards";

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
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (targetUser.isActive === true) {
      return NextResponse.json(
        { error: "User is already active", code: "ALREADY_ACTIVE" },
        { status: 400 }
      );
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        isActive: true,
        deactivatedAt: null,
      },
      select: {
        id: true,
        username: true,
        role: true,
        isActive: true,
        deactivatedAt: true,
      },
    });

    // Write audit log
    await prisma.auditLog.create({
      data: {
        entityType: "User",
        entityId: targetUser.id,
        changedByUserId: auth.user.userId,
        oldValue: "DEACTIVATED",
        newValue: "REACTIVATED",
      },
    });

    return NextResponse.json(
      {
        message: "User account reactivated successfully",
        user: updated,
      },
      { status: 200 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to reactivate user" },
      { status: 500 }
    );
  }
}
