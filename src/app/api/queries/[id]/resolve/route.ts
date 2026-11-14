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

  // Authorization rule: assigned teaching faculty only
  if (auth.user.role !== Role.FACULTY) {
    return NextResponse.json(
      { error: "Forbidden: Only assigned teaching faculty may resolve this query" },
      { status: 403 }
    );
  }

  const callerFacultyId = auth.user.facultyId;
  const assignedSectionFacultyId = query.subjectOfferingSection.facultyId;
  const isAssignedFaculty =
    callerFacultyId &&
    (callerFacultyId === query.facultyId || callerFacultyId === assignedSectionFacultyId);

  if (!isAssignedFaculty) {
    return NextResponse.json(
      {
        error: "Forbidden: Only the assigned teaching faculty for this section may resolve this query",
        code: "TEACHING_FACULTY_ONLY",
      },
      { status: 403 }
    );
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
