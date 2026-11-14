import { NextRequest, NextResponse } from "next/server";
import { Role, QueryStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyAuth, verifyHOD } from "@/lib/auth/guards";

export async function POST(
  req: NextRequest,
  { params }: { params: { offeringId: string; sectionId: string } }
) {
  const auth = verifyAuth(req, [Role.FACULTY]);
  if (!auth.ok) {
    return auth.error;
  }

  const { offeringId, sectionId } = params;

  try {
    const body = await req.json().catch(() => ({}));
    const { facultyId, reason } = body;

    const offeringSection = await prisma.subjectOfferingSection.findUnique({
      where: {
        subjectOfferingId_sectionId: {
          subjectOfferingId: offeringId,
          sectionId,
        },
      },
      include: {
        subjectOffering: {
          include: {
            subject: true,
          },
        },
        section: true,
        faculty: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!offeringSection) {
      return NextResponse.json(
        { error: "Subject offering section not found" },
        { status: 404 }
      );
    }

    const targetDeptId = offeringSection.subjectOffering.subject.departmentId;
    const hodCheck = await verifyHOD(auth.user, targetDeptId);
    if (!hodCheck.ok) {
      return hodCheck.error;
    }

    let newFaculty: any = null;
    if (facultyId) {
      newFaculty = await prisma.facultyProfile.findUnique({
        where: { id: facultyId as string },
        include: {
          user: true,
        },
      });
      if (!newFaculty) {
        return NextResponse.json(
          { error: "Faculty member not found" },
          { status: 404 }
        );
      }
    }

    const isReassignment = Boolean(
      offeringSection.facultyId && offeringSection.facultyId !== facultyId
    );

    if (isReassignment) {
      if (!reason || typeof reason !== "string" || !reason.trim()) {
        return NextResponse.json(
          { error: "Reassignment reason is required when a section already has assigned faculty" },
          { status: 400 }
        );
      }
    }

    const updatedSection = await prisma.subjectOfferingSection.update({
      where: { id: offeringSection.id },
      data: { facultyId: facultyId || null },
      include: {
        faculty: true,
        section: true,
      },
    });

    const trimmedReason = reason && typeof reason === "string" ? reason.trim() : "";

    if (isReassignment) {
      await prisma.auditLog.create({
        data: {
          entityType: "SubjectOfferingSection",
          entityId: offeringSection.id,
          changedByUserId: auth.user.userId,
          oldValue: `FACULTY:${offeringSection.facultyId}`,
          newValue: `FACULTY:${facultyId || "UNASSIGNED"} (Reason: ${trimmedReason})`,
        },
      });

      // Move OPEN queries of that section to the new faculty
      if (facultyId) {
        await prisma.query.updateMany({
          where: {
            subjectOfferingSectionId: offeringSection.id,
            status: QueryStatus.OPEN,
          },
          data: {
            facultyId: facultyId,
          },
        });
      }

      // Notify old faculty
      if (offeringSection.faculty?.userId) {
        try {
          await prisma.notification.create({
            data: {
              userId: offeringSection.faculty.userId,
              type: "FACULTY_REASSIGNED",
              message: `You have been reassigned from ${offeringSection.subjectOffering.subject.name} - Section ${offeringSection.section.name}. Reason: ${trimmedReason}`,
              link: "/faculty",
            },
          });
        } catch {
          // Non-blocking notification delivery
        }
      }

      // Notify new faculty if assigned
      if (newFaculty?.userId) {
        try {
          await prisma.notification.create({
            data: {
              userId: newFaculty.userId,
              type: "FACULTY_ASSIGNED",
              message: `You have been assigned to ${offeringSection.subjectOffering.subject.name} - Section ${offeringSection.section.name}. Reason: ${trimmedReason}`,
              link: "/faculty",
            },
          });
        } catch {
          // Non-blocking notification delivery
        }
      }
    } else {
      try {
        await prisma.auditLog.create({
          data: {
            entityType: "SubjectOfferingSection",
            entityId: offeringSection.id,
            changedByUserId: auth.user.userId,
            oldValue: "FACULTY:NONE",
            newValue: `FACULTY:${facultyId || "UNASSIGNED"}`,
          },
        });
      } catch {
        // Non-blocking audit log
      }

      if (facultyId && newFaculty?.userId) {
        try {
          await prisma.notification.create({
            data: {
              userId: newFaculty.userId,
              type: "FACULTY_ASSIGNED",
              message: `You have been assigned to ${offeringSection.subjectOffering.subject.name} - Section ${offeringSection.section.name}.`,
              link: "/faculty",
            },
          });
        } catch {
          // Non-blocking notification delivery
        }
      }
    }

    return NextResponse.json(
      {
        message: facultyId
          ? isReassignment
            ? "Faculty reassigned successfully"
            : "Faculty assigned successfully"
          : "Faculty unassigned successfully",
        offeringSection: updatedSection,
      },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to assign faculty to section" },
      { status: 500 }
    );
  }
}
