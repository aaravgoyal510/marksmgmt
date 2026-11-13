import { describe, it, expect, vi, beforeEach } from "vitest";
import { PUT as bulkMarksPut } from "@/app/api/marks/bulk/route";
import { POST as attendanceCommitPost } from "@/app/api/sections/[id]/attendance/commit/route";
import { GET as exportReportGet } from "@/app/api/reports/subject-offerings/[id]/export/route";
import { GET as studentPdfGet } from "@/app/api/reports/students/[studentId]/subject-offerings/[offeringId]/pdf/route";
import { POST as queryMessagePost } from "@/app/api/queries/[id]/messages/route";
import { GET as authMeGet } from "@/app/api/auth/me/route";
import { POST as authLogoutPost } from "@/app/api/auth/logout/route";
import { prisma } from "@/lib/prisma";
import { createTestRequest, createToken, parseJsonResponse } from "../helpers/testRequest";
import { Role } from "@prisma/client";

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("../mocks/prisma");
  return { prisma: createPrismaMock() };
});

describe("Security Boundary & Role Authorization Enforcement", () => {
  const student1Token = createToken({
    userId: "user-student-1",
    username: "aarav_gupta",
    role: Role.STUDENT,
    studentId: "stud-profile-1",
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("1. Role Boundary: STUDENT token calling PUT /api/marks/bulk is rejected with 403 Forbidden", async () => {
    const req = createTestRequest("/api/marks/bulk", {
      method: "PUT",
      token: student1Token,
      body: { sectionId: "sec-bca-m", marks: [] },
    });

    const res = await bulkMarksPut(req);
    const { status, data } = await parseJsonResponse(res);

    expect(status).toBe(403);
    expect(data.error).toContain("Forbidden");
  });

  it("2. Role Boundary: STUDENT token calling POST /api/sections/sec-1/attendance/commit is rejected with 403 Forbidden", async () => {
    const req = createTestRequest("/api/sections/sec-1/attendance/commit", {
      method: "POST",
      token: student1Token,
      body: { entries: [] },
    });

    const res = await attendanceCommitPost(req, { params: { id: "sec-1" } });
    const { status, data } = await parseJsonResponse(res);

    expect(status).toBe(403);
    expect(data.error).toContain("Forbidden");
  });

  it("3. Role Boundary: STUDENT token calling GET /api/reports/subject-offerings/off-1/export is rejected with 403 Forbidden", async () => {
    const req = createTestRequest("/api/reports/subject-offerings/off-1/export", {
      method: "GET",
      token: student1Token,
    });

    const res = await exportReportGet(req, { params: { id: "off-1" } });
    const { status, data } = await parseJsonResponse(res);

    expect(status).toBe(403);
    expect(data.error).toContain("Forbidden");
  });

  it("4. IDOR Protection: STUDENT token attempting to download another REAL student's PDF mark sheet is rejected specifically with 403 IDOR_FORBIDDEN", async () => {
    // Mock Student 2 ("other student") existing in DB with userId: "user-student-2"
    (prisma.studentProfile.findUnique as any).mockResolvedValue({
      id: "stud-profile-2",
      userId: "user-student-2", // DIFFERENT from user-student-1
      name: "Ananya Sharma",
      erpNo: "BCA25002",
      prn: "PRN25002",
      batch: { department: { name: "BCA Dept" }, label: "BCA 2025" },
      section: { name: "Section M" },
    });

    (prisma.subjectOffering.findUnique as any).mockResolvedValue({
      id: "offering-bca-101",
      gradingPolicy: {
        scoreComponents: [],
        attendanceSlabRanges: [],
      },
    });

    const req = createTestRequest(
      "/api/reports/students/stud-profile-2/subject-offerings/offering-bca-101/pdf",
      {
        method: "GET",
        token: student1Token,
      }
    );

    const res = await studentPdfGet(req, {
      params: { studentId: "stud-profile-2", offeringId: "offering-bca-101" },
    });
    const { status, data } = await parseJsonResponse(res);

    expect(status).toBe(403);
    expect(data.code).toBe("IDOR_FORBIDDEN");
    expect(data.error).toContain("You are not authorized to view another student's report");
  });

  it("5. IDOR Protection: STUDENT token attempting to post a message on another REAL student's query thread is rejected specifically with 403 IDOR_FORBIDDEN", async () => {
    // Mock a REAL query thread existing in DB belonging to Student 2 (userId: "user-student-2")
    (prisma.query.findUnique as any).mockResolvedValue({
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

    const req = createTestRequest(
      "/api/queries/query-belonging-to-student-2/messages",
      {
        method: "POST",
        token: student1Token,
        body: { message: "Malicious cross-student comment" },
      }
    );

    const res = await queryMessagePost(req, {
      params: { id: "query-belonging-to-student-2" },
    });
    const { status, data } = await parseJsonResponse(res);

    expect(status).toBe(403);
    expect(data.code).toBe("IDOR_FORBIDDEN");
    expect(data.error).toContain("You are not authorized to participate in another student's query thread");
  });

  it("6. HttpOnly Cookie Auth: Request carrying accessToken cookie passes authentication on GET /api/auth/me", async () => {
    const req = createTestRequest("/api/auth/me", {
      method: "GET",
      cookies: { accessToken: student1Token },
    });

    const res = await authMeGet(req);
    const { status, data } = await parseJsonResponse(res);

    expect(status).toBe(200);
    expect(data.authenticated).toBe(true);
    expect(data.user.userId).toBe("user-student-1");
  });

  it("7. Cookie Logout: POST /api/auth/logout sets Set-Cookie headers clearing accessToken and refreshToken", async () => {
    const res = await authLogoutPost();
    const { status, data } = await parseJsonResponse(res);

    expect(status).toBe(200);
    expect(data.message).toContain("Logout successful");

    const setCookieHeader = res.headers.get("set-cookie") || "";
    const accessCookie = res.cookies.get("accessToken");
    const refreshCookie = res.cookies.get("refreshToken");

    const hasAccessTokenCleared =
      setCookieHeader.includes("accessToken=") ||
      (accessCookie !== undefined && accessCookie.value === "");
    const hasRefreshTokenCleared =
      setCookieHeader.includes("refreshToken=") ||
      (refreshCookie !== undefined && refreshCookie.value === "");

    expect(hasAccessTokenCleared).toBe(true);
    expect(hasRefreshTokenCleared).toBe(true);
  });
});
