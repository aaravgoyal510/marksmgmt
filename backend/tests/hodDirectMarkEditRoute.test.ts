import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { app } from "../src/app";
import { PrismaClient, Role } from "@prisma/client";

const JWT_SECRET = process.env.JWT_SECRET || "default-secret-change-me";

vi.mock("@prisma/client", () => {
  const mPrisma = {
    subjectOfferingSection: {
      findUnique: vi.fn(),
    },
    mark: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    auditLog: {
      createMany: vi.fn(),
    },
    $transaction: vi.fn((callback) => callback(mPrisma)),
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

describe("Route-Level Integration: HOD Direct Mark Edit Rejection", () => {
  let prismaInstance: any;

  beforeEach(() => {
    vi.clearAllMocks();
    prismaInstance = new PrismaClient();
  });

  it("HTTP PUT /api/marks/bulk rejects an HOD's direct mark edit on a section assigned to another teaching faculty with HTTP 403 TEACHING_FACULTY_ONLY", async () => {
    // Generate valid JWT token for an HOD user (HOD has Role.FACULTY per Schema.md)
    const hodToken = jwt.sign(
      {
        userId: "user-hod-id",
        username: "HOD_USER",
        role: Role.FACULTY,
        facultyId: "fac-prof-hod-id",
      },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    // Mock requireUnlockedSection middleware check + bulkUpsertMarks controller check:
    // Section is unlocked (has confirmed policy & assigned teaching faculty), BUT assigned teaching faculty is "fac-prof-teaching-id", NOT HOD ("fac-prof-hod-id")
    prismaInstance.subjectOfferingSection.findUnique.mockResolvedValue({
      id: "sec-unlocked-1",
      facultyId: "fac-prof-teaching-id", // Teaching faculty ID != HOD faculty ID
      subjectOffering: {
        gradingPolicy: {
          confirmedAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      },
    });

    const response = await request(app)
      .put("/api/marks/bulk")
      .send({
        sectionId: "sec-unlocked-1",
        entries: [
          {
            scoreComponentId: "comp-ces-1",
            studentId: "student-aarav",
            marksObtained: 10,
          },
        ],
      })
      .set("Authorization", `Bearer ${hodToken}`);

    // Assert HTTP status code & error payload
    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: "Forbidden: Direct mark entry is restricted to the assigned teaching faculty for this section. HODs can instruct via escalated queries, but cannot edit marks directly.",
      code: "TEACHING_FACULTY_ONLY",
    });
  });
});
