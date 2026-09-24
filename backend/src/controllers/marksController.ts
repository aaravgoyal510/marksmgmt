import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { totalIA, ScoreComponent, Mark, SlabRange, attendanceScore } from "../services/gradingEngine";

const prisma = new PrismaClient();

// -----------------------------------------------------------------------------
// 0. Get My Assigned Teaching Sections (Faculty Dashboard Dropdown)
// -----------------------------------------------------------------------------
export async function getMyAssignedSections(req: Request, res: Response) {
  const facultyId = req.user?.facultyId;

  if (!facultyId) {
    return res.status(400).json({ error: "User is not linked to a FacultyProfile" });
  }

  const assignedSections = await prisma.subjectOfferingSection.findMany({
    where: { facultyId },
    include: {
      section: {
        include: {
          batch: {
            include: {
              department: true,
            },
          },
        },
      },
      subjectOffering: {
        include: {
          subject: true,
          academicTerm: true,
          gradingPolicy: true,
        },
      },
    },
    orderBy: [
      { subjectOffering: { subject: { code: "asc" } } },
      { section: { name: "asc" } },
    ],
  });

  const formatted = assignedSections.map((sos) => {
    const isPolicyConfirmed = Boolean(sos.subjectOffering.gradingPolicy?.confirmedAt);
    const isLocked = !sos.facultyId || !isPolicyConfirmed;
    const batchLabel = sos.section.batch?.label || "";
    const deptName = sos.section.batch?.department?.name || "";

    return {
      id: sos.id,
      sectionId: sos.sectionId,
      sectionName: sos.section.name,
      batchLabel,
      departmentName: deptName,
      subjectId: sos.subjectOffering.subjectId,
      subjectName: sos.subjectOffering.subject.name,
      subjectCode: sos.subjectOffering.subject.code,
      termLabel: sos.subjectOffering.academicTerm.label,
      isPolicyConfirmed,
      isLocked,
      label: `${sos.subjectOffering.subject.code} - ${sos.subjectOffering.subject.name} (${sos.section.name} - Batch ${batchLabel})`,
    };
  });

  return res.status(200).json({ sections: formatted });
}

// -----------------------------------------------------------------------------
// 1. Get Dynamic Policy Components for a Section
// -----------------------------------------------------------------------------
export async function getSectionComponents(req: Request, res: Response) {
  const sectionId = req.params.id as string;

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
    return res.status(404).json({ error: "Subject offering section not found" });
  }

  const policy = offeringSection.subjectOffering.gradingPolicy;
  if (!policy) {
    return res.status(404).json({ error: "Grading policy not configured for this subject offering" });
  }

  return res.status(200).json({
    sectionId: offeringSection.id,
    subjectName: offeringSection.subjectOffering.subject.name,
    subjectCode: offeringSection.subjectOffering.subject.code,
    sectionName: offeringSection.section.name,
    policy: {
      id: policy.id,
      cesGroupWeightage: policy.cesGroupWeightage,
      internalWeightage: policy.internalWeightage,
      attendanceWeightage: policy.attendanceWeightage,
      totalIAMarks: policy.cesGroupWeightage + policy.internalWeightage + policy.attendanceWeightage,
      isConfirmed: Boolean(policy.confirmedAt),
    },
    components: policy.scoreComponents,
    attendanceSlabs: policy.attendanceSlabRanges,
  });
}

