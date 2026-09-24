import { describe, it, expect, vi, beforeEach } from "vitest";
import { Request, Response, NextFunction } from "express";
import { requireUnlockedSection } from "../src/middleware/lock";
import { duplicatePolicyFromLastTerm } from "../src/controllers/policyController";
import { PrismaClient } from "@prisma/client";

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
      findUnique: vi.fn(),
      delete: vi.fn(),
      create: vi.fn(),
    },
    scoreComponent: {
      deleteMany: vi.fn(),
    },
    attendanceSlabRange: {
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn((callback) => callback(mPrisma)),
  };
  return {
    PrismaClient: vi.fn(() => mPrisma),
  };
});

describe("Phase 3: Policy Builder & Section Locking Security", () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let nextFunction: NextFunction;
  let prismaInstance: any;

  beforeEach(() => {
    vi.clearAllMocks();
    prismaInstance = new PrismaClient();
    nextFunction = vi.fn();
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
  });

  describe("Section Locking Middleware (requireUnlockedSection)", () => {
    it("REJECTS with 423 Locked when faculty is unassigned", async () => {
      mockReq = {
        params: { sectionId: "sec-locked-1" },
      };

      prismaInstance.subjectOfferingSection.findUnique.mockResolvedValue({
        id: "sec-locked-1",
        facultyId: null, // Unassigned!
        subjectOffering: {
          gradingPolicy: { confirmedAt: new Date() },
        },
      });

      const middleware = requireUnlockedSection("params", "sectionId");
      await middleware(mockReq as Request, mockRes as Response, nextFunction);

      expect(mockRes.status).toHaveBeenCalledWith(423);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: "SECTION_LOCKED_NO_FACULTY",
        })
      );
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it("REJECTS with 423 Locked when policy is unconfirmed (confirmedAt is null)", async () => {
      mockReq = {
        params: { sectionId: "sec-locked-2" },
      };

      prismaInstance.subjectOfferingSection.findUnique.mockResolvedValue({
        id: "sec-locked-2",
        facultyId: "fac-assigned-1",
        subjectOffering: {
          gradingPolicy: { confirmedAt: null }, // Policy pending confirmation!
        },
      });

      const middleware = requireUnlockedSection("params", "sectionId");
      await middleware(mockReq as Request, mockRes as Response, nextFunction);

      expect(mockRes.status).toHaveBeenCalledWith(423);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: "SECTION_LOCKED_POLICY_UNCONFIRMED",
        })
      );
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it("ALLOWS execution when section has assigned faculty AND confirmed policy", async () => {
      mockReq = {
        params: { sectionId: "sec-unlocked" },
      };

      prismaInstance.subjectOfferingSection.findUnique.mockResolvedValue({
        id: "sec-unlocked",
        facultyId: "fac-assigned-1",
        subjectOffering: {
          gradingPolicy: { confirmedAt: new Date() },
        },
      });

      const middleware = requireUnlockedSection("params", "sectionId");
      await middleware(mockReq as Request, mockRes as Response, nextFunction);

      expect(mockRes.status).not.toHaveBeenCalled();
      expect(nextFunction).toHaveBeenCalledTimes(1);
    });
  });

  describe("Duplicate Policy From Last Term", () => {
    it("copies previous policy structure and sets confirmedAt to null", async () => {
      mockReq = {
        user: {
          userId: "user-hod",
          role: "FACULTY",
          facultyId: "fac-hod-bca",
        },
        params: { offeringId: "offering-new-term" },
      };

      prismaInstance.subjectOffering.findUnique.mockResolvedValue({
        id: "offering-new-term",
        subjectId: "sub-webtech",
        subject: { departmentId: "dept-bca" },
      });

      prismaInstance.hODAssignment.findFirst.mockResolvedValue({
        facultyId: "fac-hod-bca",
        departmentId: "dept-bca",
      });

      // Previous offering found
      prismaInstance.subjectOffering.findFirst.mockResolvedValue({
        id: "offering-prev-term",
        subjectId: "sub-webtech",
        gradingPolicy: {
          cesGroupWeightage: 10,
          internalWeightage: 20,
          attendanceWeightage: 10,
          scoreComponents: [
            { group: "CES", name: "CES-I", maxMarks: 10, order: 1 },
            { group: "CES", name: "CES-II", maxMarks: 10, order: 2 },
          ],
          attendanceSlabRanges: [
            { minPercent: 0, maxPercent: 60, marks: 0 },
            { minPercent: 60.01, maxPercent: 100, marks: 10 },
          ],
        },
      });

      prismaInstance.gradingPolicy.create.mockResolvedValue({
        id: "duplicated-policy-id",
        subjectOfferingId: "offering-new-term",
        cesGroupWeightage: 10,
        internalWeightage: 20,
        attendanceWeightage: 10,
        confirmedAt: null, // Reset!
      });

      await duplicatePolicyFromLastTerm(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      const jsonCall = (mockRes.json as any).mock.calls[0][0];
      expect(jsonCall.policy.confirmedAt).toBeNull();
      expect(jsonCall.totalIAMarks).toBe(40);
    });
  });
});
