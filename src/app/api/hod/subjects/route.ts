import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyAuth, verifyHOD } from "@/lib/auth/guards";

export async function POST(req: NextRequest) {
  const auth = verifyAuth(req, [Role.FACULTY]);
  if (!auth.ok) {
    return auth.error;
  }

  try {
    const body = await req.json();
    const { departmentId, name, code, semesterNumber } = body;

    if (!departmentId || !name || !code || semesterNumber === undefined || semesterNumber === null) {
      return NextResponse.json(
        { error: "departmentId, name, code, and semesterNumber are required" },
        { status: 400 }
      );
    }

    const hodCheck = await verifyHOD(auth.user, departmentId);
    if (!hodCheck.ok) {
      return hodCheck.error;
    }

    const dept = await prisma.department.findUnique({
      where: { id: departmentId as string },
    });

    if (!dept) {
      return NextResponse.json(
        { error: "Department not found" },
        { status: 404 }
      );
    }

    const semNum = Number(semesterNumber);
    if (isNaN(semNum) || semNum < 1 || semNum > dept.totalSemesters) {
      return NextResponse.json(
        {
          error: `semesterNumber must be between 1 and ${dept.totalSemesters} for department ${dept.name}`,
        },
        { status: 400 }
      );
    }

    const existingCode = await prisma.subject.findUnique({
      where: {
        departmentId_code: {
          departmentId: departmentId as string,
          code,
        },
      },
    });

    if (existingCode) {
      return NextResponse.json(
        { error: `Subject code '${code}' already exists in this department` },
        { status: 400 }
      );
    }

    const subject = await prisma.subject.create({
      data: {
        departmentId: departmentId as string,
        name,
        code,
        semesterNumber: semNum,
      },
    });

    // Auto-scaffold SubjectOffering & SubjectOfferingSections if batches already exist in this semester
    const batchesInSem = await prisma.batch.findMany({
      where: {
        departmentId: departmentId as string,
        currentSemester: semNum,
      },
      include: { sections: true },
    });

    if (batchesInSem.length > 0) {
      const currentYear = new Date().getFullYear();
      const termLabel = `AY${currentYear}-${(currentYear + 1).toString().slice(-2)}`;

      let academicTerm = await prisma.academicTerm.findFirst({
        where: {
          departmentId: departmentId as string,
          semesterNumber: semNum,
          label: termLabel,
        },
      });

      if (!academicTerm) {
        academicTerm = await prisma.academicTerm.create({
          data: {
            departmentId: departmentId as string,
            semesterNumber: semNum,
            label: termLabel,
          },
        });
      }

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

      const allSections = batchesInSem.flatMap((b) => b.sections);
      for (const sec of allSections) {
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
            facultyId: null, // UNASSIGNED
          },
        });
      }
    }

    return NextResponse.json(
      {
        message: "Subject created successfully and scaffolded into active semester offerings",
        subject,
      },
      { status: 201 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to create subject" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const auth = verifyAuth(req, [Role.FACULTY]);
  if (!auth.ok) {
    return auth.error;
  }

  const departmentId = req.nextUrl.searchParams.get("departmentId");
  if (!departmentId) {
    return NextResponse.json(
      { error: "departmentId query param is required" },
      { status: 400 }
    );
  }

  const hodCheck = await verifyHOD(auth.user, departmentId);
  if (!hodCheck.ok) {
    return hodCheck.error;
  }

  try {
    const subjects = await prisma.subject.findMany({
      where: { departmentId },
      orderBy: [{ semesterNumber: "asc" }, { code: "asc" }],
    });

    return NextResponse.json({ subjects }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to fetch subjects" },
      { status: 500 }
    );
  }
}
