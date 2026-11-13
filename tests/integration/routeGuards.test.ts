import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import jwt from "jsonwebtoken";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyAuth, verifyUnlockedSection, verifyHOD } from "@/lib/auth/guards";
import { GET as healthGet } from "@/app/api/health/route";
import { GET as getMySec } from "@/app/api/faculty/my-sections/route";
import { GET as getMySecAlias } from "@/app/api/my-sections/route";
import { PUT as putBulk } from "@/app/api/marks/bulk/route";
import { PUT as putBulkAlias } from "@/app/api/faculty/marks/bulk/route";

vi.mock("@/lib/prisma", () => {
  return {
    prisma: {
      subjectOfferingSection: {
        findUnique: vi.fn(),
      },
      hODAssignment: {
        findFirst: vi.fn(),
      },
    },
  };
});

const JWT_SECRET = process.env.JWT_SECRET || "your-32-char-random-jwt-access-secret-here";

describe("Route Handlers Integration & Guard Enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. Public Health Probe", () => {
    it("should return HTTP 200 and status OK", async () => {
      const response = await healthGet();
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.status).toBe("OK");
      expect(data.timestamp).toBeDefined();
    });
  });

  describe("2. Authentication Guard (verifyAuth)", () => {
    it("should return 401 when no token is present in cookies or headers", async () => {
      const req = new NextRequest("http://localhost:3000/api/faculty/my-sections");
      const result = verifyAuth(req);

      expect(result.ok).toBe(false);
      expect(result.error.status).toBe(401);
      const data = await result.error.json();
      expect(data.error).toBe("Missing or invalid authentication token");
    });

    it("should return 401 when token is invalid or malformed", async () => {
      const req = new NextRequest("http://localhost:3000/api/faculty/my-sections", {
        headers: {
          authorization: "Bearer invalid.token.payload",
        },
      });
      const result = verifyAuth(req);

      expect(result.ok).toBe(false);
      expect(result.error.status).toBe(401);
      const data = await result.error.json();
      expect(data.error).toBe("Invalid or expired token");
    });

    it("should return 403 when user has STUDENT role but FACULTY is required", async () => {
      const token = jwt.sign(
        {
          userId: "student-user-1",
          username: "student_john",
          role: Role.STUDENT,
          studentId: "student-profile-1",
        },
        JWT_SECRET,
        { expiresIn: "1h" }
      );

      const req = new NextRequest("http://localhost:3000/api/faculty/my-sections", {
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      const result = verifyAuth(req, [Role.FACULTY]);

      expect(result.ok).toBe(false);
      expect(result.error.status).toBe(403);
      const data = await result.error.json();
      expect(data.error).toBe("Forbidden: Insufficient role permissions");
    });

    it("should succeed and return user payload when valid token has required role via header", async () => {
      const token = jwt.sign(
        {
          userId: "faculty-user-1",
          username: "prof_smith",
          role: Role.FACULTY,
          facultyId: "fac-profile-1",
        },
        JWT_SECRET,
        { expiresIn: "1h" }
      );

      const req = new NextRequest("http://localhost:3000/api/faculty/my-sections", {
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      const result = verifyAuth(req, [Role.FACULTY]);

      expect(result.ok).toBe(true);
      expect(result.user).toBeDefined();
      expect(result.user?.userId).toBe("faculty-user-1");
      expect(result.user?.role).toBe(Role.FACULTY);
      expect(result.user?.facultyId).toBe("fac-profile-1");
    });

    it("should succeed and extract token from cookie", async () => {
      const token = jwt.sign(
        {
          userId: "admin-user-1",
          username: "admin",
          role: Role.ADMIN,
        },
        JWT_SECRET,
        { expiresIn: "1h" }
      );

      const req = new NextRequest("http://localhost:3000/api/admin/departments", {
        headers: {
          cookie: `accessToken=${token}`,
        },
      });

      const result = verifyAuth(req, [Role.ADMIN]);

      expect(result.ok).toBe(true);
      expect(result.user?.role).toBe(Role.ADMIN);
    });
  });

  describe("3. Section Lock Enforcement (verifyUnlockedSection)", () => {
    it("should return 400 when sectionId is missing or empty", async () => {
      const result = await verifyUnlockedSection("");
      expect(result.ok).toBe(false);
      expect(result.error.status).toBe(400);
      const data = await result.error.json();
      expect(data.error).toBe("Missing section ID parameter");
    });

    it("should return 404 when section is not found", async () => {
      (prisma.subjectOfferingSection.findUnique as any).mockResolvedValue(null);

      const result = await verifyUnlockedSection("non-existent-section-id");
      expect(result.ok).toBe(false);
      expect(result.error.status).toBe(404);
      const data = await result.error.json();
      expect(data.error).toBe("Subject offering section not found");
    });

    it("should return HTTP 423 with SECTION_LOCKED_NO_FACULTY when facultyId is null", async () => {
      (prisma.subjectOfferingSection.findUnique as any).mockResolvedValue({
        id: "sec-101",
        facultyId: null,
        subjectOffering: {
          gradingPolicy: {
            confirmedAt: new Date(),
          },
        },
      });

      const result = await verifyUnlockedSection("sec-101");
      expect(result.ok).toBe(false);
      expect(result.error.status).toBe(423);
      const data = await result.error.json();
      expect(data.code).toBe("SECTION_LOCKED_NO_FACULTY");
      expect(data.error).toContain("Faculty member is not assigned");
    });

    it("should return HTTP 423 with SECTION_LOCKED_POLICY_UNCONFIRMED when grading policy is unconfirmed", async () => {
      (prisma.subjectOfferingSection.findUnique as any).mockResolvedValue({
        id: "sec-102",
        facultyId: "fac-101",
        subjectOffering: {
          gradingPolicy: {
            confirmedAt: null,
          },
        },
      });

      const result = await verifyUnlockedSection("sec-102");
      expect(result.ok).toBe(false);
      expect(result.error.status).toBe(423);
      const data = await result.error.json();
      expect(data.code).toBe("SECTION_LOCKED_POLICY_UNCONFIRMED");
      expect(data.error).toContain("HOD has not confirmed the grading policy");
    });

    it("should return HTTP 423 with SECTION_LOCKED_POLICY_UNCONFIRMED when grading policy is missing", async () => {
      (prisma.subjectOfferingSection.findUnique as any).mockResolvedValue({
        id: "sec-103",
        facultyId: "fac-101",
        subjectOffering: {
          gradingPolicy: null,
        },
      });

      const result = await verifyUnlockedSection("sec-103");
      expect(result.ok).toBe(false);
      expect(result.error.status).toBe(423);
      const data = await result.error.json();
      expect(data.code).toBe("SECTION_LOCKED_POLICY_UNCONFIRMED");
    });

    it("should return ok: true and section when faculty is assigned and policy is confirmed", async () => {
      const mockSection = {
        id: "sec-104",
        facultyId: "fac-101",
        subjectOffering: {
          gradingPolicy: {
            id: "pol-1",
            confirmedAt: new Date("2026-01-15T10:00:00Z"),
          },
        },
      };

      (prisma.subjectOfferingSection.findUnique as any).mockResolvedValue(mockSection);

      const result = await verifyUnlockedSection("sec-104");
      expect(result.ok).toBe(true);
      expect(result.section).toBeDefined();
      expect(result.section?.id).toBe("sec-104");
    });
  });

  describe("4. HOD Verification Guard (verifyHOD)", () => {
    it("should return 403 if account is not associated with faculty profile", async () => {
      const result = await verifyHOD(
        { userId: "u1", username: "user", role: Role.FACULTY },
        "dept-1"
      );
      expect(result.ok).toBe(false);
      expect(result.error.status).toBe(403);
    });

    it("should return 400 if departmentId is missing", async () => {
      const result = await verifyHOD(
        { userId: "u1", username: "user", role: Role.FACULTY, facultyId: "fac-1" },
        ""
      );
      expect(result.ok).toBe(false);
      expect(result.error.status).toBe(400);
    });

    it("should return 403 with HOD_DEPARTMENT_MISMATCH if assignment not found", async () => {
      (prisma.hODAssignment.findFirst as any).mockResolvedValue(null);

      const result = await verifyHOD(
        { userId: "u1", username: "user", role: Role.FACULTY, facultyId: "fac-1" },
        "dept-other"
      );
      expect(result.ok).toBe(false);
      expect(result.error.status).toBe(403);
      const data = await result.error.json();
      expect(data.code).toBe("HOD_DEPARTMENT_MISMATCH");
    });

    it("should return ok: true if HOD assignment exists for department", async () => {
      (prisma.hODAssignment.findFirst as any).mockResolvedValue({
        id: "hod-1",
        facultyId: "fac-1",
        departmentId: "dept-1",
      });

      const result = await verifyHOD(
        { userId: "u1", username: "user", role: Role.FACULTY, facultyId: "fac-1" },
        "dept-1"
      );
      expect(result.ok).toBe(true);
    });
  });

  describe("5. Dual-Mount Route Aliases", () => {
    it("should export identical GET handler for /api/faculty/my-sections and /api/my-sections", () => {
      expect(typeof getMySec).toBe("function");
      expect(getMySec).toBe(getMySecAlias);
    });

    it("should export identical PUT handler for /api/marks/bulk and /api/faculty/marks/bulk", () => {
      expect(typeof putBulk).toBe("function");
      expect(putBulk).toBe(putBulkAlias);
    });
  });
});
