import { NextRequest, NextResponse } from "next/server";
import { QueryStatus, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth/guards";
import { sanitizeTextInput } from "@/utils/sanitizer";

export const dynamic = "force-dynamic";

// -----------------------------------------------------------------------------
// POST /api/queries - Create Student Query
// -----------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const auth = verifyAuth(req);
  if (!auth.ok) {
    return auth.error;
  }

  const userId = auth.user.userId;

  // Enforce caller is an enrolled student
  if (auth.user.role !== Role.STUDENT) {
    return NextResponse.json(
      { error: "Only enrolled students can raise queries" },
      { status: 403 }
    );
  }

  const studentProfile = await prisma.studentProfile.findUnique({
    where: { userId },
  });

  if (!studentProfile) {
    return NextResponse.json(
      { error: "Only enrolled students can raise queries" },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const { subjectOfferingSectionId, scoreComponentId, message } = body;

  if (!subjectOfferingSectionId || !message || typeof message !== "string" || !message.trim()) {
    return NextResponse.json(
      { error: "subjectOfferingSectionId and message are required" },
      { status: 400 }
    );
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
    return NextResponse.json(
      { error: "Cannot raise query on an unassigned or invalid subject section" },
      { status: 400 }
    );
  }

  const cleanMessage = sanitizeTextInput(message.trim());

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
          authorUserId: userId,
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

  return NextResponse.json(
    { message: "Query submitted successfully", query },
    { status: 201 }
  );
}

// -----------------------------------------------------------------------------
// GET /api/queries - List Queries Filtered by Role
// -----------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const auth = verifyAuth(req);
  if (!auth.ok) {
    return auth.error;
  }

  const userId = auth.user.userId;
  const role = auth.user.role;
  const statusParam = req.nextUrl.searchParams.get("status") as QueryStatus | null;
  const scope = req.nextUrl.searchParams.get("scope");

  let whereClause: any = {};

  if (role === Role.STUDENT) {
    const student = await prisma.studentProfile.findUnique({ where: { userId } });
    if (!student) {
      return NextResponse.json(
        { error: "Student profile not found" },
        { status: 404 }
      );
    }
    whereClause.studentId = student.id;
  } else if (role === Role.FACULTY) {
    const faculty = await prisma.facultyProfile.findUnique({
      where: { userId },
      include: { hodAssignments: true },
    });

    if (!faculty) {
      return NextResponse.json(
        { error: "Faculty profile not found" },
        { status: 404 }
      );
    }

    const isHOD = faculty.hodAssignments.length > 0;
    const hodDeptIds = faculty.hodAssignments.map((h) => h.departmentId);

    if (scope === "HOD") {
      whereClause.OR = [
        { hodId: faculty.id },
        {
          subjectOfferingSection: {
            subjectOffering: {
              subject: { departmentId: { in: hodDeptIds } },
            },
          },
          status: QueryStatus.ESCALATED,
        },
      ];
    } else if (isHOD) {
      whereClause.OR = [
        { facultyId: faculty.id },
        { hodId: faculty.id },
        {
          subjectOfferingSection: {
            subjectOffering: {
              subject: { departmentId: { in: hodDeptIds } },
            },
          },
          status: QueryStatus.ESCALATED,
        },
      ];
    } else {
      whereClause.facultyId = faculty.id;
    }
  }
  // ADMIN role: whereClause remains empty to query all

  if (statusParam) {
    if (whereClause.OR) {
      whereClause = {
        AND: [
          { status: statusParam },
          { OR: whereClause.OR },
        ],
      };
    } else {
      whereClause.status = statusParam;
    }
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

  return NextResponse.json({ queries });
}
