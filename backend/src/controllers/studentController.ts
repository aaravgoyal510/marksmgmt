import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { totalIA, ScoreComponent, Mark, SlabRange } from "../services/gradingEngine";

const prisma = new PrismaClient();

// -----------------------------------------------------------------------------
// Get Student's Current Semester Subjects View (Stacked Single Page)
// -----------------------------------------------------------------------------
export async function getStudentSemesterView(req: Request, res: Response) {
  const userId = req.user?.userId;

  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

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
    return res.status(404).json({ error: "Student profile not found" });
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
    return res.status(200).json({
      student: {
        id: studentProfile.id,
        name: studentProfile.name,
        erpNo: studentProfile.erpNo,
        prn: studentProfile.prn,
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
        subjectId: offering.subject.id,
        subjectName: offering.subject.name,
        subjectCode: offering.subject.code,
        facultyName: offeringSection?.faculty?.name ?? "Unassigned",
        status: "POLICY_PENDING",
        components: [],
        computed: null,
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
      status: policy.confirmedAt ? "PUBLISHED" : "UNCONFIRMED",
      policyWeightages: {
        ces: policy.cesGroupWeightage,
        internal: policy.internalWeightage,
        attendance: policy.attendanceWeightage,
        totalIAMarks: policy.cesGroupWeightage + policy.internalWeightage + policy.attendanceWeightage,
      },
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

  return res.status(200).json({
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
