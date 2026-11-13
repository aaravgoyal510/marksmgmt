import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST as previewPost } from "@/app/api/sections/[id]/attendance/preview/route";
import { POST as commitPost } from "@/app/api/sections/[id]/attendance/commit/route";
import { prisma } from "@/lib/prisma";
import { createTestRequest, createToken, parseJsonResponse } from "../helpers/testRequest";
import { Role } from "@prisma/client";

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("../mocks/prisma");
  return { prisma: createPrismaMock() };
});

describe("Phase 5: Attendance CSV Dry-Run Preview & Commit Engine", () => {
  const facultyToken = createToken({
    userId: "user-fac-1",
    username: "FAC001",
    role: Role.FACULTY,
    facultyId: "fac-p1",
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Dry-Run Attendance CSV Preview", () => {
    it("correctly categorizes READY, BLOCKED_SLAB_GAP, and UNMATCHED rows", async () => {
      const csvContent =
        "ERP No,PRN,Name,Attendance%\n" +
        "BCA25001,PRN25001,Aarav Gupta,88%\n" +
        "BCA25002,PRN25002,Ananya Sharma,75.005%\n" +
        "BCA25999,PRN25999,Unknown Student,90%";

      const req = createTestRequest("/api/sections/sec-webtech-m/attendance/preview", {
        method: "POST",
        token: facultyToken,
        body: { csvContent },
      });

      (prisma.subjectOfferingSection.findUnique as any).mockResolvedValue({
        id: "sec-webtech-m",
        section: {
          students: [
            { id: "s1", erpNo: "BCA25001", prn: "PRN25001", name: "Aarav Gupta", batch: { currentSemester: 1 } },
            { id: "s2", erpNo: "BCA25002", prn: "PRN25002", name: "Ananya Sharma", batch: { currentSemester: 1 } },
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

      const res = await previewPost(req, { params: { id: "sec-webtech-m" } });
      const { status, data } = await parseJsonResponse<any>(res);

      expect(status).toBe(200);
      expect(data.summary.readyCount).toBe(1);
      expect(data.summary.blockedCount).toBe(1);
      expect(data.summary.unmatchedCount).toBe(1);

      // Row 1: Ready (88% -> 10 marks)
      expect(data.rows[0].status).toBe("READY");
      expect(data.rows[0].marksPreview).toBe(10);

      // Row 2: Blocked due to slab gap (75.005% is between 75 and 75.01)
      expect(data.rows[1].status).toBe("BLOCKED_SLAB_GAP");
      expect(data.rows[1].marksPreview).toBeNull();

      // Row 3: Unmatched student
      expect(data.rows[2].status).toBe("UNMATCHED");
    });

    it("handles plain decimal attendance values with no % sign (e.g. 88.89, 55.56, 100)", async () => {
      const csvContent =
        "ERP No,PRN,Name,Attendance\n" +
        "BCA25001,PRN25001,Aarav Gupta,88.89\n" +
        "BCA25002,PRN25002,Ananya Sharma,55.56\n" +
        "BCA25003,PRN25003,Rohan Verma,100";

      const req = createTestRequest("/api/sections/sec-webtech-m/attendance/preview", {
        method: "POST",
        token: facultyToken,
        body: { csvContent },
      });

      (prisma.subjectOfferingSection.findUnique as any).mockResolvedValue({
        id: "sec-webtech-m",
        section: {
          students: [
            { id: "s1", erpNo: "BCA25001", prn: "PRN25001", name: "Aarav Gupta", batch: { currentSemester: 1 } },
            { id: "s2", erpNo: "BCA25002", prn: "PRN25002", name: "Ananya Sharma", batch: { currentSemester: 1 } },
            { id: "s3", erpNo: "BCA25003", prn: "PRN25003", name: "Rohan Verma", batch: { currentSemester: 1 } },
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

      const res = await previewPost(req, { params: { id: "sec-webtech-m" } });
      const { status, data } = await parseJsonResponse<any>(res);

      expect(status).toBe(200);
      expect(data.summary.readyCount).toBe(3);
      expect(data.summary.blockedCount).toBe(0);
      expect(data.summary.unmatchedCount).toBe(0);

      // Row 1: 88.89 (plain decimal, no % sign) -> Slab 85.01-100% -> 10 marks
      expect(data.rows[0].attendancePercent).toBe(88.89);
      expect(data.rows[0].status).toBe("READY");
      expect(data.rows[0].marksPreview).toBe(10);

      // Row 2: 55.56 (plain decimal, no % sign) -> Slab 0-60% -> 0 marks
      expect(data.rows[1].attendancePercent).toBe(55.56);
      expect(data.rows[1].status).toBe("READY");
      expect(data.rows[1].marksPreview).toBe(0);

      // Row 3: 100 (integer decimal, no % sign) -> Slab 85.01-100% -> 10 marks
      expect(data.rows[2].attendancePercent).toBe(100);
      expect(data.rows[2].status).toBe("READY");
      expect(data.rows[2].marksPreview).toBe(10);
    });
  });

  describe("Commit Attendance Records (Overwrite Pattern)", () => {
    it("upserts attendance records for READY rows and overwrites previous values in database", async () => {
      const req = createTestRequest("/api/sections/sec-webtech-m/attendance/commit", {
        method: "POST",
        token: facultyToken,
        body: {
          entries: [{ studentId: "s1", attendancePercent: 92 }],
        },
      });

      // verifyUnlockedSection checks
      (prisma.subjectOfferingSection.findUnique as any).mockResolvedValue({
        id: "sec-webtech-m",
        facultyId: "fac-p1",
        subjectOffering: {
          gradingPolicy: {
            id: "pol-1",
            confirmedAt: new Date(),
          },
        },
      });

      (prisma.gradingPolicy.findFirst as any).mockResolvedValue({
        id: "pol-1",
        attendanceSlabRanges: [{ minPercent: 0, maxPercent: 100, marks: 10 }],
      });

      (prisma.attendanceRecord.upsert as any).mockResolvedValue({
        id: "att-rec-1",
        subjectOfferingSectionId: "sec-webtech-m",
        studentId: "s1",
        attendancePercent: 92,
      });

      const res = await commitPost(req, { params: { id: "sec-webtech-m" } });
      const { status, data } = await parseJsonResponse<any>(res);

      expect(status).toBe(200);
      expect(data.committedCount).toBe(1);
      expect(prisma.attendanceRecord.upsert).toHaveBeenCalledWith({
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
