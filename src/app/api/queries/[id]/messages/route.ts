import { NextRequest, NextResponse } from "next/server";
import { QueryStatus, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth/guards";
import { sanitizeTextInput } from "@/utils/sanitizer";
import { EmailService } from "@/services/emailService";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = verifyAuth(req);
  if (!auth.ok) {
    return auth.error;
  }

  const queryId = params.id;
  const userId = auth.user.userId;

  const body = await req.json().catch(() => ({}));
  const { message } = body;

  if (!message || typeof message !== "string" || !message.trim()) {
    return NextResponse.json(
      { error: "Message content is required" },
      { status: 400 }
    );
  }

  const query = await prisma.query.findUnique({
    where: { id: queryId },
    include: {
      student: { include: { user: true } },
      faculty: { include: { user: true } },
      hod: { include: { user: true } },
      scoreComponent: true,
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
    return NextResponse.json(
      { error: "Query not found" },
      { status: 404 }
    );
  }

  // Authorization: Owning student, assigned teaching faculty, or department HOD only when ESCALATED
  let isAuthorized = false;

  if (auth.user.role === Role.STUDENT) {
    if (query.student.userId !== userId) {
      return NextResponse.json(
        {
          error: "Forbidden: You are not authorized to participate in another student's query thread",
          code: "IDOR_FORBIDDEN",
        },
        { status: 403 }
      );
    }
    isAuthorized = true;
  } else if (auth.user.role === Role.FACULTY) {
    const callerFacultyId = auth.user.facultyId;
    const assignedSectionFacultyId = query.subjectOfferingSection.facultyId;
    const isAssignedFaculty =
      callerFacultyId &&
      (callerFacultyId === query.facultyId || callerFacultyId === assignedSectionFacultyId);

    if (isAssignedFaculty) {
      isAuthorized = true;
    } else if (query.status === QueryStatus.ESCALATED) {
      const faculty = await prisma.facultyProfile.findUnique({
        where: { userId },
        include: { hodAssignments: true },
      });
      const deptId = query.subjectOfferingSection.subjectOffering.subject.departmentId;
      const isDeptHOD = faculty?.hodAssignments.some((h) => h.departmentId === deptId);
      const isAssignedHOD = query.hodId === faculty?.id;
      if (isDeptHOD || isAssignedHOD) {
        isAuthorized = true;
      }
    }
  }

  if (!isAuthorized) {
    return NextResponse.json(
      {
        error: "Forbidden: You are not authorized to participate in this query thread",
        code: "PARTICIPATION_FORBIDDEN",
      },
      { status: 403 }
    );
  }

  const cleanMessage = sanitizeTextInput(message.trim());

  const queryMessage = await prisma.queryMessage.create({
    data: {
      queryId,
      authorUserId: userId,
      message: cleanMessage,
    },
  });

  // Notify counterpart user
  const recipientUserIds: string[] = [];
  if (auth.user.role === Role.STUDENT) {
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

  // Non-blocking transactional email notification (outside DB transaction, never awaited in a failing way)
  try {
    if (auth.user.role === Role.FACULTY && query.student?.user?.email) {
      await EmailService.sendStudentQueryReply(
        {
          email: query.student.user.email,
          emailNotifications: query.student.user.emailNotifications,
          name: query.student.name,
        },
        {
          subjectName: query.subjectOfferingSection.subjectOffering.subject.name,
          replyMessage: cleanMessage,
        }
      );
    }
  } catch (emailErr) {
    console.error("[QueryReply] Non-blocking email dispatch failure:", emailErr);
  }

  return NextResponse.json(
    { message: "Message added", queryMessage },
    { status: 201 }
  );
}
