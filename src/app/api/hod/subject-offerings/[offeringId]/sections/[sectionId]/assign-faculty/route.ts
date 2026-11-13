import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
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
    const { facultyId } = body;

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

    if (facultyId) {
      const faculty = await prisma.facultyProfile.findUnique({
        where: { id: facultyId as string },
      });
      if (!faculty) {
        return NextResponse.json(
          { error: "Faculty member not found" },
          { status: 404 }
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

    return NextResponse.json(
      {
        message: facultyId
          ? "Faculty assigned successfully"
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
