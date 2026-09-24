import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// -----------------------------------------------------------------------------
// 1. Subject Management (HOD)
// -----------------------------------------------------------------------------
export async function createSubject(req: Request, res: Response) {
  const { departmentId, name, code, semesterNumber } = req.body;

  if (!departmentId || !name || !code || !semesterNumber) {
    return res.status(400).json({ error: "departmentId, name, code, and semesterNumber are required" });
  }

  const dept = await prisma.department.findUnique({ where: { id: departmentId as string } });
  if (!dept) {
    return res.status(404).json({ error: "Department not found" });
  }

  if (semesterNumber < 1 || semesterNumber > dept.totalSemesters) {
    return res.status(400).json({
      error: `semesterNumber must be between 1 and ${dept.totalSemesters} for department ${dept.name}`,
    });
  }

  const existingCode = await prisma.subject.findUnique({
    where: {
      departmentId_code: {
        departmentId: departmentId as string,
        code,
      },
    },
  });

  if (existingCode) {
    return res.status(400).json({ error: `Subject code '${code}' already exists in this department` });
  }

  const subject = await prisma.subject.create({
    data: {
      departmentId: departmentId as string,
      name,
      code,
      semesterNumber,
    },
  });

  // Auto-scaffold SubjectOffering & SubjectOfferingSections if batches already exist in this semester
  const batchesInSem = await prisma.batch.findMany({
    where: {
      departmentId: departmentId as string,
      currentSemester: semesterNumber,
    },
    include: { sections: true },
  });

  if (batchesInSem.length > 0) {
    const termLabel = `AY${new Date().getFullYear()}-${(new Date().getFullYear() + 1).toString().slice(-2)}`;
    let academicTerm = await prisma.academicTerm.findFirst({
      where: {
        departmentId: departmentId as string,
        semesterNumber,
        label: termLabel,
      },
    });

    if (!academicTerm) {
      academicTerm = await prisma.academicTerm.create({
        data: {
          departmentId: departmentId as string,
          semesterNumber,
          label: termLabel,
        },
      });
    }

    let offering = await prisma.subjectOffering.findFirst({
      where: {
        subjectId: subject.id,
        academicTermId: academicTerm.id,
      },
    });

    if (!offering) {
      offering = await prisma.subjectOffering.create({
        data: {
          subjectId: subject.id,
          academicTermId: academicTerm.id,
        },
      });
    }

    const allSections = batchesInSem.flatMap((b) => b.sections);
    for (const sec of allSections) {
      await prisma.subjectOfferingSection.upsert({
        where: {
          subjectOfferingId_sectionId: {
            subjectOfferingId: offering.id,
            sectionId: sec.id,
          },
        },
        update: {},
        create: {
          subjectOfferingId: offering.id,
          sectionId: sec.id,
          facultyId: null, // UNASSIGNED
        },
      });
    }
  }

  return res.status(201).json({ message: "Subject created successfully and scaffolded into active semester offerings", subject });
}

export async function listSubjects(req: Request, res: Response) {
  const departmentId = req.query.departmentId as string;

  if (!departmentId) {
    return res.status(400).json({ error: "departmentId query param is required" });
  }

  const subjects = await prisma.subject.findMany({
    where: { departmentId },
    orderBy: [{ semesterNumber: "asc" }, { code: "asc" }],
  });

  return res.status(200).json({ subjects });
}

export async function listDepartmentFaculty(_req: Request, res: Response) {
  const faculty = await prisma.facultyProfile.findMany({
    include: {
      user: {
        select: { email: true, username: true },
      },
      homeDepartment: true,
      hodAssignments: {
        include: { department: true },
      },
    },
    orderBy: { name: "asc" },
  });

  const formatted = faculty.map((f) => ({
    id: f.id,
    name: f.name,
    employeeId: f.employeeId,
    homeDepartmentId: f.homeDepartmentId,
    homeDepartmentName: f.homeDepartment?.name || null,
    isHOD: f.hodAssignments.length > 0,
    hodDepartmentName: f.hodAssignments[0]?.department?.name || null,
  }));

  return res.status(200).json({ faculty: formatted });
}

// -----------------------------------------------------------------------------
// 2. HOD Subject-Term Status Board
// -----------------------------------------------------------------------------
export async function getSubjectOfferingsStatusBoard(req: Request, res: Response) {
  const departmentId = req.query.departmentId as string;
  const termId = req.query.termId as string | undefined;

  if (!departmentId) {
    return res.status(400).json({ error: "departmentId query parameter is required" });
  }

  const whereClause: any = {
    subject: {
      departmentId,
    },
  };

  if (termId) {
    whereClause.academicTermId = termId;
  }

  const offerings = await prisma.subjectOffering.findMany({
    where: whereClause,
    include: {
      subject: true,
      academicTerm: true,
      gradingPolicy: {
        select: {
          id: true,
          confirmedAt: true,
        },
      },
      sections: {
        include: {
          section: {
            include: {
              batch: true,
            },
          },
          faculty: true,
        },
      },
    },
    orderBy: {
      subject: {
        code: "asc",
      },
    },
  });

  const statusBoard = offerings.map((offering: any) => {
    const isPolicyConfirmed = Boolean(offering.gradingPolicy?.confirmedAt);

    const sectionsWithStatus = offering.sections.map((offSection: any) => {
      let status: "UNASSIGNED" | "POLICY_PENDING" | "ACTIVE" = "ACTIVE";

      if (!offSection.facultyId) {
        status = "UNASSIGNED";
      } else if (!isPolicyConfirmed) {
        status = "POLICY_PENDING";
      }

      const sectionLabel = offSection.section.batch?.label
        ? `${offSection.section.name} (Batch ${offSection.section.batch.label})`
        : offSection.section.name;

      return {
        id: offSection.id,
        sectionId: offSection.sectionId,
        sectionName: sectionLabel,
        rawSectionName: offSection.section.name,
        batchLabel: offSection.section.batch?.label || null,
        facultyId: offSection.facultyId,
        facultyName: offSection.faculty?.name ?? null,
        status,
        isLocked: !offSection.facultyId || !isPolicyConfirmed,
      };
    });

    return {
      offeringId: offering.id,
      subjectId: offering.subjectId,
      subjectName: offering.subject.name,
      subjectCode: offering.subject.code,
      semesterNumber: offering.subject.semesterNumber,
      termId: offering.academicTermId,
      termLabel: offering.academicTerm.label,
      isPolicyConfirmed,
      sections: sectionsWithStatus,
    };
  });

  return res.status(200).json({ statusBoard });
}

