import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyAuth, verifyUnlockedSection } from "@/lib/auth/guards";
import { MarksPreviewRow } from "@/lib/marksImport";

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
      { error: "Forbidden: User is not linked to a FacultyProfile" },
      { status: 403 }
    );
  }

  const sectionId = params.id;

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
          "Forbidden: Marks import is restricted to the assigned teaching faculty for this section.",
        code: "TEACHING_FACULTY_ONLY",
      },
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

  const { rows } = body || {};

  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json(
      { error: "rows array is required and cannot be empty", code: "EMPTY_PAYLOAD" },
      { status: 400 }
    );
  }

  // 3. Reject commit if any blocking row exists in the batch
  const unmatchedRows = rows.filter((r: MarksPreviewRow) => r.status === "UNMATCHED");
  const outOfBoundsRows = rows.filter((r: MarksPreviewRow) => r.status === "OUT_OF_BOUNDS");

  if (unmatchedRows.length > 0 || outOfBoundsRows.length > 0) {
    return NextResponse.json(
      {
        error: "Cannot commit marks: unresolved blocking rows (UNMATCHED or OUT_OF_BOUNDS) exist.",
        code: "BLOCKING_ROWS_EXIST",
        unmatchedCount: unmatchedRows.length,
        outOfBoundsCount: outOfBoundsRows.length,
      },
      { status: 400 }
    );
  }

  // Filter only READY rows (BLANK rows are skipped)
  const readyRows = rows.filter((r: MarksPreviewRow) => r.status === "READY" && r.studentId);

  if (readyRows.length === 0) {
    return NextResponse.json(
      { error: "No ready marks entries found to commit", code: "NO_READY_ENTRIES" },
      { status: 400 }
    );
  }

  try {
    const isAlreadyPublished = Boolean(offeringSection.marksPublishedAt);

    // Fetch existing marks for these students to construct audit logs accurately
    const studentIds = readyRows.map((r: MarksPreviewRow) => r.studentId as string);
    const existingMarks = await prisma.mark.findMany({
      where: {
        studentId: { in: studentIds },
      },
    });

    const existingMarksMap = new Map<string, number>();
    for (const m of existingMarks) {
      existingMarksMap.set(`${m.studentId}:${m.scoreComponentId}`, m.marksObtained);
    }

    const auditLogsToCreate: any[] = [];
    let committedMarksCount = 0;

    await prisma.$transaction(async (tx) => {
      for (const row of readyRows) {
        const studentId = row.studentId!;
        const marksObj = row.marks || {};

        for (const [componentId, rawVal] of Object.entries(marksObj)) {
          if (rawVal === null || rawVal === undefined || rawVal === "") {
            continue; // Skip blank components
          }

          const marksObtained = Number(rawVal);
          const key = `${studentId}:${componentId}`;
          const oldVal = existingMarksMap.get(key);

          // Only audit if value actually changed or is new
          if (oldVal === undefined || oldVal !== marksObtained) {
            auditLogsToCreate.push({
              entityType: "Mark",
              entityId: key,
              changedByUserId: auth.user.userId,
              oldValue: oldVal !== undefined ? String(oldVal) : "NULL",
              newValue: String(marksObtained),
            });
          }

          await tx.mark.upsert({
            where: {
              scoreComponentId_studentId: {
                scoreComponentId: componentId,
                studentId,
              },
            },
            update: {
              marksObtained,
              updatedByFacultyId: facultyId,
            },
            create: {
              scoreComponentId: componentId,
              studentId,
              marksObtained,
              updatedByFacultyId: facultyId,
            },
          });

          committedMarksCount++;
        }
      }

      if (auditLogsToCreate.length > 0) {
        await tx.auditLog.createMany({
          data: auditLogsToCreate,
        });
      }

      // If the section was already published, record an audit event for post-publish edit
      if (isAlreadyPublished && committedMarksCount > 0) {
        await tx.auditLog.create({
          data: {
            entityType: "SubjectOfferingSection",
            entityId: sectionId,
            changedByUserId: auth.user.userId,
            oldValue: "PUBLISHED_MARKS",
            newValue: "MARKS_EDITED_AFTER_PUBLISH",
          },
        });
      }
    });

    const responsePayload: any = {
      message: "Marks imported successfully",
      committedCount: committedMarksCount,
      studentsCount: readyRows.length,
      auditLogsCreated: auditLogsToCreate.length,
    };

    if (isAlreadyPublished) {
      responsePayload.warning =
        "Marks edited on an already published section. Students will see changes immediately.";
    }

    return NextResponse.json(responsePayload, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to commit marks import" },
      { status: 500 }
    );
  }
}

