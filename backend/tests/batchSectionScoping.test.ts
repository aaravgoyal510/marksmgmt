import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { app } from "../src/app";
import { PrismaClient, Role } from "@prisma/client";

const JWT_SECRET = process.env.JWT_SECRET || "default-secret-change-me";

vi.mock("@prisma/client", () => {
  const mPrisma = {
    department: {
      findUnique: vi.fn(),
    },
    batch: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    section: {
      create: vi.fn(),
    },
    academicTerm: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    subject: {
      findMany: vi.fn(),
    },
    subjectOffering: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    subjectOfferingSection: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    hODAssignment: {
      findFirst: vi.fn(),
    },
    facultyProfile: {
      findUnique: vi.fn(),
    },
  };
  return {
    PrismaClient: vi.fn(() => mPrisma),
    Role: {
      ADMIN: "ADMIN",
      FACULTY: "FACULTY",
      STUDENT: "STUDENT",
    },
  };
});

describe("Batch Section Scoping & Faculty Assignment Suite", () => {
  let prismaInstance: any;

  beforeEach(() => {
    vi.clearAllMocks();
    prismaInstance = new PrismaClient();
  });

  it("Claim 1: New batch creation creates default section and scaffolds UNASSIGNED SubjectOfferingSections", async () => {
    const adminToken = jwt.sign(
      { userId: "admin-1", username: "ADMIN001", role: Role.ADMIN },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    prismaInstance.department.findUnique.mockResolvedValue({ id: "dept-bca", name: "BCA" });
    prismaInstance.batch.create.mockResolvedValue({
      id: "batch-2026",
      departmentId: "dept-bca",
      label: "2026-29",
      currentSemester: 1,
    });
    prismaInstance.section.create.mockResolvedValue({
      id: "sec-2026-A",
      batchId: "batch-2026",
      name: "A",
    });
    prismaInstance.academicTerm.findFirst.mockResolvedValue({ id: "term-sem1" });
    prismaInstance.subject.findMany.mockResolvedValue([
      { id: "sub-bca101", code: "BCA101", semesterNumber: 1 },
    ]);
    prismaInstance.subjectOffering.findFirst.mockResolvedValue({ id: "offering-bca101" });
    prismaInstance.subjectOfferingSection.upsert.mockResolvedValue({
      id: "off-sec-1",
      subjectOfferingId: "offering-bca101",
      sectionId: "sec-2026-A",
      facultyId: null,
    });

    const response = await request(app)
      .post("/api/admin/batches")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        departmentId: "dept-bca",
        label: "2026-29",
        startYear: 2026,
      });

    expect(response.status).toBe(201);
    expect(prismaInstance.section.create).toHaveBeenCalledWith({
      data: {
        batchId: "batch-2026",
        name: "A",
      },
    });
    expect(prismaInstance.subjectOfferingSection.upsert).toHaveBeenCalledWith({
      where: {
        subjectOfferingId_sectionId: {
          subjectOfferingId: "offering-bca101",
          sectionId: "sec-2026-A",
        },
      },
      update: {},
      create: {
        subjectOfferingId: "offering-bca101",
        sectionId: "sec-2026-A",
        facultyId: null,
      },
    });
  });

  it("Admin adding a new section to an existing batch scaffolds UNASSIGNED SubjectOfferingSections", async () => {
    const adminToken = jwt.sign(
      { userId: "admin-1", username: "ADMIN001", role: Role.ADMIN },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    prismaInstance.batch.findUnique.mockResolvedValue({
      id: "batch-2025",
      departmentId: "dept-bca",
      label: "2025-28",
      currentSemester: 1,
    });
    prismaInstance.section.create.mockResolvedValue({
      id: "sec-2025-AFT",
      batchId: "batch-2025",
      name: "AFT",
    });
    prismaInstance.academicTerm.findFirst.mockResolvedValue({ id: "term-sem1" });
    prismaInstance.subject.findMany.mockResolvedValue([
      { id: "sub-bca101", code: "BCA101", semesterNumber: 1 },
      { id: "sub-bca102", code: "BCA102", semesterNumber: 1 },
    ]);
    prismaInstance.subjectOffering.findFirst.mockResolvedValue({ id: "offering-bca101" });
    prismaInstance.subjectOfferingSection.upsert.mockResolvedValue({
      id: "off-sec-aft",
      subjectOfferingId: "offering-bca101",
      sectionId: "sec-2025-AFT",
      facultyId: null,
    });

    const response = await request(app)
      .post("/api/admin/batches/batch-2025/sections")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "AFT" });

    expect(response.status).toBe(201);
    expect(prismaInstance.section.create).toHaveBeenCalledWith({
      data: {
        batchId: "batch-2025",
        name: "AFT",
      },
    });
    expect(prismaInstance.subjectOfferingSection.upsert).toHaveBeenCalledWith({
      where: {
        subjectOfferingId_sectionId: {
          subjectOfferingId: "offering-bca101",
          sectionId: "sec-2025-AFT",
        },
      },
      update: {},
      create: {
        subjectOfferingId: "offering-bca101",
        sectionId: "sec-2025-AFT",
        facultyId: null,
      },
    });
  });

  it("Claim 2: Batch promotion creates fresh UNASSIGNED SubjectOfferingSections under the new semester", async () => {
    const adminToken = jwt.sign(
      { userId: "admin-1", username: "ADMIN001", role: Role.ADMIN },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    prismaInstance.batch.findUnique.mockResolvedValue({
      id: "batch-2025",
      departmentId: "dept-bca",
      label: "2025-28",
      currentSemester: 1,
      department: { name: "BCA", totalSemesters: 6 },
      sections: [{ id: "sec-2025-M", name: "M" }],
    });
    prismaInstance.batch.update.mockResolvedValue({
      id: "batch-2025",
      currentSemester: 2,
    });
    prismaInstance.academicTerm.findFirst.mockResolvedValue({ id: "term-sem2" });
    prismaInstance.subject.findMany.mockResolvedValue([
      { id: "sub-bca201", code: "BCA201", semesterNumber: 2 },
    ]);
    prismaInstance.subjectOffering.findFirst.mockResolvedValue({ id: "offering-bca201" });
    prismaInstance.subjectOfferingSection.upsert.mockResolvedValue({
      id: "off-sec-2",
      subjectOfferingId: "offering-bca201",
      sectionId: "sec-2025-M",
      facultyId: null,
    });

    const response = await request(app)
      .post("/api/admin/batches/batch-2025/promote")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(prismaInstance.subjectOfferingSection.upsert).toHaveBeenCalledWith({
      where: {
        subjectOfferingId_sectionId: {
          subjectOfferingId: "offering-bca201",
          sectionId: "sec-2025-M",
        },
      },
      update: {},
      create: {
        subjectOfferingId: "offering-bca201",
        sectionId: "sec-2025-M",
        facultyId: null,
      },
    });
  });

  it("Claim 3: Multi-batch sections sharing a semester update independent SubjectOfferingSection records", async () => {
    const hodToken = jwt.sign(
      { userId: "user-hod1", username: "EMP001", role: Role.FACULTY, facultyId: "fac-hod1" },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    // Section 1 (Batch 2024-27): sec-2024-M
    // Section 2 (Batch 2025-28): sec-2025-M
    prismaInstance.subjectOfferingSection.findUnique.mockResolvedValue({
      id: "off-sec-batch2024",
      subjectOfferingId: "offering-sem3",
      sectionId: "sec-2024-M",
      subjectOffering: {
        subject: { departmentId: "dept-bca" },
      },
    });
    prismaInstance.hODAssignment.findFirst.mockResolvedValue({
      facultyId: "fac-hod1",
      departmentId: "dept-bca",
    });
    prismaInstance.facultyProfile.findUnique.mockResolvedValue({ id: "fac-teacher1" });
    prismaInstance.subjectOfferingSection.update.mockResolvedValue({
      id: "off-sec-batch2024",
      facultyId: "fac-teacher1",
    });

    const response = await request(app)
      .post("/api/hod/subject-offerings/offering-sem3/sections/sec-2024-M/assign-faculty")
      .set("Authorization", `Bearer ${hodToken}`)
      .send({ facultyId: "fac-teacher1" });

    expect(response.status).toBe(200);
    // Asserts update target is explicitly the sectionId for Batch 2024-27
    expect(prismaInstance.subjectOfferingSection.update).toHaveBeenCalledWith({
      where: { id: "off-sec-batch2024" },
      data: { facultyId: "fac-teacher1" },
      include: { faculty: true, section: true },
    });
  });
});
