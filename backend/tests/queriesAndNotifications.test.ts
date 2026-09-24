import { describe, it, expect, vi, beforeEach } from "vitest";
import { Request, Response } from "express";
import { escalateQuery } from "../src/controllers/queryController";
import { PrismaClient } from "@prisma/client";

vi.mock("@prisma/client", () => {
  const mPrisma = {
    query: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    hODAssignment: {
      findUnique: vi.fn(),
    },
    notification: {
      create: vi.fn(),
    },
  };
  return {
    PrismaClient: vi.fn(() => mPrisma),
    QueryStatus: {
      OPEN: "OPEN",
      ESCALATED: "ESCALATED",
      RESOLVED: "RESOLVED",
    },
    Role: {
      STUDENT: "STUDENT",
      FACULTY: "FACULTY",
      ADMIN: "ADMIN",
    },
  };
});

describe("Phase 6: Query Escalation & Notification System", () => {
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

  it("escalates an open query to the department HOD and creates an HOD notification", async () => {
    mockReq = {
      params: { id: "query-open-1" },
    };

    prismaInstance.query.findUnique.mockResolvedValue({
      id: "query-open-1",
      status: "OPEN",
      student: { name: "Aarav Gupta" },
      subjectOfferingSection: {
        subjectOffering: {
          subject: {
            name: "Web Technologies",
            departmentId: "dept-bca-id",
          },
        },
      },
    });

    prismaInstance.hODAssignment.findUnique.mockResolvedValue({
      facultyId: "fac-rajesh-hod",
      faculty: {
        userId: "user-rajesh-hod",
        name: "Dr. Rajesh Sharma",
      },
    });

    prismaInstance.query.update.mockResolvedValue({
      id: "query-open-1",
      status: "ESCALATED",
      hodId: "fac-rajesh-hod",
    });

    await escalateQuery(mockReq as Request, mockRes as Response);

    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(prismaInstance.query.update).toHaveBeenCalledWith({
      where: { id: "query-open-1" },
      data: {
        status: "ESCALATED",
        hodId: "fac-rajesh-hod",
      },
    });

    expect(prismaInstance.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-rajesh-hod",
        type: "QUERY_ESCALATED",
      }),
    });
  });

  it("prevents duplicate escalation if query is already ESCALATED", async () => {
    mockReq = {
      params: { id: "query-already-escalated" },
    };

    prismaInstance.query.findUnique.mockResolvedValue({
      id: "query-already-escalated",
      status: "ESCALATED",
    });

    await escalateQuery(mockReq as Request, mockRes as Response);

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: "Query is already escalated",
    });
  });
});
