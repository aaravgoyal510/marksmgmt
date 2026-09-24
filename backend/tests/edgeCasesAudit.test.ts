import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { app } from "../src/app";
import { PrismaClient, Role } from "@prisma/client";

const JWT_SECRET = process.env.JWT_SECRET || "default-secret-change-me";

vi.mock("@prisma/client", () => {
  const mPrisma: any = {
    department: {
      findUnique: vi.fn(),
    },
    batch: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    academicTerm: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    subject: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    subjectOffering: {
      findFirst: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
    },
    subjectOfferingSection: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    hODAssignment: {
      findFirst: vi.fn(),
    },
    facultyProfile: {
      findUnique: vi.fn(),
    },
    gradingPolicy: {
      findUnique: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
    scoreComponent: {
      deleteMany: vi.fn(),
      create: vi.fn(),
    },
    attendanceSlabRange: {
      deleteMany: vi.fn(),
      create: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    mark: {
      findMany: vi.fn(),
    },
    attendanceRecord: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn(async (cb) => cb(mPrisma)),
  };
  return {
    PrismaClient: vi.fn(() => mPrisma),
    Role: {
      ADMIN: "ADMIN",
      FACULTY: "FACULTY",
      STUDENT: "STUDENT",
    },
    ScoreGroup: {
      CES: "CES",
      INTERNAL: "INTERNAL",
    },
  };
});

describe("Edge Cases Audit Suite", () => {
  let prismaInstance: any;

  beforeEach(() => {
    vi.clearAllMocks();
    prismaInstance = new PrismaClient();
  });

  it("Item 1: Mid-term subject creation scaffolds SubjectOfferingSection for active sections", async () => {
    const hodToken = jwt.sign(
      { userId: "user-hod1", username: "EMP001", role: Role.FACULTY, facultyId: "fac-hod1" },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    prismaInstance.hODAssignment.findFirst.mockResolvedValue({
      facultyId: "fac-hod1",
      departmentId: "dept-bca",
    });
    prismaInstance.department.findUnique.mockResolvedValue({ id: "dept-bca", name: "BCA", totalSemesters: 6 });
    prismaInstance.subject.findUnique.mockResolvedValue(null);
    prismaInstance.subject.create.mockResolvedValue({
      id: "sub-bca103",
      departmentId: "dept-bca",
      name: "Data Structures",
      code: "BCA103",
      semesterNumber: 1,
    });
    prismaInstance.batch.findMany.mockResolvedValue([
      {
        id: "batch-2025",
        currentSemester: 1,
        sections: [{ id: "sec-2025-M" }, { id: "sec-2025-AFT" }],
      },
    ]);
    prismaInstance.academicTerm.findFirst.mockResolvedValue({ id: "term-sem1" });
    prismaInstance.subjectOffering.findFirst.mockResolvedValue({ id: "offering-bca103" });
    prismaInstance.subjectOfferingSection.upsert.mockResolvedValue({ id: "off-sec" });

    const response = await request(app)
      .post("/api/hod/subjects")
      .set("Authorization", `Bearer ${hodToken}`)
      .send({
        departmentId: "dept-bca",
        name: "Data Structures",
        code: "BCA103",
        semesterNumber: 1,
      });

    expect(response.status).toBe(201);
    expect(prismaInstance.subjectOfferingSection.upsert).toHaveBeenCalledTimes(2);
  });

  it("Item 2: getSectionMarksGrid excludes students whose semesterOverride does not match offering semester", async () => {
    const facultyToken = jwt.sign(
      { userId: "user-fac1", username: "EMP001", role: Role.FACULTY, facultyId: "fac-1" },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    prismaInstance.subjectOfferingSection.findUnique.mockResolvedValue({
      id: "sos-sem1",
      facultyId: "fac-1",
      section: {
        students: [
          { id: "stud-1", erpNo: "E101", name: "Regular Sem1 Student", semesterOverride: null, batch: { currentSemester: 1 } },
          { id: "stud-2", erpNo: "E102", name: "Repeater Sem2 Student", semesterOverride: 2, batch: { currentSemester: 1 } },
        ],
      },
      subjectOffering: {
        subject: { code: "BCA101", name: "Web Technologies" },
        academicTerm: { semesterNumber: 1 },
        gradingPolicy: {
          id: "policy-1",
          cesGroupWeightage: 10,
          internalWeightage: 20,
          attendanceWeightage: 10,
          confirmedAt: new Date(),
          scoreComponents: [{ id: "comp-1", group: "CES", name: "CES-I", maxMarks: 10, order: 1 }],
          attendanceSlabRanges: [{ id: "slab-1", minPercent: 0, maxPercent: 100, marks: 10 }],
        },
      },
    });

    prismaInstance.mark.findMany.mockResolvedValue([]);
    prismaInstance.attendanceRecord.findMany.mockResolvedValue([]);

    const response = await request(app)
      .get("/api/sections/sos-sem1/marks")
      .set("Authorization", `Bearer ${facultyToken}`);

    expect(response.status).toBe(200);
    expect(response.body.students.length).toBe(1);
    expect(response.body.students[0].studentId).toBe("stud-1");
  });

  it("Item 3: Confirmed grading policy blocks direct edits and requires unconfirm first with AuditLog", async () => {
    const hodToken = jwt.sign(
      { userId: "user-hod1", username: "EMP001", role: Role.FACULTY, facultyId: "fac-hod1" },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    prismaInstance.subjectOffering.findUnique.mockResolvedValue({
      id: "offering-bca101",
      subject: { departmentId: "dept-bca" },
      gradingPolicy: { id: "policy-1", confirmedAt: new Date() },
    });
    prismaInstance.gradingPolicy.findUnique.mockResolvedValue({
      id: "policy-1",
      confirmedAt: new Date(),
    });
    prismaInstance.gradingPolicy.upsert.mockResolvedValue({ id: "policy-1" });
    prismaInstance.hODAssignment.findFirst.mockResolvedValue({
      facultyId: "fac-hod1",
      departmentId: "dept-bca",
    });

    // Attempting direct edit on confirmed policy fails with 400 POLICY_LOCKED
    const editResponse = await request(app)
      .post("/api/hod/subject-offerings/offering-bca101/policy")
      .set("Authorization", `Bearer ${hodToken}`)
      .send({
        cesGroupWeightage: 10,
        internalWeightage: 20,
        attendanceWeightage: 10,
        scoreComponents: [{ group: "CES", name: "CES-I", maxMarks: 10, order: 1 }],
        attendanceSlabRanges: [{ minPercent: 0, maxPercent: 100, marks: 10 }],
      });

    expect(editResponse.status).toBe(400);
    expect(editResponse.body.code).toBe("POLICY_LOCKED");

    // Unconfirming policy succeeds and creates AuditLog entry
    prismaInstance.gradingPolicy.update.mockResolvedValue({
      id: "policy-1",
      confirmedAt: null,
    });
    prismaInstance.auditLog.create.mockResolvedValue({ id: "audit-1" });

    const unconfirmResponse = await request(app)
      .post("/api/hod/subject-offerings/offering-bca101/policy/unconfirm")
      .set("Authorization", `Bearer ${hodToken}`);

    expect(unconfirmResponse.status).toBe(200);
    expect(prismaInstance.auditLog.create).toHaveBeenCalledWith({
      data: {
        entityType: "GradingPolicy",
        entityId: "policy-1",
        changedByUserId: "user-hod1",
        oldValue: "CONFIRMED",
        newValue: "UNCONFIRMED",
      },
    });
  });

  it("Item 4: Promoting a batch at maximum totalSemesters returns 400 Bad Request cleanly", async () => {
    const adminToken = jwt.sign(
      { userId: "admin-1", username: "ADMIN001", role: Role.ADMIN },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    prismaInstance.batch.findUnique.mockResolvedValue({
      id: "batch-bca-final",
      departmentId: "dept-bca",
      label: "2022-25",
      currentSemester: 6,
      department: { name: "BCA", totalSemesters: 6 },
    });

    const response = await request(app)
      .post("/api/admin/batches/batch-bca-final/promote")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("maximum totalSemesters (6)");
  });

  it("Item 5: GET /api/faculty/my-sections returns all assigned section offerings for logged in faculty", async () => {
    const facultyToken = jwt.sign(
      { userId: "user-fac3", username: "EMP003", role: Role.FACULTY, facultyId: "fac-patel" },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    prismaInstance.facultyProfile.findUnique.mockResolvedValue({
      id: "fac-patel",
      name: "Prof. Amit Patel",
    });

    prismaInstance.subjectOfferingSection.findMany.mockResolvedValue([
      {
        id: "sos-1",
        sectionId: "sec-M",
        facultyId: "fac-patel",
        section: { name: "M", batch: { label: "2025-28", department: { name: "BCA" } } },
        subjectOffering: {
          subjectId: "sub-101",
          subject: { code: "BCA101", name: "Web Technologies" },
          academicTerm: { label: "AY2025-26" },
          gradingPolicy: { confirmedAt: new Date() },
        },
      },
      {
        id: "sos-2",
        sectionId: "sec-AFT",
        facultyId: "fac-patel",
        section: { name: "AFT", batch: { label: "2025-28", department: { name: "BCA" } } },
        subjectOffering: {
          subjectId: "sub-101",
          subject: { code: "BCA101", name: "Web Technologies" },
          academicTerm: { label: "AY2025-26" },
          gradingPolicy: { confirmedAt: new Date() },
        },
      },
    ]);

    const response = await request(app)
      .get("/api/faculty/my-sections")
      .set("Authorization", `Bearer ${facultyToken}`);

    expect(response.status).toBe(200);
    expect(response.body.sections.length).toBe(2);
    expect(response.body.sections[0].sectionName).toBe("M");
    expect(response.body.sections[1].sectionName).toBe("AFT");
  });
});
