import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth/guards";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = verifyAuth(req, [Role.FACULTY]);
  if (!auth.ok) {
    return auth.error;
  }

  const sectionId = params.id;

  try {
    const offeringSection = await prisma.subjectOfferingSection.findUnique({
      where: { id: sectionId },
      include: {
        subjectOffering: {
          include: {
            subject: true,
            gradingPolicy: {
              include: {
                scoreComponents: { orderBy: { order: "asc" } },
                attendanceSlabRanges: { orderBy: { minPercent: "asc" } },
              },
            },
          },
        },
        section: true,
      },
    });

    if (!offeringSection) {
      return NextResponse.json(
        { error: "Subject offering section not found" },
        { status: 404 }
      );
    }

    const policy = offeringSection.subjectOffering.gradingPolicy;
    if (!policy) {
      return NextResponse.json(
        { error: "Grading policy not configured for this subject offering" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        sectionId: offeringSection.id,
        subjectName: offeringSection.subjectOffering.subject.name,
        subjectCode: offeringSection.subjectOffering.subject.code,
        sectionName: offeringSection.section.name,
        policy: {
          id: policy.id,
          cesGroupWeightage: policy.cesGroupWeightage,
          internalWeightage: policy.internalWeightage,
          attendanceWeightage: policy.attendanceWeightage,
          totalIAMarks:
            policy.cesGroupWeightage +
            policy.internalWeightage +
            policy.attendanceWeightage,
          isConfirmed: Boolean(policy.confirmedAt),
        },
        components: policy.scoreComponents,
        attendanceSlabs: policy.attendanceSlabRanges,
      },
      { status: 200 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to fetch section components" },
      { status: 500 }
    );
  }
}
