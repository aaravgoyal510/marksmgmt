import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { app } from "../src/app";
import { PrismaClient, Role } from "@prisma/client";

const JWT_SECRET = process.env.JWT_SECRET || "default-secret-change-me";

vi.mock("@prisma/client", () => {
  const mPrisma = {
    subjectOfferingSection: {
      findUnique: vi.fn(),
    },
    subjectOffering: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    hODAssignment: {
      findFirst: vi.fn(),
    },
    gradingPolicy: {
      update: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    attendanceRecord: {
      upsert: vi.fn(),
    },
    $transaction: vi.fn((callback) => callback(mPrisma)),
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

describe("Route-Level Supertest Integration Suite", () => {
  let prismaInstance: any;

  beforeEach(() => {
    vi.clearAllMocks();
    prismaInstance = new PrismaClient();
  });

  describe("POST /api/sections/:id/attendance/commit (Attendance Import Commit Route)", () => {
    it("rejects request with HTTP 423 Locked when section grading policy is unconfirmed", async () => {
      const token = jwt.sign(
        { userId: "fac-u1", username: "EMP001", role: Role.FACULTY, facultyId: "fac-p1" },
        JWT_SECRET,
        { expiresIn: "1h" }
      );

      prismaInstance.subjectOfferingSection.findUnique.mockResolvedValue({
        id: "sec-locked-1",
        facultyId: "fac-p1",
        subjectOffering: {
          gradingPolicy: {
            confirmedAt: null, // Policy NOT confirmed -> Locked!
          },
        },
      });

      const response = await request(app)
        .post("/api/sections/sec-locked-1/attendance/commit")
        .set("Authorization", `Bearer ${token}`)
        .send({
          entries: [{ studentId: "s1", attendancePercent: 90 }],
        });

      expect(response.status).toBe(423);
      expect(response.body.error).toContain("Section is locked");
    });

    it("rejects request with HTTP 403 TEACHING_FACULTY_ONLY when authenticated faculty is NOT the assigned teaching faculty for the section", async () => {
      const unassignedFacultyToken = jwt.sign(
        { userId: "fac-u2", username: "EMP002", role: Role.FACULTY, facultyId: "fac-p2-other" },
        JWT_SECRET,
        { expiresIn: "1h" }
      );

      prismaInstance.subjectOfferingSection.findUnique.mockResolvedValue({
        id: "sec-unlocked-1",
        facultyId: "fac-p1-assigned", // Section assigned to fac-p1-assigned, NOT fac-p2-other
        subjectOffering: {
          gradingPolicy: {
            confirmedAt: new Date("2026-01-01T00:00:00.000Z"),
          },
        },
      });

      const response = await request(app)
        .post("/api/sections/sec-unlocked-1/attendance/commit")
        .set("Authorization", `Bearer ${unassignedFacultyToken}`)
        .send({
          entries: [{ studentId: "s1", attendancePercent: 90 }],
        });

      expect(response.status).toBe(403);
      expect(response.body).toEqual({
        error: "Forbidden: Attendance import is restricted to the assigned teaching faculty for this section.",
        code: "TEACHING_FACULTY_ONLY",
      });
    });

    it("accepts request with HTTP 200 when section is unlocked and caller is the assigned teaching faculty", async () => {
      const assignedFacultyToken = jwt.sign(
        { userId: "fac-u1", username: "EMP001", role: Role.FACULTY, facultyId: "fac-p1-assigned" },
        JWT_SECRET,
        { expiresIn: "1h" }
      );

      prismaInstance.subjectOfferingSection.findUnique.mockResolvedValue({
        id: "sec-unlocked-1",
        facultyId: "fac-p1-assigned",
        subjectOffering: {
          gradingPolicy: {
            confirmedAt: new Date("2026-01-01T00:00:00.000Z"),
            attendanceSlabRanges: [{ minPercent: 0, maxPercent: 100, marks: 10 }],
          },
        },
      });

      prismaInstance.attendanceRecord.upsert.mockResolvedValue({
        id: "att-rec-1",
        subjectOfferingSectionId: "sec-unlocked-1",
        studentId: "s1",
        attendancePercent: 90,
      });

      const response = await request(app)
        .post("/api/sections/sec-unlocked-1/attendance/commit")
        .set("Authorization", `Bearer ${assignedFacultyToken}`)
        .send({
          entries: [{ studentId: "s1", attendancePercent: 90 }],
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toContain("Attendance records committed successfully");
    });
  });

  describe("POST /api/hod/subject-offerings/:offeringId/policy/confirm (HOD Policy Confirm Route)", () => {
    it("rejects request with HTTP 403 HOD_DEPARTMENT_MISMATCH when HOD attempts policy confirm for another department", async () => {
      const hodTokenDeptA = jwt.sign(
        { userId: "hod-u1", username: "HOD_DEPT_A", role: Role.FACULTY, facultyId: "fac-hod-dept-a" },
        JWT_SECRET,
        { expiresIn: "1h" }
      );

      prismaInstance.subjectOffering.findUnique.mockResolvedValue({
        id: "offering-dept-b",
        subject: { id: "sub-b", departmentId: "dept-b" }, // Department B subject
        gradingPolicy: { id: "pol-b" },
      });

      // HOD assignment query returns null because HOD belongs to Dept A, not Dept B
      prismaInstance.hODAssignment.findFirst.mockResolvedValue(null);

      const response = await request(app)
        .post("/api/hod/subject-offerings/offering-dept-b/policy/confirm")
        .set("Authorization", `Bearer ${hodTokenDeptA}`);

      expect(response.status).toBe(403);
      expect(response.body).toEqual({
        error: "Forbidden: Not HOD of this department",
      });
    });
  });

  describe("POST /api/hod/subject-offerings/:offeringId/policy/duplicate-last-term (HOD Policy Duplication Route)", () => {
    it("rejects request with HTTP 403 HOD_DEPARTMENT_MISMATCH when HOD attempts policy duplication for another department", async () => {
      const hodTokenDeptA = jwt.sign(
        { userId: "hod-u1", username: "HOD_DEPT_A", role: Role.FACULTY, facultyId: "fac-hod-dept-a" },
        JWT_SECRET,
        { expiresIn: "1h" }
      );

      prismaInstance.subjectOffering.findUnique.mockResolvedValue({
        id: "offering-dept-b",
        subject: { id: "sub-b", departmentId: "dept-b" },
      });

      prismaInstance.hODAssignment.findFirst.mockResolvedValue(null);

      const response = await request(app)
        .post("/api/hod/subject-offerings/offering-dept-b/policy/duplicate-last-term")
        .set("Authorization", `Bearer ${hodTokenDeptA}`);

      expect(response.status).toBe(403);
      expect(response.body).toEqual({
        error: "Forbidden: Not HOD of this department",
      });
    });
  });
});
