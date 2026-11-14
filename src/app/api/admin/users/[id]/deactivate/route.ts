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
      include: {
        facultyProfile: {
          include: {
            hodAssignments: true,
            subjectOfferingSections: true,
          },
        },
        studentProfile: true,
      },
    });

    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (targetUser.isActive === false) {
      return NextResponse.json(
        { error: "User is already deactivated", code: "ALREADY_DEACTIVATED" },
        { status: 400 }
      );
    }

    // Safety checks for faculty members
    if (targetUser.facultyProfile) {
      // 1. Sitting HOD block
      if (targetUser.facultyProfile.hodAssignments && targetUser.facultyProfile.hodAssignments.length > 0) {
        return NextResponse.json(
          {
            error:
              "Cannot deactivate sitting Head of Department. Please reassign the HOD role before deactivating this account.",
            code: "FACULTY_IS_HOD",
          },
          { status: 400 }
        );
      }

      // 2. Active section assignments block
      if (
        targetUser.facultyProfile.subjectOfferingSections &&
        targetUser.facultyProfile.subjectOfferingSections.length > 0
      ) {
        return NextResponse.json(
          {
            error:
              "Cannot deactivate faculty with active section assignments. Please reassign their sections before deactivating this account.",
            code: "FACULTY_HAS_ACTIVE_SECTIONS",
            assignedSectionsCount: targetUser.facultyProfile.subjectOfferingSections.length,
          },
          { status: 400 }
        );
      }
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        isActive: false,
        deactivatedAt: new Date(),
        tokenVersion: { increment: 1 },
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
        oldValue: "ACTIVE",
        newValue: "DEACTIVATED",
      },
    });

    return NextResponse.json(
      {
        message: "User account deactivated successfully",
        user: updated,
      },
      { status: 200 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to deactivate user" },
      { status: 500 }
    );
  }
}
