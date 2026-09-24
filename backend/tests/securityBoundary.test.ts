import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { app } from "../src/app";
import { PrismaClient, Role } from "@prisma/client";

const secret = process.env.JWT_SECRET || "your-32-char-random-jwt-access-secret-here";

vi.mock("@prisma/client", () => {
  const mPrisma: any = {
    studentProfile: {
      findUnique: vi.fn(),
    },
    subjectOffering: {
      findUnique: vi.fn(),
    },
    query: {
      findUnique: vi.fn(),
    },
  };
  return {
    PrismaClient: vi.fn(() => mPrisma),
    Role: {
      STUDENT: "STUDENT",
      FACULTY: "FACULTY",
      ADMIN: "ADMIN",
    },
    QueryStatus: {
      OPEN: "OPEN",
      ESCALATED: "ESCALATED",
      RESOLVED: "RESOLVED",
    },
  };
});

describe("Security Boundary & Role Authorization Enforcement", () => {
  let prismaInstance: any;

  // Student 1 (Aarav - requesting user)
  const student1Token = jwt.sign(
    {
      userId: "user-student-1",
      username: "aarav_gupta",
      role: Role.STUDENT,
      studentId: "stud-profile-1",
    },
    secret
  );

  beforeEach(() => {
    vi.clearAllMocks();
    prismaInstance = new PrismaClient();
  });

  it("1. Role Boundary: STUDENT token calling PUT /api/marks/bulk is rejected with 403 Forbidden", async () => {
    const res = await request(app)
      .put("/api/marks/bulk")
      .set("Authorization", `Bearer ${student1Token}`)
      .send({ sectionId: "sec-bca-m", marks: [] });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain("Forbidden");
  });

  it("2. Role Boundary: STUDENT token calling POST /api/sections/sec-1/attendance/commit is rejected with 403 Forbidden", async () => {
    const res = await request(app)
      .post("/api/sections/sec-1/attendance/commit")
      .set("Authorization", `Bearer ${student1Token}`)
      .send({ entries: [] });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain("Forbidden");
  });

  it("3. Role Boundary: STUDENT token calling GET /api/reports/subject-offerings/off-1/export is rejected with 403 Forbidden", async () => {
    const res = await request(app)
      .get("/api/reports/subject-offerings/off-1/export")
      .set("Authorization", `Bearer ${student1Token}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toContain("Forbidden");
  });

  it("4. IDOR Protection: STUDENT token attempting to download another REAL student's PDF mark sheet is rejected specifically with 403 IDOR_FORBIDDEN", async () => {
    // Mock Student 2 ("other student") existing in DB with userId: "user-student-2"
    prismaInstance.studentProfile.findUnique.mockResolvedValue({
      id: "stud-profile-2",
      userId: "user-student-2", // DIFFERENT from user-student-1
      name: "Ananya Sharma",
      erpNo: "BCA25002",
      prn: "PRN25002",
      batch: { department: { name: "BCA Dept" }, label: "BCA 2025" },
      section: { name: "Section M" },
    });

    prismaInstance.subjectOffering.findUnique.mockResolvedValue({
      id: "offering-bca-101",
      gradingPolicy: {
        scoreComponents: [],
        attendanceSlabRanges: [],
      },
    });

    const res = await request(app)
      .get("/api/reports/students/stud-profile-2/subject-offerings/offering-bca-101/pdf")
      .set("Authorization", `Bearer ${student1Token}`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("IDOR_FORBIDDEN");
    expect(res.body.error).toContain("You are not authorized to view another student's report");
  });

  it("5. IDOR Protection: STUDENT token attempting to post a message on another REAL student's query thread is rejected specifically with 403 IDOR_FORBIDDEN", async () => {
    // Mock a REAL query thread existing in DB belonging to Student 2 (userId: "user-student-2")
    prismaInstance.query.findUnique.mockResolvedValue({
      id: "query-belonging-to-student-2",
      studentId: "stud-profile-2",
      student: {
        id: "stud-profile-2",
        userId: "user-student-2", // DIFFERENT from user-student-1
        name: "Ananya Sharma",
      },
      faculty: { userId: "user-faculty-1" },
      subjectOfferingSection: {
        subjectOffering: { subject: { name: "C Programming" } },
      },
    });

    const res = await request(app)
      .post("/api/queries/query-belonging-to-student-2/messages")
      .set("Authorization", `Bearer ${student1Token}`)
      .send({ message: "Malicious cross-student comment" });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("IDOR_FORBIDDEN");
    expect(res.body.error).toContain("You are not authorized to participate in another student's query thread");
  });

  it("6. HttpOnly Cookie Auth: Request carrying accessToken cookie passes authentication on GET /api/auth/me", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set("Cookie", [`accessToken=${student1Token}`]);

    expect(res.status).toBe(200);
    expect(res.body.authenticated).toBe(true);
    expect(res.body.user.userId).toBe("user-student-1");
  });

  it("7. Cookie Logout: POST /api/auth/logout sets Set-Cookie headers clearing accessToken and refreshToken", async () => {
    const res = await request(app).post("/api/auth/logout");

    expect(res.status).toBe(200);
    expect(res.body.message).toContain("Logout successful");
    const setCookieHeaders = res.headers["set-cookie"] || [];
    const joinedHeaders = setCookieHeaders.join("; ");
    expect(joinedHeaders).toContain("accessToken=");
    expect(joinedHeaders).toContain("refreshToken=");
  });
});
