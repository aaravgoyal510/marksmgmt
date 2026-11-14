import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth/guards";
import { totalIA, ScoreComponent, Mark, SlabRange } from "@/services/gradingEngine";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = verifyAuth(req, [Role.STUDENT]);
  if (!auth.ok) {
    return auth.error;
  }

  const userId = auth.user.userId;

  const studentProfile = await prisma.studentProfile.findUnique({
    where: { userId },
    include: {
      batch: {
        include: {
          department: true,
        },
      },
      section: true,
    },
  });

  if (!studentProfile) {
    return NextResponse.json(
      { error: "Student profile not found" },
      { status: 404 }
    );
  }

  // Determine effective current semester (handle semesterOverride if present)
  const currentSem = studentProfile.semesterOverride ?? studentProfile.batch.currentSemester;

  // Find active AcademicTerm for this department and semester
  const academicTerm = await prisma.academicTerm.findFirst({
    where: {
      departmentId: studentProfile.batch.departmentId,
      semesterNumber: currentSem,
    },
    orderBy: { createdAt: "desc" },
  });

  if (!academicTerm) {
    return NextResponse.json({
      student: {
        id: studentProfile.id,
        name: studentProfile.name,
        erpNo: studentProfile.erpNo,
        prn: studentProfile.prn,
        departmentName: studentProfile.batch.department.name,
        batchLabel: studentProfile.batch.label,
        sectionName: studentProfile.section.name,
        currentSemester: currentSem,
      },
      subjects: [],
    });
  }

  // Find all SubjectOfferings for this term
  const offerings = await prisma.subjectOffering.findMany({
    where: {
      academicTermId: academicTerm.id,
    },
    include: {
      subject: true,
      gradingPolicy: {
        include: {
          scoreComponents: { orderBy: { order: "asc" } },
          attendanceSlabRanges: { orderBy: { minPercent: "asc" } },
        },
      },
      sections: {
        where: { sectionId: studentProfile.sectionId },
        include: {
          faculty: true,
        },
      },
    },
    orderBy: {
      subject: { code: "asc" },
    },
  });

  const subjectBreakdowns = [];

  for (const offering of offerings) {
    const offeringSection = offering.sections[0]; // Student's section assignment
    const policy = offering.gradingPolicy;

    if (!policy) {
      // Policy not configured yet
      subjectBreakdowns.push({
        offeringId: offering.id,
        offeringSectionId: offeringSection?.id ?? null,
        subjectId: offering.subject.id,
        subjectName: offering.subject.name,
        subjectCode: offering.subject.code,
        facultyName: offeringSection?.faculty?.name ?? "Unassigned",
        status: "POLICY_PENDING",
        isPublished: false,
        marksPublishedAt: null,
        components: [],
        attendancePercent: null,
        computedScores: null,
      });
      continue;
    }

    const isPublished = Boolean(offeringSection?.marksPublishedAt);

    if (!isPublished) {
      // Unpublished section: marks and attendance are hidden from students
      subjectBreakdowns.push({
        offeringId: offering.id,
        offeringSectionId: offeringSection?.id ?? null,
        subjectId: offering.subject.id,
        subjectName: offering.subject.name,
        subjectCode: offering.subject.code,
        facultyName: offeringSection?.faculty?.name ?? "Unassigned",
        status: "NOT_YET_PUBLISHED",
        isPublished: false,
        marksPublishedAt: null,
        policyWeightages: {
          ces: policy.cesGroupWeightage,
          internal: policy.internalWeightage,
          attendance: policy.attendanceWeightage,
          attendanceShortfallPercent: policy.attendanceShortfallPercent ?? 75,
          totalIAMarks:
            policy.cesGroupWeightage +
            policy.internalWeightage +
            policy.attendanceWeightage,
        },
        attendanceSlabs: policy.attendanceSlabRanges.map((s) => ({
          minPercent: s.minPercent,
          maxPercent: s.maxPercent,
          marks: s.marks,
        })),
        components: policy.scoreComponents.map((c) => ({
          id: c.id,
          name: c.name,
          group: c.group,
          maxMarks: c.maxMarks,
          marksObtained: null,
        })),
        attendancePercent: null,
        computedScores: null,
      });
      continue;
    }

    // Fetch student's marks for this policy's components
    const componentIds = policy.scoreComponents.map((c) => c.id);
    const studentMarks = await prisma.mark.findMany({
      where: {
        studentId: studentProfile.id,
        scoreComponentId: { in: componentIds },
      },
    });

    // Fetch student's attendance record
    const attendanceRecord = offeringSection
      ? await prisma.attendanceRecord.findUnique({
          where: {
            subjectOfferingSectionId_studentId: {
              subjectOfferingSectionId: offeringSection.id,
              studentId: studentProfile.id,
            },
          },
        })
      : null;

    const attendancePercent = attendanceRecord?.attendancePercent ?? 0;

    const formattedComponents: ScoreComponent[] = policy.scoreComponents.map((c) => ({
      id: c.id,
      group: c.group as "CES" | "INTERNAL",
      name: c.name,
      maxMarks: c.maxMarks,
    }));

    const formattedSlabs: SlabRange[] = policy.attendanceSlabRanges.map((s) => ({
      minPercent: s.minPercent,
      maxPercent: s.maxPercent,
      marks: s.marks,
    }));

    const engineMarks: Mark[] = studentMarks.map((m) => ({
      scoreComponentId: m.scoreComponentId,
      marksObtained: m.marksObtained,
    }));

    // Compute live scores using pure grading engine
    const computed = totalIA(
      formattedComponents,
      engineMarks,
      policy.cesGroupWeightage,
      policy.internalWeightage,
      attendancePercent,
      formattedSlabs
    );

    const componentDetails = policy.scoreComponents.map((c) => {
      const mark = studentMarks.find((m) => m.scoreComponentId === c.id);
      return {
        id: c.id,
        name: c.name,
        group: c.group,
        maxMarks: c.maxMarks,
        marksObtained: mark?.marksObtained ?? null,
      };
    });

    subjectBreakdowns.push({
      offeringId: offering.id,
      offeringSectionId: offeringSection?.id ?? null,
      subjectId: offering.subject.id,
      subjectName: offering.subject.name,
      subjectCode: offering.subject.code,
      facultyName: offeringSection?.faculty?.name ?? "Unassigned",
      status: "PUBLISHED",
      isPublished: true,
      marksPublishedAt: offeringSection?.marksPublishedAt ?? null,
      policyWeightages: {
        ces: policy.cesGroupWeightage,
        internal: policy.internalWeightage,
        attendance: policy.attendanceWeightage,
        attendanceShortfallPercent: policy.attendanceShortfallPercent ?? 75,
        totalIAMarks: policy.cesGroupWeightage + policy.internalWeightage + policy.attendanceWeightage,
      },
      attendanceSlabs: policy.attendanceSlabRanges.map((s) => ({
        minPercent: s.minPercent,
        maxPercent: s.maxPercent,
        marks: s.marks,
      })),
      components: componentDetails,
      attendancePercent,
      computedScores: {
        cesScore: computed.cesScore,
        internalScore: computed.internalScore,
        attendanceScore: computed.attendanceScore,
        totalIA: computed.totalIA,
      },
    });
  }

  return NextResponse.json({
    student: {
      id: studentProfile.id,
      name: studentProfile.name,
      erpNo: studentProfile.erpNo,
      prn: studentProfile.prn,
      departmentName: studentProfile.batch.department.name,
      batchLabel: studentProfile.batch.label,
      sectionName: studentProfile.section.name,
      currentSemester: currentSem,
    },
    termLabel: academicTerm.label,
    subjects: subjectBreakdowns,
  });
}
