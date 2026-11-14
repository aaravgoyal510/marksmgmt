import { NextRequest, NextResponse } from "next/server";
import { Role, ScoreGroup } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyAuth, verifyHOD } from "@/lib/auth/guards";
import { validateSlabs } from "@/services/gradingEngine";

export async function GET(
  req: NextRequest,
  { params }: { params: { offeringId: string } }
) {
  const auth = verifyAuth(req, [Role.FACULTY]);
  if (!auth.ok) {
    return auth.error;
  }

  const { offeringId } = params;

  try {
    const policy = await prisma.gradingPolicy.findUnique({
      where: { subjectOfferingId: offeringId },
      include: {
        scoreComponents: { orderBy: { order: "asc" } },
        attendanceSlabRanges: { orderBy: { minPercent: "asc" } },
      },
    });

    if (!policy) {
      return NextResponse.json(
        { error: "Grading policy not configured" },
        { status: 404 }
      );
    }

    const totalIAMarks =
      policy.cesGroupWeightage + policy.internalWeightage + policy.attendanceWeightage;

    return NextResponse.json({ policy, totalIAMarks }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to fetch grading policy" },
      { status: 500 }
    );
  }
}

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
    const body = await req.json();
    const {
      cesGroupWeightage,
      internalWeightage,
      attendanceWeightage,
      attendanceShortfallPercent,
      scoreComponents,
      attendanceSlabRanges,
    } = body;

    if (
      cesGroupWeightage === undefined ||
      internalWeightage === undefined ||
      attendanceWeightage === undefined ||
      !Array.isArray(scoreComponents) ||
      !Array.isArray(attendanceSlabRanges)
    ) {
      return NextResponse.json(
        {
          error:
            "cesGroupWeightage, internalWeightage, attendanceWeightage, scoreComponents array, and attendanceSlabRanges array are required",
        },
        { status: 400 }
      );
    }

    const offering = await prisma.subjectOffering.findUnique({
      where: { id: offeringId },
      include: { subject: true },
    });

    if (!offering) {
      return NextResponse.json(
        { error: "Subject offering not found" },
        { status: 404 }
      );
    }

    const hodCheck = await verifyHOD(auth.user, offering.subject.departmentId);
    if (!hodCheck.ok) {
      return hodCheck.error;
    }

    const existingPolicyCheck = await prisma.gradingPolicy.findUnique({
      where: { subjectOfferingId: offeringId },
    });

    if (existingPolicyCheck && existingPolicyCheck.confirmedAt !== null) {
      return NextResponse.json(
        {
          error: "Grading policy is confirmed and locked. You must unlock/un-confirm the policy before modifying it.",
          code: "POLICY_LOCKED",
        },
        { status: 400 }
      );
    }

    const slabValidation = validateSlabs(attendanceSlabRanges, attendanceWeightage);
    if (!slabValidation.valid) {
      return NextResponse.json(
        {
          error: "Invalid attendance slab ranges",
          details: slabValidation.errors,
        },
        { status: 400 }
      );
    }

    const calculatedTotalIA =
      cesGroupWeightage + internalWeightage + attendanceWeightage;

    const result = await prisma.$transaction(async (tx) => {
      const existingPolicy = await tx.gradingPolicy.findUnique({
        where: { subjectOfferingId: offeringId },
      });

      if (existingPolicy) {
        await tx.scoreComponent.deleteMany({
          where: { gradingPolicyId: existingPolicy.id },
        });
        await tx.attendanceSlabRange.deleteMany({
          where: { gradingPolicyId: existingPolicy.id },
        });
      }

      const policy = await tx.gradingPolicy.upsert({
        where: { subjectOfferingId: offeringId },
        update: {
          cesGroupWeightage,
          internalWeightage,
          attendanceWeightage,
          attendanceShortfallPercent:
            attendanceShortfallPercent !== undefined ? attendanceShortfallPercent : null,
          confirmedAt: null,
          confirmedByFacultyId: null,
        },
        create: {
          subjectOfferingId: offeringId,
          cesGroupWeightage,
          internalWeightage,
          attendanceWeightage,
          attendanceShortfallPercent:
            attendanceShortfallPercent !== undefined ? attendanceShortfallPercent : null,
          confirmedAt: null,
        },
      });

      const createdComponents = await Promise.all(
        scoreComponents.map(
          (comp: { group: ScoreGroup; name: string; maxMarks: number; order: number }) =>
            tx.scoreComponent.create({
              data: {
                gradingPolicyId: policy.id,
                group: comp.group,
                name: comp.name,
                maxMarks: comp.maxMarks,
                order: comp.order,
              },
            })
        )
      );

      const createdSlabs = await Promise.all(
        attendanceSlabRanges.map(
          (slab: { minPercent: number; maxPercent: number; marks: number }) =>
            tx.attendanceSlabRange.create({
              data: {
                gradingPolicyId: policy.id,
                minPercent: slab.minPercent,
                maxPercent: slab.maxPercent,
                marks: slab.marks,
              },
            })
        )
      );

      return { policy, components: createdComponents, slabs: createdSlabs };
    });

    return NextResponse.json(
      {
        message: "Grading policy configured successfully",
        policy: result.policy,
        totalIAMarks: calculatedTotalIA,
        components: result.components,
        slabs: result.slabs,
      },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to configure grading policy" },
      { status: 500 }
    );
  }
}