// -----------------------------------------------------------------------------
// 3. Faculty Assignment to Subject Offering Section
// -----------------------------------------------------------------------------
export async function assignFacultyToSection(req: Request, res: Response) {
  const offeringId = req.params.offeringId as string;
  const sectionId = req.params.sectionId as string;
  const { facultyId } = req.body;

  const offeringSection = await prisma.subjectOfferingSection.findUnique({
    where: {
      subjectOfferingId_sectionId: {
        subjectOfferingId: offeringId,
        sectionId,
      },
    },
    include: {
      subjectOffering: {
        include: {
          subject: true,
        },
      },
    },
  });

  if (!offeringSection) {
    return res.status(404).json({ error: "Subject offering section not found" });
  }

  const targetDeptId = offeringSection.subjectOffering.subject.departmentId;
  const hodAssignment = await prisma.hODAssignment.findFirst({
    where: {
      facultyId: req.user!.facultyId,
      departmentId: targetDeptId,
    },
  });

  if (!hodAssignment) {
    return res.status(403).json({
      error: "Forbidden: You are not authorized as HOD for this subject's department",
      code: "HOD_DEPARTMENT_MISMATCH",
    });
  }

  if (facultyId) {
    const faculty = await prisma.facultyProfile.findUnique({ where: { id: facultyId as string } });
    if (!faculty) {
      return res.status(404).json({ error: "Faculty member not found" });
    }
  }

  const updatedSection = await prisma.subjectOfferingSection.update({
    where: { id: offeringSection.id },
    data: { facultyId: facultyId || null },
    include: {
      faculty: true,
      section: true,
    },
  });

  return res.status(200).json({
    message: facultyId ? "Faculty assigned successfully" : "Faculty unassigned successfully",
    offeringSection: updatedSection,
  });
}

// -----------------------------------------------------------------------------
// 4. HOD Department-Scoped Batch Promotion
// -----------------------------------------------------------------------------
export async function hodPromoteBatch(req: Request, res: Response) {
  const batchId = req.params.batchId as string;

  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    include: { department: true, sections: true },
  });

  if (!batch) {
    return res.status(404).json({ error: "Batch not found" });
  }

  const hodAssignment = await prisma.hODAssignment.findFirst({
    where: {
      facultyId: req.user!.facultyId,
      departmentId: batch.departmentId,
    },
  });

  if (!hodAssignment) {
    return res.status(403).json({
      error: "Forbidden: You are not authorized as HOD for this batch's department",
      code: "HOD_DEPARTMENT_MISMATCH",
    });
  }

  if (batch.currentSemester >= batch.department.totalSemesters) {
    return res.status(400).json({
      error: `Batch has already reached max totalSemesters (${batch.department.totalSemesters})`,
    });
  }

  const nextSem = batch.currentSemester + 1;

  const updatedBatch = await prisma.batch.update({
    where: { id: batchId },
    data: { currentSemester: nextSem },
  });

  const termLabel = `AY${new Date().getFullYear()}-${(new Date().getFullYear() + 1).toString().slice(-2)}`;
  let term = await prisma.academicTerm.findFirst({
    where: {
      departmentId: batch.departmentId,
      semesterNumber: nextSem,
      label: termLabel,
    },
  });

  if (!term) {
    term = await prisma.academicTerm.create({
      data: {
        departmentId: batch.departmentId,
        semesterNumber: nextSem,
        label: termLabel,
      },
    });
  }

  const subjects = await prisma.subject.findMany({
    where: {
      departmentId: batch.departmentId,
      semesterNumber: nextSem,
    },
  });

  for (const sub of subjects) {
    let offering = await prisma.subjectOffering.findFirst({
      where: {
        subjectId: sub.id,
        academicTermId: term.id,
      },
    });

    if (!offering) {
      offering = await prisma.subjectOffering.create({
        data: {
          subjectId: sub.id,
          academicTermId: term.id,
        },
      });
    }

    for (const sec of batch.sections) {
      await prisma.subjectOfferingSection.upsert({
        where: {
          subjectOfferingId_sectionId: {
            subjectOfferingId: offering.id,
            sectionId: sec.id,
          },
        },
        update: {},
        create: {
          subjectOfferingId: offering.id,
          sectionId: sec.id,
          facultyId: null,
        },
      });
    }
  }

  return res.status(200).json({
    message: `Batch promoted to Semester ${nextSem}`,
    batch: updatedBatch,
    academicTerm: term,
  });
}
