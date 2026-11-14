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

  const { name, totalSemesters } = body;
  if (!name || !totalSemesters || typeof totalSemesters !== "number") {
    return NextResponse.json(
      { error: "Name and numeric totalSemesters are required" },
      { status: 400 }
    );
  }

  try {
    const department = await prisma.department.create({
      data: {
        name: String(name).trim(),
        totalSemesters,
      },
    });

    return NextResponse.json(
      { message: "Department created successfully", department },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to create department" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const auth = verifyAuth(req, [Role.ADMIN]);
  if (!auth.ok) {
    return auth.error;
  }

  try {
    const departments = await prisma.department.findMany({
      include: {
        hodAssignment: {
          include: {
            faculty: true,
          },
        },
        batches: {
          include: {
            sections: true,
          },
        },
      },
    });

    return NextResponse.json({ departments }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to list departments" },
      { status: 500 }
    );
  }
}
