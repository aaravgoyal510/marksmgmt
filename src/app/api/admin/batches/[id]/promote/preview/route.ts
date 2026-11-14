import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth/guards";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = verifyAuth(req, [Role.ADMIN]);
  if (!auth.ok) {
    return auth.error;
  }

  const batchId = params.id;

  try {
    const batch = await prisma.batch.findUnique({
      where: { id: batchId },
      include: {
        department: true,
        sections: {
          include: {
            students: {
              include: {
                user: { select: { isActive: true } },
              },
            },
          },
        },
      },
    });

    if (!batch) {
      return NextResponse.json({ error: "Batch not found" }, { status: 404 });
    }

    const isFinalSemester = batch.currentSemester >= batch.department.totalSemesters;
    const warning = isFinalSemester
      ? `Batch has already reached the maximum total semesters (${batch.department.totalSemesters}) for ${batch.department.name}. Promotion is not recommended.`
      : null;

    const targetSemester = batch.currentSemester + 1;
    const currentYear = new Date().getFullYear();
    const termLabel = `AY${currentYear}-${(currentYear + 1).toString().slice(-2)}`;

    const existingTerm = await prisma.academicTerm.findFirst({
      where: {
        departmentId: batch.departmentId,
        semesterNumber: targetSemester,
        label: termLabel,
      },
    });

    const termWillBeCreated = !existingTerm;
    const academicTermLabel = existingTerm ? existingTerm.label : termLabel;

    // Subjects in target semester
    const subjects = await prisma.subject.findMany({
      where: {
        departmentId: batch.departmentId,
        semesterNumber: targetSemester,
      },
      orderBy: { code: "asc" },
    });

    // Check how many offerings and sections will be created
    let newOfferingsCount = 0;
    let newSectionsCount = 0;

    for (const sub of subjects) {
      let existingOffering = null;
      if (existingTerm) {
        existingOffering = await prisma.subjectOffering.findFirst({
          where: {
            subjectId: sub.id,
            academicTermId: existingTerm.id,
          },
          include: { sections: true },
        });
      }

      if (!existingOffering) {
        newOfferingsCount++;
        newSectionsCount += batch.sections.length;
      } else {
        const existingSectionIds = new Set(existingOffering.sections.map((s) => s.sectionId));
        for (const sec of batch.sections) {
          if (!existingSectionIds.has(sec.id)) {
            newSectionsCount++;
          }
        }
      }
    }

    // Identify students with semesterOverride
    const studentsWithOverride: {
      id: string;
      erpNo: string;
      name: string;
      semesterOverride: number;
    }[] = [];

    for (const sec of batch.sections) {
      for (const st of sec.students) {
        if (
          st.semesterOverride !== null &&
          st.semesterOverride !== undefined &&
          st.user?.isActive !== false
        ) {
          studentsWithOverride.push({
            id: st.id,
            erpNo: st.erpNo,
            name: st.name,
            semesterOverride: st.semesterOverride,
          });
        }
      }
    }

    return NextResponse.json(
      {
        batchId: batch.id,
        batchLabel: batch.label,
        departmentId: batch.departmentId,
        departmentName: batch.department.name,
        currentSemester: batch.currentSemester,
        targetSemester,
        totalSemesters: batch.department.totalSemesters,
        isFinalSemester,
        warning,
        termWillBeCreated,
        academicTermLabel,
        subjectsCount: subjects.length,
        sectionsCount: batch.sections.length,
        newOfferingsCount,
        newSectionsCount,
        subjects: subjects.map((s) => ({ id: s.id, code: s.code, name: s.name })),
        sections: batch.sections.map((s) => ({ id: s.id, name: s.name })),
        studentsWithOverride,
      },
      { status: 200 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to generate promotion preview" },
      { status: 500 }
    );
  }
}
