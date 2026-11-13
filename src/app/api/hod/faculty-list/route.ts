import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth/guards";

export async function GET(req: NextRequest) {
  const auth = verifyAuth(req, [Role.FACULTY]);
  if (!auth.ok) {
    return auth.error;
  }

  try {
    const faculty = await prisma.facultyProfile.findMany({
      include: {
        user: {
          select: { email: true, username: true },
        },
        homeDepartment: true,
        hodAssignments: {
          include: { department: true },
        },
      },
      orderBy: { name: "asc" },
    });

    const formatted = faculty.map((f) => ({
      id: f.id,
      name: f.name,
      employeeId: f.employeeId,
      homeDepartmentId: f.homeDepartmentId,
      homeDepartmentName: f.homeDepartment?.name || null,
      isHOD: f.hodAssignments.length > 0,
      hodDepartmentName: f.hodAssignments[0]?.department?.name || null,
    }));

    return NextResponse.json({ faculty: formatted }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to fetch faculty list" },
      { status: 500 }
    );
  }
}
