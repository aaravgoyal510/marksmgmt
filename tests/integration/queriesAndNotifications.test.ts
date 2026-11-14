import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST as escalatePost } from "@/app/api/queries/[id]/escalate/route";
import { POST as messagesPost } from "@/app/api/queries/[id]/messages/route";
import { GET as notificationsGet } from "@/app/api/notifications/route";
import { POST as notifReadPost } from "@/app/api/notifications/[id]/read/route";
import { POST as notifReadAllPost } from "@/app/api/notifications/read-all/route";
import { prisma } from "@/lib/prisma";
import { createTestRequest, createToken, parseJsonResponse } from "../helpers/testRequest";
import { Role, QueryStatus } from "@prisma/client";

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("../mocks/prisma");
  return { prisma: createPrismaMock() };
});

describe("Phase 1 / Phase 6: Query Escalation & Notification System", () => {
  const studentToken = createToken({
    userId: "user-s1",
    username: "BCA25001",
    role: Role.STUDENT,
    studentId: "s1",
  });

  const otherStudentToken = createToken({
    userId: "user-s2",
    username: "BCA25002",
    role: Role.STUDENT,
    studentId: "s2",
  });

  const crossHodToken = createToken({
    userId: "user-hod-bba",
    username: "HOD_BBA",
    role: Role.FACULTY,
    hodDepartmentId: "dept-bba-id",
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

  it("rejects escalation of an already escalated query with HTTP 409", async () => {
    const req = createTestRequest("/api/queries/query-already-escalated/escalate", {
      method: "POST",
      token: studentToken,
    });

    (prisma.query.findUnique as any).mockResolvedValue({
      id: "query-already-escalated",
      status: QueryStatus.ESCALATED,
      facultyId: "fac-1",
      student: {
        id: "s1",
        userId: "user-s1",
        name: "Aarav Gupta",
      },
      subjectOfferingSection: {
        facultyId: "fac-1",
        subjectOffering: {
          subject: { departmentId: "dept-bca-id" },
        },
      },
    });

    const res = await escalatePost(req, { params: { id: "query-already-escalated" } });
    const { status, data } = await parseJsonResponse<any>(res);

    expect(status).toBe(409);
    expect(data.code).toBe("INVALID_QUERY_STATE");
    expect(prisma.query.update).not.toHaveBeenCalled();
  });

  it("rejects escalation by another student with HTTP 403 ESCALATION_FORBIDDEN", async () => {
    const req = createTestRequest("/api/queries/query-open-1/escalate", {
      method: "POST",
      token: otherStudentToken,
      body: { reason: "Attacking someone else's query" },
    });

    (prisma.query.findUnique as any).mockResolvedValue({
      id: "query-open-1",
      status: QueryStatus.OPEN,
      facultyId: "fac-1",
      student: {
        id: "s1",
        userId: "user-s1",
        name: "Aarav Gupta",
      },
      subjectOfferingSection: {
        facultyId: "fac-1",
        subjectOffering: {
          subject: {
            name: "Web Technologies",
            departmentId: "dept-bca-id",
          },
        },
      },
    });

    const res = await escalatePost(req, { params: { id: "query-open-1" } });
    const { status, data } = await parseJsonResponse<any>(res);

    expect(status).toBe(403);
    expect(data.code).toBe("ESCALATION_FORBIDDEN");
    expect(prisma.query.update).not.toHaveBeenCalled();
  });

  it("allows assigned teaching faculty to escalate the query", async () => {
    const assignedFacultyToken = createToken({
      userId: "user-fac-1",
      username: "EMP101",
      role: Role.FACULTY,
      facultyId: "fac-1",
    });

    const req = createTestRequest("/api/queries/query-open-1/escalate", {
      method: "POST",
      token: assignedFacultyToken,
      body: { reason: "Escalating on behalf of student after review" },
    });

    (prisma.query.findUnique as any).mockResolvedValue({
      id: "query-open-1",
      status: QueryStatus.OPEN,
      facultyId: "fac-1",
      student: { id: "s1", userId: "user-s1", name: "Aarav Gupta" },
      subjectOfferingSection: {
        facultyId: "fac-1",
        subjectOffering: {
          subject: { name: "Web Technologies", departmentId: "dept-bca-id" },
        },
      },
    });

    (prisma.hODAssignment.findUnique as any).mockResolvedValue({
      departmentId: "dept-bca-id",
      facultyId: "fac-rajesh-hod",
      faculty: { userId: "user-rajesh-hod", name: "Dr. Rajesh" },
    });

    (prisma.query.update as any).mockResolvedValue({ id: "query-open-1", status: QueryStatus.ESCALATED });
    (prisma.queryMessage.create as any).mockResolvedValue({ id: "msg-1" });
    (prisma.notification.create as any).mockResolvedValue({ id: "notif-1" });

    const res = await escalatePost(req, { params: { id: "query-open-1" } });
    expect(res.status).toBe(200);
  });

  it("rejects escalation by unrelated faculty with HTTP 403", async () => {
    const unrelatedFacultyToken = createToken({
      userId: "user-fac-99",
      username: "EMP999",
      role: Role.FACULTY,
      facultyId: "fac-99",
    });

    const req = createTestRequest("/api/queries/query-open-1/escalate", {
      method: "POST",
      token: unrelatedFacultyToken,
    });

    (prisma.query.findUnique as any).mockResolvedValue({
      id: "query-open-1",
      status: QueryStatus.OPEN,
      facultyId: "fac-1",
      student: { id: "s1", userId: "user-s1", name: "Aarav Gupta" },
      subjectOfferingSection: {
        facultyId: "fac-1",
        subjectOffering: {
          subject: { name: "Web Technologies", departmentId: "dept-bca-id" },
        },
      },
    });

    const res = await escalatePost(req, { params: { id: "query-open-1" } });
    expect(res.status).toBe(403);
  });

  it("rejects escalation by admin with HTTP 403", async () => {
    const adminToken = createToken({
      userId: "user-admin",
      username: "ADMIN001",
      role: Role.ADMIN,
    });

    const req = createTestRequest("/api/queries/query-open-1/escalate", {
      method: "POST",
      token: adminToken,
    });

    (prisma.query.findUnique as any).mockResolvedValue({
      id: "query-open-1",
      status: QueryStatus.OPEN,
      facultyId: "fac-1",
      student: { id: "s1", userId: "user-s1", name: "Aarav Gupta" },
      subjectOfferingSection: {
        facultyId: "fac-1",
        subjectOffering: {
          subject: { name: "Web Technologies", departmentId: "dept-bca-id" },
        },
      },
    });

    const res = await escalatePost(req, { params: { id: "query-open-1" } });
    expect(res.status).toBe(403);
  });

  it("rejects reply by another student with HTTP 403 IDOR_FORBIDDEN", async () => {
    const req = createTestRequest("/api/queries/query-open-1/messages", {
      method: "POST",
      token: otherStudentToken,
      body: { message: "Sneaking into another student's thread" },
    });

    (prisma.query.findUnique as any).mockResolvedValue({
      id: "query-open-1",
      status: QueryStatus.OPEN,
      student: {
        id: "s1",
        userId: "user-s1",
        name: "Aarav Gupta",
      },
      faculty: {
        id: "fac-1",
        userId: "user-fac-1",
      },
      subjectOfferingSection: {
        subjectOffering: {
          subject: {
            departmentId: "dept-bca-id",
          },
        },
      },
    });

    const res = await messagesPost(req, { params: { id: "query-open-1" } });
    const { status, data } = await parseJsonResponse<any>(res);

    expect(status).toBe(403);
    expect(data.code).toBe("IDOR_FORBIDDEN");
    expect(prisma.queryMessage.create).not.toHaveBeenCalled();
  });

  it("rejects message post by HOD of another department with HTTP 403", async () => {
    const req = createTestRequest("/api/queries/query-open-1/messages", {
      method: "POST",
      token: crossHodToken,
      body: { message: "Instruction from wrong department HOD" },
    });

    (prisma.query.findUnique as any).mockResolvedValue({
      id: "query-open-1",
      status: QueryStatus.ESCALATED,
      facultyId: "fac-bca-teacher",
      hodId: "fac-bca-hod",
      student: {
        id: "s1",
        userId: "user-s1",
      },
      faculty: {
        id: "fac-bca-teacher",
        userId: "user-bca-teacher",
      },
      hod: {
        id: "fac-bca-hod",
        userId: "user-bca-hod",
      },
      subjectOfferingSection: {
        subjectOffering: {
          subject: {
            departmentId: "dept-bca-id",
          },
        },
      },
    });

    (prisma.facultyProfile.findUnique as any).mockResolvedValue({
      id: "fac-bba-hod",
      userId: "user-hod-bba",
      hodAssignments: [
        { departmentId: "dept-bba-id" },
      ],
    });

    const res = await messagesPost(req, { params: { id: "query-open-1" } });
    const { status, data } = await parseJsonResponse<any>(res);

    expect(status).toBe(403);
    expect(data.error).toContain("Forbidden: You are not authorized");
    expect(prisma.queryMessage.create).not.toHaveBeenCalled();
  });

  it("fetches notifications with accurate unreadCount", async () => {
    const req = createTestRequest("/api/notifications?all=true", {
      method: "GET",
      token: studentToken,
    });

    (prisma.notification.findMany as any).mockResolvedValue([
      { id: "notif-1", userId: "user-s1", isRead: false, type: "MARKS_PUBLISHED", message: "Marks updated" },
      { id: "notif-2", userId: "user-s1", isRead: true, type: "QUERY_REPLY", message: "Reply received" },
    ]);

    const res = await notificationsGet(req);
    const { status, data } = await parseJsonResponse<any>(res);

    expect(status).toBe(200);
    expect(data.notifications).toHaveLength(2);
    expect(data.unreadCount).toBe(1);
  });

  it("marks a single notification as read via POST /api/notifications/[id]/read", async () => {
    const req = createTestRequest("/api/notifications/notif-1/read", {
      method: "POST",
      token: studentToken,
    });

    (prisma.notification.findFirst as any).mockResolvedValue({
      id: "notif-1",
      userId: "user-s1",
      isRead: false,
    });

    (prisma.notification.update as any).mockResolvedValue({
      id: "notif-1",
      userId: "user-s1",
      isRead: true,
    });

    const res = await notifReadPost(req, { params: { id: "notif-1" } });
    const { status, data } = await parseJsonResponse<any>(res);

    expect(status).toBe(200);
    expect(data.message).toBe("Notification marked as read");
    expect(prisma.notification.update).toHaveBeenCalledWith({
      where: { id: "notif-1" },
      data: { isRead: true },
    });
  });

  it("marks all notifications as read via POST /api/notifications/read-all", async () => {
    const req = createTestRequest("/api/notifications/read-all", {
      method: "POST",
      token: studentToken,
    });

    (prisma.notification.updateMany as any).mockResolvedValue({
      count: 3,
    });

    const res = await notifReadAllPost(req);
    const { status, data } = await parseJsonResponse<any>(res);

    expect(status).toBe(200);
    expect(data.count).toBe(3);
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: {
        userId: "user-s1",
        isRead: false,
      },
      data: {
        isRead: true,
      },
    });
  });

  it("returns 404 when marking a non-existent notification as read", async () => {
    const req = createTestRequest("/api/notifications/non-existent/read", {
      method: "POST",
      token: studentToken,
    });

    (prisma.notification.findFirst as any).mockResolvedValue(null);

    const res = await notifReadPost(req, { params: { id: "non-existent" } });
    const { status, data } = await parseJsonResponse<any>(res);

    expect(status).toBe(404);
    expect(data.error).toBe("Notification not found");
    expect(prisma.notification.update).not.toHaveBeenCalled();
  });
});
