import { Request, Response } from "express";
import { PrismaClient, Role } from "@prisma/client";
import { AuthService } from "../services/authService";
import ExcelJS from "exceljs";
import { generatePassword, hashPassword } from "../utils/password";

const prisma = new PrismaClient();

// In-memory store for generated plain passwords for credential exports
const credentialStore = new Map<string, { username: string; name: string; passwordPlain: string }>();

// -----------------------------------------------------------------------------
// Department Management
// -----------------------------------------------------------------------------
export async function createDepartment(req: Request, res: Response) {
  const { name, totalSemesters } = req.body;
  if (!name || !totalSemesters || typeof totalSemesters !== "number") {
    return res.status(400).json({ error: "Name and numeric totalSemesters are required" });
  }

  const department = await prisma.department.create({
    data: {
      name,
      totalSemesters,
    },
  });

  return res.status(201).json({ message: "Department created successfully", department });
}

export async function listDepartments(_req: Request, res: Response) {
  const departments = await prisma.department.findMany({
    include: {
      hodAssignment: {
        include: {
          faculty: true,
        },
      },
      batches: true,
    },
  });
  return res.status(200).json({ departments });
}

// -----------------------------------------------------------------------------
// Batch Management & Whole-Batch Promotion
// -----------------------------------------------------------------------------
export async function createBatch(req: Request, res: Response) {
  const { departmentId, label, startYear } = req.body;
  if (!departmentId || !label || !startYear) {
    return res.status(400).json({ error: "departmentId, label, and startYear are required" });
  }

  const department = await prisma.department.findUnique({ where: { id: departmentId as string } });
  if (!department) {
    return res.status(404).json({ error: "Department not found" });
  }

  const batch = await prisma.batch.create({
    data: {
      departmentId,
      label,
      startYear,
      currentSemester: 1,
    },
  });

  // Create default Section "A" for the new batch
  const defaultSection = await prisma.section.create({
    data: {
      batchId: batch.id,
      name: "A",
    },
  });

  // Auto-scaffold Semester 1 SubjectOfferingSections if Semester 1 subjects already exist
  const termLabel = `AY${new Date().getFullYear()}-${(new Date().getFullYear() + 1).toString().slice(-2)}`;
  let academicTerm = await prisma.academicTerm.findFirst({
    where: {
      departmentId,
      semesterNumber: 1,
      label: termLabel,
    },
  });

  if (!academicTerm) {
    academicTerm = await prisma.academicTerm.create({
      data: {
        departmentId,
        semesterNumber: 1,
        label: termLabel,
      },
    });
  }

  const sem1Subjects = await prisma.subject.findMany({
    where: {
      departmentId,
      semesterNumber: 1,
    },
  });

  for (const sub of sem1Subjects) {
    let offering = await prisma.subjectOffering.findFirst({
      where: {
        subjectId: sub.id,
        academicTermId: academicTerm.id,
      },
    });

    if (!offering) {
      offering = await prisma.subjectOffering.create({
        data: {
          subjectId: sub.id,
          academicTermId: academicTerm.id,
        },
      });
    }

    await prisma.subjectOfferingSection.upsert({
      where: {
        subjectOfferingId_sectionId: {
          subjectOfferingId: offering.id,
          sectionId: defaultSection.id,
        },
      },
      update: {},
      create: {
        subjectOfferingId: offering.id,
        sectionId: defaultSection.id,
        facultyId: null, // UNASSIGNED
      },
    });
  }

  return res.status(201).json({ message: "Batch created successfully", batch });
}

export async function promoteBatch(req: Request, res: Response) {
  const batchId = req.params.id as string;

  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    include: { department: true, sections: true },
  });

  if (!batch) {
    return res.status(404).json({ error: "Batch not found" });
  }

  if (batch.currentSemester >= batch.department.totalSemesters) {
    return res.status(400).json({
      error: `Batch has already reached the maximum totalSemesters (${batch.department.totalSemesters}) for ${batch.department.name}`,
    });
  }

  const newSemester = batch.currentSemester + 1;

  // Update batch currentSemester
  const updatedBatch = await prisma.batch.update({
    where: { id: batchId },
    data: { currentSemester: newSemester },
  });

  // Auto-create or reuse AcademicTerm for this department + newSemester
  const termLabel = `AY${new Date().getFullYear()}-${(new Date().getFullYear() + 1).toString().slice(-2)}`;
  
  let academicTerm = await prisma.academicTerm.findFirst({
    where: {
      departmentId: batch.departmentId,
      semesterNumber: newSemester,
      label: termLabel,
    },
  });

  if (!academicTerm) {
    academicTerm = await prisma.academicTerm.create({
      data: {
        departmentId: batch.departmentId,
        semesterNumber: newSemester,
        label: termLabel,
      },
    });
  }

  // Auto-scaffold SubjectOfferings for all Subjects in this department matching newSemester
  const subjects = await prisma.subject.findMany({
    where: {
      departmentId: batch.departmentId,
      semesterNumber: newSemester,
    },
  });

  for (const subject of subjects) {
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

    // Scaffold sections for this batch
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
          facultyId: null, // initially unassigned
        },
      });
    }
  }

  return res.status(200).json({
    message: `Batch promoted to Semester ${newSemester} successfully`,
    batch: updatedBatch,
  });
}

