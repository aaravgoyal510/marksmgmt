import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET as getStudents } from "@/app/api/admin/students/route";
import { PUT as updateSemesterOverride } from "@/app/api/admin/students/[id]/semester-override/route";
import { GET as getFaculty } from "@/app/api/admin/faculty/route";
import { POST as assignFacultyHOD } from "@/app/api/admin/faculty/[id]/assign-hod/route";
import { prisma } from "@/lib/prisma";
import { createTestRequest, createToken, parseJsonResponse } from "../helpers/testRequest";
import { Role } from "@prisma/client";

vi.mock("@/lib/prisma", () => {
  const mPrisma: any = {
    studentProfile: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    facultyProfile: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    department: {
      findUnique: vi.fn(),
    },
    hODAssignment: {
      deleteMany: vi.fn(),
      upsert: vi.fn(),
    },
  };
  return { prisma: mPrisma };
});

describe("Admin Extensions: Student Semester Override & Faculty HOD Promotion", () => {
  const adminToken = createToken({
    userId: "admin-1",
    username: "ADMIN",
    role: Role.ADMIN,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Student List & Semester Override (Repeater Management)", () => {
    it("lists all enrolled students with effective current semester (batch vs override)", async () => {
      const req = createTestRequest("/api/admin/students", {
        method: "GET",
        token: adminToken,
      });

      (prisma.studentProfile.findMany as any).mockResolvedValue([
        {
          id: "st-1",
          name: "Aarav Gupta",
          erpNo: "BCA25001",
          prn: "PRN25001",
          batchId: "batch-1",
          sectionId: "sec-1",
          semesterOverride: null,
          batch: {
            label: "2025-28",
            currentSemester: 2,
            departmentId: "dept-bca",
            department: { name: "BCA", totalSemesters: 6 },
          },
          section: { name: "M" },
        },
        {
          id: "st-repeater",
          name: "Rohan Verma",
          erpNo: "BCA25003",
          prn: "PRN25003",
          batchId: "batch-1",
          sectionId: "sec-1",
          semesterOverride: 1, // Repeater override back to Sem 1!
          batch: {
            label: "2025-28",
            currentSemester: 2,
            departmentId: "dept-bca",
            department: { name: "BCA", totalSemesters: 6 },
          },
          section: { name: "M" },
        },
      ]);

      const res = await getStudents(req);
      const { status, data } = await parseJsonResponse<any>(res);

      expect(status).toBe(200);
      expect(data.students).toHaveLength(2);
      expect(data.students[0].effectiveSemester).toBe(2); // Regular student
      expect(data.students[1].effectiveSemester).toBe(1); // Repeater with override
    });

    it("updates student semester override and returns updated profile", async () => {
      const req = createTestRequest("/api/admin/students/st-repeater/semester-override", {
        method: "PUT",
        token: adminToken,
        body: { semesterOverride: 1 },
      });

      (prisma.studentProfile.findUnique as any).mockResolvedValue({
        id: "st-repeater",
        name: "Rohan Verma",
        batch: {
          currentSemester: 2,
          department: { name: "BCA", totalSemesters: 6 },
        },
      });

      (prisma.studentProfile.update as any).mockResolvedValue({
        id: "st-repeater",
        name: "Rohan Verma",
        semesterOverride: 1,
      });

      const res = await updateSemesterOverride(req, { params: { id: "st-repeater" } });
      const { status, data } = await parseJsonResponse<any>(res);

      expect(status).toBe(200);
      expect(prisma.studentProfile.update).toHaveBeenCalledWith({
        where: { id: "st-repeater" },
        data: { semesterOverride: 1 },
      });
      expect(data.student.semesterOverride).toBe(1);
      expect(data.message).toContain("Semester override set to Semester 1");
    });
  });

  describe("Faculty Management & HOD Assignment", () => {
    it("lists faculty with home department and HOD assignments", async () => {
      const req = createTestRequest("/api/admin/faculty", {
        method: "GET",
        token: adminToken,
      });

      (prisma.facultyProfile.findMany as any).mockResolvedValue([
        {
          id: "fac-1",
          name: "Dr. Rajesh Sharma",
          employeeId: "EMP001",
          homeDepartmentId: "dept-bca",
          user: { email: "rajesh@bvimr.edu.in", username: "EMP001" },
          homeDepartment: { id: "dept-bca", name: "BCA" },
          hodAssignments: [
            {
              departmentId: "dept-bca",
              department: { id: "dept-bca", name: "BCA" },
            },
          ],
        },
        {
          id: "fac-2",
          name: "Prof. Amit Verma",
          employeeId: "EMP002",
          homeDepartmentId: "dept-bca",
          user: { email: "amit@bvimr.edu.in", username: "EMP002" },
          homeDepartment: { id: "dept-bca", name: "BCA" },
          hodAssignments: [],
        },
      ]);

      const res = await getFaculty(req);
      const { status, data } = await parseJsonResponse<any>(res);

      expect(status).toBe(200);
      expect(data.faculty).toHaveLength(2);
      expect(data.faculty[0].isHOD).toBe(true);
      expect(data.faculty[0].hodDepartmentName).toBe("BCA");
      expect(data.faculty[1].isHOD).toBe(false);
      expect(data.faculty[1].hodDepartmentName).toBeNull();
    });

    it("promotes faculty to HOD with hODAssignment.upsert and replaces existing HOD", async () => {
      const req = createTestRequest("/api/admin/faculty/fac-prof-sunita/assign-hod", {
        method: "POST",
        token: adminToken,
        body: { departmentId: "dept-mca-id" },
      });

      (prisma.facultyProfile.findUnique as any).mockResolvedValue({
        id: "fac-prof-sunita",
        name: "Prof. Sunita Verma",
      });

      (prisma.department.findUnique as any).mockResolvedValue({
        id: "dept-mca-id",
        name: "MCA",
      });

      (prisma.hODAssignment.upsert as any).mockResolvedValue({
        id: "hod-assign-mca",
        facultyId: "fac-prof-sunita",
        departmentId: "dept-mca-id",
      });

      const res = await assignFacultyHOD(req, { params: { id: "fac-prof-sunita" } });
      const { status, data } = await parseJsonResponse<any>(res);

      expect(status).toBe(200);
      expect(prisma.hODAssignment.upsert).toHaveBeenCalledWith({
        where: { departmentId: "dept-mca-id" },
        update: { facultyId: "fac-prof-sunita" },
        create: { facultyId: "fac-prof-sunita", departmentId: "dept-mca-id" },
      });
      expect(data.message).toContain("successfully assigned as HOD of MCA");
    });
  });
});
