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
            scoreComponents: {
              select: { id: true },
            },
          },
        },
        sections: {
          include: {
            section: {
              include: {
                batch: true,
                students: {
                  select: {
                    id: true,
                    semesterOverride: true,
                    batch: {
                      select: {
                        currentSemester: true,
                      },
                    },
                  },
                },
              },
            },
            faculty: true,
            attendanceRecords: {
              select: {
                id: true,
              },
            },
          },
        },
      },
      orderBy: {
        subject: {
          code: "asc",
        },
      },
    });

    // Gather all component IDs to batch-query marks entered
    const allComponentIds: string[] = [];
    for (const offering of offerings) {
      if (offering.gradingPolicy?.scoreComponents) {
        for (const comp of offering.gradingPolicy.scoreComponents) {
          allComponentIds.push(comp.id);
        }
      }
    }

    const marksWithStudents =
      allComponentIds.length > 0
        ? await prisma.mark.findMany({
            where: {
              scoreComponentId: { in: allComponentIds },
            },
            select: {
              studentId: true,
              scoreComponentId: true,
            },
          })
        : [];

    const marksByComponent = new Map<string, Set<string>>();
    for (const m of marksWithStudents) {
      if (!marksByComponent.has(m.scoreComponentId)) {
        marksByComponent.set(m.scoreComponentId, new Set());
      }
      marksByComponent.get(m.scoreComponentId)!.add(m.studentId);
    }

    const statusBoard = offerings.map((offering: any) => {
      const isPolicyConfirmed = Boolean(offering.gradingPolicy?.confirmedAt);
      const offeringSem = offering.subject?.semesterNumber;
      const offeringCompIds: string[] =
        offering.gradingPolicy?.scoreComponents?.map((c: any) => c.id) || [];

      const studentsWithMarksForOffering = new Set<string>();
      for (const compId of offeringCompIds) {
        const studentSet = marksByComponent.get(compId);
        if (studentSet) {
          studentSet.forEach((sId) => {
            studentsWithMarksForOffering.add(sId);
          });
        }
      }

      const sectionsWithStatus = offering.sections.map((offSection: any) => {
        let status: "UNASSIGNED" | "POLICY_PENDING" | "ACTIVE" = "ACTIVE";

        if (!offSection.facultyId) {
          status = "UNASSIGNED";
        } else if (!isPolicyConfirmed) {
          status = "POLICY_PENDING";
        }

        const sectionLabel = offSection.section?.batch?.label
          ? `${offSection.section.name} (Batch ${offSection.section.batch.label})`
          : offSection.section?.name || "Section";

        const allStudents = offSection.section?.students || [];
        const enrolledStudents = allStudents.filter((s: any) => {
          const effectiveSem =
            s.semesterOverride !== null && s.semesterOverride !== undefined
              ? s.semesterOverride
              : s.batch?.currentSemester;
          if (effectiveSem !== undefined && offeringSem !== undefined) {
            return effectiveSem === offeringSem;
          }
          return true;
        });

        const totalStudents = enrolledStudents.length;
        let marksEnteredStudents = 0;
        for (const st of enrolledStudents) {
          if (studentsWithMarksForOffering.has(st.id)) {
            marksEnteredStudents++;
          }
        }

        const attendanceUploaded = Boolean(
          offSection.attendanceRecords && offSection.attendanceRecords.length > 0
        );
        const isPublished = Boolean(offSection.marksPublishedAt);

        return {
          id: offSection.id,
          sectionId: offSection.sectionId,
          sectionName: sectionLabel,
          rawSectionName: offSection.section?.name,
          batchLabel: offSection.section?.batch?.label || null,
          facultyId: offSection.facultyId,
          facultyName: offSection.faculty?.name ?? null,
          status,
          isLocked: !offSection.facultyId || !isPolicyConfirmed,
          totalStudents,
          marksEnteredStudents,
          attendanceUploaded,
          isPublished,
          marksPublishedAt: offSection.marksPublishedAt || null,
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
