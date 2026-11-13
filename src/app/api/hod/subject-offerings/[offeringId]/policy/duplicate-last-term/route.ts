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
    const currentOffering = await prisma.subjectOffering.findUnique({
      where: { id: offeringId },
      include: { subject: true },
    });

    if (!currentOffering) {
      return NextResponse.json(
        { error: "Subject offering not found" },
        { status: 404 }
      );
    }

    const hodCheck = await verifyHOD(auth.user, currentOffering.subject.departmentId);
    if (!hodCheck.ok) {
      return hodCheck.error;
    }

    const previousOffering = await prisma.subjectOffering.findFirst({
      where: {
        subjectId: currentOffering.subjectId,
        id: { not: offeringId },
        gradingPolicy: {
          confirmedAt: { not: null },
        },
      },
      orderBy: {
        academicTerm: { createdAt: "desc" },
      },
      include: {
        gradingPolicy: {
          include: {
            scoreComponents: true,
            attendanceSlabRanges: true,
          },
        },
      },
    });

    if (!previousOffering || !previousOffering.gradingPolicy) {
      return NextResponse.json(
        {
          error: "No previous term grading policy found to duplicate",
        },
        { status: 404 }
      );
    }

    const prevPolicy = previousOffering.gradingPolicy;

    const newPolicy = await prisma.$transaction(async (tx) => {
      const existing = await tx.gradingPolicy.findUnique({
        where: { subjectOfferingId: offeringId },
      });
      if (existing) {
        await tx.scoreComponent.deleteMany({
          where: { gradingPolicyId: existing.id },
        });
        await tx.attendanceSlabRange.deleteMany({
          where: { gradingPolicyId: existing.id },
        });
        await tx.gradingPolicy.delete({ where: { id: existing.id } });
      }

      return tx.gradingPolicy.create({
        data: {
          subjectOfferingId: offeringId,
          cesGroupWeightage: prevPolicy.cesGroupWeightage,
          internalWeightage: prevPolicy.internalWeightage,
          attendanceWeightage: prevPolicy.attendanceWeightage,
          confirmedAt: null,
          scoreComponents: {
            create: prevPolicy.scoreComponents.map((c: any) => ({
              group: c.group,
              name: c.name,
              maxMarks: c.maxMarks,
              order: c.order,
            })),
          },
          attendanceSlabRanges: {
            create: prevPolicy.attendanceSlabRanges.map((s: any) => ({
              minPercent: s.minPercent,
              maxPercent: s.maxPercent,
              marks: s.marks,
            })),
          },
        },
        include: {
          scoreComponents: true,
          attendanceSlabRanges: true,
        },
      });
    });

    const totalIAMarks =
      newPolicy.cesGroupWeightage +
      newPolicy.internalWeightage +
      newPolicy.attendanceWeightage;

    return NextResponse.json(
      {
        message: "Policy duplicated successfully from previous term",
        policy: newPolicy,
        totalIAMarks,
      },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to duplicate policy from previous term" },
      { status: 500 }
    );
  }
}
