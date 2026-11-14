import { PrismaClient, Role, ScoreGroup } from "@prisma/client";
import bcrypt from "bcrypt";
import crypto from "crypto";

const prisma = new PrismaClient();

const SAFE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
function generatePassword(length = 10): string {
  return Array.from({ length }, () =>
    SAFE_CHARS[Math.floor(Math.random() * SAFE_CHARS.length)]
  ).join("");
}

function parseHostFromDbUrl(dbUrl: string | undefined): string {
  if (!dbUrl) return "unknown";
  try {
    const url = new URL(dbUrl);
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    return "unparseable-url";
  }
}

async function main() {
  console.log("=========================================================================");
  console.log("🌱 Starting seed script execution...");
  console.log(`📡 Target Database Host: ${parseHostFromDbUrl(process.env.DATABASE_URL)}`);
  console.log("=========================================================================");

  if ((process.env.NODE_ENV as string) === "production") {
    console.error("❌ ABORTED: Seeding database is strictly prohibited when NODE_ENV === 'production'.");
    process.exit(1);
  }

  if (process.env.ALLOW_DEMO_SEED !== "true") {
    console.error("❌ ABORTED: Seeding requires explicit confirmation via ALLOW_DEMO_SEED=true environment variable.");
    console.error("    Run with: ALLOW_DEMO_SEED=true npm run seed");
    process.exit(1);
  }

  // Clean up existing data
  await prisma.notification.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.queryMessage.deleteMany();
  await prisma.query.deleteMany();
  await prisma.attendanceRecord.deleteMany();
  await prisma.mark.deleteMany();
  await prisma.studentProfile.deleteMany();
  await prisma.subjectOfferingSection.deleteMany();
  await prisma.attendanceSlabRange.deleteMany();
  await prisma.scoreComponent.deleteMany();
  await prisma.gradingPolicy.deleteMany();
  await prisma.subjectOffering.deleteMany();
  await prisma.academicTerm.deleteMany();
  await prisma.subject.deleteMany();
  await prisma.section.deleteMany();
  await prisma.batch.deleteMany();
  await prisma.hODAssignment.deleteMany();
  await prisma.facultyProfile.deleteMany();
  await prisma.user.deleteMany();
  await prisma.department.deleteMany();

  let adminPasswordPlain = "Pass1234!";
  if (process.env.NODE_ENV === "production") {
    adminPasswordPlain = process.env.ADMIN_INITIAL_PASSWORD || crypto.randomBytes(12).toString("hex");
    console.log("=========================================================================");
    console.log("🔐 PRODUCTION SECURITY SEED: Initial Admin Password generated:");
    console.log(`    Username: ADMIN001`);
    console.log(`    Password: ${adminPasswordPlain}`);
    console.log("    IMPORTANT: Store this password securely and change it on first login!");
    console.log("=========================================================================");
  }

  const defaultPasswordHash = await bcrypt.hash(adminPasswordPlain, 10);

  // 1. Create Admin User
  const adminUser = await prisma.user.create({
    data: {
      username: "ADMIN001",
      passwordHash: defaultPasswordHash,
      role: Role.ADMIN,
      email: "admin@bvimr.edu.in",
    },
  });
  console.log("✅ Admin user created (username: ADMIN001)");

  // 2. Create Departments (6 sem BCA vs 4 sem MCA)
  const bcaDept = await prisma.department.create({
    data: {
      name: "BCA",
      totalSemesters: 6,
    },
  });

  const mcaDept = await prisma.department.create({
    data: {
      name: "MCA",
      totalSemesters: 4,
    },
  });
  console.log("✅ Departments created: BCA (6 sems) & MCA (4 sems)");

  // 3. Create Faculty & HOD Users
  // Faculty 1: Dr. Rajesh Sharma (HOD of BCA)
  const userHOD1 = await prisma.user.create({
    data: {
      username: "EMP001",
      passwordHash: defaultPasswordHash,
      role: Role.FACULTY,
      email: "rajesh.sharma@bvimr.edu.in",
    },
  });

  const facultyHOD1 = await prisma.facultyProfile.create({
    data: {
      userId: userHOD1.id,
      name: "Dr. Rajesh Sharma",
      employeeId: "EMP001",
      homeDepartmentId: bcaDept.id,
    },
  });

  await prisma.hODAssignment.create({
    data: {
      facultyId: facultyHOD1.id,
      departmentId: bcaDept.id,
    },
  });

  // Faculty 2: Prof. Sunita Verma (HOD of MCA)
  const userHOD2 = await prisma.user.create({
    data: {
      username: "EMP002",
      passwordHash: defaultPasswordHash,
      role: Role.FACULTY,
      email: "sunita.verma@bvimr.edu.in",
    },
  });

  const facultyHOD2 = await prisma.facultyProfile.create({
    data: {
      userId: userHOD2.id,
      name: "Prof. Sunita Verma",
      employeeId: "EMP002",
      homeDepartmentId: mcaDept.id,
    },
  });

  await prisma.hODAssignment.create({
    data: {
      facultyId: facultyHOD2.id,
      departmentId: mcaDept.id,
    },
  });

  // Faculty 3: Prof. Amit Patel (Faculty in BCA, non-HOD)
  const userFaculty3 = await prisma.user.create({
    data: {
      username: "EMP003",
      passwordHash: defaultPasswordHash,
      role: Role.FACULTY,
      email: "amit.patel@bvimr.edu.in",
    },
  });

  const faculty3 = await prisma.facultyProfile.create({
    data: {
      userId: userFaculty3.id,
      name: "Prof. Amit Patel",
      employeeId: "EMP003",
      homeDepartmentId: bcaDept.id,
    },
  });
  console.log("✅ Faculty & HOD profiles created");

  // 4. Create Batches & Sections
  const bcaBatch = await prisma.batch.create({
    data: {
      departmentId: bcaDept.id,
      label: "2025-28",
      startYear: 2025,
      currentSemester: 1,
    },
  });

  const bcaSectionM = await prisma.section.create({
    data: {
      batchId: bcaBatch.id,
      name: "M",
    },
  });

  const bcaSectionAFT = await prisma.section.create({
    data: {
      batchId: bcaBatch.id,
      name: "AFT",
    },
  });

  const mcaBatch = await prisma.batch.create({
    data: {
      departmentId: mcaDept.id,
      label: "2025-27",
      startYear: 2025,
      currentSemester: 1,
    },
  });

  const mcaSectionA = await prisma.section.create({
    data: {
      batchId: mcaBatch.id,
      name: "A",
    },
  });
  console.log("✅ Batches and Sections created");

  // 5. Seed Students (~15 students total)
  const studentsData = [
    { erp: "BCA25001", prn: "PRN25001", name: "Aarav Gupta", batchId: bcaBatch.id, sectionId: bcaSectionM.id },
    { erp: "BCA25002", prn: "PRN25002", name: "Ananya Sharma", batchId: bcaBatch.id, sectionId: bcaSectionM.id },
    { erp: "BCA25003", prn: "PRN25003", name: "Rohan Verma", batchId: bcaBatch.id, sectionId: bcaSectionM.id },
    { erp: "BCA25004", prn: "PRN25004", name: "Isha Patel", batchId: bcaBatch.id, sectionId: bcaSectionM.id },
    { erp: "BCA25005", prn: "PRN25005", name: "Devansh Mehta", batchId: bcaBatch.id, sectionId: bcaSectionM.id },
    { erp: "BCA25006", prn: "PRN25006", name: "Sanya Roy", batchId: bcaBatch.id, sectionId: bcaSectionM.id },
    { erp: "BCA25007", prn: "PRN25007", name: "Kabir Singh", batchId: bcaBatch.id, sectionId: bcaSectionM.id },
    { erp: "BCA25008", prn: "PRN25008", name: "Diya Joshi", batchId: bcaBatch.id, sectionId: bcaSectionM.id },
    { erp: "BCA25009", prn: "PRN25009", name: "Vihaan Nair", batchId: bcaBatch.id, sectionId: bcaSectionM.id },
    { erp: "BCA25010", prn: "PRN25010", name: "Tara Kapoor", batchId: bcaBatch.id, sectionId: bcaSectionM.id },
    { erp: "MCA25001", prn: "PRN25101", name: "Aditya Rao", batchId: mcaBatch.id, sectionId: mcaSectionA.id },
    { erp: "MCA25002", prn: "PRN25102", name: "Kavya Menon", batchId: mcaBatch.id, sectionId: mcaSectionA.id },
    { erp: "MCA25003", prn: "PRN25103", name: "Arjun Reddy", batchId: mcaBatch.id, sectionId: mcaSectionA.id },
    { erp: "MCA25004", prn: "PRN25104", name: "Riya Sen", batchId: mcaBatch.id, sectionId: mcaSectionA.id },
    { erp: "MCA25005", prn: "PRN25105", name: "Siddharth Das", batchId: mcaBatch.id, sectionId: mcaSectionA.id },
  ];

  const studentProfiles = [];
  for (const s of studentsData) {
    const user = await prisma.user.create({
      data: {
        username: s.erp,
        passwordHash: defaultPasswordHash,
        role: Role.STUDENT,
        email: `${s.erp.toLowerCase()}@bvimr.edu.in`,
      },
    });

    const studentProfile = await prisma.studentProfile.create({
      data: {
        userId: user.id,
        name: s.name,
        erpNo: s.erp,
        prn: s.prn,
        batchId: s.batchId,
        sectionId: s.sectionId,
      },
    });
    studentProfiles.push(studentProfile);
  }
  console.log(`✅ ${studentProfiles.length} Seed students created`);

  // 6. Create Subjects
  const subjectA = await prisma.subject.create({
    data: {
      departmentId: bcaDept.id,
      name: "Web Technologies",
      code: "BCA101",
      semesterNumber: 1,
    },
  });

  const subjectB = await prisma.subject.create({
    data: {
      departmentId: bcaDept.id,
      name: "C Programming",
      code: "BCA102",
      semesterNumber: 1,
    },
  });

  const subjectC = await prisma.subject.create({
    data: {
      departmentId: mcaDept.id,
      name: "Advanced Java",
      code: "MCA101",
      semesterNumber: 1,
    },
  });
  console.log("✅ Subjects created");

  // 7. Academic Terms
  const bcaTermSem1 = await prisma.academicTerm.create({
    data: {
      departmentId: bcaDept.id,
      semesterNumber: 1,
      label: "AY2025-26",
    },
  });

  const mcaTermSem1 = await prisma.academicTerm.create({
    data: {
      departmentId: mcaDept.id,
      semesterNumber: 1,
      label: "AY2025-26",
    },
  });

  // 8. Subject Offerings & Differently Shaped Grading Policies

  // --- Subject A (Web Technologies): 2 CES components (10, 10 marks), Int 40, 5 Slabs ---
  const offeringA = await prisma.subjectOffering.create({
    data: {
      subjectId: subjectA.id,
      academicTermId: bcaTermSem1.id,
    },
  });

  const policyA = await prisma.gradingPolicy.create({
    data: {
      subjectOfferingId: offeringA.id,
      cesGroupWeightage: 10,
      internalWeightage: 20,
      attendanceWeightage: 10,
      confirmedAt: new Date(),
      confirmedByFacultyId: facultyHOD1.id,
      scoreComponents: {
        create: [
          { group: ScoreGroup.CES, name: "CES-I", maxMarks: 10, order: 1 },
          { group: ScoreGroup.CES, name: "CES-II", maxMarks: 10, order: 2 },
          { group: ScoreGroup.INTERNAL, name: "Internal Exam", maxMarks: 40, order: 3 },
        ],
      },
      attendanceSlabRanges: {
        create: [
          { minPercent: 0, maxPercent: 60, marks: 0 },
          { minPercent: 60.01, maxPercent: 75, marks: 4 },
          { minPercent: 75.01, maxPercent: 85, marks: 6 },
          { minPercent: 85.01, maxPercent: 95, marks: 8 },
          { minPercent: 95.01, maxPercent: 100, marks: 10 },
        ],
      },
    },
    include: {
      scoreComponents: true,
    },
  });

  // --- Subject B (C Programming): 3 CES components (15, 15, 20 marks), Int 50, 4 Slabs ---
  const offeringB = await prisma.subjectOffering.create({
    data: {
      subjectId: subjectB.id,
      academicTermId: bcaTermSem1.id,
    },
  });

  const policyB = await prisma.gradingPolicy.create({
    data: {
      subjectOfferingId: offeringB.id,
      cesGroupWeightage: 10,
      internalWeightage: 25,
      attendanceWeightage: 15,
      confirmedAt: new Date(),
      confirmedByFacultyId: facultyHOD1.id,
      scoreComponents: {
        create: [
          { group: ScoreGroup.CES, name: "CES-I", maxMarks: 15, order: 1 },
          { group: ScoreGroup.CES, name: "CES-II", maxMarks: 15, order: 2 },
          { group: ScoreGroup.CES, name: "CES-III", maxMarks: 20, order: 3 },
          { group: ScoreGroup.INTERNAL, name: "Internal Exam", maxMarks: 50, order: 4 },
        ],
      },
      attendanceSlabRanges: {
        create: [
          { minPercent: 0, maxPercent: 70, marks: 0 },
          { minPercent: 70.01, maxPercent: 80, marks: 8 },
          { minPercent: 80.01, maxPercent: 90, marks: 12 },
          { minPercent: 90.01, maxPercent: 100, marks: 15 },
        ],
      },
    },
    include: {
      scoreComponents: true,
    },
  });

  // --- Subject C (MCA Advanced Java): Unassigned / Policy Pending for status board testing ---
  const offeringC = await prisma.subjectOffering.create({
    data: {
      subjectId: subjectC.id,
      academicTermId: mcaTermSem1.id,
    },
  });

  // 9. SubjectOfferingSections & Faculty Assignments
  const secA_M = await prisma.subjectOfferingSection.create({
    data: {
      subjectOfferingId: offeringA.id,
      sectionId: bcaSectionM.id,
      facultyId: faculty3.id, // Prof. Amit Patel
    },
  });

  await prisma.subjectOfferingSection.create({
    data: {
      subjectOfferingId: offeringA.id,
      sectionId: bcaSectionAFT.id,
      facultyId: null, // Unassigned for AFT section
    },
  });

  const secB_M = await prisma.subjectOfferingSection.create({
    data: {
      subjectOfferingId: offeringB.id,
      sectionId: bcaSectionM.id,
      facultyId: facultyHOD1.id, // Dr. Rajesh Sharma
    },
  });

  await prisma.subjectOfferingSection.create({
    data: {
      subjectOfferingId: offeringB.id,
      sectionId: bcaSectionAFT.id,
      facultyId: null, // Unassigned for AFT section
    },
  });

  await prisma.subjectOfferingSection.create({
    data: {
      subjectOfferingId: offeringC.id,
      sectionId: mcaSectionA.id,
      facultyId: null, // Unassigned!
    },
  });
  console.log("✅ Subject Offerings, Differently Shaped Policies & Sections seeded");

  // 10. Seed Marks and Attendance for enrolled students in BCA Section M
  const bcaMStudents = studentProfiles.filter((s) => s.sectionId === bcaSectionM.id);

  const ces1_A = policyA.scoreComponents.find((c) => c.name === "CES-I")!;
  const ces2_A = policyA.scoreComponents.find((c) => c.name === "CES-II")!;
  const int_A = policyA.scoreComponents.find((c) => c.name === "Internal Exam")!;

  for (let i = 0; i < bcaMStudents.length; i++) {
    const student = bcaMStudents[i];
    // Vary marks for realistic data
    const ces1Val = Math.min(10, 6 + (i % 5));
    const ces2Val = Math.min(10, 7 + (i % 4));
    const intVal = Math.min(40, 25 + i * 1.5);
    const attPct = Math.min(100, 65 + i * 3.5);

    await prisma.mark.create({
      data: {
        scoreComponentId: ces1_A.id,
        studentId: student.id,
        marksObtained: ces1Val,
        updatedByFacultyId: faculty3.id,
      },
    });

    await prisma.mark.create({
      data: {
        scoreComponentId: ces2_A.id,
        studentId: student.id,
        marksObtained: ces2Val,
        updatedByFacultyId: faculty3.id,
      },
    });

    await prisma.mark.create({
      data: {
        scoreComponentId: int_A.id,
        studentId: student.id,
        marksObtained: intVal,
        updatedByFacultyId: faculty3.id,
      },
    });

    await prisma.attendanceRecord.create({
      data: {
        subjectOfferingSectionId: secA_M.id,
        studentId: student.id,
        attendancePercent: attPct,
      },
    });
  }

  console.log("✅ Sample marks & attendance records populated for BCA Section M");
  console.log("🌱 Database seeding complete!");
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
