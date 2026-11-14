import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET as exportGet } from "@/app/api/reports/subject-offerings/[id]/export/route";
import { GET as historyGet } from "@/app/api/reports/history/route";
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

describe("Phase 5: Reports Export & History Scoping + Profile Management", () => {
  const facultyToken = createToken({
    userId: "user-fac-1",
    username: "FAC001",
    role: Role.FACULTY,
    facultyId: "fac-p1",
  });

  const hodToken = createToken({
    userId: "user-hod-1",
    username: "HOD001",
    role: Role.FACULTY,
    facultyId: "fac-hod-1",
    hodDepartmentId: "dept-bca",
  });

  const adminToken = createToken({
    userId: "user-admin-1",
    username: "ADMIN001",
    role: Role.ADMIN,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Excel Report Export (Scoping & Security Guards)", () => {
    it("exports Excel report workbook buffer with correct Content-Type and Content-Disposition for assigned faculty", async () => {
      const req = createTestRequest(
        "/api/reports/subject-offerings/offering-report-1/export",
        {
          method: "GET",
          token: facultyToken,
        }
      );

      (prisma.facultyProfile.findUnique as any).mockResolvedValue({
        id: "fac-p1",
        hodAssignments: [],
      });

      (prisma.subjectOffering.findUnique as any).mockResolvedValue({
        id: "offering-report-1",
        subject: {
          name: "Web Technologies",
          code: "BCA101",
          department: { id: "dept-bca", name: "BCA" },
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
            facultyId: "fac-p1",
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

    it("rejects export with HTTP 403 when HOD attempts to export an offering belonging to another department", async () => {
      const req = createTestRequest(
        "/api/reports/subject-offerings/offering-mba-1/export",
        {
          method: "GET",
          token: hodToken,
        }
      );

      // HOD belongs to BCA, but offering is MBA
      (prisma.facultyProfile.findUnique as any).mockResolvedValue({
        id: "fac-hod-1",
        hodAssignments: [
          { id: "hod-assign-1", facultyId: "fac-hod-1", departmentId: "dept-bca" },
        ],
      });

      (prisma.subjectOffering.findUnique as any).mockResolvedValue({
        id: "offering-mba-1",
        subject: {
          name: "Marketing Management",
          code: "MBA101",
          departmentId: "dept-mba",
          department: { id: "dept-mba", name: "MBA" },
        },
        academicTerm: { label: "AY2025-26" },
        gradingPolicy: null,
        sections: [],
      });

      const res = await exportGet(req, { params: { id: "offering-mba-1" } });
      const { status, data } = await parseJsonResponse<any>(res);

      expect(status).toBe(403);
      expect(data.error).toContain("Access denied: HOD can only export reports for their own department");
    });

    it("rejects export with HTTP 403 when Faculty is not assigned to any section of the offering", async () => {
      const req = createTestRequest(
        "/api/reports/subject-offerings/offering-foreign/export",
        {
          method: "GET",
          token: facultyToken,
        }
      );

      (prisma.facultyProfile.findUnique as any).mockResolvedValue({
        id: "fac-p1",
        hodAssignments: [],
      });

      (prisma.subjectOffering.findUnique as any).mockResolvedValue({
        id: "offering-foreign",
        subject: {
          name: "Cloud Computing",
          code: "BCA301",
          departmentId: "dept-bca",
          department: { id: "dept-bca", name: "BCA" },
        },
        academicTerm: { label: "AY2025-26" },
        gradingPolicy: null,
        sections: [
          {
            id: "sec-other",
            facultyId: "fac-other-person",
            section: { name: "A", students: [] },
          },
        ],
      });

      const res = await exportGet(req, { params: { id: "offering-foreign" } });
      const { status, data } = await parseJsonResponse<any>(res);

      expect(status).toBe(403);
      expect(data.error).toContain("Access denied: Faculty can only export reports for offerings they teach");
    });
  });

  describe("Reports History & Term Archive Scoping (GET /api/reports/history)", () => {
    it("returns history offerings scoped to HOD department", async () => {
      const req = createTestRequest("/api/reports/history", {
        method: "GET",
        token: hodToken,
      });

      (prisma.facultyProfile.findUnique as any).mockResolvedValue({
        id: "fac-hod-1",
        hodAssignments: [
          { id: "hod-assign-1", facultyId: "fac-hod-1", departmentId: "dept-bca" },
        ],
      });

      (prisma.academicTerm.findMany as any).mockResolvedValue([
        { id: "term-1", semesterNumber: 1, label: "AY2025-26", departmentId: "dept-bca" },
      ]);

      (prisma.subjectOffering.findMany as any).mockResolvedValue([
        {
          id: "off-1",
          academicTermId: "term-1",
          academicTerm: { id: "term-1", semesterNumber: 1, label: "AY2025-26" },
          subject: {
            id: "sub-1",
            name: "Database Systems",
            code: "BCA102",
            department: { id: "dept-bca", name: "BCA" },
          },
          gradingPolicy: { id: "pol-1", isConfirmed: true },
          sections: [
            {
              id: "sec-1",
              faculty: { user: { name: "Prof. Sharma" } },
              section: { name: "A", students: [{ id: "st-1" }] },
            },
          ],
        },
      ]);

      const res = await historyGet(req);
      const { status, data } = await parseJsonResponse<any>(res);

      expect(status).toBe(200);
      expect(data.offerings).toHaveLength(1);
      expect(data.offerings[0].subjectCode).toBe("BCA102");
      expect(data.offerings[0].departmentName).toBe("BCA");
      expect(prisma.subjectOffering.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            subject: { departmentId: { in: ["dept-bca"] } },
          }),
        })
      );
    });

    it("rejects HOD with HTTP 403 when attempting to access another department's history archive", async () => {
      const req = createTestRequest("/api/reports/history?departmentId=dept-mba", {
        method: "GET",
        token: hodToken,
      });

      (prisma.facultyProfile.findUnique as any).mockResolvedValue({
        id: "fac-hod-1",
        hodAssignments: [
          { id: "hod-assign-1", facultyId: "fac-hod-1", departmentId: "dept-bca" },
        ],
      });

      const res = await historyGet(req);
      const { status, data } = await parseJsonResponse<any>(res);

      expect(status).toBe(403);
      expect(data.error).toContain("Access denied: HOD can only view reports for their own department");
    });

    it("allows ADMIN to filter any department without cross-department denial", async () => {
      const req = createTestRequest("/api/reports/history?departmentId=dept-mba", {
        method: "GET",
        token: adminToken,
      });

      (prisma.academicTerm.findMany as any).mockResolvedValue([]);
      (prisma.subjectOffering.findMany as any).mockResolvedValue([]);

      const res = await historyGet(req);
      const { status } = await parseJsonResponse<any>(res);

      expect(status).toBe(200);
      expect(prisma.subjectOffering.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            subject: { departmentId: { in: ["dept-mba"] } },
          }),
        })
      );
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
