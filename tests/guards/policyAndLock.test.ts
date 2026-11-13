import { describe, it, expect, vi, beforeEach } from "vitest";
import { verifyUnlockedSection } from "@/lib/auth/guards";
import { POST } from "@/app/api/hod/subject-offerings/[offeringId]/policy/duplicate-last-term/route";
import { prisma } from "@/lib/prisma";
import { createTestRequest, createToken, parseJsonResponse } from "../helpers/testRequest";
import { Role } from "@prisma/client";

vi.mock("@/lib/prisma", () => {
  const mPrisma: any = {
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
    $transaction: vi.fn(async (cb: any) => cb(mPrisma)),
  };
  return { prisma: mPrisma };
});

describe("Phase 3: Policy Builder & Section Locking Security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Section Locking Guard (verifyUnlockedSection)", () => {
    it("REJECTS with 423 Locked (SECTION_LOCKED_NO_FACULTY) when faculty is unassigned", async () => {
      (prisma.subjectOfferingSection.findUnique as any).mockResolvedValue({
        id: "sec-locked-1",
        facultyId: null,
        subjectOffering: {
          gradingPolicy: { confirmedAt: new Date() },
        },
      });

      const result = await verifyUnlockedSection("sec-locked-1");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.status).toBe(423);
        const json = await result.error.json();
        expect(json.code).toBe("SECTION_LOCKED_NO_FACULTY");
        expect(json.error).toContain("Faculty member is not assigned");
      }
    });

    it("REJECTS with 423 Locked (SECTION_LOCKED_POLICY_UNCONFIRMED) when policy is unconfirmed (confirmedAt is null)", async () => {
      (prisma.subjectOfferingSection.findUnique as any).mockResolvedValue({
        id: "sec-locked-2",
        facultyId: "fac-assigned-1",
        subjectOffering: {
          gradingPolicy: { confirmedAt: null },
        },
      });

      const result = await verifyUnlockedSection("sec-locked-2");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.status).toBe(423);
        const json = await result.error.json();
        expect(json.code).toBe("SECTION_LOCKED_POLICY_UNCONFIRMED");
        expect(json.error).toContain("HOD has not confirmed the grading policy");
      }
    });

    it("ALLOWS execution when section has assigned faculty AND confirmed policy", async () => {
      const confirmedDate = new Date();
      (prisma.subjectOfferingSection.findUnique as any).mockResolvedValue({
        id: "sec-unlocked",
        facultyId: "fac-assigned-1",
        subjectOffering: {
          gradingPolicy: { confirmedAt: confirmedDate },
        },
      });

      const result = await verifyUnlockedSection("sec-unlocked");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.section.id).toBe("sec-unlocked");
        expect(result.section.facultyId).toBe("fac-assigned-1");
      }
    });
  });

  describe("Duplicate Policy From Last Term Route Handler", () => {
    it("copies previous policy structure and sets confirmedAt to null with totalIAMarks: 40", async () => {
      const token = createToken({
        userId: "user-hod",
        username: "EMP_HOD",
        role: Role.FACULTY,
        facultyId: "fac-hod-bca",
      });

      const req = createTestRequest(
        "/api/hod/subject-offerings/offering-new-term/policy/duplicate-last-term",
        {
          method: "POST",
          token,
        }
      );

      (prisma.subjectOffering.findUnique as any).mockResolvedValue({
        id: "offering-new-term",
        subjectId: "sub-webtech",
        subject: { departmentId: "dept-bca" },
      });

      (prisma.hODAssignment.findFirst as any).mockResolvedValue({
        facultyId: "fac-hod-bca",
        departmentId: "dept-bca",
      });

      // Previous offering found with confirmed policy
      (prisma.subjectOffering.findFirst as any).mockResolvedValue({
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

      (prisma.gradingPolicy.findUnique as any).mockResolvedValue(null);

      (prisma.gradingPolicy.create as any).mockResolvedValue({
        id: "duplicated-policy-id",
        subjectOfferingId: "offering-new-term",
        cesGroupWeightage: 10,
        internalWeightage: 20,
        attendanceWeightage: 10,
        confirmedAt: null, // Reset to unconfirmed
      });

      const res = await POST(req, { params: { offeringId: "offering-new-term" } });
      const { status, data } = await parseJsonResponse<any>(res);

      expect(status).toBe(200);
      expect(data.policy.confirmedAt).toBeNull();
      expect(data.totalIAMarks).toBe(40);
      expect(data.message).toBe("Policy duplicated successfully from previous term");
    });
  });
});
