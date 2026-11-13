import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth/guards";

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = verifyAuth(req, [Role.ADMIN]);
  if (!auth.ok) {
    return auth.error;
  }

  const studentId = params.id;
  const body = await req.json().catch(() => null);

  if (!body) {
    return NextResponse.json({ error: "Invalid JSON request body" }, { status: 400 });
  }

  const { semesterOverride } = body;

  try {
    const student = await prisma.studentProfile.findUnique({
      where: { id: studentId },
      include: { batch: { include: { department: true } } },
    });

    if (!student) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }

    if (semesterOverride !== null && semesterOverride !== undefined) {
      if (
        typeof semesterOverride !== "number" ||
        semesterOverride < 1 ||
        semesterOverride > student.batch.department.totalSemesters
      ) {
        return NextResponse.json(
          {
            error: `semesterOverride must be between 1 and ${student.batch.department.totalSemesters} for department ${student.batch.department.name}`,
          },
          { status: 400 }
        );
      }
    }

    const updatedStudent = await prisma.studentProfile.update({
      where: { id: studentId },
      data: {
        semesterOverride: semesterOverride !== undefined ? semesterOverride : null,
      },
    });

    const message =
      updatedStudent.semesterOverride !== null
        ? `Semester override set to Semester ${updatedStudent.semesterOverride} for student ${student.name}`
        : `Semester override cleared for student ${student.name} (reverted to Batch default Semester ${student.batch.currentSemester})`;

    return NextResponse.json({ message, student: updatedStudent }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to update semester override" },
      { status: 500 }
    );
  }
}
