import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST as batchPost } from "@/app/api/admin/batches/route";
import { POST as sectionPost } from "@/app/api/admin/batches/[id]/sections/route";
import { POST as promotePost } from "@/app/api/admin/batches/[id]/promote/route";
import { POST as assignFacultyPost } from "@/app/api/hod/subject-offerings/[offeringId]/sections/[sectionId]/assign-faculty/route";
import { prisma } from "@/lib/prisma";
import { createTestRequest, createToken, parseJsonResponse } from "../helpers/testRequest";
import { Role } from "@prisma/client";

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("../mocks/prisma");
  return { prisma: createPrismaMock() };
});

describe("Batch Section Scoping & Faculty Assignment Suite", () => {
  const adminToken = createToken({
    userId: "admin-1",
    username: "ADMIN001",
    role: Role.ADMIN,
  });

  const hodToken = createToken({
    userId: "user-hod1",
    username: "EMP001",
    role: Role.FACULTY,
    facultyId: "fac-hod1",
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("New batch creation scaffolds default section 'A' and creates UNASSIGNED SubjectOfferingSection rows for all current term subjects", async () => {
    (prisma.department.findUnique as any).mockResolvedValue({
      id: "dept-bca",
      name: "BCA",
    });
    (prisma.batch.create as any).mockResolvedValue({
      id: "batch-2026",
      departmentId: "dept-bca",
      label: "2026-29",
      currentSemester: 1,
    });
    (prisma.section.create as any).mockResolvedValue({
      id: "sec-2026-A",
      batchId: "batch-2026",
      name: "A",
    });
    (prisma.academicTerm.findFirst as any).mockResolvedValue({
      id: "term-sem1",
    });
    (prisma.subject.findMany as any).mockResolvedValue([
      { id: "sub-bca101", code: "BCA101", semesterNumber: 1 },
    ]);
    (prisma.subjectOffering.findFirst as any).mockResolvedValue({
      id: "offering-bca101",
    });
    (prisma.subjectOfferingSection.upsert as any).mockResolvedValue({
      id: "off-sec-1",
      subjectOfferingId: "offering-bca101",
      sectionId: "sec-2026-A",
      facultyId: null,
    });

    const req = createTestRequest("/api/admin/batches", {
      method: "POST",
      token: adminToken,
      body: {
        departmentId: "dept-bca",
        label: "2026-29",
        startYear: 2026,
      },
    });

    const res = await batchPost(req);
    const { status, data } = await parseJsonResponse(res);

    expect(status).toBe(201);
    expect(data.message).toBe("Batch created successfully");
    expect(prisma.section.create).toHaveBeenCalledWith({
      data: {
        batchId: "batch-2026",
        name: "A",
      },
    });
    expect(prisma.subjectOfferingSection.upsert).toHaveBeenCalledWith({
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

  it("Adding section 'B' to an existing batch dynamically creates corresponding SubjectOfferingSection rows", async () => {
    (prisma.batch.findUnique as any).mockResolvedValue({
      id: "batch-2025",
      departmentId: "dept-bca",
      label: "2025-28",
      currentSemester: 1,
    });
    (prisma.section.create as any).mockResolvedValue({
      id: "sec-2025-B",
      batchId: "batch-2025",
      name: "B",
    });
    (prisma.academicTerm.findFirst as any).mockResolvedValue({
      id: "term-sem1",
    });
    (prisma.subject.findMany as any).mockResolvedValue([
      { id: "sub-bca101", code: "BCA101", semesterNumber: 1 },
      { id: "sub-bca102", code: "BCA102", semesterNumber: 1 },
    ]);
    (prisma.subjectOffering.findFirst as any).mockResolvedValue({
      id: "offering-bca101",
    });
    (prisma.subjectOfferingSection.upsert as any).mockResolvedValue({
      id: "off-sec-b",
      subjectOfferingId: "offering-bca101",
      sectionId: "sec-2025-B",
      facultyId: null,
    });

    const req = createTestRequest("/api/admin/batches/batch-2025/sections", {
      method: "POST",
      token: adminToken,
      body: { name: "B" },
    });

    const res = await sectionPost(req, { params: { id: "batch-2025" } });
    const { status, data } = await parseJsonResponse(res);

    expect(status).toBe(201);
    expect(data.section).toBeDefined();
    expect(prisma.section.create).toHaveBeenCalledWith({
      data: {
        batchId: "batch-2025",
        name: "B",
      },
    });
    expect(prisma.subjectOfferingSection.upsert).toHaveBeenCalledWith({
      where: {
        subjectOfferingId_sectionId: {
          subjectOfferingId: "offering-bca101",
          sectionId: "sec-2025-B",
        },
      },
      update: {},
      create: {
        subjectOfferingId: "offering-bca101",
        sectionId: "sec-2025-B",
        facultyId: null,
      },
    });
  });

  it("Admin batch promotion retains existing section structures while updating currentSemester", async () => {
    (prisma.batch.findUnique as any).mockResolvedValue({
      id: "batch-2025",
      departmentId: "dept-bca",
      label: "2025-28",
      currentSemester: 1,
      department: { name: "BCA", totalSemesters: 6 },
      sections: [{ id: "sec-2025-M", name: "M" }],
    });
    (prisma.batch.update as any).mockResolvedValue({
      id: "batch-2025",
      currentSemester: 2,
    });
    (prisma.academicTerm.findFirst as any).mockResolvedValue({
      id: "term-sem2",
    });
    (prisma.subject.findMany as any).mockResolvedValue([
      { id: "sub-bca201", code: "BCA201", semesterNumber: 2 },
    ]);
    (prisma.subjectOffering.findFirst as any).mockResolvedValue({
      id: "offering-bca201",
    });
    (prisma.subjectOfferingSection.upsert as any).mockResolvedValue({
      id: "off-sec-2",
      subjectOfferingId: "offering-bca201",
      sectionId: "sec-2025-M",
      facultyId: null,
    });

    const req = createTestRequest("/api/admin/batches/batch-2025/promote", {
      method: "POST",
      token: adminToken,
    });

    const res = await promotePost(req, { params: { id: "batch-2025" } });
    const { status, data } = await parseJsonResponse(res);

    expect(status).toBe(200);
    expect(data.message).toBe("Batch promoted to Semester 2 successfully");
    expect(prisma.subjectOfferingSection.upsert).toHaveBeenCalledWith({
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

  it("HOD successfully assigns faculty member to subject offering section within department scope", async () => {
    (prisma.subjectOfferingSection.findUnique as any).mockResolvedValue({
      id: "off-sec-batch2024",
      subjectOfferingId: "offering-sem3",
      sectionId: "sec-2024-M",
      subjectOffering: {
        subject: { departmentId: "dept-bca" },
      },
    });
    (prisma.hODAssignment.findFirst as any).mockResolvedValue({
      facultyId: "fac-hod1",
      departmentId: "dept-bca",
    });
    (prisma.facultyProfile.findUnique as any).mockResolvedValue({
      id: "fac-teacher1",
    });
    (prisma.subjectOfferingSection.update as any).mockResolvedValue({
      id: "off-sec-batch2024",
      facultyId: "fac-teacher1",
    });

    const req = createTestRequest(
      "/api/hod/subject-offerings/offering-sem3/sections/sec-2024-M/assign-faculty",
      {
        method: "POST",
        token: hodToken,
        body: { facultyId: "fac-teacher1" },
      }
    );

    const res = await assignFacultyPost(req, {
      params: { offeringId: "offering-sem3", sectionId: "sec-2024-M" },
    });
    const { status, data } = await parseJsonResponse(res);

    expect(status).toBe(200);
    expect(data.message).toBe("Faculty assigned successfully");
    expect(prisma.subjectOfferingSection.update).toHaveBeenCalledWith({
      where: { id: "off-sec-batch2024" },
      data: { facultyId: "fac-teacher1" },
      include: { faculty: true, section: true },
    });
  });
});
