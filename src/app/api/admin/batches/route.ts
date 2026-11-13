import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth/guards";

export async function POST(req: NextRequest) {
  const auth = verifyAuth(req, [Role.ADMIN]);
  if (!auth.ok) {
    return auth.error;
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON request body" }, { status: 400 });
  }

  const { departmentId, label, startYear } = body;
  if (!departmentId || !label || startYear === undefined || startYear === null) {
    return NextResponse.json(
      { error: "departmentId, label, and startYear are required" },
      { status: 400 }
    );
  }

  const parsedStartYear = Number(startYear);
  if (isNaN(parsedStartYear)) {
    return NextResponse.json(
      { error: "startYear must be a valid number" },
      { status: 400 }
    );
  }

  try {
    const department = await prisma.department.findUnique({
      where: { id: String(departmentId) },
    });

    if (!department) {
      return NextResponse.json({ error: "Department not found" }, { status: 404 });
    }

    const batch = await prisma.batch.create({
      data: {
        departmentId: String(departmentId),
        label: String(label).trim(),
        startYear: parsedStartYear,
        currentSemester: 1,
      },
    });

    // Create default Section "A" for the new batch
    const defaultSection = await prisma.section.create({
      data: {
        batchId: batch.id,
        name: "A",
      },
    });

    // Auto-scaffold Semester 1 SubjectOfferingSections if Semester 1 subjects already exist
    const currentYear = new Date().getFullYear();
    const termLabel = `AY${currentYear}-${(currentYear + 1).toString().slice(-2)}`;

    let academicTerm = await prisma.academicTerm.findFirst({
      where: {
        departmentId: String(departmentId),
        semesterNumber: 1,
        label: termLabel,
      },
    });

    if (!academicTerm) {
      academicTerm = await prisma.academicTerm.create({
        data: {
          departmentId: String(departmentId),
          semesterNumber: 1,
          label: termLabel,
        },
      });
    }

    const sem1Subjects = await prisma.subject.findMany({
      where: {
        departmentId: String(departmentId),
        semesterNumber: 1,
      },
    });

    for (const sub of sem1Subjects) {
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
            sectionId: defaultSection.id,
          },
        },
        update: {},
        create: {
          subjectOfferingId: offering.id,
          sectionId: defaultSection.id,
          facultyId: null, // UNASSIGNED
        },
      });
    }

    return NextResponse.json(
      { message: "Batch created successfully", batch },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to create batch" },
      { status: 500 }
    );
  }
}
