import { describe, it, expect, vi, beforeEach } from "vitest";
import { Request, Response } from "express";
import { previewAttendanceImport, commitAttendanceImport } from "../src/controllers/attendanceController";
import { PrismaClient } from "@prisma/client";

vi.mock("@prisma/client", () => {
  const mPrisma = {
    subjectOfferingSection: {
      findUnique: vi.fn(),
    },
    attendanceRecord: {
      upsert: vi.fn(),
    },
    $transaction: vi.fn((callback) => callback(mPrisma)),
  };
  return {
    PrismaClient: vi.fn(() => mPrisma),
  };
});

describe("Phase 5: Attendance CSV Dry-Run Preview & Commit Engine", () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let prismaInstance: any;

  beforeEach(() => {
    vi.clearAllMocks();
    prismaInstance = new PrismaClient();
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
  });

  describe("Dry-Run Attendance CSV Preview", () => {
    it("correctly categorizes READY, BLOCKED_SLAB_GAP, and UNMATCHED rows", async () => {
      mockReq = {
        params: { id: "sec-webtech-m" },
        body: {
          csvContent: `ERP No,PRN,Name,Attendance%\nBCA25001,PRN25001,Aarav Gupta,88%\nBCA25002,PRN25002,Ananya Sharma,75.005%\nBCA25999,PRN25999,Unknown Student,90%`,
        },
      };

      prismaInstance.subjectOfferingSection.findUnique.mockResolvedValue({
        id: "sec-webtech-m",
        section: {
          students: [
            { id: "s1", erpNo: "BCA25001", prn: "PRN25001", name: "Aarav Gupta" },
            { id: "s2", erpNo: "BCA25002", prn: "PRN25002", name: "Ananya Sharma" },
          ],
        },
        subjectOffering: {
          academicTerm: { semesterNumber: 1 },
          gradingPolicy: {
            attendanceSlabRanges: [
              { minPercent: 0, maxPercent: 60, marks: 0 },
              { minPercent: 60.01, maxPercent: 75, marks: 4 },
              { minPercent: 75.01, maxPercent: 85, marks: 6 },
              { minPercent: 85.01, maxPercent: 100, marks: 10 },
            ],
          },
        },
      });

      await previewAttendanceImport(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      const jsonCall = (mockRes.json as any).mock.calls[0][0];

      expect(jsonCall.summary.readyCount).toBe(1);
      expect(jsonCall.summary.blockedCount).toBe(1);
      expect(jsonCall.summary.unmatchedCount).toBe(1);

      // Row 1: Ready (88% -> 10 marks)
      expect(jsonCall.rows[0].status).toBe("READY");
      expect(jsonCall.rows[0].marksPreview).toBe(10);

      // Row 2: Blocked due to slab gap (75.005% is between 75 and 75.01)
      expect(jsonCall.rows[1].status).toBe("BLOCKED_SLAB_GAP");
      expect(jsonCall.rows[1].marksPreview).toBeNull();

      // Row 3: Unmatched student
      expect(jsonCall.rows[2].status).toBe("UNMATCHED");
    });

    it("handles plain decimal attendance values with no % sign (e.g. 88.89, 55.56, 100)", async () => {
      mockReq = {
        params: { id: "sec-webtech-m" },
        body: {
          csvContent: `ERP No,PRN,Name,Attendance\nBCA25001,PRN25001,Aarav Gupta,88.89\nBCA25002,PRN25002,Ananya Sharma,55.56\nBCA25003,PRN25003,Rohan Verma,100`,
        },
      };

      prismaInstance.subjectOfferingSection.findUnique.mockResolvedValue({
        id: "sec-webtech-m",
        section: {
          students: [
            { id: "s1", erpNo: "BCA25001", prn: "PRN25001", name: "Aarav Gupta" },
            { id: "s2", erpNo: "BCA25002", prn: "PRN25002", name: "Ananya Sharma" },
            { id: "s3", erpNo: "BCA25003", prn: "PRN25003", name: "Rohan Verma" },
          ],
        },
        subjectOffering: {
          academicTerm: { semesterNumber: 1 },
          gradingPolicy: {
            attendanceSlabRanges: [
              { minPercent: 0, maxPercent: 60, marks: 0 },
              { minPercent: 60.01, maxPercent: 75, marks: 4 },
              { minPercent: 75.01, maxPercent: 85, marks: 6 },
              { minPercent: 85.01, maxPercent: 100, marks: 10 },
            ],
          },
        },
      });

      await previewAttendanceImport(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      const jsonCall = (mockRes.json as any).mock.calls[0][0];

      expect(jsonCall.summary.readyCount).toBe(3);
      expect(jsonCall.summary.blockedCount).toBe(0);
      expect(jsonCall.summary.unmatchedCount).toBe(0);

      // Row 1: 88.89 (plain decimal, no % sign) -> Slab 85.01-100% -> 10 marks
      expect(jsonCall.rows[0].attendancePercent).toBe(88.89);
      expect(jsonCall.rows[0].status).toBe("READY");
      expect(jsonCall.rows[0].marksPreview).toBe(10);

      // Row 2: 55.56 (plain decimal, no % sign) -> Slab 0-60% -> 0 marks
      expect(jsonCall.rows[1].attendancePercent).toBe(55.56);
      expect(jsonCall.rows[1].status).toBe("READY");
      expect(jsonCall.rows[1].marksPreview).toBe(0);

      // Row 3: 100 (integer decimal, no % sign) -> Slab 85.01-100% -> 10 marks
      expect(jsonCall.rows[2].attendancePercent).toBe(100);
      expect(jsonCall.rows[2].status).toBe("READY");
      expect(jsonCall.rows[2].marksPreview).toBe(10);
    });
  });

  describe("Commit Attendance Records (Overwrite Pattern)", () => {
    it("upserts attendance records for READY rows and overwrites previous values", async () => {
      mockReq = {
        user: { facultyId: "fac-p1" },
        params: { id: "sec-webtech-m" },
        body: {
          entries: [{ studentId: "s1", attendancePercent: 92 }],
        },
      };

      prismaInstance.subjectOfferingSection.findUnique.mockResolvedValue({
        id: "sec-webtech-m",
        facultyId: "fac-p1",
        subjectOffering: {
          gradingPolicy: {
            attendanceSlabRanges: [{ minPercent: 0, maxPercent: 100, marks: 10 }],
          },
        },
      });

      prismaInstance.attendanceRecord.upsert.mockResolvedValue({
        id: "att-rec-1",
        subjectOfferingSectionId: "sec-webtech-m",
        studentId: "s1",
        attendancePercent: 92,
      });

      await commitAttendanceImport(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(prismaInstance.attendanceRecord.upsert).toHaveBeenCalledWith({
        where: {
          subjectOfferingSectionId_studentId: {
            subjectOfferingSectionId: "sec-webtech-m",
            studentId: "s1",
          },
        },
        update: { attendancePercent: 92 },
        create: {
          subjectOfferingSectionId: "sec-webtech-m",
          studentId: "s1",
          attendancePercent: 92,
        },
      });
    });
  });
});
