import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth/guards";

export async function POST(
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
      include: { department: true, sections: true },
    });

    if (!batch) {
      return NextResponse.json({ error: "Batch not found" }, { status: 404 });
    }

    if (batch.currentSemester >= batch.department.totalSemesters) {
      return NextResponse.json(
        {
          error: `Batch has already reached the maximum totalSemesters (${batch.department.totalSemesters}) for ${batch.department.name}`,
        },
        { status: 400 }
      );
    }

    const newSemester = batch.currentSemester + 1;

    // Update batch currentSemester
    const updatedBatch = await prisma.batch.update({
      where: { id: batchId },
      data: { currentSemester: newSemester },
    });

    // Auto-create or reuse AcademicTerm for this department + newSemester
    const currentYear = new Date().getFullYear();
    const termLabel = `AY${currentYear}-${(currentYear + 1).toString().slice(-2)}`;

    let academicTerm = await prisma.academicTerm.findFirst({
      where: {
        departmentId: batch.departmentId,
        semesterNumber: newSemester,
        label: termLabel,
      },
    });

    if (!academicTerm) {
      academicTerm = await prisma.academicTerm.create({
        data: {
          departmentId: batch.departmentId,
          semesterNumber: newSemester,
          label: termLabel,
        },
      });
    }

    // Auto-scaffold SubjectOfferings for all Subjects in this department matching newSemester
    const subjects = await prisma.subject.findMany({
      where: {
        departmentId: batch.departmentId,
        semesterNumber: newSemester,
      },
    });

    for (const subject of subjects) {
      let offering = await prisma.subjectOffering.findFirst({
        where: {
          subjectId: subject.id,
          academicTermId: academicTerm.id,
        },
      });

      if (!offering) {
        offering = await prisma.subjectOffering.create({
          data: {
            subjectId: subject.id,
            academicTermId: academicTerm.id,
          },
        });
      }

      // Scaffold sections for this batch
      for (const sec of batch.sections) {
        await prisma.subjectOfferingSection.upsert({
          where: {
            subjectOfferingId_sectionId: {
              subjectOfferingId: offering.id,
              sectionId: sec.id,
            },
          },
          update: {},
          create: {
            subjectOfferingId: offering.id,
            sectionId: sec.id,
            facultyId: null, // initially unassigned
          },
        });
      }
    }

    return NextResponse.json(
      {
        message: `Batch promoted to Semester ${newSemester} successfully`,
        batch: updatedBatch,
      },
      { status: 200 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to promote batch" },
      { status: 500 }
    );
  }
}
