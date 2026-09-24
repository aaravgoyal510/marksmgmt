import { describe, it, expect, vi, beforeEach } from "vitest";
import { Request, Response } from "express";
import { getSubjectOfferingsStatusBoard, assignFacultyToSection, hodPromoteBatch } from "../src/controllers/hodController";
import { PrismaClient } from "@prisma/client";

vi.mock("@prisma/client", () => {
  const mPrisma = {
    subjectOffering: {
      findMany: vi.fn(),
    },
    subjectOfferingSection: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    batch: {
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
  };
});

describe("HOD Academic Management & Status Board Logic", () => {
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

  describe("HOD Status Board Calculation", () => {
    it("should correctly classify sections into UNASSIGNED, POLICY_PENDING, and ACTIVE", async () => {
      mockReq = {
        query: { departmentId: "dept-bca" },
      };

      prismaInstance.subjectOffering.findMany.mockResolvedValue([
        {
          id: "offering-1",
          subjectId: "sub-1",
          subject: { name: "Web Tech", code: "BCA101", semesterNumber: 1 },
          academicTermId: "term-1",
          academicTerm: { label: "AY2025-26" },
          gradingPolicy: { id: "policy-1", confirmedAt: new Date() }, // Confirmed policy
          sections: [
            {
              id: "off-sec-1",
              sectionId: "sec-m",
              facultyId: "fac-1", // Has faculty + confirmed policy -> ACTIVE
              section: { name: "M" },
              faculty: { name: "Prof. Amit" },
            },
            {
              id: "off-sec-2",
              sectionId: "sec-aft",
              facultyId: null, // No faculty -> UNASSIGNED
              section: { name: "AFT" },
              faculty: null,
            },
          ],
        },
        {
          id: "offering-2",
          subjectId: "sub-2",
          subject: { name: "C Prog", code: "BCA102", semesterNumber: 1 },
          academicTermId: "term-1",
          academicTerm: { label: "AY2025-26" },
          gradingPolicy: null, // Policy pending!
          sections: [
            {
              id: "off-sec-3",
              sectionId: "sec-m",
              facultyId: "fac-2", // Has faculty but policy is null -> POLICY_PENDING
              section: { name: "M" },
              faculty: { name: "Dr. Rajesh" },
            },
          ],
        },
      ]);

      await getSubjectOfferingsStatusBoard(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      const jsonCall = (mockRes.json as any).mock.calls[0][0];
      const statusBoard = jsonCall.statusBoard;

      expect(statusBoard).toHaveLength(2);
      
      // Offering 1 sections
      expect(statusBoard[0].sections[0].status).toBe("ACTIVE");
      expect(statusBoard[0].sections[0].isLocked).toBe(false);

      expect(statusBoard[0].sections[1].status).toBe("UNASSIGNED");
      expect(statusBoard[0].sections[1].isLocked).toBe(true);

      // Offering 2 sections
      expect(statusBoard[1].sections[0].status).toBe("POLICY_PENDING");
      expect(statusBoard[1].sections[0].isLocked).toBe(true);
    });
  });

  describe("Cross-Department Faculty Assignment Protection", () => {
    it("REJECTS faculty assignment when HOD attempts to assign faculty in another department", async () => {
      mockReq = {
        user: {
          userId: "user-bca-hod",
          username: "EMP001",
          role: "FACULTY",
          facultyId: "fac-bca-hod",
        },
        params: {
          offeringId: "off-mca-1",
          sectionId: "sec-a",
        },
        body: {
          facultyId: "fac-target-1",
        },
      };

      prismaInstance.subjectOfferingSection.findUnique.mockResolvedValue({
        id: "off-sec-mca",
        subjectOfferingId: "off-mca-1",
        sectionId: "sec-a",
        subjectOffering: {
          subject: {
            departmentId: "dept-mca-id", // MCA Department
          },
        },
      });

      // BCA HOD is NOT an HOD of MCA Department
      prismaInstance.hODAssignment.findFirst.mockResolvedValue(null);

      await assignFacultyToSection(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "Forbidden: You are not authorized as HOD for this subject's department",
          code: "HOD_DEPARTMENT_MISMATCH",
        })
      );
    });
  });

  describe("HOD Cross-Department Batch Promotion Protection", () => {
    it("REJECTS batch promotion when HOD of Department A attempts to promote a batch in Department B via hodPromoteBatch", async () => {
      mockReq = {
        user: {
          userId: "user-bca-hod",
          username: "EMP001",
          role: "FACULTY",
          facultyId: "fac-bca-hod",
        },
        params: {
          batchId: "batch-mca-2025",
        },
      };

      prismaInstance.batch.findUnique.mockResolvedValue({
        id: "batch-mca-2025",
        label: "MCA 2025-27",
        departmentId: "dept-mca-id", // MCA Department
        currentSemester: 1,
        department: { totalSemesters: 4 },
      });

      // BCA HOD is NOT an HOD of MCA Department -> returns null
      prismaInstance.hODAssignment.findFirst.mockResolvedValue(null);

      await hodPromoteBatch(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "Forbidden: You are not authorized as HOD for this batch's department",
          code: "HOD_DEPARTMENT_MISMATCH",
        })
      );
    });
  });
});
