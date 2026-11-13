import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyAuth, verifyHOD } from "@/lib/auth/guards";

export async function POST(
  req: NextRequest,
  { params }: { params: { batchId: string } }
) {
  const auth = verifyAuth(req, [Role.FACULTY]);
  if (!auth.ok) {
    return auth.error;
  }

  const { batchId } = params;

  try {
    const batch = await prisma.batch.findUnique({
      where: { id: batchId },
      include: { department: true, sections: true },
    });

    if (!batch) {
      return NextResponse.json({ error: "Batch not found" }, { status: 404 });
    }

    const hodCheck = await verifyHOD(auth.user, batch.departmentId);
    if (!hodCheck.ok) {
      return hodCheck.error;
    }

    if (batch.currentSemester >= batch.department.totalSemesters) {
      return NextResponse.json(
        {
          error: `Batch has already reached max totalSemesters (${batch.department.totalSemesters})`,
        },
        { status: 400 }
      );
    }

    const nextSem = batch.currentSemester + 1;

    const updatedBatch = await prisma.batch.update({
      where: { id: batchId },
      data: { currentSemester: nextSem },
    });

    const currentYear = new Date().getFullYear();
    const termLabel = `AY${currentYear}-${(currentYear + 1).toString().slice(-2)}`;
    let term = await prisma.academicTerm.findFirst({
      where: {
        departmentId: batch.departmentId,
        semesterNumber: nextSem,
        label: termLabel,
      },
    });

    if (!term) {
      term = await prisma.academicTerm.create({
        data: {
          departmentId: batch.departmentId,
          semesterNumber: nextSem,
          label: termLabel,
        },
      });
    }

    const subjects = await prisma.subject.findMany({
      where: {
        departmentId: batch.departmentId,
        semesterNumber: nextSem,
      },
    });

    for (const sub of subjects) {
      let offering = await prisma.subjectOffering.findFirst({
        where: {
          subjectId: sub.id,
          academicTermId: term.id,
        },
      });

      if (!offering) {
        offering = await prisma.subjectOffering.create({
          data: {
            subjectId: sub.id,
            academicTermId: term.id,
          },
        });
      }

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
            facultyId: null,
          },
        });
      }
    }

    return NextResponse.json(
      {
        message: `Batch promoted to Semester ${nextSem}`,
        batch: updatedBatch,
        academicTerm: term,
      },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to promote batch" },
      { status: 500 }
    );
  }
}
