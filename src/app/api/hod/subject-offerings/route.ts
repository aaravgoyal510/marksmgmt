import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyAuth, verifyHOD } from "@/lib/auth/guards";

export async function GET(req: NextRequest) {
  const auth = verifyAuth(req, [Role.FACULTY]);
  if (!auth.ok) {
    return auth.error;
  }

  const departmentId = req.nextUrl.searchParams.get("departmentId");
  const termId = req.nextUrl.searchParams.get("termId");

  if (!departmentId) {
    return NextResponse.json(
      { error: "departmentId query parameter is required" },
      { status: 400 }
    );
  }

  const hodCheck = await verifyHOD(auth.user, departmentId);
  if (!hodCheck.ok) {
    return hodCheck.error;
  }

  try {
    const whereClause: any = {
      subject: {
        departmentId,
      },
    };

    if (termId) {
      whereClause.academicTermId = termId;
    }

    const offerings = await prisma.subjectOffering.findMany({
      where: whereClause,
      include: {
        subject: true,
        academicTerm: true,
        gradingPolicy: {
          select: {
            id: true,
            confirmedAt: true,
          },
        },
        sections: {
          include: {
            section: {
              include: {
                batch: true,
              },
            },
            faculty: true,
          },
        },
      },
      orderBy: {
        subject: {
          code: "asc",
        },
      },
    });

    const statusBoard = offerings.map((offering: any) => {
      const isPolicyConfirmed = Boolean(offering.gradingPolicy?.confirmedAt);

      const sectionsWithStatus = offering.sections.map((offSection: any) => {
        let status: "UNASSIGNED" | "POLICY_PENDING" | "ACTIVE" = "ACTIVE";

        if (!offSection.facultyId) {
          status = "UNASSIGNED";
        } else if (!isPolicyConfirmed) {
          status = "POLICY_PENDING";
        }

        const sectionLabel = offSection.section.batch?.label
          ? `${offSection.section.name} (Batch ${offSection.section.batch.label})`
          : offSection.section.name;

        return {
          id: offSection.id,
          sectionId: offSection.sectionId,
          sectionName: sectionLabel,
          rawSectionName: offSection.section.name,
          batchLabel: offSection.section.batch?.label || null,
          facultyId: offSection.facultyId,
          facultyName: offSection.faculty?.name ?? null,
          status,
          isLocked: !offSection.facultyId || !isPolicyConfirmed,
        };
      });

      return {
        offeringId: offering.id,
        subjectId: offering.subjectId,
        subjectName: offering.subject.name,
        subjectCode: offering.subject.code,
        semesterNumber: offering.subject.semesterNumber,
        termId: offering.academicTermId,
        termLabel: offering.academicTerm.label,
        isPolicyConfirmed,
        sections: sectionsWithStatus,
      };
    });

    return NextResponse.json({ statusBoard }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to fetch subject offerings status board" },
      { status: 500 }
    );
  }
}
