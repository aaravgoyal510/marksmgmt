import { describe, it, expect, vi, beforeEach } from "vitest";
import { verifyHOD, JwtPayload } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    hODAssignment: {
      findFirst: vi.fn(),
    },
  },
}));

describe("HOD Department Scoping Guard — Server-Side Security Enforcer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("REJECTS with 403 Forbidden (HOD_DEPARTMENT_MISMATCH) when an HOD of Department A attempts an action in Department B", async () => {
    const deptA_HOD_FacultyId = "faculty-dept-a-hod-id";
    const deptB_Id = "dept-b-id";

    const user: JwtPayload = {
      userId: "user-hod-a",
      username: "EMP001",
      role: Role.FACULTY,
      facultyId: deptA_HOD_FacultyId,
    };

    // Prisma returns null because this faculty member is NOT the HOD of Department B
    (prisma.hODAssignment.findFirst as any).mockResolvedValue(null);

    const result = await verifyHOD(user, deptB_Id);

    expect(prisma.hODAssignment.findFirst).toHaveBeenCalledWith({
      where: {
        facultyId: deptA_HOD_FacultyId,
        departmentId: deptB_Id,
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.status).toBe(403);
      const json = await result.error.json();
      expect(json.code).toBe("HOD_DEPARTMENT_MISMATCH");
      expect(json.error).toBe(
        "Forbidden: You are not authorized as HOD for this department"
      );
    }
  });

  it("ALLOWS execution (result.ok === true) when an HOD performs an action in their own Department A", async () => {
    const deptA_HOD_FacultyId = "faculty-dept-a-hod-id";
    const deptA_Id = "dept-a-id";

    const user: JwtPayload = {
      userId: "user-hod-a",
      username: "EMP001",
      role: Role.FACULTY,
      facultyId: deptA_HOD_FacultyId,
    };

    // Prisma finds valid HOD assignment
    (prisma.hODAssignment.findFirst as any).mockResolvedValue({
      id: "hod-assign-1",
      facultyId: deptA_HOD_FacultyId,
      departmentId: deptA_Id,
    });

    const result = await verifyHOD(user, deptA_Id);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.error).toBeUndefined();
    }
  });

  it("REJECTS with 403 Forbidden when a user without a facultyId attempts an HOD action", async () => {
    const user: JwtPayload = {
      userId: "student-user-id",
      username: "BCA25001",
      role: Role.STUDENT,
      // facultyId is undefined
    };

    const result = await verifyHOD(user, "dept-a-id");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.status).toBe(403);
      const json = await result.error.json();
      expect(json.error).toBe(
        "Forbidden: Account is not associated with a Faculty profile"
      );
    }
    expect(prisma.hODAssignment.findFirst).not.toHaveBeenCalled();
  });
});