// -----------------------------------------------------------------------------
// 2. Get Marks Grid with Live Computed Total IA
// -----------------------------------------------------------------------------
export async function getSectionMarksGrid(req: Request, res: Response) {
  const sectionId = req.params.id as string;

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
    return res.status(404).json({ error: "Subject offering section not found" });
  }

  const policy = offeringSection.subjectOffering.gradingPolicy;
  if (!policy) {
    return res.status(404).json({ error: "Grading policy not configured for this section" });
  }

  const offeringSem = offeringSection.subjectOffering.academicTerm.semesterNumber;
  const students = offeringSection.section.students.filter((s: any) => {
    const effectiveSem = s.semesterOverride !== null && s.semesterOverride !== undefined
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

  const formattedComponents: ScoreComponent[] = policy.scoreComponents.map((c: any) => ({
    id: c.id,
    group: c.group as "CES" | "INTERNAL",
    name: c.name,
    maxMarks: c.maxMarks,
  }));

  const formattedSlabs: SlabRange[] = policy.attendanceSlabRanges.map((s: any) => ({
    minPercent: s.minPercent,
    maxPercent: s.maxPercent,
    marks: s.marks,
  }));

  const grid = students.map((student: any) => {
    const studentMarks = existingMarks.filter((m: any) => m.studentId === student.id);
    const attRecord = attendanceRecords.find((a: any) => a.studentId === student.id);
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

  return res.status(200).json({
    sectionId,
    components: policy.scoreComponents,
    slabs: policy.attendanceSlabRanges,
    policyWeightages: {
      ces: policy.cesGroupWeightage,
      internal: policy.internalWeightage,
      attendance: policy.attendanceWeightage,
      totalIAMarks: policy.cesGroupWeightage + policy.internalWeightage + policy.attendanceWeightage,
    },
    students: grid,
  });
}

// -----------------------------------------------------------------------------
// 3. Bulk Marks Entry with Audit Logging
// -----------------------------------------------------------------------------
export async function bulkUpsertMarks(req: Request, res: Response) {
  const { sectionId, entries, attendanceEntries } = req.body;

  const hasMarkEntries = Array.isArray(entries) && entries.length > 0;
  const hasAttendanceEntries = Array.isArray(attendanceEntries) && attendanceEntries.length > 0;

  if (!sectionId || (!hasMarkEntries && !hasAttendanceEntries)) {
    return res.status(400).json({ error: "sectionId and at least one mark entry or attendance entry are required" });
  }

  const facultyId = req.user?.facultyId;
  const userId = req.user?.userId;

  if (!facultyId || !userId) {
    return res.status(403).json({ error: "Forbidden: Only faculty can enter marks or attendance" });
  }

  const offeringSection = await prisma.subjectOfferingSection.findUnique({
    where: { id: sectionId },
  });

  if (!offeringSection) {
    return res.status(404).json({ error: "Subject offering section not found" });
  }

  // Strict HOD Instruct-Only Rule Enforcement:
  // Direct mark & attendance edits are restricted to the assigned teaching faculty for this section.
  // An HOD (or any non-assigned faculty) attempting to edit marks or attendance directly is rejected with 403.
  if (offeringSection.facultyId !== facultyId) {
    return res.status(403).json({
      error: "Forbidden: Direct mark entry is restricted to the assigned teaching faculty for this section. HODs can instruct via escalated queries, but cannot edit marks directly.",
      code: "TEACHING_FACULTY_ONLY",
    });
  }

  // Fetch score components for bounds validation
  const components = (await prisma.scoreComponent.findMany({
    where: {
      gradingPolicy: {
        subjectOffering: {
          sections: {
            some: { id: sectionId },
          },
        },
      },
    },
  })) || [];

  const componentMap = new Map(components.map((c) => [c.id, c]));

  // Pre-validate all mark entries before opening database transaction
  if (hasMarkEntries) {
    for (const entry of entries) {
      const { scoreComponentId, studentId, marksObtained } = entry;
      if (!scoreComponentId || !studentId || marksObtained === undefined || typeof marksObtained !== "number") {
        continue;
      }

      const comp = componentMap.get(scoreComponentId);
      if (comp) {
        if (marksObtained < 0 || marksObtained > comp.maxMarks) {
          return res.status(400).json({
            error: `Marks obtained (${marksObtained}) for component ${comp.name} exceeds valid range (0 - ${comp.maxMarks}) for student ${studentId}`,
            code: "MARK_OUT_OF_BOUNDS",
            details: {
              studentId,
              scoreComponentId,
              componentName: comp.name,
              marksObtained,
              minMarks: 0,
              maxMarks: comp.maxMarks,
            },
          });
        }
      }
    }
  }

  // Pre-validate all attendance entries against bounds (0-100) and HOD Slab Ranges (no BLOCKED_SLAB_GAP allowed)
  if (hasAttendanceEntries) {
    const policy = await prisma.gradingPolicy.findFirst({
      where: {
        subjectOffering: {
          sections: {
            some: { id: sectionId },
          },
        },
      },
      include: {
        attendanceSlabRanges: { orderBy: { minPercent: "asc" } },
      },
    });

    const slabRanges: SlabRange[] = policy
      ? policy.attendanceSlabRanges.map((s) => ({ minPercent: s.minPercent, maxPercent: s.maxPercent, marks: s.marks }))
      : [];

    for (const attEntry of attendanceEntries) {
      const { studentId, attendancePercent } = attEntry;
      if (!studentId || attendancePercent === undefined || typeof attendancePercent !== "number") {
        continue;
      }

      if (attendancePercent < 0 || attendancePercent > 100) {
        return res.status(400).json({
          error: `Attendance percentage (${attendancePercent}%) for student ${studentId} must be between 0 and 100`,
          code: "INVALID_ATTENDANCE_PERCENTAGE",
        });
      }

      if (slabRanges.length > 0) {
        const slabMarks = attendanceScore(attendancePercent, slabRanges);
        if (slabMarks === null) {
          return res.status(400).json({
            error: `Attendance percentage (${attendancePercent}%) for student ${studentId} falls into an unmapped attendance slab gap`,
            code: "BLOCKED_SLAB_GAP",
            details: { studentId, attendancePercent },
          });
        }
      }
    }
  }

  const auditLogsToCreate: Array<{ entityType: string; entityId: string; changedByUserId: string; oldValue: string; newValue: string }> = [];

  const transactionResult = await prisma.$transaction(async (tx) => {
    const markResults = [];
    const attendanceResults = [];

    // 1. Process Mark Upserts
    if (hasMarkEntries) {
      for (const entry of entries) {
        const { scoreComponentId, studentId, marksObtained } = entry;

        if (!scoreComponentId || !studentId || marksObtained === undefined || typeof marksObtained !== "number") {
          continue;
        }

        const existingMark = await tx.mark.findUnique({
          where: {
            scoreComponentId_studentId: {
              scoreComponentId,
              studentId,
            },
          },
        });

        const mark = await tx.mark.upsert({
          where: {
            scoreComponentId_studentId: {
              scoreComponentId,
              studentId,
            },
          },
          update: {
            marksObtained,
            updatedByFacultyId: facultyId,
          },
          create: {
            scoreComponentId,
            studentId,
            marksObtained,
            updatedByFacultyId: facultyId,
          },
        });

        if (existingMark && existingMark.marksObtained !== marksObtained) {
          auditLogsToCreate.push({
            entityType: "Mark",
            entityId: mark.id,
            changedByUserId: userId,
            oldValue: existingMark.marksObtained.toString(),
            newValue: marksObtained.toString(),
          });
        } else if (!existingMark) {
          auditLogsToCreate.push({
            entityType: "Mark",
            entityId: mark.id,
            changedByUserId: userId,
            oldValue: "NEW_ENTRY",
            newValue: marksObtained.toString(),
          });
        }

        markResults.push(mark);
      }
    }

    // 2. Process Attendance Record Upserts & Audit Logging
    if (hasAttendanceEntries) {
      for (const attEntry of attendanceEntries) {
        const { studentId, attendancePercent } = attEntry;

        if (!studentId || attendancePercent === undefined || typeof attendancePercent !== "number") {
          continue;
        }

        const existingRecord = await tx.attendanceRecord.findUnique({
          where: {
            subjectOfferingSectionId_studentId: {
              subjectOfferingSectionId: sectionId,
              studentId,
            },
          },
        });

        const record = await tx.attendanceRecord.upsert({
          where: {
            subjectOfferingSectionId_studentId: {
              subjectOfferingSectionId: sectionId,
              studentId,
            },
          },
          update: {
            attendancePercent,
          },
          create: {
            subjectOfferingSectionId: sectionId,
            studentId,
            attendancePercent,
          },
        });

        if (existingRecord && existingRecord.attendancePercent !== attendancePercent) {
          auditLogsToCreate.push({
            entityType: "AttendanceRecord",
            entityId: record.id,
            changedByUserId: userId,
            oldValue: `${existingRecord.attendancePercent}%`,
            newValue: `${attendancePercent}%`,
          });
        } else if (!existingRecord) {
          auditLogsToCreate.push({
            entityType: "AttendanceRecord",
            entityId: record.id,
            changedByUserId: userId,
            oldValue: "NEW_ENTRY",
            newValue: `${attendancePercent}%`,
          });
        }

        attendanceResults.push(record);
      }
    }

    if (auditLogsToCreate.length > 0) {
      await tx.auditLog.createMany({
        data: auditLogsToCreate,
      });
    }

    return { marks: markResults, attendance: attendanceResults };
  });

  return res.status(200).json({
    message: "Marks & attendance saved successfully",
    updatedCount: transactionResult.marks.length + transactionResult.attendance.length,
    auditLogsCreated: auditLogsToCreate.length,
  });
}
