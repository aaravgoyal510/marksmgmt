import { describe, it, expect, vi, beforeEach } from "vitest";
import { Request, Response, NextFunction } from "express";
import { requireHODOfDepartment } from "../src/middleware/auth";
import { PrismaClient } from "@prisma/client";

// Mock PrismaClient to test middleware logic deterministically
vi.mock("@prisma/client", () => {
  const mPrisma = {
    hODAssignment: {
      findFirst: vi.fn(),
    },
  };
  return {
    PrismaClient: vi.fn(() => mPrisma),
    Role: {
      ADMIN: "ADMIN",
      FACULTY: "FACULTY",
      STUDENT: "STUDENT",
    },
  };
});

describe("HOD Department Scoping Middleware — Server-Side Security Enforcer", () => {
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

  it("REJECTS with 403 Forbidden when an HOD of Department A attempts an action in Department B", async () => {
    const deptA_HOD_FacultyId = "faculty-dept-a-hod-id";
    const deptB_Id = "dept-b-id";

    // Setup req with user from Dept A attempting an action on Dept B
    mockReq = {
      user: {
        userId: "user-hod-a",
        username: "EMP001",
        role: "FACULTY",
        facultyId: deptA_HOD_FacultyId,
      },
      params: {
        departmentId: deptB_Id,
      },
    };

    // Prisma returns null because this faculty member is NOT the HOD of Department B
    prismaInstance.hODAssignment.findFirst.mockResolvedValue(null);

    const middleware = requireHODOfDepartment("params", "departmentId");
    await middleware(mockReq as Request, mockRes as Response, nextFunction);

    expect(prismaInstance.hODAssignment.findFirst).toHaveBeenCalledWith({
      where: {
        facultyId: deptA_HOD_FacultyId,
        departmentId: deptB_Id,
      },
    });

    expect(mockRes.status).toHaveBeenCalledWith(403);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: "Forbidden: You are not authorized as HOD for this department",
        code: "HOD_DEPARTMENT_MISMATCH",
      })
    );
    expect(nextFunction).not.toHaveBeenCalled();
  });

  it("ALLOWS execution (calls next) when an HOD performs an action in their own Department A", async () => {
    const deptA_HOD_FacultyId = "faculty-dept-a-hod-id";
    const deptA_Id = "dept-a-id";

    mockReq = {
      user: {
        userId: "user-hod-a",
        username: "EMP001",
        role: "FACULTY",
        facultyId: deptA_HOD_FacultyId,
      },
      params: {
        departmentId: deptA_Id,
      },
    };

    // Prisma finds valid HOD assignment
    prismaInstance.hODAssignment.findFirst.mockResolvedValue({
      id: "hod-assign-1",
      facultyId: deptA_HOD_FacultyId,
      departmentId: deptA_Id,
    });

    const middleware = requireHODOfDepartment("params", "departmentId");
    await middleware(mockReq as Request, mockRes as Response, nextFunction);

    expect(mockRes.status).not.toHaveBeenCalled();
    expect(nextFunction).toHaveBeenCalledTimes(1);
  });

  it("REJECTS with 403 Forbidden when a user without a Faculty Profile attempts HOD action", async () => {
    mockReq = {
      user: {
        userId: "student-user-id",
        username: "BCA25001",
        role: "STUDENT",
        // facultyId is undefined!
      },
      params: {
        departmentId: "dept-a-id",
      },
    };

    const middleware = requireHODOfDepartment("params", "departmentId");
    await middleware(mockReq as Request, mockRes as Response, nextFunction);

    expect(mockRes.status).toHaveBeenCalledWith(403);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: "Forbidden: Account is not associated with a Faculty profile",
    });
    expect(nextFunction).not.toHaveBeenCalled();
  });
});
