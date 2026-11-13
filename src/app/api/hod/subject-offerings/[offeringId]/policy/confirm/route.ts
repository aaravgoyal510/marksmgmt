import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyAuth, verifyHOD } from "@/lib/auth/guards";
import { validateSlabs } from "@/services/gradingEngine";

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
            attendanceSlabRanges: true,
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

    const slabValidation = validateSlabs(
      offering.gradingPolicy.attendanceSlabRanges,
      offering.gradingPolicy.attendanceWeightage
    );
    if (!slabValidation.valid) {
      return NextResponse.json(
        {
          error: "Invalid attendance slab ranges",
          details: slabValidation.errors,
        },
        { status: 400 }
      );
    }

    const confirmedPolicy = await prisma.gradingPolicy.update({
      where: { id: offering.gradingPolicy.id },
      data: {
        confirmedAt: new Date(),
        confirmedByFacultyId: auth.user.facultyId,
      },
      include: {
        scoreComponents: true,
        attendanceSlabRanges: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        entityType: "GradingPolicy",
        entityId: confirmedPolicy.id,
        changedByUserId: auth.user.userId,
        oldValue: "UNCONFIRMED",
        newValue: "CONFIRMED",
      },
    });

    return NextResponse.json(
      {
        message: "Grading policy confirmed. Marks entry is now unlocked for faculty.",
        policy: confirmedPolicy,
      },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to confirm grading policy" },
      { status: 500 }
    );
  }
}