export async function createSectionForBatch(req: Request, res: Response) {
  const batchId = req.params.id as string;
  const { name } = req.body;

  if (!name || typeof name !== "string") {
    return res.status(400).json({ error: "Section name is required" });
  }

  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    include: { department: true },
  });

  if (!batch) {
    return res.status(404).json({ error: "Batch not found" });
  }

  // Create new section for batch
  const section = await prisma.section.create({
    data: {
      batchId,
      name: name.trim(),
    },
  });

  // Auto-scaffold SubjectOfferingSection rows for subjects in current semester
  const termLabel = `AY${new Date().getFullYear()}-${(new Date().getFullYear() + 1).toString().slice(-2)}`;
  let academicTerm = await prisma.academicTerm.findFirst({
    where: {
      departmentId: batch.departmentId,
      semesterNumber: batch.currentSemester,
      label: termLabel,
    },
  });

  if (!academicTerm) {
    academicTerm = await prisma.academicTerm.create({
      data: {
        departmentId: batch.departmentId,
        semesterNumber: batch.currentSemester,
        label: termLabel,
      },
    });
  }

  const subjects = await prisma.subject.findMany({
    where: {
      departmentId: batch.departmentId,
      semesterNumber: batch.currentSemester,
    },
  });

  for (const sub of subjects) {
    let offering = await prisma.subjectOffering.findFirst({
      where: {
        subjectId: sub.id,
        academicTermId: academicTerm.id,
      },
    });

    if (!offering) {
      offering = await prisma.subjectOffering.create({
        data: {
          subjectId: sub.id,
          academicTermId: academicTerm.id,
        },
      });
    }

    await prisma.subjectOfferingSection.upsert({
      where: {
        subjectOfferingId_sectionId: {
          subjectOfferingId: offering.id,
          sectionId: section.id,
        },
      },
      update: {},
      create: {
        subjectOfferingId: offering.id,
        sectionId: section.id,
        facultyId: null, // UNASSIGNED
      },
    });
  }

  return res.status(201).json({
    message: `Section "${section.name}" created for batch "${batch.label}" and scaffolded into current semester subjects`,
    section,
  });
}

// -----------------------------------------------------------------------------
// Faculty Directory & Onboarding
// -----------------------------------------------------------------------------
export async function listFaculty(_req: Request, res: Response) {
  const faculty = await prisma.facultyProfile.findMany({
    include: {
      user: {
        select: {
          email: true,
          username: true,
        },
      },
      homeDepartment: true,
      hodAssignments: {
        include: {
          department: true,
        },
      },
    },
    orderBy: { name: "asc" },
  });

  const formatted = faculty.map((f) => ({
    id: f.id,
    name: f.name,
    employeeId: f.employeeId,
    email: f.user.email,
    homeDepartmentId: f.homeDepartmentId,
    homeDepartmentName: f.homeDepartment?.name || "N/A",
    isHOD: f.hodAssignments.length > 0,
    hodDepartmentId: f.hodAssignments[0]?.departmentId || null,
    hodDepartmentName: f.hodAssignments[0]?.department?.name || null,
  }));

  return res.status(200).json({ faculty: formatted });
}

export async function onboardFaculty(req: Request, res: Response) {
  const { name, employeeId, email, isHOD, hodDepartmentId } = req.body;

  if (!name || !employeeId) {
    return res.status(400).json({ error: "Name and employeeId are required" });
  }

  const existingUser = await prisma.user.findUnique({ where: { username: employeeId } });
  if (existingUser) {
    return res.status(400).json({ error: `User with Employee ID ${employeeId} already exists` });
  }

  const passwordPlain = generatePassword(10);
  const passwordHash = await hashPassword(passwordPlain);

  const user = await prisma.user.create({
    data: {
      username: employeeId,
      passwordHash,
      role: Role.FACULTY,
      email: email || `${employeeId.toLowerCase()}@bvimr.edu.in`,
    },
  });

  const facultyProfile = await prisma.facultyProfile.create({
    data: {
      userId: user.id,
      name,
      employeeId,
    },
  });

  if (isHOD && hodDepartmentId) {
    await prisma.hODAssignment.upsert({
      where: { departmentId: hodDepartmentId },
      update: { facultyId: facultyProfile.id },
      create: {
        facultyId: facultyProfile.id,
        departmentId: hodDepartmentId,
      },
    });
  }

  credentialStore.set(user.id, {
    username: user.username,
    name,
    passwordPlain,
  });

  return res.status(201).json({
    message: "Faculty onboarded successfully",
    faculty: facultyProfile,
    credentials: {
      username: user.username,
      passwordPlain,
    },
  });
}

