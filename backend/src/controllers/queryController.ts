import { Request, Response } from "express";
import { PrismaClient, QueryStatus, Role } from "@prisma/client";
import { sanitizeTextInput } from "../utils/sanitizer";

const prisma = new PrismaClient();

// -----------------------------------------------------------------------------
// 1. Create Student Query (Student -> Faculty)
// -----------------------------------------------------------------------------
export async function createQuery(req: Request, res: Response) {
  const { subjectOfferingSectionId, scoreComponentId, message } = req.body;
  const userId = req.user?.userId;

  if (!subjectOfferingSectionId || !message) {
    return res.status(400).json({ error: "subjectOfferingSectionId and message are required" });
  }

  const studentProfile = await prisma.studentProfile.findUnique({ where: { userId } });
  if (!studentProfile) {
    return res.status(403).json({ error: "Only enrolled students can raise queries" });
  }

  const offeringSection = await prisma.subjectOfferingSection.findUnique({
    where: { id: subjectOfferingSectionId },
    include: {
      faculty: true,
      subjectOffering: {
        include: { subject: true },
      },
    },
  });

  if (!offeringSection || !offeringSection.facultyId || !offeringSection.faculty) {
    return res.status(400).json({ error: "Cannot raise query on an unassigned or invalid subject section" });
  }

  const cleanMessage = sanitizeTextInput(message);

  const query = await prisma.query.create({
    data: {
      studentId: studentProfile.id,
      subjectOfferingSectionId,
      scoreComponentId: scoreComponentId || null,
      message: cleanMessage,
      status: QueryStatus.OPEN,
      facultyId: offeringSection.facultyId,
      messages: {
        create: {
          authorUserId: userId!,
          message: cleanMessage,
        },
      },
    },
    include: {
      messages: true,
    },
  });

  await prisma.notification.create({
    data: {
      userId: offeringSection.faculty.userId,
      type: "NEW_QUERY",
      message: `New query raised by ${studentProfile.name} in ${offeringSection.subjectOffering.subject.name}`,
      link: `/faculty/queries/${query.id}`,
    },
  });

  return res.status(201).json({ message: "Query raised successfully", query });
}

// -----------------------------------------------------------------------------
// 2. Add Message to Query Thread
// -----------------------------------------------------------------------------
export async function addQueryMessage(req: Request, res: Response) {
  const queryId = req.params.id as string;
  const { message } = req.body;
  const userId = req.user?.userId;

  if (!message) {
    return res.status(400).json({ error: "Message content is required" });
  }

  const query = await prisma.query.findUnique({
    where: { id: queryId },
    include: {
      student: true,
      faculty: true,
      hod: true,
      subjectOfferingSection: {
        include: { subjectOffering: { include: { subject: true } } },
      },
    },
  });

  if (!query) {
    return res.status(404).json({ error: "Query not found" });
  }

  // IDOR Protection: Students can only post messages to their own queries
  if (req.user?.role === Role.STUDENT && query.student.userId !== userId) {
    return res.status(403).json({
      error: "Forbidden: You are not authorized to participate in another student's query thread",
      code: "IDOR_FORBIDDEN",
    });
  }

  const queryMessage = await prisma.queryMessage.create({
    data: {
      queryId,
      authorUserId: userId!,
      message: sanitizeTextInput(message),
    },
  });

  const recipientUserIds: string[] = [];
  if (req.user?.role === Role.STUDENT) {
    if (query.faculty) recipientUserIds.push(query.faculty.userId);
    if (query.hod) recipientUserIds.push(query.hod.userId);
  } else {
    if (query.student) recipientUserIds.push(query.student.userId);
  }

  for (const rId of recipientUserIds) {
    await prisma.notification.create({
      data: {
        userId: rId,
        type: "QUERY_REPLY",
        message: `New message on query regarding ${query.subjectOfferingSection.subjectOffering.subject.name}`,
        link: `/queries/${query.id}`,
      },
    });
  }

  return res.status(200).json({ message: "Message added", queryMessage });
}

