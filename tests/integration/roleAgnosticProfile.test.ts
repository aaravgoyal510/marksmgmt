import { describe, it, expect, vi, beforeEach } from "vitest";
import { PUT as profilePut, GET as profileGet } from "@/app/api/profile/me/route";
import { prisma } from "@/lib/prisma";
import { createTestRequest, createToken, parseJsonResponse } from "../helpers/testRequest";
import { Role } from "@prisma/client";

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("../mocks/prisma");
  return { prisma: createPrismaMock() };
});

describe("Role-Agnostic Profile Management Suite (PUT /api/profile/me)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ALLOWS System ADMIN role to update profile name & email with HTTP 200 and returns updated displayName", async () => {
    const adminToken = createToken({
      userId: "admin-u1",
      username: "ADMIN001",
      role: Role.ADMIN,
    });

    (prisma.user.findUnique as any)
      .mockResolvedValueOnce({
        id: "admin-u1",
        username: "ADMIN001",
        role: Role.ADMIN,
      })
      .mockResolvedValueOnce({
        id: "admin-u1",
        username: "ADMIN001",
        role: Role.ADMIN,
        facultyProfile: { name: "System Admin Dr. Sharma" },
      });

    (prisma.user.update as any).mockResolvedValue({
      id: "admin-u1",
      username: "ADMIN001",
      email: "newadmin@bvimr.edu.in",
      role: Role.ADMIN,
    });

    (prisma.facultyProfile.upsert as any).mockResolvedValue({
      id: "fac-p1",
      userId: "admin-u1",
      name: "System Admin Dr. Sharma",
    });

    const req = createTestRequest("/api/profile/me", {
      method: "PUT",
      token: adminToken,
      body: {
        name: "System Admin Dr. Sharma",
        email: "newadmin@bvimr.edu.in",
      },
    });

    const res = await profilePut(req);
    const { status, data } = await parseJsonResponse(res);

    expect(status).toBe(200);
    expect(data.message).toBe("Profile updated successfully");
    expect(data.user.displayName).toBe("System Admin Dr. Sharma");
    expect(prisma.facultyProfile.upsert).toHaveBeenCalledWith({
      where: { userId: "admin-u1" },
      update: { name: "System Admin Dr. Sharma" },
      create: {
        userId: "admin-u1",
        name: "System Admin Dr. Sharma",
        employeeId: "ADMIN001",
      },
    });
  });

  it("ALLOWS FACULTY role to update profile name & email with HTTP 200 and returns updated displayName", async () => {
    const facultyToken = createToken({
      userId: "fac-u1",
      username: "EMP001",
      role: Role.FACULTY,
      facultyId: "fac-p1",
    });

    (prisma.user.findUnique as any)
      .mockResolvedValueOnce({
        id: "fac-u1",
        username: "EMP001",
        role: Role.FACULTY,
      })
      .mockResolvedValueOnce({
        id: "fac-u1",
        username: "EMP001",
        role: Role.FACULTY,
        facultyProfile: { name: "Dr. Updated Faculty" },
      });

    (prisma.user.update as any).mockResolvedValue({
      id: "fac-u1",
      username: "EMP001",
      email: "newfac@bvimr.edu.in",
      role: Role.FACULTY,
    });

    (prisma.facultyProfile.updateMany as any).mockResolvedValue({ count: 1 });

    const req = createTestRequest("/api/profile/me", {
      method: "PUT",
      token: facultyToken,
      body: {
        name: "Dr. Updated Faculty",
        email: "newfac@bvimr.edu.in",
      },
    });

    const res = await profilePut(req);
    const { status, data } = await parseJsonResponse(res);

    expect(status).toBe(200);
    expect(data.message).toBe("Profile updated successfully");
    expect(data.user.displayName).toBe("Dr. Updated Faculty");
    expect(prisma.facultyProfile.updateMany).toHaveBeenCalledWith({
      where: { userId: "fac-u1" },
      data: { name: "Dr. Updated Faculty" },
    });
  });

  it("ALLOWS STUDENT role to update profile name & email with HTTP 200 and returns updated displayName", async () => {
    const studentToken = createToken({
      userId: "st-u1",
      username: "BCA25001",
      role: Role.STUDENT,
      studentId: "st-p1",
    });

    (prisma.user.findUnique as any)
      .mockResolvedValueOnce({
        id: "st-u1",
        username: "BCA25001",
        role: Role.STUDENT,
      })
      .mockResolvedValueOnce({
        id: "st-u1",
        username: "BCA25001",
        role: Role.STUDENT,
        studentProfile: { name: "Aarav Gupta" },
      });

    (prisma.user.update as any).mockResolvedValue({
      id: "st-u1",
      username: "BCA25001",
      email: "newstudent@bvimr.edu.in",
      role: Role.STUDENT,
    });

    (prisma.studentProfile.updateMany as any).mockResolvedValue({ count: 1 });

    const req = createTestRequest("/api/profile/me", {
      method: "PUT",
      token: studentToken,
      body: {
        name: "Aarav Gupta",
        email: "newstudent@bvimr.edu.in",
      },
    });

    const res = await profilePut(req);
    const { status, data } = await parseJsonResponse(res);

    expect(status).toBe(200);
    expect(data.message).toBe("Profile updated successfully");
    expect(data.user.displayName).toBe("Aarav Gupta");
    expect(prisma.studentProfile.updateMany).toHaveBeenCalledWith({
      where: { userId: "st-u1" },
      data: { name: "Aarav Gupta" },
    });
  });
});
