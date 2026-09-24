import { describe, it, expect, vi, beforeEach } from "vitest";
import { Request, Response } from "express";
import {
  listStudents,
  setStudentSemesterOverride,
  listFaculty,
  assignFacultyHOD,
} from "../src/controllers/adminController";
import { PrismaClient } from "@prisma/client";

vi.mock("@prisma/client", () => {
  const mPrisma = {
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
  return {
    PrismaClient: vi.fn(() => mPrisma),
  };
});

describe("Admin Extensions: Student Semester Override & Faculty HOD Promotion", () => {
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

  describe("Student List & Semester Override (Repeater Management)", () => {
    it("lists all enrolled students with effective current semester (batch vs override)", async () => {
      mockReq = {};

      prismaInstance.studentProfile.findMany.mockResolvedValue([
        {
          id: "st-1",
          name: "Aarav Gupta",
          erpNo: "BCA25001",
          prn: "PRN25001",
          semesterOverride: null,
          batch: { label: "2025-28", currentSemester: 2, department: { name: "BCA", totalSemesters: 6 } },
          section: { name: "M" },
        },
        {
          id: "st-repeater",
          name: "Rohan Verma",
          erpNo: "BCA25003",
          prn: "PRN25003",
          semesterOverride: 1, // Repeater override back to Sem 1!
          batch: { label: "2025-28", currentSemester: 2, department: { name: "BCA", totalSemesters: 6 } },
          section: { name: "M" },
        },
      ]);

      await listStudents(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      const jsonCall = (mockRes.json as any).mock.calls[0][0];
      const students = jsonCall.students;

      expect(students[0].effectiveSemester).toBe(2); // Regular student
      expect(students[1].effectiveSemester).toBe(1); // Repeater with override
    });

    it("sets semester override on a student profile and validates semester bounds", async () => {
      mockReq = {
        params: { id: "st-repeater" },
        body: { semesterOverride: 1 },
      };

      prismaInstance.studentProfile.findUnique.mockResolvedValue({
        id: "st-repeater",
        batch: { department: { name: "BCA", totalSemesters: 6 } },
      });

      prismaInstance.studentProfile.update.mockResolvedValue({
        id: "st-repeater",
        semesterOverride: 1,
      });

      await setStudentSemesterOverride(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(prismaInstance.studentProfile.update).toHaveBeenCalledWith({
        where: { id: "st-repeater" },
        data: { semesterOverride: 1 },
      });
    });

    it("clears semester override when semesterOverride is null", async () => {
      mockReq = {
        params: { id: "st-repeater" },
        body: { semesterOverride: null },
      };

      prismaInstance.studentProfile.findUnique.mockResolvedValue({
        id: "st-repeater",
        batch: { department: { name: "BCA", totalSemesters: 6 } },
      });

      await setStudentSemesterOverride(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(prismaInstance.studentProfile.update).toHaveBeenCalledWith({
        where: { id: "st-repeater" },
        data: { semesterOverride: null },
      });
    });
  });

  describe("Faculty HOD Promotion (Explicit Replacement)", () => {
    it("promotes a faculty member to HOD of a department and explicitly replaces existing HOD", async () => {
      mockReq = {
        params: { id: "fac-prof-sunita" },
        body: { departmentId: "dept-mca-id" },
      };

      prismaInstance.facultyProfile.findUnique.mockResolvedValue({
        id: "fac-prof-sunita",
        name: "Prof. Sunita Verma",
      });

      prismaInstance.department.findUnique.mockResolvedValue({
        id: "dept-mca-id",
        name: "MCA",
        hodAssignment: {
          faculty: { name: "Dr. Previous HOD" },
        },
      });

      await assignFacultyHOD(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(prismaInstance.hODAssignment.upsert).toHaveBeenCalledWith({
        where: { departmentId: "dept-mca-id" },
        update: { facultyId: "fac-prof-sunita" },
        create: { facultyId: "fac-prof-sunita", departmentId: "dept-mca-id" },
      });

      const message = (mockRes.json as any).mock.calls[0][0].message;
      expect(message).toContain("successfully assigned as HOD of MCA");
    });
  });
});
