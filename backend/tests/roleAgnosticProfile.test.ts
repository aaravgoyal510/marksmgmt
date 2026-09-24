import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { app } from "../src/app";
import { PrismaClient, Role } from "@prisma/client";

const JWT_SECRET = process.env.JWT_SECRET || "default-secret-change-me";

vi.mock("@prisma/client", () => {
  const mPrisma = {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    studentProfile: {
      updateMany: vi.fn(),
    },
    facultyProfile: {
      updateMany: vi.fn(),
      upsert: vi.fn(),
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

describe("Role-Agnostic Profile Management Suite (PUT /api/profile/me)", () => {
  let prismaInstance: any;

  beforeEach(() => {
    vi.clearAllMocks();
    prismaInstance = new PrismaClient();
  });

  it("ALLOWS System ADMIN role to update profile name & email with HTTP 200 and returns updated displayName", async () => {
    const adminToken = jwt.sign(
      { userId: "admin-u1", username: "ADMIN001", role: Role.ADMIN },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    prismaInstance.user.findUnique
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

    prismaInstance.user.update.mockResolvedValue({
      id: "admin-u1",
      username: "ADMIN001",
      email: "newadmin@bvimr.edu.in",
      role: Role.ADMIN,
    });

    const response = await request(app)
      .put("/api/profile/me")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "System Admin Dr. Sharma",
        email: "newadmin@bvimr.edu.in",
      });

    expect(response.status).toBe(200);
    expect(response.body.message).toBe("Profile updated successfully");
    expect(response.body.user.displayName).toBe("System Admin Dr. Sharma");
  });

  it("ALLOWS FACULTY role to update profile name & email with HTTP 200 and returns updated displayName", async () => {
    const facultyToken = jwt.sign(
      { userId: "fac-u1", username: "EMP001", role: Role.FACULTY, facultyId: "fac-p1" },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    prismaInstance.user.findUnique
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

    prismaInstance.user.update.mockResolvedValue({
      id: "fac-u1",
      username: "EMP001",
      email: "newfac@bvimr.edu.in",
      role: Role.FACULTY,
    });

    const response = await request(app)
      .put("/api/profile/me")
      .set("Authorization", `Bearer ${facultyToken}`)
      .send({
        name: "Dr. Updated Faculty",
        email: "newfac@bvimr.edu.in",
      });

    expect(response.status).toBe(200);
    expect(response.body.message).toBe("Profile updated successfully");
    expect(response.body.user.displayName).toBe("Dr. Updated Faculty");
  });

  it("ALLOWS STUDENT role to update profile name & email with HTTP 200 and returns updated displayName", async () => {
    const studentToken = jwt.sign(
      { userId: "st-u1", username: "BCA25001", role: Role.STUDENT, studentId: "st-p1" },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    prismaInstance.user.findUnique
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

    prismaInstance.user.update.mockResolvedValue({
      id: "st-u1",
      username: "BCA25001",
      email: "newstudent@bvimr.edu.in",
      role: Role.STUDENT,
    });

    const response = await request(app)
      .put("/api/profile/me")
      .set("Authorization", `Bearer ${studentToken}`)
      .send({
        name: "Aarav Gupta",
        email: "newstudent@bvimr.edu.in",
      });

    expect(response.status).toBe(200);
    expect(response.body.message).toBe("Profile updated successfully");
    expect(response.body.user.displayName).toBe("Aarav Gupta");
  });
});
