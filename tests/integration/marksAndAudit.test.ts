import { describe, it, expect, vi, beforeEach } from "vitest";
import { PUT as bulkPut } from "@/app/api/marks/bulk/route";
import { prisma } from "@/lib/prisma";
import { createTestRequest, createToken, parseJsonResponse } from "../helpers/testRequest";
import { Role } from "@prisma/client";

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("../mocks/prisma");
  return { prisma: createPrismaMock() };
});

describe("Phase 4: Bulk Marks Entry & Audit Logging Engine", () => {
  const hodToken = createToken({
    userId: "user-hod-1",
    username: "HOD001",
    role: Role.FACULTY,
    facultyId: "fac-prof-hod-id",
  });

  const facultyToken = createToken({
    userId: "user-faculty-1",
    username: "EMP003",
    role: Role.FACULTY,
    facultyId: "fac-prof-amit",
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects direct mark edits by an HOD on a section where they are not assigned as teaching faculty with HTTP 403 TEACHING_FACULTY_ONLY", async () => {
    const req = createTestRequest("/api/marks/bulk", {
      method: "PUT",
      token: hodToken,
      body: {
        sectionId: "sec-unlocked-1",
        entries: [
          {
            scoreComponentId: "comp-ces-1",
            studentId: "student-aarav",
            marksObtained: 10,
          },
        ],
      },
    });

    (prisma.subjectOfferingSection.findUnique as any).mockResolvedValue({
      id: "sec-unlocked-1",
      facultyId: "fac-prof-teaching-faculty-id",
      subjectOffering: {
        gradingPolicy: {
          id: "pol-1",
          confirmedAt: new Date(),
        },
      },
    });

    const res = await bulkPut(req);
    const { status, data } = await parseJsonResponse<any>(res);

    expect(status).toBe(403);
    expect(data.code).toBe("TEACHING_FACULTY_ONLY");
    expect(data.error).toContain("Direct mark entry is restricted to the assigned teaching faculty");
  });

  it("successfully upserts marks for teaching faculty and generates audit log records for updated/inserted entries", async () => {
    const req = createTestRequest("/api/marks/bulk", {
      method: "PUT",
      token: facultyToken,
      body: {
        sectionId: "sec-unlocked-1",
        entries: [
          {
            scoreComponentId: "comp-ces-1",
            studentId: "student-aarav",
            marksObtained: 9.5, // Updated score from 8.0
          },
          {
            scoreComponentId: "comp-ces-1",
            studentId: "student-rohan",
            marksObtained: 8.0, // New score
          },
        ],
      },
    });

    (prisma.subjectOfferingSection.findUnique as any).mockResolvedValue({
      id: "sec-unlocked-1",
      facultyId: "fac-prof-amit",
      subjectOffering: {
        gradingPolicy: {
          id: "pol-1",
          confirmedAt: new Date(),
        },
      },
    });

    (prisma.scoreComponent.findMany as any).mockResolvedValue([
      {
        id: "comp-ces-1",
        name: "CES-I",
        maxMarks: 10,
      },
    ]);

    (prisma.mark.findUnique as any)
      .mockResolvedValueOnce({
        id: "mark-aarav-id",
        scoreComponentId: "comp-ces-1",
        studentId: "student-aarav",
        marksObtained: 8.0,
      })
      .mockResolvedValueOnce(null);

    (prisma.mark.upsert as any)
      .mockResolvedValueOnce({
        id: "mark-aarav-id",
        scoreComponentId: "comp-ces-1",
        studentId: "student-aarav",
        marksObtained: 9.5,
      })
      .mockResolvedValueOnce({
        id: "mark-rohan-id",
        scoreComponentId: "comp-ces-1",
        studentId: "student-rohan",
        marksObtained: 8.0,
      });

    const res = await bulkPut(req);
    const { status, data } = await parseJsonResponse<any>(res);

    expect(status).toBe(200);
    expect(data.count).toBe(2);
    expect(prisma.auditLog.createMany).toHaveBeenCalledWith({
      data: [
        {
          entityType: "Mark",
          entityId: "mark-aarav-id",
          changedByUserId: "user-faculty-1",
          oldValue: "8",
          newValue: "9.5",
        },
        {
          entityType: "Mark",
          entityId: "mark-rohan-id",
          changedByUserId: "user-faculty-1",
          oldValue: "NEW_ENTRY",
          newValue: "8",
        },
      ],
    });
  });

  it("rejects marks exceeding component maxMarks with HTTP 400 validation error", async () => {
    const req = createTestRequest("/api/marks/bulk", {
      method: "PUT",
      token: facultyToken,
      body: {
        sectionId: "sec-unlocked-1",
        entries: [
          {
            scoreComponentId: "comp-ces-2", // maxMarks: 10
            studentId: "student-aarav",
            marksObtained: 11, // EXCEEDS max 10
          },
        ],
      },
    });

    (prisma.subjectOfferingSection.findUnique as any).mockResolvedValue({
      id: "sec-unlocked-1",
      facultyId: "fac-prof-amit",
      subjectOffering: {
        gradingPolicy: {
          id: "pol-1",
          confirmedAt: new Date(),
        },
      },
    });

    (prisma.scoreComponent.findMany as any).mockResolvedValue([
      {
        id: "comp-ces-2",
        name: "CES-II",
        maxMarks: 10,
      },
    ]);

    const res = await bulkPut(req);
    const { status, data } = await parseJsonResponse<any>(res);

    expect(status).toBe(400);
    expect(data.code).toBe("MARK_OUT_OF_BOUNDS");
  });

  it("handles partial marks submission without corrupting unmodified component marks", async () => {
    const req = createTestRequest("/api/marks/bulk", {
      method: "PUT",
      token: facultyToken,
      body: {
        sectionId: "sec-unlocked-1",
        entries: [
          {
            scoreComponentId: "comp-ces-1",
            studentId: "student-aarav",
            marksObtained: 8.5,
          },
        ],
      },
    });

    (prisma.subjectOfferingSection.findUnique as any).mockResolvedValue({
      id: "sec-unlocked-1",
      facultyId: "fac-prof-amit",
      subjectOffering: {
        gradingPolicy: {
          id: "pol-1",
          confirmedAt: new Date(),
        },
      },
    });

    (prisma.scoreComponent.findMany as any).mockResolvedValue([
      {
        id: "comp-ces-1",
        name: "CES-I",
        maxMarks: 10,
      },
    ]);

    (prisma.mark.findUnique as any).mockResolvedValue(null);
    (prisma.mark.upsert as any).mockResolvedValue({
      id: "mark-aarav-id",
      scoreComponentId: "comp-ces-1",
      studentId: "student-aarav",
      marksObtained: 8.5,
    });

    const res = await bulkPut(req);
    const { status, data } = await parseJsonResponse<any>(res);

    expect(status).toBe(200);
    expect(data.count).toBe(1);
    expect(prisma.mark.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.mark.upsert).toHaveBeenCalledWith({
      where: {
        scoreComponentId_studentId: {
          scoreComponentId: "comp-ces-1",
          studentId: "student-aarav",
        },
      },
      update: {
        marksObtained: 8.5,
        updatedByFacultyId: "fac-prof-amit",
      },
      create: {
        scoreComponentId: "comp-ces-1",
        studentId: "student-aarav",
        marksObtained: 8.5,
        updatedByFacultyId: "fac-prof-amit",
      },
    });
  });

  it("rolls back transaction when database error occurs during bulk batch write", async () => {
    const req = createTestRequest("/api/marks/bulk", {
      method: "PUT",
      token: facultyToken,
      body: {
        sectionId: "sec-unlocked-1",
        entries: [
          {
            scoreComponentId: "comp-ces-1",
            studentId: "student-aarav",
            marksObtained: 8.5,
          },
        ],
      },
    });

    (prisma.subjectOfferingSection.findUnique as any).mockResolvedValue({
      id: "sec-unlocked-1",
      facultyId: "fac-prof-amit",
      subjectOffering: {
        gradingPolicy: {
          id: "pol-1",
          confirmedAt: new Date(),
        },
      },
    });

    (prisma.scoreComponent.findMany as any).mockResolvedValue([
      {
        id: "comp-ces-1",
        name: "CES-I",
        maxMarks: 10,
      },
    ]);

    (prisma.$transaction as any).mockRejectedValueOnce(
      new Error("Database transaction failed")
    );

    const res = await bulkPut(req);
    const { status, data } = await parseJsonResponse<any>(res);

    expect(status).toBe(500);
    expect(data.error).toContain("Database transaction failed");
  });

  it("rejects marks submission with HTTP 423 when section is locked (unconfirmed policy)", async () => {
    const req = createTestRequest("/api/marks/bulk", {
      method: "PUT",
      token: facultyToken,
      body: {
        sectionId: "sec-locked-1",
        entries: [
          {
            scoreComponentId: "comp-ces-1",
            studentId: "student-aarav",
            marksObtained: 9.0,
          },
        ],
      },
    });

    // Policy is unconfirmed (confirmedAt is null)
    (prisma.subjectOfferingSection.findUnique as any).mockResolvedValue({
      id: "sec-locked-1",
      facultyId: "fac-prof-amit",
      subjectOffering: {
        gradingPolicy: {
          id: "pol-1",
          confirmedAt: null,
        },
      },
    });

    const res = await bulkPut(req);
    const { status, data } = await parseJsonResponse<any>(res);

    expect(status).toBe(423);
    expect(data.code).toBe("SECTION_LOCKED_POLICY_UNCONFIRMED");
    expect(data.error).toContain("Section is locked: HOD has not confirmed the grading policy");
  });
});
