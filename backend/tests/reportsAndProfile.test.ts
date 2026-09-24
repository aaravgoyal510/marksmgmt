import { describe, it, expect, vi, beforeEach } from "vitest";
import { Request, Response } from "express";
import { exportSubjectOfferingReport } from "../src/controllers/reportsController";
import { changePassword } from "../src/controllers/profileController";
import { PrismaClient } from "@prisma/client";
import { comparePassword, hashPassword } from "../src/utils/password";

vi.mock("@prisma/client", () => {
  const mPrisma = {
    subjectOffering: {
      findUnique: vi.fn(),
    },
    mark: {
      findMany: vi.fn(),
    },
    attendanceRecord: {
      findMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({ id: "audit-1" }),
    },
  };
  return {
    PrismaClient: vi.fn(() => mPrisma),
  };
});

vi.mock("../src/utils/password", () => ({
  comparePassword: vi.fn(),
  hashPassword: vi.fn(),
}));

describe("Phase 7: Reports Export & Profile Management", () => {
  let mockReq: any;
  let mockRes: Partial<Response>;
  let prismaInstance: any;

  beforeEach(() => {
    vi.clearAllMocks();
    prismaInstance = new PrismaClient();
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
      setHeader: vi.fn(),
    };
  });

  describe("Dynamic Column CSV Report Export", () => {
    it("generates CSV string with dynamic columns based on offering policy components", async () => {
      mockReq = {
        params: { id: "offering-report-1" },
        query: { format: "csv" },
      };

      prismaInstance.subjectOffering.findUnique.mockResolvedValue({
        id: "offering-report-1",
        subject: { name: "Web Technologies", code: "BCA101", department: { name: "BCA" } },
        academicTerm: { label: "AY2025-26" },
        gradingPolicy: {
          cesGroupWeightage: 10,
          internalWeightage: 20,
          attendanceWeightage: 10,
          scoreComponents: [
            { id: "c1", group: "CES", name: "CES-I", maxMarks: 10, order: 1 },
            { id: "c2", group: "CES", name: "CES-II", maxMarks: 10, order: 2 },
            { id: "c3", group: "INTERNAL", name: "Internal Exam", maxMarks: 40, order: 3 },
          ],
          attendanceSlabRanges: [{ minPercent: 0, maxPercent: 100, marks: 10 }],
        },
        sections: [
          {
            id: "sec-m-id",
            section: {
              name: "M",
              students: [{ id: "st-1", erpNo: "BCA25001", prn: "PRN25001", name: "Aarav Gupta" }],
            },
          },
        ],
      });

      prismaInstance.mark.findMany.mockResolvedValue([
        { studentId: "st-1", scoreComponentId: "c1", marksObtained: 8 },
        { studentId: "st-1", scoreComponentId: "c2", marksObtained: 10 },
        { studentId: "st-1", scoreComponentId: "c3", marksObtained: 30 },
      ]);

      prismaInstance.attendanceRecord.findMany.mockResolvedValue([
        { studentId: "st-1", attendancePercent: 88 },
      ]);

      await exportSubjectOfferingReport(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.setHeader).toHaveBeenCalledWith("Content-Type", "text/csv");

      const csvContent = (mockRes.send as any).mock.calls[0][0];
      expect(csvContent).toContain("Enrollment No");
      expect(csvContent).toContain("CES-I");
      expect(csvContent).toContain("CES-II");
      expect(csvContent).toContain("Internal Exam");
      expect(csvContent).toContain("Total IA Marks");
      expect(csvContent).toContain("BCA25001");
    });
  });

  describe("Profile Password Change", () => {
    it("changes password successfully when current password is valid", async () => {
      mockReq = {
        user: { userId: "user-123" },
        body: { currentPassword: "OldPassword123!", newPassword: "NewPassword123!" },
      };

      prismaInstance.user.findUnique.mockResolvedValue({
        id: "user-123",
        passwordHash: "old-hash",
      });

      (comparePassword as any).mockResolvedValue(true);
      (hashPassword as any).mockResolvedValue("new-hash");

      await changePassword(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(prismaInstance.user.update).toHaveBeenCalledWith({
        where: { id: "user-123" },
        data: { passwordHash: "new-hash" },
      });
    });

    it("rejects password change with 400 when current password is incorrect", async () => {
      mockReq = {
        user: { userId: "user-123" },
        body: { currentPassword: "WrongPassword!", newPassword: "NewPassword123!" },
      };

      prismaInstance.user.findUnique.mockResolvedValue({
        id: "user-123",
        passwordHash: "old-hash",
      });

      (comparePassword as any).mockResolvedValue(false);

      await changePassword(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: "Incorrect current password" });
    });
  });
});
