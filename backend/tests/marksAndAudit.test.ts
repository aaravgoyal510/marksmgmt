import { describe, it, expect, vi, beforeEach } from "vitest";
import { Request, Response } from "express";
import { bulkUpsertMarks } from "../src/controllers/marksController";
import { PrismaClient } from "@prisma/client";

vi.mock("@prisma/client", () => {
  const mPrisma = {
    subjectOfferingSection: {
      findUnique: vi.fn(),
    },
    scoreComponent: {
      findMany: vi.fn(),
    },
    gradingPolicy: {
      findFirst: vi.fn(),
    },
    attendanceRecord: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
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
  };
});

describe("Phase 4: Bulk Marks Entry & Audit Logging Engine", () => {
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

  it("rejects direct mark edits by an HOD on a section where they are not assigned as teaching faculty with HTTP 403 TEACHING_FACULTY_ONLY", async () => {
    mockReq = {
      user: {
        userId: "user-hod-1",
        username: "HOD001",
        role: "FACULTY",
        facultyId: "fac-prof-hod-id",
      },
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
    };

    // The section is assigned to regular teaching faculty "fac-prof-teaching-faculty-id", NOT the HOD
    prismaInstance.subjectOfferingSection.findUnique.mockResolvedValue({
      id: "sec-unlocked-1",
      facultyId: "fac-prof-teaching-faculty-id",
    });

    await bulkUpsertMarks(mockReq as Request, mockRes as Response);

    expect(mockRes.status).toHaveBeenCalledWith(403);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: expect.stringContaining("Direct mark entry is restricted to the assigned teaching faculty"),
      code: "TEACHING_FACULTY_ONLY",
    });
  });

  it("creates AuditLog entry with (oldValue -> newValue) when an existing mark is modified by assigned faculty", async () => {
    mockReq = {
      user: {
        userId: "user-faculty-1",
        username: "EMP003",
        role: "FACULTY",
        facultyId: "fac-prof-amit",
      },
      body: {
        sectionId: "sec-unlocked-1",
        entries: [
          {
            scoreComponentId: "comp-ces-1",
            studentId: "student-aarav",
            marksObtained: 9.5, // Updated score from 8.0
          },
        ],
      },
    };

    prismaInstance.subjectOfferingSection.findUnique.mockResolvedValue({
      id: "sec-unlocked-1",
      facultyId: "fac-prof-amit",
    });

    // Existing mark in DB had 8.0 marks
    prismaInstance.mark.findUnique.mockResolvedValue({
      id: "mark-existing-id",
      scoreComponentId: "comp-ces-1",
      studentId: "student-aarav",
      marksObtained: 8.0,
    });

    prismaInstance.mark.upsert.mockResolvedValue({
      id: "mark-existing-id",
      scoreComponentId: "comp-ces-1",
      studentId: "student-aarav",
      marksObtained: 9.5,
    });

    await bulkUpsertMarks(mockReq as Request, mockRes as Response);

    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(prismaInstance.auditLog.createMany).toHaveBeenCalledWith({
      data: [
        {
          entityType: "Mark",
          entityId: "mark-existing-id",
          changedByUserId: "user-faculty-1",
          oldValue: "8",
          newValue: "9.5",
        },
      ],
    });
  });

  it("creates AuditLog entry with oldValue='NEW_ENTRY' when a new mark is entered by assigned faculty", async () => {
    mockReq = {
      user: {
        userId: "user-faculty-1",
        username: "EMP003",
        role: "FACULTY",
        facultyId: "fac-prof-amit",
      },
      body: {
        sectionId: "sec-unlocked-1",
        entries: [
          {
            scoreComponentId: "comp-ces-2",
            studentId: "student-aarav",
            marksObtained: 10,
          },
        ],
      },
    };

    prismaInstance.subjectOfferingSection.findUnique.mockResolvedValue({
      id: "sec-unlocked-1",
      facultyId: "fac-prof-amit",
    });

    // No existing mark found
    prismaInstance.mark.findUnique.mockResolvedValue(null);

    prismaInstance.mark.upsert.mockResolvedValue({
      id: "mark-new-id",
      scoreComponentId: "comp-ces-2",
      studentId: "student-aarav",
      marksObtained: 10,
    });

    await bulkUpsertMarks(mockReq as Request, mockRes as Response);

    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(prismaInstance.auditLog.createMany).toHaveBeenCalledWith({
      data: [
        {
          entityType: "Mark",
          entityId: "mark-new-id",
          changedByUserId: "user-faculty-1",
          oldValue: "NEW_ENTRY",
          newValue: "10",
        },
      ],
    });
  });

  it("rejects mark entries that exceed component maxMarks with HTTP 400 MARK_OUT_OF_BOUNDS", async () => {
    mockReq = {
      user: {
        userId: "user-faculty-1",
        username: "EMP003",
        role: "FACULTY",
        facultyId: "fac-prof-amit",
      },
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
    };

    prismaInstance.subjectOfferingSection.findUnique.mockResolvedValue({
      id: "sec-unlocked-1",
      facultyId: "fac-prof-amit",
    });

    prismaInstance.scoreComponent.findMany.mockResolvedValue([
      {
        id: "comp-ces-2",
        name: "CES-II",
        maxMarks: 10,
      },
    ]);

    await bulkUpsertMarks(mockReq as Request, mockRes as Response);

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "MARK_OUT_OF_BOUNDS",
      })
    );
  });

  it("rejects manual attendance percentage that falls into an unmapped slab gap with HTTP 400 BLOCKED_SLAB_GAP", async () => {
    mockReq = {
      user: {
        userId: "user-faculty-1",
        username: "EMP003",
        role: "FACULTY",
        facultyId: "fac-prof-amit",
      },
      body: {
        sectionId: "sec-unlocked-1",
        attendanceEntries: [
          {
            studentId: "student-aarav",
            attendancePercent: 78.5, // Falls in unmapped gap (75-80 gap)
          },
        ],
      },
    };

    prismaInstance.subjectOfferingSection.findUnique.mockResolvedValue({
      id: "sec-unlocked-1",
      facultyId: "fac-prof-amit",
    });

    prismaInstance.gradingPolicy.findFirst.mockResolvedValue({
      id: "pol-1",
      attendanceSlabRanges: [
        { minPercent: 0, maxPercent: 75, marks: 0 },
        { minPercent: 80, maxPercent: 100, marks: 10 }, // 75.01 to 79.99 is an unmapped slab gap!
      ],
    });

    await bulkUpsertMarks(mockReq as Request, mockRes as Response);

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "BLOCKED_SLAB_GAP",
      })
    );
  });

  it("creates AuditLog entry (entityType: AttendanceRecord) when attendance % is updated", async () => {
    mockReq = {
      user: {
        userId: "user-faculty-1",
        username: "EMP003",
        role: "FACULTY",
        facultyId: "fac-prof-amit",
      },
      body: {
        sectionId: "sec-unlocked-1",
        attendanceEntries: [
          {
            studentId: "student-aarav",
            attendancePercent: 85, // Covered by 80-100 slab
          },
        ],
      },
    };

    prismaInstance.subjectOfferingSection.findUnique.mockResolvedValue({
      id: "sec-unlocked-1",
      facultyId: "fac-prof-amit",
    });

    prismaInstance.gradingPolicy.findFirst.mockResolvedValue({
      id: "pol-1",
      attendanceSlabRanges: [
        { minPercent: 0, maxPercent: 75, marks: 0 },
        { minPercent: 80, maxPercent: 100, marks: 10 },
      ],
    });

    prismaInstance.attendanceRecord.findUnique.mockResolvedValue({
      id: "att-rec-1",
      attendancePercent: 70,
    });

    prismaInstance.attendanceRecord.upsert.mockResolvedValue({
      id: "att-rec-1",
      attendancePercent: 85,
    });

    await bulkUpsertMarks(mockReq as Request, mockRes as Response);

    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(prismaInstance.auditLog.createMany).toHaveBeenCalledWith({
      data: [
        {
          entityType: "AttendanceRecord",
          entityId: "att-rec-1",
          changedByUserId: "user-faculty-1",
          oldValue: "70%",
          newValue: "85%",
        },
      ],
    });
  });
});
