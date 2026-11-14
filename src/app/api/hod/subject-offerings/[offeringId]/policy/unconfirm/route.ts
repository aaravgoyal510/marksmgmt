import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyAuth, verifyHOD } from "@/lib/auth/guards";

export async function POST(
  req: NextRequest,
  { params }: { params: { offeringId: string } }
) {
  const auth = verifyAuth(req, [Role.FACULTY]);
  if (!auth.ok) {
    return auth.error;
  }

  const { offeringId } = params;

  try {
    const offering = await prisma.subjectOffering.findUnique({
      where: { id: offeringId },
      include: {
        subject: true,
        gradingPolicy: {
          include: {
            scoreComponents: true,
          },
        },
        sections: {
          select: {
            id: true,
            faculty: {
              select: {
                userId: true,
              },
            },
          },
        },
      },
    });

    if (!offering || !offering.gradingPolicy) {
      return NextResponse.json(
        { error: "Grading policy not found for this offering" },
        { status: 404 }
      );
    }

    const hodCheck = await verifyHOD(auth.user, offering.subject.departmentId);
    if (!hodCheck.ok) {
      return hodCheck.error;
    }

    // Check if any marks or attendance records exist for any section of this offering
    const componentIds = offering.gradingPolicy.scoreComponents.map((c) => c.id);
    const sectionIds = offering.sections.map((s) => s.id);

    const [marksCount, attendanceCount] = await Promise.all([
      componentIds.length > 0
        ? prisma.mark.count({
            where: {
              scoreComponentId: { in: componentIds },
            },
          })
        : 0,
      sectionIds.length > 0
        ? prisma.attendanceRecord.count({
            where: {
              subjectOfferingSectionId: { in: sectionIds },
            },
          })
        : 0,
    ]);

    if (marksCount > 0 || attendanceCount > 0) {
      return NextResponse.json(
        {
          error:
            "Cannot unconfirm policy: Marks or attendance records have already been entered by faculty. Clear records first.",
          code: "CANNOT_UNCONFIRM_MARKS_EXIST",
        },
        { status: 400 }
      );
    }

    const unconfirmedPolicy = await prisma.gradingPolicy.update({
      where: { id: offering.gradingPolicy.id },
      data: {
        confirmedAt: null,
        confirmedByFacultyId: null,
      },
      include: {
        scoreComponents: true,
        attendanceSlabRanges: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        entityType: "GradingPolicy",
        entityId: unconfirmedPolicy.id,
        changedByUserId: auth.user.userId,
        oldValue: "CONFIRMED",
        newValue: "UNCONFIRMED",
      },
    });

    // Notify assigned faculty members that policy was unlocked
    try {
      const facultyUserIds = Array.from(
        new Set(
          offering.sections
            .map((s: any) => s.faculty?.userId)
            .filter(Boolean) as string[]
        )
      );

      if (facultyUserIds.length > 0) {
        await prisma.notification.createMany({
          data: facultyUserIds.map((uId) => ({
            userId: uId,
            type: "OFFERING_UNLOCKED",
            message: `Grading policy unlocked for ${offering.subject.name} (${offering.subject.code}) by HOD. Marks entry is temporarily locked.`,
            link: "/faculty",
          })),
        });
      }
    } catch (notifErr) {
      console.error("Failed to notify faculty of unconfirmed policy:", notifErr);
    }

    return NextResponse.json(
      {
        message: "Policy unconfirmed successfully",
        policy: unconfirmedPolicy,
      },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to unconfirm grading policy" },
      { status: 500 }
    );
  }
}
