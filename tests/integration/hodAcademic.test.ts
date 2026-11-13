import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET as getSubjectOfferingsStatusBoard } from "@/app/api/hod/subject-offerings/route";
import { POST as assignFacultyToSection } from "@/app/api/hod/subject-offerings/[offeringId]/sections/[sectionId]/assign-faculty/route";
import { POST as hodPromoteBatch } from "@/app/api/hod/batches/[batchId]/promote/route";
import { prisma } from "@/lib/prisma";
import { createTestRequest, createToken, parseJsonResponse } from "../helpers/testRequest";
import { Role } from "@prisma/client";

vi.mock("@/lib/prisma", () => {
  const mPrisma: any = {
    subjectOffering: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    subjectOfferingSection: {
      findUnique: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
    batch: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    academicTerm: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    subject: {
      findMany: vi.fn(),
    },
    hODAssignment: {
      findFirst: vi.fn(),
    },
    facultyProfile: {
      findUnique: vi.fn(),
    },
  };
  return { prisma: mPrisma };
});

describe("HOD Academic Management & Status Board Logic", () => {
  const bcaHodToken = createToken({
    userId: "user-bca-hod",
    username: "EMP001",
    role: Role.FACULTY,
    facultyId: "fac-bca-hod",
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("HOD Status Board Calculation", () => {
    it("correctly classifies sections into UNASSIGNED, POLICY_PENDING, and ACTIVE with isLocked flags", async () => {
      const req = createTestRequest("/api/hod/subject-offerings?departmentId=dept-bca", {
        method: "GET",
        token: bcaHodToken,
      });

      // HOD verified for dept-bca
      (prisma.hODAssignment.findFirst as any).mockResolvedValue({
        id: "hod-assign-bca",
        facultyId: "fac-bca-hod",
        departmentId: "dept-bca",
      });

      (prisma.subjectOffering.findMany as any).mockResolvedValue([
        {
          id: "offering-1",
          subjectId: "sub-1",
          academicTermId: "term-1",
          academicTerm: { label: "AY2025-26" },
          subject: { name: "Web Tech", code: "BCA101", semesterNumber: 1 },
          gradingPolicy: { id: "policy-1", confirmedAt: new Date() }, // Confirmed policy
          sections: [
            {
              id: "off-sec-1",
              sectionId: "sec-m",
              facultyId: "fac-1", // Has faculty + confirmed policy -> ACTIVE
              section: { name: "M", batch: { label: "2025-28" } },
              faculty: { name: "Prof. Amit" },
            },
            {
              id: "off-sec-2",
              sectionId: "sec-aft",
              facultyId: null, // No faculty -> UNASSIGNED
              section: { name: "AFT", batch: { label: "2025-28" } },
              faculty: null,
            },
          ],
        },
        {
          id: "offering-2",
          subjectId: "sub-2",
          academicTermId: "term-1",
          academicTerm: { label: "AY2025-26" },
          subject: { name: "C Prog", code: "BCA102", semesterNumber: 1 },
          gradingPolicy: null, // Policy pending confirmation!
          sections: [
            {
              id: "off-sec-3",
              sectionId: "sec-m",
              facultyId: "fac-2", // Has faculty but policy is null -> POLICY_PENDING
              section: { name: "M", batch: { label: "2025-28" } },
              faculty: { name: "Dr. Rajesh" },
            },
          ],
        },
      ]);

      const res = await getSubjectOfferingsStatusBoard(req);
      const { status, data } = await parseJsonResponse<any>(res);

      expect(status).toBe(200);
      const statusBoard = data.statusBoard;
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
    it("REJECTS faculty assignment with 403 Forbidden (HOD_DEPARTMENT_MISMATCH) when HOD attempts assignment outside their department", async () => {
      const req = createTestRequest(
        "/api/hod/subject-offerings/off-mca-1/sections/sec-a/assign-faculty",
        {
          method: "POST",
          token: bcaHodToken,
          body: { facultyId: "fac-target-1" },
        }
      );

      (prisma.subjectOfferingSection.findUnique as any).mockResolvedValue({
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
      (prisma.hODAssignment.findFirst as any).mockResolvedValue(null);

      const res = await assignFacultyToSection(req, {
        params: { offeringId: "off-mca-1", sectionId: "sec-a" },
      });
      const { status, data } = await parseJsonResponse<any>(res);

      expect(status).toBe(403);
      expect(data.code).toBe("HOD_DEPARTMENT_MISMATCH");
      expect(data.error).toContain("Forbidden: You are not authorized as HOD for this department");
    });
  });

  describe("HOD Cross-Department Batch Promotion Protection", () => {
    it("REJECTS batch promotion with 403 Forbidden (HOD_DEPARTMENT_MISMATCH) when HOD attempts cross-department batch promotion", async () => {
      const req = createTestRequest("/api/hod/batches/batch-mca-2025/promote", {
        method: "POST",
        token: bcaHodToken,
      });

      (prisma.batch.findUnique as any).mockResolvedValue({
        id: "batch-mca-2025",
        label: "MCA 2025-27",
        departmentId: "dept-mca-id", // MCA Department
        currentSemester: 1,
        department: { totalSemesters: 4 },
        sections: [],
      });

      // BCA HOD is NOT an HOD of MCA Department
      (prisma.hODAssignment.findFirst as any).mockResolvedValue(null);

      const res = await hodPromoteBatch(req, {
        params: { batchId: "batch-mca-2025" },
      });
      const { status, data } = await parseJsonResponse<any>(res);

      expect(status).toBe(403);
      expect(data.code).toBe("HOD_DEPARTMENT_MISMATCH");
      expect(data.error).toContain("Forbidden: You are not authorized as HOD for this department");
    });
  });
});
