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
  const resolutionRemarks = body.resolutionRemarks || body.remarks || "";

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

  // IDOR Protection: Students can only resolve their own queries
  if (auth.user.role === Role.STUDENT && query.student.userId !== userId) {
    return NextResponse.json(
      {
        error: "Forbidden: You are not authorized to resolve another student's query",
        code: "IDOR_FORBIDDEN",
      },
      { status: 403 }
    );
  }

  // Authorization check for faculty: must be assigned faculty or HOD
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
        { error: "Forbidden: You are not authorized to resolve this query" },
        { status: 403 }
      );
    }
  }

  const cleanRemarks =
    resolutionRemarks && typeof resolutionRemarks === "string"
      ? sanitizeTextInput(resolutionRemarks.trim())
      : "";

  const updatedQuery = await prisma.query.update({
    where: { id: queryId },
    data: {
      status: QueryStatus.RESOLVED,
      resolvedAt: new Date(),
    },
  });

  const resolutionText = cleanRemarks
    ? `[SYSTEM: RESOLVED] Remarks: ${cleanRemarks}`
    : `[SYSTEM: RESOLVED] Query has been marked as resolved.`;

  await prisma.queryMessage.create({
    data: {
      queryId,
      authorUserId: userId,
      message: resolutionText,
    },
  });

  await prisma.notification.create({
    data: {
      userId: query.student.userId,
      type: "QUERY_RESOLVED",
      message: "Your query has been marked as resolved.",
      link: `/student/queries/${query.id}`,
    },
  });

  return NextResponse.json({
    message: "Query resolved successfully",
    query: updatedQuery,
  });
}
