import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth/guards";
import {
  totalIA,
  ScoreComponent,
  Mark,
  SlabRange,
} from "@/services/gradingEngine";

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
        section: {
          include: {
            students: {
              include: {
                batch: true,
              },
              orderBy: { erpNo: "asc" },
            },
          },
        },
        subjectOffering: {
          include: {
            subject: true,
            academicTerm: true,
            gradingPolicy: {
              include: {
                scoreComponents: { orderBy: { order: "asc" } },
                attendanceSlabRanges: { orderBy: { minPercent: "asc" } },
              },
            },
          },
        },
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
        { error: "Grading policy not configured for this section" },
        { status: 404 }
      );
    }

    const offeringSem =
      offeringSection.subjectOffering.academicTerm.semesterNumber;
    const students = offeringSection.section.students.filter((s: any) => {
      const effectiveSem =
        s.semesterOverride !== null && s.semesterOverride !== undefined
          ? s.semesterOverride
          : s.batch?.currentSemester;
      if (effectiveSem !== undefined) {
        return effectiveSem === offeringSem;
      }
      return true;
    });
    const studentIds = students.map((s: any) => s.id);

    const existingMarks = await prisma.mark.findMany({
      where: {
        studentId: { in: studentIds },
        scoreComponentId: { in: policy.scoreComponents.map((c: any) => c.id) },
      },
    });

    const attendanceRecords = await prisma.attendanceRecord.findMany({
      where: {
        subjectOfferingSectionId: sectionId,
        studentId: { in: studentIds },
      },
    });

    const formattedComponents: ScoreComponent[] = policy.scoreComponents.map(
      (c: any) => ({
        id: c.id,
        group: c.group as "CES" | "INTERNAL",
        name: c.name,
        maxMarks: c.maxMarks,
      })
    );

    const formattedSlabs: SlabRange[] = policy.attendanceSlabRanges.map(
      (s: any) => ({
        minPercent: s.minPercent,
        maxPercent: s.maxPercent,
        marks: s.marks,
      })
    );

    const grid = students.map((student: any) => {
      const studentMarks = existingMarks.filter(
        (m: any) => m.studentId === student.id
      );
      const attRecord = attendanceRecords.find(
        (a: any) => a.studentId === student.id
      );
      const attendancePercent = attRecord ? attRecord.attendancePercent : 0;

      const engineMarks: Mark[] = studentMarks.map((m: any) => ({
        scoreComponentId: m.scoreComponentId,
        marksObtained: m.marksObtained,
      }));

      const computed = totalIA(
        formattedComponents,
        engineMarks,
        policy.cesGroupWeightage,
        policy.internalWeightage,
        attendancePercent,
        formattedSlabs
      );

      const marksMap: Record<string, number> = {};
      for (const m of studentMarks) {
        marksMap[m.scoreComponentId] = m.marksObtained;
      }

      return {
        studentId: student.id,
        name: student.name,
        erpNo: student.erpNo,
        prn: student.prn,
        marks: marksMap,
        attendancePercent,
        computedScores: {
          cesScore: computed.cesScore,
          internalScore: computed.internalScore,
          attendanceScore: computed.attendanceScore,
          totalIA: computed.totalIA,
        },
      };
    });

    return NextResponse.json(
      {
        sectionId,
        isPublished: Boolean(offeringSection.marksPublishedAt),
        marksPublishedAt: offeringSection.marksPublishedAt,
        subjectName: offeringSection.subjectOffering.subject.name,
        subjectCode: offeringSection.subjectOffering.subject.code,
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
        slabs: policy.attendanceSlabRanges,
        policyWeightages: {
          ces: policy.cesGroupWeightage,
          internal: policy.internalWeightage,
          attendance: policy.attendanceWeightage,
          totalIAMarks:
            policy.cesGroupWeightage +
            policy.internalWeightage +
            policy.attendanceWeightage,
        },
        students: grid,
      },
      { status: 200 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to fetch section marks" },
      { status: 500 }
    );
  }
}
