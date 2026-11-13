import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET as exportGet } from "@/app/api/reports/subject-offerings/[id]/export/route";
import { POST as changePassPost } from "@/app/api/profile/change-password/route";
import { prisma } from "@/lib/prisma";
import { comparePassword, hashPassword } from "@/utils/password";
import { createTestRequest, createToken, parseJsonResponse } from "../helpers/testRequest";
import { Role } from "@prisma/client";

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("../mocks/prisma");
  return { prisma: createPrismaMock() };
});

vi.mock("@/utils/password", () => ({
  comparePassword: vi.fn(),
  hashPassword: vi.fn(),
}));

describe("Phase 7: Reports Export & Profile Management", () => {
  const facultyToken = createToken({
    userId: "user-fac-1",
    username: "FAC001",
    role: Role.FACULTY,
    facultyId: "fac-p1",
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Excel Report Export", () => {
    it("exports Excel report workbook buffer with correct Content-Type and Content-Disposition", async () => {
      const req = createTestRequest(
        "/api/reports/subject-offerings/offering-report-1/export",
        {
          method: "GET",
          token: facultyToken,
        }
      );

      (prisma.subjectOffering.findUnique as any).mockResolvedValue({
        id: "offering-report-1",
        subject: {
          name: "Web Technologies",
          code: "BCA101",
          department: { name: "BCA" },
        },
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
              students: [
                { id: "st-1", erpNo: "BCA25001", prn: "PRN25001", name: "Aarav Gupta" },
              ],
            },
          },
        ],
      });

      (prisma.mark.findMany as any).mockResolvedValue([
        { studentId: "st-1", scoreComponentId: "c1", marksObtained: 8 },
        { studentId: "st-1", scoreComponentId: "c2", marksObtained: 10 },
        { studentId: "st-1", scoreComponentId: "c3", marksObtained: 30 },
      ]);

      (prisma.attendanceRecord.findMany as any).mockResolvedValue([
        { studentId: "st-1", attendancePercent: 88 },
      ]);

      const res = await exportGet(req, { params: { id: "offering-report-1" } });

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      expect(res.headers.get("content-disposition")).toBe(
        'attachment; filename="BCA101_AY2025-26_Report.xlsx"'
      );

      const arrayBuffer = await res.arrayBuffer();
      expect(arrayBuffer.byteLength).toBeGreaterThan(0);
    });
  });

  describe("Profile Password Change", () => {
    it("successfully changes password, updates user password hash, and records PASSWORD_CHANGED security AuditLog", async () => {
      const req = createTestRequest("/api/profile/change-password", {
        method: "POST",
        token: facultyToken,
        body: {
          currentPassword: "OldPassword123!",
          newPassword: "NewPassword123!",
        },
      });

      (prisma.user.findUnique as any).mockResolvedValue({
        id: "user-fac-1",
        passwordHash: "old-hashed-password",
      });

      (comparePassword as any).mockResolvedValue(true);
      (hashPassword as any).mockResolvedValue("new-hashed-password");
      (prisma.user.update as any).mockResolvedValue({
        id: "user-fac-1",
        passwordHash: "new-hashed-password",
      });

      const res = await changePassPost(req);
      const { status, data } = await parseJsonResponse<any>(res);

      expect(status).toBe(200);
      expect(data.message).toBe("Password changed successfully");

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-fac-1" },
        data: { passwordHash: "new-hashed-password" },
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          entityType: "User",
          entityId: "user-fac-1",
          changedByUserId: "user-fac-1",
          oldValue: "ACTIVE",
          newValue: "PASSWORD_CHANGED",
        },
      });
    });

    it("rejects password change with HTTP 400 when current password does not match", async () => {
      const req = createTestRequest("/api/profile/change-password", {
        method: "POST",
        token: facultyToken,
        body: {
          currentPassword: "WrongPassword!",
          newPassword: "NewPassword123!",
        },
      });

      (prisma.user.findUnique as any).mockResolvedValue({
        id: "user-fac-1",
        passwordHash: "old-hashed-password",
      });

      (comparePassword as any).mockResolvedValue(false);

      const res = await changePassPost(req);
      const { status, data } = await parseJsonResponse<any>(res);

      expect(status).toBe(400);
      expect(data.error).toBe("Incorrect current password");
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });
  });
});
