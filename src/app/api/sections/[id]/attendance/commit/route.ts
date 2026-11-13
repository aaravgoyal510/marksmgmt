import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyAuth, verifyUnlockedSection } from "@/lib/auth/guards";
import { attendanceScore, SlabRange } from "@/services/gradingEngine";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = verifyAuth(req, [Role.FACULTY]);
  if (!auth.ok) {
    return auth.error;
  }

  const facultyId = auth.user.facultyId;
  if (!facultyId) {
    return NextResponse.json(
      { error: "Forbidden: Only faculty can import attendance" },
      { status: 403 }
    );
  }

  const sectionId = params.id;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON request body" },
      { status: 400 }
    );
  }

  const { entries } = body || {};

  if (!Array.isArray(entries) || entries.length === 0) {
    return NextResponse.json(
      { error: "entries array is required and cannot be empty" },
      { status: 400 }
    );
  }

  // 1. Enforce section lock via verifyUnlockedSection (returns 423 if locked)
  const lockCheck = await verifyUnlockedSection(sectionId);
  if (!lockCheck.ok) {
    return lockCheck.error;
  }
  const offeringSection = lockCheck.section;

  // 2. Strict Section Teaching Faculty Ownership Enforcement
  if (offeringSection.facultyId !== facultyId) {
    return NextResponse.json(
      {
        error:
          "Forbidden: Attendance import is restricted to the assigned teaching faculty for this section.",
        code: "TEACHING_FACULTY_ONLY",
      },
      { status: 403 }
    );
  }

  try {
    const policy = await prisma.gradingPolicy.findFirst({
      where: {
        subjectOffering: {
          sections: {
            some: { id: sectionId },
          },
        },
      },
      include: {
        attendanceSlabRanges: { orderBy: { minPercent: "asc" } },
      },
    });

    if (!policy) {
      return NextResponse.json(
        { error: "Grading policy not configured for this section" },
        { status: 400 }
      );
    }

    const slabs: SlabRange[] = policy.attendanceSlabRanges.map((s: any) => ({
      minPercent: s.minPercent,
      maxPercent: s.maxPercent,
      marks: s.marks,
    }));

    // Validate that no student entry falls into a slab gap before transaction
    for (const entry of entries) {
      const { studentId, attendancePercent } = entry;
      if (
        !studentId ||
        attendancePercent === undefined ||
        typeof attendancePercent !== "number"
      ) {
        continue;
      }

      const marks = attendanceScore(attendancePercent, slabs);
      if (marks === null) {
        return NextResponse.json(
          {
            error: `Cannot commit row for studentId ${studentId}: attendance ${attendancePercent}% falls into an HOD slab gap.`,
            code: "BLOCKED_SLAB_GAP",
            details: { studentId, attendancePercent },
          },
          { status: 400 }
        );
      }
    }

    const committedRecords = await prisma.$transaction(async (tx) => {
      const results = [];

      for (const entry of entries) {
        const { studentId, attendancePercent } = entry;

        if (
          !studentId ||
          attendancePercent === undefined ||
          typeof attendancePercent !== "number"
        ) {
          continue;
        }

        const record = await tx.attendanceRecord.upsert({
          where: {
            subjectOfferingSectionId_studentId: {
              subjectOfferingSectionId: sectionId,
              studentId,
            },
          },
          update: {
            attendancePercent,
          },
          create: {
            subjectOfferingSectionId: sectionId,
            studentId,
            attendancePercent,
          },
        });

        results.push(record);
      }

      return results;
    });

    return NextResponse.json(
      {
        message:
          "Attendance records committed successfully (latest snapshot overwritten)",
        committedCount: committedRecords.length,
      },
      { status: 200 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to commit attendance records" },
      { status: 500 }
    );
  }
}
