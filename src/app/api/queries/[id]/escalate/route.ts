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
  const { reason } = body;

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
    return NextResponse.json(
      { error: "Query not found" },
      { status: 404 }
    );
  }

  // Only (a) owning student or (b) assigned teaching faculty may escalate
  let isAuthorized = false;

  if (auth.user.role === Role.STUDENT) {
    if (query.student.userId === userId) {
      isAuthorized = true;
    }
  } else if (auth.user.role === Role.FACULTY) {
    const callerFacultyId = auth.user.facultyId;
    const assignedSectionFacultyId = query.subjectOfferingSection.facultyId;
    if (
      callerFacultyId &&
      (callerFacultyId === query.facultyId || callerFacultyId === assignedSectionFacultyId)
    ) {
      isAuthorized = true;
    }
  }

  if (!isAuthorized) {
    return NextResponse.json(
      {
        error: "Forbidden: Only the owning student or the assigned teaching faculty may escalate this query",
        code: "ESCALATION_FORBIDDEN",
      },
      { status: 403 }
    );
  }

  if (query.status === QueryStatus.ESCALATED || query.status === QueryStatus.RESOLVED) {
    return NextResponse.json(
      {
        error: `Query cannot be escalated because it is already ${query.status.toLowerCase()}`,
        code: "INVALID_QUERY_STATE",
      },
      { status: 409 }
    );
  }

  const deptId = query.subjectOfferingSection.subjectOffering.subject.departmentId;

  const hodAssignment = await prisma.hODAssignment.findUnique({
    where: { departmentId: deptId },
    include: { faculty: { include: { user: true } } },
  });

  if (!hodAssignment) {
    return NextResponse.json(
      { error: "No HOD currently assigned to this department to escalate to" },
      { status: 400 }
    );
  }

  const cleanReason = reason && typeof reason === "string" ? sanitizeTextInput(reason.trim()) : "";

  const updatedQuery = await prisma.query.update({
    where: { id: queryId },
    data: {
      status: QueryStatus.ESCALATED,
      hodId: hodAssignment.facultyId,
    },
  });

  const escalationText = cleanReason
    ? `[SYSTEM: ESCALATED TO HOD] Reason: ${cleanReason}`
    : `[SYSTEM: ESCALATED TO HOD] Query escalated for HOD review.`;

  await prisma.queryMessage.create({
    data: {
      queryId,
      authorUserId: userId,
      message: escalationText,
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

  // Non-blocking transactional email notification to HOD
  try {
    if (hodAssignment.faculty?.user?.email) {
      await EmailService.sendQueryEscalated(
        {
          email: hodAssignment.faculty.user.email,
          emailNotifications: hodAssignment.faculty.user.emailNotifications,
          name: hodAssignment.faculty.name,
        },
        {
          subjectName: query.subjectOfferingSection.subjectOffering.subject.name,
          studentName: query.student.name,
          reason: cleanReason,
        }
      );
    }
  } catch (emailErr) {
    console.error("[QueryEscalate] Non-blocking email dispatch failure:", emailErr);
  }

  return NextResponse.json({
    message: "Query escalated to HOD successfully",
    query: updatedQuery,
  });
}
