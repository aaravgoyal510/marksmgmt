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

  const facultyId = params.id;
  const body = await req.json().catch(() => ({}));
  const { departmentId } = body || {};

  try {
    const faculty = await prisma.facultyProfile.findUnique({
      where: { id: facultyId },
    });

    if (!faculty) {
      return NextResponse.json(
        { error: "Faculty member not found" },
        { status: 404 }
      );
    }

    if (departmentId) {
      const dept = await prisma.department.findUnique({
        where: { id: String(departmentId) },
      });

      if (!dept) {
        return NextResponse.json(
          { error: "Department not found" },
          { status: 404 }
        );
      }

      // Explicit Replacement Logic: upsert HOD assignment for department
      await prisma.hODAssignment.upsert({
        where: { departmentId: String(departmentId) },
        update: { facultyId },
        create: {
          facultyId,
          departmentId: String(departmentId),
        },
      });

      return NextResponse.json(
        {
          message: `Faculty ${faculty.name} successfully assigned as HOD of ${dept.name}`,
        },
        { status: 200 }
      );
    } else {
      // Remove HOD assignment
      await prisma.hODAssignment.deleteMany({
        where: { facultyId },
      });

      return NextResponse.json(
        {
          message: `HOD status removed for faculty ${faculty.name}`,
        },
        { status: 200 }
      );
    }
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to update HOD assignment" },
      { status: 500 }
    );
  }
}
