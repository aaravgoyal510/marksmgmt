import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST as commitPost } from "@/app/api/sections/[id]/attendance/commit/route";
import { POST as confirmPost } from "@/app/api/hod/subject-offerings/[offeringId]/policy/confirm/route";
import { POST as duplicatePost } from "@/app/api/hod/subject-offerings/[offeringId]/policy/duplicate-last-term/route";
import { prisma } from "@/lib/prisma";
import { createTestRequest, createToken, parseJsonResponse } from "../helpers/testRequest";
import { Role } from "@prisma/client";

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("../mocks/prisma");
  return { prisma: createPrismaMock() };
});

describe("Route-Level App Router Integration Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /api/sections/[id]/attendance/commit (Attendance Import Commit Route)", () => {
    it("rejects request with HTTP 423 Locked when section grading policy is unconfirmed", async () => {
      const token = createToken({
        userId: "fac-u1",
        username: "EMP001",
        role: Role.FACULTY,
        facultyId: "fac-p1",
      });

      (prisma.subjectOfferingSection.findUnique as any).mockResolvedValue({
        id: "sec-locked-1",
        facultyId: "fac-p1",
        subjectOffering: {
          gradingPolicy: {
            confirmedAt: null, // Policy NOT confirmed -> Locked!
          },
        },
      });

      const req = createTestRequest("/api/sections/sec-locked-1/attendance/commit", {
        method: "POST",
        token,
        body: {
          entries: [{ studentId: "s1", attendancePercent: 90 }],
        },
      });

      const res = await commitPost(req, { params: { id: "sec-locked-1" } });
      const { status, data } = await parseJsonResponse(res);

      expect(status).toBe(423);
      expect(data.error).toContain("Section is locked");
    });

    it("rejects request with HTTP 403 TEACHING_FACULTY_ONLY when authenticated faculty is NOT the assigned teaching faculty for the section", async () => {
      const unassignedFacultyToken = createToken({
        userId: "fac-u2",
        username: "EMP002",
        role: Role.FACULTY,
        facultyId: "fac-p2-other",
      });

      (prisma.subjectOfferingSection.findUnique as any).mockResolvedValue({
        id: "sec-unlocked-1",
        facultyId: "fac-p1-assigned", // Section assigned to fac-p1-assigned, NOT fac-p2-other
        subjectOffering: {
          gradingPolicy: {
            confirmedAt: new Date("2026-01-01T00:00:00.000Z"),
          },
        },
      });

      const req = createTestRequest("/api/sections/sec-unlocked-1/attendance/commit", {
        method: "POST",
        token: unassignedFacultyToken,
        body: {
          entries: [{ studentId: "s1", attendancePercent: 90 }],
        },
      });

      const res = await commitPost(req, { params: { id: "sec-unlocked-1" } });
      const { status, data } = await parseJsonResponse(res);

      expect(status).toBe(403);
      expect(data).toEqual({
        error:
          "Forbidden: Attendance import is restricted to the assigned teaching faculty for this section.",
        code: "TEACHING_FACULTY_ONLY",
      });
    });

    it("accepts request with HTTP 200 when section is unlocked and caller is the assigned teaching faculty", async () => {
      const assignedFacultyToken = createToken({
        userId: "fac-u1",
        username: "EMP001",
        role: Role.FACULTY,
        facultyId: "fac-p1-assigned",
      });

      (prisma.subjectOfferingSection.findUnique as any).mockResolvedValue({
        id: "sec-unlocked-1",
        facultyId: "fac-p1-assigned",
        subjectOffering: {
          gradingPolicy: {
            confirmedAt: new Date("2026-01-01T00:00:00.000Z"),
            attendanceSlabRanges: [{ minPercent: 0, maxPercent: 100, marks: 10 }],
          },
        },
      });

      (prisma.gradingPolicy.findFirst as any).mockResolvedValue({
        id: "pol-1",
        confirmedAt: new Date("2026-01-01T00:00:00.000Z"),
        attendanceSlabRanges: [{ minPercent: 0, maxPercent: 100, marks: 10 }],
      });

      (prisma.attendanceRecord.upsert as any).mockResolvedValue({
        id: "att-rec-1",
        subjectOfferingSectionId: "sec-unlocked-1",
        studentId: "s1",
        attendancePercent: 90,
      });

      const req = createTestRequest("/api/sections/sec-unlocked-1/attendance/commit", {
        method: "POST",
        token: assignedFacultyToken,
        body: {
          entries: [{ studentId: "s1", attendancePercent: 90 }],
        },
      });

      const res = await commitPost(req, { params: { id: "sec-unlocked-1" } });
      const { status, data } = await parseJsonResponse(res);

      expect(status).toBe(200);
      expect(data.message).toContain("Attendance records committed successfully");
    });
  });

  describe("POST /api/hod/subject-offerings/[offeringId]/policy/confirm (HOD Policy Confirm Route)", () => {
    it("rejects request with HTTP 403 HOD_DEPARTMENT_MISMATCH when HOD attempts policy confirm for another department", async () => {
      const hodTokenDeptA = createToken({
        userId: "hod-u1",
        username: "HOD_DEPT_A",
        role: Role.FACULTY,
        facultyId: "fac-hod-dept-a",
      });

      (prisma.subjectOffering.findUnique as any).mockResolvedValue({
        id: "offering-dept-b",
        subject: { id: "sub-b", departmentId: "dept-b" }, // Department B subject
        gradingPolicy: { id: "pol-b", attendanceWeightage: 10, attendanceSlabRanges: [] },
      });

      // HOD assignment query returns null because HOD belongs to Dept A, not Dept B
      (prisma.hODAssignment.findFirst as any).mockResolvedValue(null);

      const req = createTestRequest(
        "/api/hod/subject-offerings/offering-dept-b/policy/confirm",
        {
          method: "POST",
          token: hodTokenDeptA,
        }
      );

      const res = await confirmPost(req, { params: { offeringId: "offering-dept-b" } });
      const { status, data } = await parseJsonResponse(res);

      expect(status).toBe(403);
      expect(data.code).toBe("HOD_DEPARTMENT_MISMATCH");
    });
  });

  describe("POST /api/hod/subject-offerings/[offeringId]/policy/duplicate-last-term (HOD Policy Duplication Route)", () => {
    it("rejects request with HTTP 403 HOD_DEPARTMENT_MISMATCH when HOD attempts policy duplication for another department", async () => {
      const hodTokenDeptA = createToken({
        userId: "hod-u1",
        username: "HOD_DEPT_A",
        role: Role.FACULTY,
        facultyId: "fac-hod-dept-a",
      });

      (prisma.subjectOffering.findUnique as any).mockResolvedValue({
        id: "offering-dept-b",
        subject: { id: "sub-b", departmentId: "dept-b" },
      });

      (prisma.hODAssignment.findFirst as any).mockResolvedValue(null);

      const req = createTestRequest(
        "/api/hod/subject-offerings/offering-dept-b/policy/duplicate-last-term",
        {
          method: "POST",
          token: hodTokenDeptA,
        }
      );

      const res = await duplicatePost(req, { params: { offeringId: "offering-dept-b" } });
      const { status, data } = await parseJsonResponse(res);

      expect(status).toBe(403);
      expect(data.code).toBe("HOD_DEPARTMENT_MISMATCH");
    });
  });
});