export async function assignFacultyHOD(req: Request, res: Response) {
  const facultyId = req.params.id as string;
  const { departmentId } = req.body;

  const faculty = await prisma.facultyProfile.findUnique({ where: { id: facultyId } });
  if (!faculty) {
    return res.status(404).json({ error: "Faculty member not found" });
  }

  if (departmentId) {
    const dept = await prisma.department.findUnique({ where: { id: departmentId } });
    if (!dept) {
      return res.status(404).json({ error: "Department not found" });
    }

    // Explicit Replacement Logic: remove existing HOD for department if present
    await prisma.hODAssignment.upsert({
      where: { departmentId },
      update: { facultyId },
      create: {
        facultyId,
        departmentId,
      },
    });

    return res.status(200).json({
      message: `Faculty ${faculty.name} successfully assigned as HOD of ${dept.name}`,
    });
  } else {
    // Remove HOD assignment
    await prisma.hODAssignment.deleteMany({
      where: { facultyId },
    });

    return res.status(200).json({
      message: `HOD status removed for faculty ${faculty.name}`,
    });
  }
}

export async function downloadFacultyCredentials(req: Request, res: Response) {
  const facultyId = req.params.id as string;
  const faculty = await prisma.facultyProfile.findUnique({ where: { id: facultyId }, include: { user: true } });

  if (!faculty) {
    return res.status(404).json({ error: "Faculty member not found" });
  }

  const stored = credentialStore.get(faculty.userId);
  const passwordPlain = stored?.passwordPlain || "(Password reset required)";

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Faculty Credentials");

  worksheet.columns = [
    { header: "Faculty Name", key: "name", width: 25 },
    { header: "Employee ID (Username)", key: "username", width: 25 },
    { header: "Initial Password", key: "passwordPlain", width: 25 },
  ];

  worksheet.addRow({
    name: faculty.name,
    username: faculty.employeeId,
    passwordPlain,
  });

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader(
    "Content-Disposition",
    `attachment; filename=Credentials_${faculty.employeeId}.xlsx`
  );

  await workbook.xlsx.write(res);
  return res.end();
}

// -----------------------------------------------------------------------------
// Student Directory & Repeater Semester Overrides
// -----------------------------------------------------------------------------
export async function listStudents(_req: Request, res: Response) {
  const students = await prisma.studentProfile.findMany({
    include: {
      batch: {
        include: {
          department: true,
        },
      },
      section: true,
    },
    orderBy: { erpNo: "asc" },
  });

  const formatted = students.map((s) => {
    const effectiveSemester = s.semesterOverride !== null ? s.semesterOverride : s.batch.currentSemester;

    return {
      id: s.id,
      name: s.name,
      erpNo: s.erpNo,
      prn: s.prn,
      batchId: s.batchId,
      batchLabel: s.batch.label,
      departmentId: s.batch.departmentId,
      departmentName: s.batch.department.name,
      sectionId: s.sectionId,
      sectionName: s.section.name,
      batchDefaultSemester: s.batch.currentSemester,
      semesterOverride: s.semesterOverride,
      effectiveSemester,
      maxSemesters: s.batch.department.totalSemesters,
    };
  });

  return res.status(200).json({ students: formatted });
}

export async function setStudentSemesterOverride(req: Request, res: Response) {
  const studentId = req.params.id as string;
  const { semesterOverride } = req.body;

  const student = await prisma.studentProfile.findUnique({
    where: { id: studentId },
    include: { batch: { include: { department: true } } },
  });

  if (!student) {
    return res.status(404).json({ error: "Student not found" });
  }

  if (semesterOverride !== null && semesterOverride !== undefined) {
    if (
      typeof semesterOverride !== "number" ||
      semesterOverride < 1 ||
      semesterOverride > student.batch.department.totalSemesters
    ) {
      return res.status(400).json({
        error: `semesterOverride must be between 1 and ${student.batch.department.totalSemesters} for department ${student.batch.department.name}`,
      });
    }
  }

  const updatedStudent = await prisma.studentProfile.update({
    where: { id: studentId },
    data: {
      semesterOverride: semesterOverride !== undefined ? semesterOverride : null,
    },
  });

  const message =
    updatedStudent.semesterOverride !== null
      ? `Semester override set to Semester ${updatedStudent.semesterOverride} for student ${student.name}`
      : `Semester override cleared for student ${student.name} (reverted to Batch default Semester ${student.batch.currentSemester})`;

  return res.status(200).json({ message, student: updatedStudent });
}

export async function forceResetPassword(req: Request, res: Response) {
  const userId = req.params.id as string;
  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  const newPasswordPlain = generatePassword(10);
  const newPasswordHash = await hashPassword(newPasswordPlain);

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: newPasswordHash },
  });

  AuthService.clearLockout(user.username);

  // Security AuditLog for admin password force reset event
  await prisma.auditLog.create({
    data: {
      entityType: "User",
      entityId: user.id,
      changedByUserId: req.user!.userId,
      oldValue: "ACTIVE",
      newValue: "FORCE_PASSWORD_RESET",
    },
  });

  credentialStore.set(user.id, {
    username: user.username,
    name: user.username,
    passwordPlain: newPasswordPlain,
  });

  return res.status(200).json({
    message: `Password reset successfully for user ${user.username}`,
    credentials: {
      username: user.username,
      passwordPlain: newPasswordPlain,
    },
  });
}