// -----------------------------------------------------------------------------
// 3. Escalate Query to HOD
// -----------------------------------------------------------------------------
export async function escalateQuery(req: Request, res: Response) {
  const queryId = req.params.id as string;

  const query = await prisma.query.findUnique({
    where: { id: queryId },
    include: {
      student: true,
      subjectOfferingSection: {
        include: {
          subjectOffering: {
            include: { subject: true },
          },
        },
      },
    },
  });

  if (!query) {
    return res.status(404).json({ error: "Query not found" });
  }

  // IDOR Protection: Students can only escalate their own queries
  if (req.user?.role === Role.STUDENT && query.student.userId !== req.user?.userId) {
    return res.status(403).json({
      error: "Forbidden: You are not authorized to escalate another student's query",
      code: "IDOR_FORBIDDEN",
    });
  }

  if (query.status === QueryStatus.ESCALATED) {
    return res.status(400).json({ error: "Query is already escalated" });
  }

  const deptId = query.subjectOfferingSection.subjectOffering.subject.departmentId;

  const hodAssignment = await prisma.hODAssignment.findUnique({
    where: { departmentId: deptId },
    include: { faculty: true },
  });

  if (!hodAssignment) {
    return res.status(400).json({ error: "No HOD currently assigned to this department to escalate to" });
  }

  const updatedQuery = await prisma.query.update({
    where: { id: queryId },
    data: {
      status: QueryStatus.ESCALATED,
      hodId: hodAssignment.facultyId,
    },
  });

  await prisma.notification.create({
    data: {
      userId: hodAssignment.faculty.userId,
      type: "QUERY_ESCALATED",
      message: `Escalated query from ${query.student.name} in ${query.subjectOfferingSection.subjectOffering.subject.name}`,
      link: `/hod/queries/${query.id}`,
    },
  });

  return res.status(200).json({
    message: "Query escalated to HOD successfully",
    query: updatedQuery,
  });
}

// -----------------------------------------------------------------------------
// 4. Resolve Query
// -----------------------------------------------------------------------------
export async function resolveQuery(req: Request, res: Response) {
  const queryId = req.params.id as string;

  const query = await prisma.query.findUnique({
    where: { id: queryId },
    include: { student: true },
  });

  if (!query) {
    return res.status(404).json({ error: "Query not found" });
  }

  // IDOR Protection: Students can only resolve their own queries
  if (req.user?.role === Role.STUDENT && query.student.userId !== req.user?.userId) {
    return res.status(403).json({
      error: "Forbidden: You are not authorized to resolve another student's query",
      code: "IDOR_FORBIDDEN",
    });
  }

  const updatedQuery = await prisma.query.update({
    where: { id: queryId },
    data: {
      status: QueryStatus.RESOLVED,
      resolvedAt: new Date(),
    },
  });

  await prisma.notification.create({
    data: {
      userId: query.student.userId,
      type: "QUERY_RESOLVED",
      message: `Your query has been marked as resolved.`,
      link: `/student/queries/${query.id}`,
    },
  });

  return res.status(200).json({ message: "Query resolved successfully", query: updatedQuery });
}

// -----------------------------------------------------------------------------
// 5. List Queries (Filtered by Role)
// -----------------------------------------------------------------------------
export async function listQueries(req: Request, res: Response) {
  const userId = req.user?.userId;
  const role = req.user?.role;
  const statusParam = req.query.status as QueryStatus | undefined;

  let whereClause: any = {};

  if (role === Role.STUDENT) {
    const student = await prisma.studentProfile.findUnique({ where: { userId } });
    if (!student) return res.status(404).json({ error: "Student profile not found" });
    whereClause.studentId = student.id;
  } else if (role === Role.FACULTY) {
    const faculty = await prisma.facultyProfile.findUnique({ where: { userId } });
    if (!faculty) return res.status(404).json({ error: "Faculty profile not found" });

    if (req.query.scope === "HOD") {
      whereClause.hodId = faculty.id;
      whereClause.status = QueryStatus.ESCALATED;
    } else {
      whereClause.facultyId = faculty.id;
    }
  }

  if (statusParam) {
    whereClause.status = statusParam;
  }

  const queries = await prisma.query.findMany({
    where: whereClause,
    include: {
      student: true,
      subjectOfferingSection: {
        include: {
          subjectOffering: { include: { subject: true } },
          section: true,
        },
      },
      scoreComponent: true,
      messages: {
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return res.status(200).json({ queries });
}
