import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth/guards";

export async function GET(req: NextRequest) {
  const auth = verifyAuth(req, [Role.FACULTY]);
  if (!auth.ok) {
    return auth.error;
  }

  const facultyId = auth.user.facultyId;
  if (!facultyId) {
    return NextResponse.json(
      { error: "User is not linked to a FacultyProfile" },
      { status: 400 }
    );
  }

  try {
    const assignedSections = await prisma.subjectOfferingSection.findMany({
      where: { facultyId },
      include: {
        section: {
          include: {
            batch: {
              include: {
                department: true,
              },
            },
          },
        },
        subjectOffering: {
          include: {
            subject: true,
            academicTerm: true,
            gradingPolicy: true,
          },
        },
      },
      orderBy: [
        { subjectOffering: { subject: { code: "asc" } } },
        { section: { name: "asc" } },
      ],
    });

    const formatted = assignedSections.map((sos) => {
      const isPolicyConfirmed = Boolean(sos.subjectOffering.gradingPolicy?.confirmedAt);
      const isLocked = !sos.facultyId || !isPolicyConfirmed;
      const batchLabel = sos.section.batch?.label || "";
      const deptName = sos.section.batch?.department?.name || "";

      return {
        id: sos.id,
        sectionId: sos.sectionId,
        sectionName: sos.section.name,
        subjectOfferingId: sos.subjectOfferingId,
        academicTermId: sos.subjectOffering.academicTermId,
        batchLabel,
        departmentName: deptName,
        subjectId: sos.subjectOffering.subjectId,
        subjectName: sos.subjectOffering.subject.name,
        subjectCode: sos.subjectOffering.subject.code,
        termLabel: sos.subjectOffering.academicTerm.label,
        isPolicyConfirmed,
        isLocked,
        isPublished: Boolean(sos.marksPublishedAt),
        marksPublishedAt: sos.marksPublishedAt,
        label: `${sos.subjectOffering.subject.code} - ${sos.subjectOffering.subject.name} (${sos.section.name} - Batch ${batchLabel})`,
      };
    });

    return NextResponse.json({ sections: formatted }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to fetch assigned sections" },
      { status: 500 }
    );
  }
}
