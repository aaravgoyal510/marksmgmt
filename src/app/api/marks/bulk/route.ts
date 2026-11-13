import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyAuth, verifyUnlockedSection } from "@/lib/auth/guards";
import { attendanceScore, SlabRange } from "@/services/gradingEngine";

export async function PUT(req: NextRequest) {
  const auth = verifyAuth(req, [Role.FACULTY]);
  if (!auth.ok) {
    return auth.error;
  }

  const facultyId = auth.user.facultyId;
  const userId = auth.user.userId;

  if (!facultyId || !userId) {
    return NextResponse.json(
      { error: "Forbidden: Only faculty can enter marks or attendance" },
      { status: 403 }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON request body" },
      { status: 400 }
    );
  }

  const { sectionId, entries, attendanceEntries } = body || {};

  const hasMarkEntries = Array.isArray(entries) && entries.length > 0;
  const hasAttendanceEntries =
    Array.isArray(attendanceEntries) && attendanceEntries.length > 0;

  if (!sectionId || (!hasMarkEntries && !hasAttendanceEntries)) {
    return NextResponse.json(
      {
        error:
          "sectionId and at least one mark entry or attendance entry are required",
      },
      { status: 400 }
    );
  }

  // 1. Enforce Section Lock rules via typed guard
  const lockCheck = await verifyUnlockedSection(sectionId);
  if (!lockCheck.ok) {
    return lockCheck.error;
  }
  const offeringSection = lockCheck.section;

  // 2. Strict HOD Instruct-Only Rule Enforcement:
  // Direct mark & attendance edits are restricted to the assigned teaching faculty for this section.
  // An HOD (or any non-assigned faculty) attempting to edit marks or attendance directly is rejected with 403.
  if (offeringSection.facultyId !== facultyId) {
    return NextResponse.json(
      {
        error:
          "Forbidden: Direct mark entry is restricted to the assigned teaching faculty for this section. HODs can instruct via escalated queries, but cannot edit marks directly.",
        code: "TEACHING_FACULTY_ONLY",
      },
      { status: 403 }
    );
  }

  try {
    // Fetch score components for bounds validation
    const components =
      (await prisma.scoreComponent.findMany({
        where: {
          gradingPolicy: {
            subjectOffering: {
              sections: {
                some: { id: sectionId },
              },
            },
          },
        },
      })) || [];

    const componentMap = new Map(components.map((c) => [c.id, c]));

    // Pre-validate all mark entries before opening database transaction
    if (hasMarkEntries) {
      for (const entry of entries) {
        const { scoreComponentId, studentId, marksObtained } = entry;
        if (
          !scoreComponentId ||
          !studentId ||
          marksObtained === undefined ||
          typeof marksObtained !== "number"
        ) {
          continue;
        }

        const comp = componentMap.get(scoreComponentId);
        if (comp) {
          if (marksObtained < 0 || marksObtained > comp.maxMarks) {
            return NextResponse.json(
              {
                error: `Marks obtained (${marksObtained}) for component ${comp.name} exceeds valid range (0 - ${comp.maxMarks}) for student ${studentId}`,
                code: "MARK_OUT_OF_BOUNDS",
                details: {
                  studentId,
                  scoreComponentId,
                  componentName: comp.name,
                  marksObtained,
                  minMarks: 0,
                  maxMarks: comp.maxMarks,
                },
              },
              { status: 400 }
            );
          }
        }
      }
    }

    // Pre-validate all attendance entries against bounds (0-100) and HOD Slab Ranges
    if (hasAttendanceEntries) {
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

      const slabRanges: SlabRange[] = policy
        ? policy.attendanceSlabRanges.map((s) => ({
            minPercent: s.minPercent,
            maxPercent: s.maxPercent,
            marks: s.marks,
          }))
        : [];

      for (const attEntry of attendanceEntries) {
        const { studentId, attendancePercent } = attEntry;
        if (
          !studentId ||
          attendancePercent === undefined ||
          typeof attendancePercent !== "number"
        ) {
          continue;
        }

        if (attendancePercent < 0 || attendancePercent > 100) {
          return NextResponse.json(
            {
              error: `Attendance percentage (${attendancePercent}%) for student ${studentId} must be between 0 and 100`,
              code: "INVALID_ATTENDANCE_PERCENTAGE",
            },
            { status: 400 }
          );
        }

        if (slabRanges.length > 0) {
          const slabMarks = attendanceScore(attendancePercent, slabRanges);
          if (slabMarks === null) {
            return NextResponse.json(
              {
                error: `Attendance percentage (${attendancePercent}%) for student ${studentId} falls into an unmapped attendance slab gap`,
                code: "BLOCKED_SLAB_GAP",
                details: { studentId, attendancePercent },
              },
              { status: 400 }
            );
          }
        }
      }
    }

    const auditLogsToCreate: Array<{
      entityType: string;
      entityId: string;
      changedByUserId: string;
      oldValue: string;
      newValue: string;
    }> = [];

    const transactionResult = await prisma.$transaction(async (tx) => {
      const markResults = [];
      const attendanceResults = [];

      // 1. Process Mark Upserts
      if (hasMarkEntries) {
        for (const entry of entries) {
          const { scoreComponentId, studentId, marksObtained } = entry;

          if (
            !scoreComponentId ||
            !studentId ||
            marksObtained === undefined ||
            typeof marksObtained !== "number"
          ) {
            continue;
          }

          const existingMark = await tx.mark.findUnique({
            where: {
              scoreComponentId_studentId: {
                scoreComponentId,
                studentId,
              },
            },
          });

          const mark = await tx.mark.upsert({
            where: {
              scoreComponentId_studentId: {
                scoreComponentId,
                studentId,
              },
            },
            update: {
              marksObtained,
              updatedByFacultyId: facultyId,
            },
            create: {
              scoreComponentId,
              studentId,
              marksObtained,
              updatedByFacultyId: facultyId,
            },
          });

          if (existingMark && existingMark.marksObtained !== marksObtained) {
            auditLogsToCreate.push({
              entityType: "Mark",
              entityId: mark.id,
              changedByUserId: userId,
              oldValue: existingMark.marksObtained.toString(),
              newValue: marksObtained.toString(),
            });
          } else if (!existingMark) {
            auditLogsToCreate.push({
              entityType: "Mark",
              entityId: mark.id,
              changedByUserId: userId,
              oldValue: "NEW_ENTRY",
              newValue: marksObtained.toString(),
            });
          }

          markResults.push(mark);
        }
      }

      // 2. Process Attendance Record Upserts & Audit Logging
      if (hasAttendanceEntries) {
        for (const attEntry of attendanceEntries) {
          const { studentId, attendancePercent } = attEntry;

          if (
            !studentId ||
            attendancePercent === undefined ||
            typeof attendancePercent !== "number"
          ) {
            continue;
          }

          const existingRecord = await tx.attendanceRecord.findUnique({
            where: {
              subjectOfferingSectionId_studentId: {
                subjectOfferingSectionId: sectionId,
                studentId,
              },
            },
          });

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

          if (
            existingRecord &&
            existingRecord.attendancePercent !== attendancePercent
          ) {
            auditLogsToCreate.push({
              entityType: "AttendanceRecord",
              entityId: record.id,
              changedByUserId: userId,
              oldValue: `${existingRecord.attendancePercent}%`,
              newValue: `${attendancePercent}%`,
            });
          } else if (!existingRecord) {
            auditLogsToCreate.push({
              entityType: "AttendanceRecord",
              entityId: record.id,
              changedByUserId: userId,
              oldValue: "NEW_ENTRY",
              newValue: `${attendancePercent}%`,
            });
          }

          attendanceResults.push(record);
        }
      }

      if (auditLogsToCreate.length > 0) {
        await tx.auditLog.createMany({
          data: auditLogsToCreate,
        });
      }

      return { marks: markResults, attendance: attendanceResults };
    });

    const totalCount =
      transactionResult.marks.length + transactionResult.attendance.length;

    return NextResponse.json(
      {
        message: "Marks and attendance updated successfully",
        count: totalCount,
        updatedCount: totalCount,
        auditLogsCreated: auditLogsToCreate.length,
      },
      { status: 200 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to update marks and attendance" },
      { status: 500 }
    );
  }
}
