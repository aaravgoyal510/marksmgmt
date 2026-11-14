import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyAuth, verifyHOD } from "@/lib/auth/guards";
import {
  totalIA,
  ScoreComponent,
  Mark,
  SlabRange,
} from "@/services/gradingEngine";

export const dynamic = "force-dynamic";

function calculateMedian(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 !== 0) {
    return sorted[mid];
  }
  return Number(((sorted[mid - 1] + sorted[mid]) / 2).toFixed(2));
}

function calculateStdDev(numbers: number[], mean: number): number {
  if (numbers.length <= 1) return 0;
  const variance =
    numbers.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
    numbers.length;
  return Number(Math.sqrt(variance).toFixed(2));
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = verifyAuth(req);
  if (!auth.ok) {
    return auth.error;
  }

  // Role Guard per Amendment: Assigned faculty and HOD only. No Admin. Test both denials.
  if (auth.user.role === Role.ADMIN) {
    return NextResponse.json(
      { error: "Forbidden: Admin does not have access to section analytics" },
      { status: 403 }
    );
  }

  if (auth.user.role !== Role.FACULTY) {
    return NextResponse.json(
      { error: "Forbidden: Only faculty and HOD have access to section analytics" },
      { status: 403 }
    );
  }

  const sectionOfferingId = params.id;

  try {
    const offeringSection = await prisma.subjectOfferingSection.findUnique({
      where: { id: sectionOfferingId },
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

    const deptId = offeringSection.subjectOffering.subject.departmentId;
    const isAssigned = offeringSection.facultyId === auth.user.facultyId;
    const hodCheck = await verifyHOD(auth.user, deptId);
    const isHOD = hodCheck.ok;

    if (!isAssigned && !isHOD) {
      return NextResponse.json(
        {
          error: "Forbidden: You are neither the assigned faculty nor the HOD for this department",
          code: "SECTION_ACCESS_DENIED",
        },
        { status: 403 }
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
        subjectOfferingSectionId: sectionOfferingId,
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

    const totalIAMax =
      policy.cesGroupWeightage +
      policy.internalWeightage +
      policy.attendanceWeightage;

    // Configurable thresholds with defaults (policy attendanceShortfallPercent takes precedence unless explicitly overridden via query param)
    const { searchParams } = new URL(req.url);
    const passThreshold = parseFloat(searchParams.get("passThreshold") || "40");
    const queryAttendanceThreshold = searchParams.get("attendanceThreshold");
    const attendanceThreshold = queryAttendanceThreshold !== null
      ? parseFloat(queryAttendanceThreshold)
      : (policy.attendanceShortfallPercent ?? 75);

    const scores: number[] = [];
    const shortfallStudents: Array<{
      studentId: string;
      name: string;
      erpNo: string;
      attendancePercent: number;
    }> = [];

    const gradeBands = {
      "0-39": 0,
      "40-49": 0,
      "50-59": 0,
      "60-74": 0,
      "75+": 0,
    };

    let passCount = 0;

    for (const student of students) {
      const sMarks = existingMarks.filter((m: any) => m.studentId === student.id);
      const attRecord = attendanceRecords.find((a: any) => a.studentId === student.id);
      const attendancePercent = attRecord ? attRecord.attendancePercent : 0;

      if (attendancePercent < attendanceThreshold) {
        shortfallStudents.push({
          studentId: student.id,
          name: student.name,
          erpNo: student.erpNo,
          attendancePercent,
        });
      }

      const engineMarks: Mark[] = sMarks.map((m: any) => ({
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

      const finalTotal = computed.totalIA ?? 0;
      scores.push(finalTotal);

      // Normalized percentage for grade bands and pass threshold
      const scorePercent = totalIAMax > 0 ? (finalTotal / totalIAMax) * 100 : finalTotal;

      if (scorePercent >= passThreshold) {
        passCount++;
      }

      if (scorePercent < 40) {
        gradeBands["0-39"]++;
      } else if (scorePercent < 50) {
        gradeBands["40-49"]++;
      } else if (scorePercent < 60) {
        gradeBands["50-59"]++;
      } else if (scorePercent < 75) {
        gradeBands["60-74"]++;
      } else {
        gradeBands["75+"]++;
      }
    }

    const totalStudents = students.length;
    const mean =
      totalStudents > 0
        ? Number((scores.reduce((a, b) => a + b, 0) / totalStudents).toFixed(2))
        : 0;
    const median = calculateMedian(scores);
    const stdDev = calculateStdDev(scores, mean);
    const passRate =
      totalStudents > 0
        ? Number(((passCount / totalStudents) * 100).toFixed(2))
        : 0;

    return NextResponse.json({
      sectionId: sectionOfferingId,
      sectionName: offeringSection.section.name,
      subjectName: offeringSection.subjectOffering.subject.name,
      subjectCode: offeringSection.subjectOffering.subject.code,
      totalStudents,
      totalIAMax,
      mean,
      median,
      stdDev,
      passThreshold,
      passRate,
      passCount,
      gradeBands,
      attendanceThreshold,
      attendanceShortfallCount: shortfallStudents.length,
      attendanceShortfallList: shortfallStudents,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to generate section analytics" },
      { status: 500 }
    );
  }
}

