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
  const body = await req.json().catch(() => null);

  if (!body || !body.name || typeof body.name !== "string") {
    return NextResponse.json(
      { error: "Section name is required" },
      { status: 400 }
    );
  }

  const name = body.name.trim();
  if (!name) {
    return NextResponse.json(
      { error: "Section name is required" },
      { status: 400 }
    );
  }

  try {
    const batch = await prisma.batch.findUnique({
      where: { id: batchId },
      include: { department: true },
    });

    if (!batch) {
      return NextResponse.json({ error: "Batch not found" }, { status: 404 });
    }

    // Create new section for batch
    const section = await prisma.section.create({
      data: {
        batchId,
        name,
      },
    });

    // Auto-scaffold SubjectOfferingSection rows for subjects in current semester
    const currentYear = new Date().getFullYear();
    const termLabel = `AY${currentYear}-${(currentYear + 1).toString().slice(-2)}`;
    let academicTerm = await prisma.academicTerm.findFirst({
      where: {
        departmentId: batch.departmentId,
        semesterNumber: batch.currentSemester,
        label: termLabel,
      },
    });

    if (!academicTerm) {
      academicTerm = await prisma.academicTerm.create({
        data: {
          departmentId: batch.departmentId,
          semesterNumber: batch.currentSemester,
          label: termLabel,
        },
      });
    }

    const subjects = await prisma.subject.findMany({
      where: {
        departmentId: batch.departmentId,
        semesterNumber: batch.currentSemester,
      },
    });

    for (const sub of subjects) {
      let offering = await prisma.subjectOffering.findFirst({
        where: {
          subjectId: sub.id,
          academicTermId: academicTerm.id,
        },
      });

      if (!offering) {
        offering = await prisma.subjectOffering.create({
          data: {
            subjectId: sub.id,
            academicTermId: academicTerm.id,
          },
        });
      }

      await prisma.subjectOfferingSection.upsert({
        where: {
          subjectOfferingId_sectionId: {
            subjectOfferingId: offering.id,
            sectionId: section.id,
          },
        },
        update: {},
        create: {
          subjectOfferingId: offering.id,
          sectionId: section.id,
          facultyId: null, // UNASSIGNED
        },
      });
    }

    return NextResponse.json(
      {
        message: `Section "${section.name}" created for batch "${batch.label}" and scaffolded into current semester subjects`,
        section,
      },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to create section" },
      { status: 500 }
    );
  }
}
