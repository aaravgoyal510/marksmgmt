import { PrismaClient, Role, ScoreGroup, QueryStatus } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

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
  console.log("🌱 BVIMR IA Portal — Demo Data Seeding Script");
  console.log(`📡 Target Database Host: ${parseHostFromDbUrl(process.env.DATABASE_URL)}`);
  console.log("=========================================================================");

  // PRODUCTION SAFETY GUARDS PER AMENDMENT
  if ((process.env.NODE_ENV as string) === "production") {
    console.error("❌ ABORTED: Seeding demo data is strictly prohibited when NODE_ENV === 'production'.");
    process.exit(1);
  }

  if (process.env.ALLOW_DEMO_SEED !== "true") {
    console.error("❌ ABORTED: Demo seed requires explicit confirmation via ALLOW_DEMO_SEED=true environment variable.");
    console.error("    Run with: ALLOW_DEMO_SEED=true npm run seed:demo");
    process.exit(1);
  }

  console.log("🧹 Clearing previous demo data safely...");
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

  const defaultPasswordHash = await bcrypt.hash("Pass1234!", 10);

  // 1. Admin Account
  console.log("👤 Creating Admin Account...");
  await prisma.user.create({
    data: {
      username: "ADMIN001",
      passwordHash: defaultPasswordHash,
      role: Role.ADMIN,
      email: "admin@bvimr.edu.in",
    },
  });

  // 2. Department: MCA
  console.log("🏢 Creating MCA Department...");
  const dept = await prisma.department.create({
    data: {
      name: "Master of Computer Applications",
      totalSemesters: 4,
    },
  });

  // 3. Faculty: 1 HOD + 3 Teaching Faculty
  console.log("👨‍🏫 Creating HOD and Faculty...");
  const hodUser = await prisma.user.create({
    data: {
      username: "HOD_MCA",
      passwordHash: defaultPasswordHash,
      role: Role.FACULTY,
      email: "hod.mca@bvimr.edu.in",
    },
  });
  const hodFaculty = await prisma.facultyProfile.create({
    data: {
      userId: hodUser.id,
      name: "Dr. Rajesh Sharma",
      employeeId: "EMP_HOD_01",
      homeDepartmentId: dept.id,
    },
  });
  await prisma.hODAssignment.create({
    data: {
      departmentId: dept.id,
      facultyId: hodFaculty.id,
    },
  });

  const faculty1User = await prisma.user.create({
    data: {
      username: "FAC_SUNITA",
      passwordHash: defaultPasswordHash,
      role: Role.FACULTY,
      email: "sunita.rao@bvimr.edu.in",
    },
  });
  const faculty1 = await prisma.facultyProfile.create({
    data: {
      userId: faculty1User.id,
      name: "Prof. Sunita Rao",
      employeeId: "EMP002",
      homeDepartmentId: dept.id,
    },
  });

  const faculty2User = await prisma.user.create({
    data: {
      username: "FAC_AMIT",
      passwordHash: defaultPasswordHash,
      role: Role.FACULTY,
      email: "amit.verma@bvimr.edu.in",
    },
  });
  const faculty2 = await prisma.facultyProfile.create({
    data: {
      userId: faculty2User.id,
      name: "Dr. Amit Verma",
      employeeId: "EMP003",
      homeDepartmentId: dept.id,
    },
  });

  const faculty3User = await prisma.user.create({
    data: {
      username: "FAC_NEHA",
      passwordHash: defaultPasswordHash,
      role: Role.FACULTY,
      email: "neha.gupta@bvimr.edu.in",
    },
  });
  const faculty3 = await prisma.facultyProfile.create({
    data: {
      userId: faculty3User.id,
      name: "Prof. Neha Gupta",
      employeeId: "EMP004",
      homeDepartmentId: dept.id,
    },
  });

  // 4. Batch & 2 Sections (30 students each)
  console.log("🎓 Creating Batch & 60 Students across Sections A and B...");
  const batch = await prisma.batch.create({
    data: {
      label: "MCA 2025-27",
      startYear: 2025,
      currentSemester: 1,
      departmentId: dept.id,
    },
  });

  const secA = await prisma.section.create({
    data: {
      name: "A",
      batchId: batch.id,
    },
  });

  const secB = await prisma.section.create({
    data: {
      name: "B",
      batchId: batch.id,
    },
  });

  const studentsA = [];
  for (let i = 1; i <= 30; i++) {
    const erpNo = `MCA25${String(i).padStart(3, "0")}`;
    const user = await prisma.user.create({
      data: {
        username: erpNo,
        passwordHash: defaultPasswordHash,
        role: Role.STUDENT,
        email: `${erpNo}@bvimr.edu.in`,
      },
    });
    const profile = await prisma.studentProfile.create({
      data: {
        userId: user.id,
        erpNo,
        prn: `0241BCA${String(100 + i)}`,
        name: `Student A-${i}`,
        batchId: batch.id,
        sectionId: secA.id,
      },
    });
    studentsA.push(profile);
  }

  const studentsB = [];
  for (let i = 31; i <= 60; i++) {
    const erpNo = `MCA25${String(i).padStart(3, "0")}`;
    const user = await prisma.user.create({
      data: {
        username: erpNo,
        passwordHash: defaultPasswordHash,
        role: Role.STUDENT,
        email: `${erpNo}@bvimr.edu.in`,
      },
    });
    const profile = await prisma.studentProfile.create({
      data: {
        userId: user.id,
        erpNo,
        prn: `0241BCA${String(100 + i)}`,
        name: `Student B-${i - 30}`,
        batchId: batch.id,
        sectionId: secB.id,
      },
    });
    studentsB.push(profile);
  }

  // 5. Academic Term & 2 Subjects
  console.log("📚 Creating Academic Term & Subjects...");
  const term = await prisma.academicTerm.create({
    data: {
      label: "MCA Semester 1 (2025-26)",
      departmentId: dept.id,
      semesterNumber: 1,
    },
  });

  const sub1 = await prisma.subject.create({
    data: {
      name: "Advanced Java Programming",
      code: "MCA101",
      semesterNumber: 1,
      departmentId: dept.id,
    },
  });

  const sub2 = await prisma.subject.create({
    data: {
      name: "Relational Database Management Systems",
      code: "MCA102",
      semesterNumber: 1,
      departmentId: dept.id,
    },
  });

  // 6. Subject Offerings & Confirmed Grading Policies (CES 20, Internal 60, Attendance 20)
  console.log("⚙️ Configuring & Confirming Grading Policies...");
  const offering1 = await prisma.subjectOffering.create({
    data: {
      subjectId: sub1.id,
      academicTermId: term.id,
    },
  });

  const policy1 = await prisma.gradingPolicy.create({
    data: {
      subjectOfferingId: offering1.id,
      cesGroupWeightage: 20,
      internalWeightage: 60,
      attendanceWeightage: 20,
      confirmedAt: new Date(),
      confirmedByFacultyId: hodFaculty.id,
      scoreComponents: {
        create: [
          { group: ScoreGroup.CES, name: "CES 1", maxMarks: 10, order: 1 },
          { group: ScoreGroup.CES, name: "CES 2", maxMarks: 10, order: 2 },
          { group: ScoreGroup.INTERNAL, name: "Internal Exam", maxMarks: 60, order: 3 },
        ],
      },
      attendanceSlabRanges: {
        create: [
          { minPercent: 0, maxPercent: 74.99, marks: 0 },
          { minPercent: 75, maxPercent: 79.99, marks: 10 },
          { minPercent: 80, maxPercent: 84.99, marks: 14 },
          { minPercent: 85, maxPercent: 89.99, marks: 17 },
          { minPercent: 90, maxPercent: 100, marks: 20 },
        ],
      },
    },
    include: {
      scoreComponents: { orderBy: { order: "asc" } },
    },
  });

  const offering2 = await prisma.subjectOffering.create({
    data: {
      subjectId: sub2.id,
      academicTermId: term.id,
    },
  });

  await prisma.gradingPolicy.create({
    data: {
      subjectOfferingId: offering2.id,
      cesGroupWeightage: 20,
      internalWeightage: 60,
      attendanceWeightage: 20,
      confirmedAt: new Date(),
      confirmedByFacultyId: hodFaculty.id,
      scoreComponents: {
        create: [
          { group: ScoreGroup.CES, name: "CES 1", maxMarks: 10, order: 1 },
          { group: ScoreGroup.CES, name: "CES 2", maxMarks: 10, order: 2 },
          { group: ScoreGroup.INTERNAL, name: "Internal Exam", maxMarks: 60, order: 3 },
        ],
      },
      attendanceSlabRanges: {
        create: [
          { minPercent: 0, maxPercent: 74.99, marks: 0 },
          { minPercent: 75, maxPercent: 79.99, marks: 10 },
          { minPercent: 80, maxPercent: 84.99, marks: 14 },
          { minPercent: 85, maxPercent: 89.99, marks: 17 },
          { minPercent: 90, maxPercent: 100, marks: 20 },
        ],
      },
    },
  });

  // 7. Sections Assignment
  console.log("📝 Assigning Faculty to Sections...");
  // MCA101 Section A: Prof Sunita Rao (Published)
  const offSec1A = await prisma.subjectOfferingSection.create({
    data: {
      subjectOfferingId: offering1.id,
      sectionId: secA.id,
      facultyId: faculty1.id,
      marksPublishedAt: new Date(),
      marksPublishedById: faculty1.userId,
    },
  });

  // MCA101 Section B: Dr Amit Verma (Unpublished)
  const offSec1B = await prisma.subjectOfferingSection.create({
    data: {
      subjectOfferingId: offering1.id,
      sectionId: secB.id,
      facultyId: faculty2.id,
      marksPublishedAt: null,
    },
  });

  // MCA102 Sections: Prof Neha Gupta
  await prisma.subjectOfferingSection.create({
    data: {
      subjectOfferingId: offering2.id,
      sectionId: secA.id,
      facultyId: faculty3.id,
    },
  });

  await prisma.subjectOfferingSection.create({
    data: {
      subjectOfferingId: offering2.id,
      sectionId: secB.id,
      facultyId: faculty3.id,
    },
  });

  // 8. Marks & Attendance: Full for Section A, Partial for Section B
  console.log("📊 Entering Marks & Attendance (Full for Sec A, Partial for Sec B)...");
  const comps = policy1.scoreComponents;

  // Full marks for Section A (30 students)
  for (const st of studentsA) {
    await prisma.mark.createMany({
      data: [
        { studentId: st.id, scoreComponentId: comps[0].id, marksObtained: 8 + Math.floor(Math.random() * 3), updatedByFacultyId: faculty1.id },
        { studentId: st.id, scoreComponentId: comps[1].id, marksObtained: 7 + Math.floor(Math.random() * 4), updatedByFacultyId: faculty1.id },
        { studentId: st.id, scoreComponentId: comps[2].id, marksObtained: 40 + Math.floor(Math.random() * 20), updatedByFacultyId: faculty1.id },
      ],
    });

    await prisma.attendanceRecord.create({
      data: {
        studentId: st.id,
        subjectOfferingSectionId: offSec1A.id,
        attendancePercent: 70 + Math.floor(Math.random() * 28),
      },
    });
  }

  // Partial marks for Section B (first 15 students only)
  for (let i = 0; i < 15; i++) {
    const st = studentsB[i];
    await prisma.mark.createMany({
      data: [
        { studentId: st.id, scoreComponentId: comps[0].id, marksObtained: 7 + Math.floor(Math.random() * 4), updatedByFacultyId: faculty2.id },
        { studentId: st.id, scoreComponentId: comps[1].id, marksObtained: 6 + Math.floor(Math.random() * 4), updatedByFacultyId: faculty2.id },
        { studentId: st.id, scoreComponentId: comps[2].id, marksObtained: 35 + Math.floor(Math.random() * 22), updatedByFacultyId: faculty2.id },
      ],
    });

    await prisma.attendanceRecord.create({
      data: {
        studentId: st.id,
        subjectOfferingSectionId: offSec1B.id,
        attendancePercent: 65 + Math.floor(Math.random() * 30),
      },
    });
  }

  // 9. Create 3 Queries (OPEN, ESCALATED, RESOLVED)
  console.log("💬 Creating Demo Queries (1 OPEN, 1 ESCALATED, 1 RESOLVED)...");
  // Query 1: OPEN (Student 1 -> Prof Sunita)
  const q1 = await prisma.query.create({
    data: {
      studentId: studentsA[0].id,
      subjectOfferingSectionId: offSec1A.id,
      scoreComponentId: comps[0].id,
      facultyId: faculty1.id,
      message: "Respected Ma'am, my CES-1 marks seem to be entered as 8, but my evaluated sheet shows 9.5.",
      status: QueryStatus.OPEN,
      createdAt: new Date(),
    },
  });

  await prisma.queryMessage.create({
    data: {
      queryId: q1.id,
      authorUserId: studentsA[0].userId,
      message: "Respected Ma'am, my CES-1 marks seem to be entered as 8, but my evaluated sheet shows 9.5.",
    },
  });

  // Query 2: ESCALATED (Student 2 -> HOD Dr Rajesh Sharma)
  const q2 = await prisma.query.create({
    data: {
      studentId: studentsA[1].id,
      subjectOfferingSectionId: offSec1A.id,
      facultyId: faculty1.id,
      hodId: hodFaculty.id,
      message: "Attendance was recorded as 72%, which is below the 75% cutoff, but I had submitted medical leaves.",
      status: QueryStatus.ESCALATED,
      createdAt: new Date(Date.now() - 100 * 60 * 60 * 1000), // > 96h SLA breach
    },
  });

  await prisma.queryMessage.createMany({
    data: [
      {
        queryId: q2.id,
        authorUserId: studentsA[1].userId,
        message: "Attendance was recorded as 72%, which is below the 75% cutoff, but I had submitted medical leaves.",
      },
      {
        queryId: q2.id,
        authorUserId: hodUser.id,
        message: "[SYSTEM: SLA BREACH - ESCALATED TO HOD] Query escalated after exceeding SLA without resolution.",
      },
    ],
  });

  // Query 3: RESOLVED (Student 3 -> Prof Sunita)
  const q3 = await prisma.query.create({
    data: {
      studentId: studentsA[2].id,
      subjectOfferingSectionId: offSec1A.id,
      scoreComponentId: comps[2].id,
      facultyId: faculty1.id,
      message: "Internal exam marks recheck requested for question 4.",
      status: QueryStatus.RESOLVED,
      createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
      resolvedAt: new Date(),
    },
  });

  await prisma.queryMessage.createMany({
    data: [
      {
        queryId: q3.id,
        authorUserId: studentsA[2].userId,
        message: "Internal exam marks recheck requested for question 4.",
      },
      {
        queryId: q3.id,
        authorUserId: faculty1User.id,
        message: "Rechecked your response sheet. Question 4 score verified and updated. Query resolved.",
      },
    ],
  });

  console.log("=========================================================================");
  console.log("🎉 Demo Seeding Completed Successfully!");
  console.log("   - Department: MCA");
  console.log("   - HOD: HOD_MCA (Dr. Rajesh Sharma)");
  console.log("   - Faculty: FAC_SUNITA, FAC_AMIT, FAC_NEHA");
  console.log("   - Students: MCA25001 - MCA25060 (60 students across Sections A and B)");
  console.log("   - All Passwords: Pass1234!");
  console.log("   - Subjects: MCA101 (Confirmed), MCA102 (Confirmed)");
  console.log("   - Queries: 1 OPEN, 1 ESCALATED, 1 RESOLVED");
  console.log("=========================================================================");
}

main()
  .catch((e) => {
    console.error("❌ Demo Seed Error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
