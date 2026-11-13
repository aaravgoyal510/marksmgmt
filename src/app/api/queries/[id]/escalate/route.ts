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

  // IDOR Protection: Students can only escalate their own queries
  if (auth.user.role === Role.STUDENT && query.student.userId !== userId) {
    return NextResponse.json(
      {
        error: "Forbidden: You are not authorized to escalate another student's query",
        code: "IDOR_FORBIDDEN",
      },
      { status: 403 }
    );
  }

  if (query.status === QueryStatus.ESCALATED) {
    return NextResponse.json(
      { error: "Query is already escalated" },
      { status: 400 }
    );
  }

  const deptId = query.subjectOfferingSection.subjectOffering.subject.departmentId;

  const hodAssignment = await prisma.hODAssignment.findUnique({
    where: { departmentId: deptId },
    include: { faculty: true },
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

  return NextResponse.json({
    message: "Query escalated to HOD successfully",
    query: updatedQuery,
  });
}
