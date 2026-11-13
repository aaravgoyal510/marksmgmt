import { NextRequest, NextResponse } from "next/server";
import { QueryStatus, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth/guards";
import { sanitizeTextInput } from "@/utils/sanitizer";

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
      student: true,
      faculty: true,
      hod: true,
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

  // IDOR Protection: Students can only post messages to their own queries
  if (auth.user.role === Role.STUDENT && query.student.userId !== userId) {
    return NextResponse.json(
      {
        error: "Forbidden: You are not authorized to participate in another student's query thread",
        code: "IDOR_FORBIDDEN",
      },
      { status: 403 }
    );
  }

  // Authorization check for faculty
  if (auth.user.role === Role.FACULTY) {
    const faculty = await prisma.facultyProfile.findUnique({
      where: { userId },
      include: { hodAssignments: true },
    });

    const isAssignedFaculty = query.facultyId === faculty?.id;
    const isAssignedHOD = query.hodId === faculty?.id;
    const deptId = query.subjectOfferingSection.subjectOffering.subject.departmentId;
    const isDeptHOD = faculty?.hodAssignments.some((h) => h.departmentId === deptId);

    if (!isAssignedFaculty && !isAssignedHOD && !isDeptHOD) {
      return NextResponse.json(
        { error: "Forbidden: You are not authorized to participate in this query thread" },
        { status: 403 }
      );
    }
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

  return NextResponse.json(
    { message: "Message added", queryMessage },
    { status: 201 }
  );
}
