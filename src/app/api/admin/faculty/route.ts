import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth/guards";
import { generatePassword, hashPassword } from "@/utils/password";
import { credentialStore } from "@/lib/credentialStore";

export async function GET(req: NextRequest) {
  const auth = verifyAuth(req, [Role.ADMIN]);
  if (!auth.ok) {
    return auth.error;
  }

  try {
    const faculty = await prisma.facultyProfile.findMany({
      include: {
        user: {
          select: {
            id: true,
            email: true,
            username: true,
            isActive: true,
            deactivatedAt: true,
          },
        },
        homeDepartment: true,
        hodAssignments: {
          include: {
            department: true,
          },
        },
      },
      orderBy: { name: "asc" },
    });

    const formatted = faculty.map((f) => ({
      id: f.id,
      userId: f.userId,
      isActive: f.user.isActive ?? true,
      deactivatedAt: f.user.deactivatedAt ?? null,
      name: f.name,
      employeeId: f.employeeId,
      email: f.user.email,
      homeDepartmentId: f.homeDepartmentId,
      homeDepartmentName: f.homeDepartment?.name || "N/A",
      isHOD: f.hodAssignments.length > 0,
      hodDepartmentId: f.hodAssignments[0]?.departmentId || null,
      hodDepartmentName: f.hodAssignments[0]?.department?.name || null,
    }));

    return NextResponse.json({ faculty: formatted }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to list faculty" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = verifyAuth(req, [Role.ADMIN]);
  if (!auth.ok) {
    return auth.error;
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON request body" }, { status: 400 });
  }

  const { name, employeeId, email, isHOD, hodDepartmentId } = body;

  if (!name || !employeeId) {
    return NextResponse.json(
      { error: "Name and employeeId are required" },
      { status: 400 }
    );
  }

  const cleanEmployeeId = String(employeeId).trim();
  const cleanName = String(name).trim();

  try {
    const existingUser = await prisma.user.findUnique({
      where: { username: cleanEmployeeId },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: `User with Employee ID ${cleanEmployeeId} already exists` },
        { status: 400 }
      );
    }

    const passwordPlain = generatePassword(10);
    const passwordHash = await hashPassword(passwordPlain);

    const user = await prisma.user.create({
      data: {
        username: cleanEmployeeId,
        passwordHash,
        role: Role.FACULTY,
        email: email ? String(email).trim() : `${cleanEmployeeId.toLowerCase()}@bvimr.edu.in`,
      },
    });

    const facultyProfile = await prisma.facultyProfile.create({
      data: {
        userId: user.id,
        name: cleanName,
        employeeId: cleanEmployeeId,
      },
    });

    if (isHOD && hodDepartmentId) {
      await prisma.hODAssignment.upsert({
        where: { departmentId: String(hodDepartmentId) },
        update: { facultyId: facultyProfile.id },
        create: {
          facultyId: facultyProfile.id,
          departmentId: String(hodDepartmentId),
        },
      });
    }

    credentialStore.set(user.id, {
      username: user.username,
      name: cleanName,
      passwordPlain,
    });

    return NextResponse.json(
      {
        message: "Faculty onboarded successfully",
        faculty: facultyProfile,
        credentials: {
          username: user.username,
          passwordPlain,
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to onboard faculty" },
      { status: 500 }
    );
  }
}
