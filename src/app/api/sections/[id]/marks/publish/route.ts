import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyAuth, verifyUnlockedSection } from "@/lib/auth/guards";
import { EmailService } from "@/services/emailService";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = verifyAuth(req, [Role.FACULTY]);
  if (!auth.ok) {
    return auth.error;
  }

  const sectionId = params.id;

  // 1. Enforce section lock via verifyUnlockedSection (returns 423 if locked)
  const lockCheck = await verifyUnlockedSection(sectionId);
  if (!lockCheck.ok) {
    return lockCheck.error;
  }
  const offeringSection = lockCheck.section;

  // 2. Strict Section Teaching Faculty Ownership Enforcement
  if (offeringSection.facultyId !== auth.user.facultyId) {
    return NextResponse.json(
      {
        error:
          "Forbidden: Marks publication is restricted to the assigned teaching faculty for this section.",
        code: "TEACHING_FACULTY_ONLY",
      },
      { status: 403 }
    );
  }

  try {
    const updated = await prisma.subjectOfferingSection.update({
      where: { id: sectionId },
      data: {
        marksPublishedAt: new Date(),
        marksPublishedById: auth.user.userId,
      },
      include: {
        subjectOffering: {
          include: {
            subject: true,
          },
        },
        section: {
          include: {
            students: {
              select: {
                id: true,
                userId: true,
                name: true,
                user: {
                  select: {
                    email: true,
                    emailNotifications: true,
                  },
                },
              },
            },
            batch: true,
          },
        },
      },
    });

    // Write AuditLog for publication
    await prisma.auditLog.create({
      data: {
        entityType: "SubjectOfferingSection",
        entityId: sectionId,
        changedByUserId: auth.user.userId,
        oldValue: offeringSection.marksPublishedAt
          ? offeringSection.marksPublishedAt.toISOString()
          : "UNPUBLISHED",
        newValue: "MARKS_PUBLISHED",
      },
    });

    // Notify enrolled students of the section
    const students = updated.section?.students || [];
    const subjectName = updated.subjectOffering?.subject?.name || "your course";

    if (students.length > 0) {
      const notifRecords = students.map((st) => ({
        userId: st.userId,
        type: "MARKS_PUBLISHED",
        message: `Internal marks published for ${subjectName}`,
        link: "/student",
      }));

      await prisma.notification.createMany({
        data: notifRecords,
      });

      // Non-blocking transactional emails to enrolled students (outside DB transaction)
      for (const st of students) {
        if (st.user?.email && st.user?.emailNotifications) {
          EmailService.sendStudentMarksPublished(
            {
              email: st.user.email,
              emailNotifications: st.user.emailNotifications,
              name: st.name,
            },
            {
              subjectName,
              sectionName: updated.section?.name || "A",
            }
          ).catch((err) => {
            console.error(`[PublishMarks] Non-blocking email dispatch failure for student ${st.id}:`, err);
          });
        }
      }
    }

    return NextResponse.json(
      {
        message: "Marks published successfully",
        marksPublishedAt: updated.marksPublishedAt,
      },
      { status: 200 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to publish marks" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = verifyAuth(req, [Role.FACULTY]);
  if (!auth.ok) {
    return auth.error;
  }

  const sectionId = params.id;

  // 1. Enforce section lock via verifyUnlockedSection (returns 423 if locked)
  const lockCheck = await verifyUnlockedSection(sectionId);
  if (!lockCheck.ok) {
    return lockCheck.error;
  }
  const offeringSection = lockCheck.section;

  // 2. Strict Section Teaching Faculty Ownership Enforcement
  if (offeringSection.facultyId !== auth.user.facultyId) {
    return NextResponse.json(
      {
        error:
          "Forbidden: Marks unpublication is restricted to the assigned teaching faculty for this section.",
        code: "TEACHING_FACULTY_ONLY",
      },
      { status: 403 }
    );
  }

  try {
    await prisma.subjectOfferingSection.update({
      where: { id: sectionId },
      data: {
        marksPublishedAt: null,
        marksPublishedById: null,
      },
    });

    // Write AuditLog for unpublication
    await prisma.auditLog.create({
      data: {
        entityType: "SubjectOfferingSection",
        entityId: sectionId,
        changedByUserId: auth.user.userId,
        oldValue: offeringSection.marksPublishedAt
          ? offeringSection.marksPublishedAt.toISOString()
          : "PUBLISHED",
        newValue: "MARKS_UNPUBLISHED",
      },
    });

    return NextResponse.json(
      {
        message: "Marks unpublished successfully",
      },
      { status: 200 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to unpublish marks" },
      { status: 500 }
    );
  }
}

