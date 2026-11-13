import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST as subjectsPost } from "@/app/api/hod/subjects/route";
import { GET as marksGridGet } from "@/app/api/sections/[id]/marks/route";
import { POST as policyPost } from "@/app/api/hod/subject-offerings/[offeringId]/policy/route";
import { POST as unconfirmPost } from "@/app/api/hod/subject-offerings/[offeringId]/policy/unconfirm/route";
import { POST as promotePost } from "@/app/api/admin/batches/[id]/promote/route";
import { GET as mySectionsGet } from "@/app/api/faculty/my-sections/route";
import { prisma } from "@/lib/prisma";
import { createTestRequest, createToken, parseJsonResponse } from "../helpers/testRequest";
import { Role } from "@prisma/client";

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("../mocks/prisma");
  return { prisma: createPrismaMock() };
});

describe("Edge Cases Audit Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Item 1: Mid-term subject creation scaffolds SubjectOfferingSection for active sections", async () => {
    const hodToken = createToken({
      userId: "user-hod1",
      username: "EMP001",
      role: Role.FACULTY,
      facultyId: "fac-hod1",
    });

    (prisma.hODAssignment.findFirst as any).mockResolvedValue({
      facultyId: "fac-hod1",
      departmentId: "dept-bca",
    });
    (prisma.department.findUnique as any).mockResolvedValue({
      id: "dept-bca",
      name: "BCA",
      totalSemesters: 6,
    });
    (prisma.subject.findUnique as any).mockResolvedValue(null);
    (prisma.subject.create as any).mockResolvedValue({
      id: "sub-bca103",
      departmentId: "dept-bca",
      name: "Data Structures",
      code: "BCA103",
      semesterNumber: 1,
    });
    (prisma.batch.findMany as any).mockResolvedValue([
      {
        id: "batch-2025",
        currentSemester: 1,
        sections: [{ id: "sec-2025-M" }, { id: "sec-2025-AFT" }],
      },
    ]);
    (prisma.academicTerm.findFirst as any).mockResolvedValue({ id: "term-sem1" });
    (prisma.subjectOffering.findFirst as any).mockResolvedValue({ id: "offering-bca103" });
    (prisma.subjectOfferingSection.upsert as any).mockResolvedValue({ id: "off-sec" });

    const req = createTestRequest("/api/hod/subjects", {
      method: "POST",
      token: hodToken,
      body: {
        departmentId: "dept-bca",
        name: "Data Structures",
        code: "BCA103",
        semesterNumber: 1,
      },
    });

    const res = await subjectsPost(req);
    const { status } = await parseJsonResponse(res);

    expect(status).toBe(201);
    expect(prisma.subjectOfferingSection.upsert).toHaveBeenCalledTimes(2);
  });

  it("Item 2: getSectionMarksGrid excludes students whose semesterOverride does not match offering semester", async () => {
    const facultyToken = createToken({
      userId: "user-fac1",
      username: "EMP001",
      role: Role.FACULTY,
      facultyId: "fac-1",
    });

    (prisma.subjectOfferingSection.findUnique as any).mockResolvedValue({
      id: "sos-sem1",
      facultyId: "fac-1",
      section: {
        students: [
          {
            id: "stud-1",
            erpNo: "E101",
            name: "Regular Sem1 Student",
            semesterOverride: null,
            batch: { currentSemester: 1 },
          },
          {
            id: "stud-2",
            erpNo: "E102",
            name: "Repeater Sem2 Student",
            semesterOverride: 2,
            batch: { currentSemester: 1 },
          },
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

    (prisma.mark.findMany as any).mockResolvedValue([]);
    (prisma.attendanceRecord.findMany as any).mockResolvedValue([]);

    const req = createTestRequest("/api/sections/sos-sem1/marks", {
      method: "GET",
      token: facultyToken,
    });

    const res = await marksGridGet(req, { params: { id: "sos-sem1" } });
    const { status, data } = await parseJsonResponse(res);

    expect(status).toBe(200);
    expect(data.students.length).toBe(1);
    expect(data.students[0].studentId).toBe("stud-1");
  });

  it("Item 3: Confirmed grading policy blocks direct edits and requires unconfirm first with AuditLog", async () => {
    const hodToken = createToken({
      userId: "user-hod1",
      username: "EMP001",
      role: Role.FACULTY,
      facultyId: "fac-hod1",
    });

    (prisma.subjectOffering.findUnique as any).mockResolvedValue({
      id: "offering-bca101",
      subject: { departmentId: "dept-bca" },
      gradingPolicy: { id: "policy-1", confirmedAt: new Date() },
      sections: [],
    });
    (prisma.gradingPolicy.findUnique as any).mockResolvedValue({
      id: "policy-1",
      confirmedAt: new Date(),
    });
    (prisma.hODAssignment.findFirst as any).mockResolvedValue({
      facultyId: "fac-hod1",
      departmentId: "dept-bca",
    });

    // Attempting direct edit on confirmed policy fails with 400 POLICY_LOCKED
    const editReq = createTestRequest(
      "/api/hod/subject-offerings/offering-bca101/policy",
      {
        method: "POST",
        token: hodToken,
        body: {
          cesGroupWeightage: 10,
          internalWeightage: 20,
          attendanceWeightage: 10,
          scoreComponents: [{ group: "CES", name: "CES-I", maxMarks: 10, order: 1 }],
          attendanceSlabRanges: [{ minPercent: 0, maxPercent: 100, marks: 10 }],
        },
      }
    );

    const editRes = await policyPost(editReq, {
      params: { offeringId: "offering-bca101" },
    });
    const editJson = await parseJsonResponse(editRes);

    expect(editJson.status).toBe(400);
    expect(editJson.data.code).toBe("POLICY_LOCKED");

    // Unconfirming policy succeeds and creates AuditLog entry
    (prisma.subjectOffering.findUnique as any).mockResolvedValue({
      id: "offering-bca101",
      subject: { departmentId: "dept-bca" },
      gradingPolicy: {
        id: "policy-1",
        confirmedAt: new Date(),
        scoreComponents: [],
      },
      sections: [],
    });
    (prisma.mark.count as any).mockResolvedValue(0);
    (prisma.attendanceRecord.count as any).mockResolvedValue(0);
    (prisma.gradingPolicy.update as any).mockResolvedValue({
      id: "policy-1",
      confirmedAt: null,
      scoreComponents: [],
      attendanceSlabRanges: [],
    });

    const unconfirmReq = createTestRequest(
      "/api/hod/subject-offerings/offering-bca101/policy/unconfirm",
      {
        method: "POST",
        token: hodToken,
      }
    );

    const unconfirmRes = await unconfirmPost(unconfirmReq, {
      params: { offeringId: "offering-bca101" },
    });
    const unconfirmJson = await parseJsonResponse(unconfirmRes);

    expect(unconfirmJson.status).toBe(200);
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
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
    const adminToken = createToken({
      userId: "admin-1",
      username: "ADMIN001",
      role: Role.ADMIN,
    });

    (prisma.batch.findUnique as any).mockResolvedValue({
      id: "batch-bca-final",
      departmentId: "dept-bca",
      label: "2022-25",
      currentSemester: 6,
      department: { name: "BCA", totalSemesters: 6 },
      sections: [],
    });

    const promoteReq = createTestRequest(
      "/api/admin/batches/batch-bca-final/promote",
      {
        method: "POST",
        token: adminToken,
      }
    );

    const promoteRes = await promotePost(promoteReq, {
      params: { id: "batch-bca-final" },
    });
    const { status, data } = await parseJsonResponse(promoteRes);

    expect(status).toBe(400);
    expect(data.error).toContain("maximum totalSemesters (6)");
  });

  it("Item 5: GET /api/faculty/my-sections returns all assigned section offerings for logged in faculty", async () => {
    const facultyToken = createToken({
      userId: "user-fac3",
      username: "EMP003",
      role: Role.FACULTY,
      facultyId: "fac-patel",
    });

    (prisma.subjectOfferingSection.findMany as any).mockResolvedValue([
      {
        id: "sos-1",
        sectionId: "sec-M",
        facultyId: "fac-patel",
        section: {
          name: "M",
          batch: { label: "2025-28", department: { name: "BCA" } },
        },
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
        section: {
          name: "AFT",
          batch: { label: "2025-28", department: { name: "BCA" } },
        },
        subjectOffering: {
          subjectId: "sub-101",
          subject: { code: "BCA101", name: "Web Technologies" },
          academicTerm: { label: "AY2025-26" },
          gradingPolicy: { confirmedAt: new Date() },
        },
      },
    ]);

    const req = createTestRequest("/api/faculty/my-sections", {
      method: "GET",
      token: facultyToken,
    });

    const res = await mySectionsGet(req);
    const { status, data } = await parseJsonResponse(res);

    expect(status).toBe(200);
    expect(data.sections.length).toBe(2);
    expect(data.sections[0].sectionName).toBe("M");
    expect(data.sections[1].sectionName).toBe("AFT");
  });
});
