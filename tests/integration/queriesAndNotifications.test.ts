import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST as escalatePost } from "@/app/api/queries/[id]/escalate/route";
import { prisma } from "@/lib/prisma";
import { createTestRequest, createToken, parseJsonResponse } from "../helpers/testRequest";
import { Role, QueryStatus } from "@prisma/client";

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("../mocks/prisma");
  return { prisma: createPrismaMock() };
});

describe("Phase 6: Query Escalation & Notification System", () => {
  const studentToken = createToken({
    userId: "user-s1",
    username: "BCA25001",
    role: Role.STUDENT,
    studentId: "s1",
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("escalates an open query to the department HOD and creates an HOD notification record", async () => {
    const req = createTestRequest("/api/queries/query-open-1/escalate", {
      method: "POST",
      token: studentToken,
      body: { reason: "Need HOD review regarding grading policy discrepancy" },
    });

    (prisma.query.findUnique as any).mockResolvedValue({
      id: "query-open-1",
      status: QueryStatus.OPEN,
      student: {
        id: "s1",
        userId: "user-s1",
        name: "Aarav Gupta",
      },
      subjectOfferingSection: {
        subjectOffering: {
          subject: {
            name: "Web Technologies",
            departmentId: "dept-bca-id",
          },
        },
      },
    });

    (prisma.hODAssignment.findUnique as any).mockResolvedValue({
      facultyId: "fac-rajesh-hod",
      faculty: {
        userId: "user-rajesh-hod",
        name: "Dr. Rajesh Sharma",
      },
    });

    (prisma.query.update as any).mockResolvedValue({
      id: "query-open-1",
      status: QueryStatus.ESCALATED,
      hodId: "fac-rajesh-hod",
    });

    (prisma.queryMessage.create as any).mockResolvedValue({
      id: "msg-1",
    });

    (prisma.notification.create as any).mockResolvedValue({
      id: "notif-1",
    });

    const res = await escalatePost(req, { params: { id: "query-open-1" } });
    const { status, data } = await parseJsonResponse<any>(res);

    expect(status).toBe(200);
    expect(data.message).toBe("Query escalated to HOD successfully");
    expect(prisma.query.update).toHaveBeenCalledWith({
      where: { id: "query-open-1" },
      data: {
        status: QueryStatus.ESCALATED,
        hodId: "fac-rajesh-hod",
      },
    });

    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-rajesh-hod",
        type: "QUERY_ESCALATED",
      }),
    });
  });

  it("rejects escalation of an already escalated query with HTTP 400", async () => {
    const req = createTestRequest("/api/queries/query-already-escalated/escalate", {
      method: "POST",
      token: studentToken,
    });

    (prisma.query.findUnique as any).mockResolvedValue({
      id: "query-already-escalated",
      status: QueryStatus.ESCALATED,
      student: {
        id: "s1",
        userId: "user-s1",
        name: "Aarav Gupta",
      },
    });

    const res = await escalatePost(req, { params: { id: "query-already-escalated" } });
    const { status, data } = await parseJsonResponse<any>(res);

    expect(status).toBe(400);
    expect(data.error).toBe("Query is already escalated");
    expect(prisma.query.update).not.toHaveBeenCalled();
  });
});
