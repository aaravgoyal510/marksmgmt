import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth/guards";
import { generatePassword, hashPassword } from "@/utils/password";
import { credentialStore } from "@/lib/credentialStore";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = verifyAuth(req, [Role.ADMIN]);
  if (!auth.ok) {
    return auth.error;
  }

  try {
    const students = await prisma.studentProfile.findMany({
      include: {
        user: {
          select: {
            id: true,
            isActive: true,
            deactivatedAt: true,
          },
        },
        batch: {
          include: {
            department: true,
          },
        },
        section: true,
      },
      orderBy: { erpNo: "asc" },
    });

    const formatted = students.map((s) => {
      const effectiveSemester =
        s.semesterOverride !== null ? s.semesterOverride : s.batch.currentSemester;

      return {
        id: s.id,
        userId: s.userId,
        isActive: s.user?.isActive ?? true,
        deactivatedAt: s.user?.deactivatedAt ?? null,
        name: s.name,
        erpNo: s.erpNo,
        prn: s.prn,
        batchId: s.batchId,
        batchLabel: s.batch.label,
        departmentId: s.batch.departmentId,
        departmentName: s.batch.department.name,
        sectionId: s.sectionId,
        sectionName: s.section.name,
        batchDefaultSemester: s.batch.currentSemester,
        semesterOverride: s.semesterOverride,
        effectiveSemester,
        maxSemesters: s.batch.department.totalSemesters,
      };
    });

    return NextResponse.json({ students: formatted }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to list students" },
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

  const { erpNo, prn, name, email, batchId, sectionId } = body;

  if (!erpNo || !prn || !name || !batchId || !sectionId) {
    return NextResponse.json(
      { error: "erpNo, prn, name, batchId, and sectionId are required" },
      { status: 400 }
    );
  }

  const cleanErp = String(erpNo).trim();
  const cleanPrn = String(prn).trim();
  const cleanName = String(name).trim();
  const cleanEmail = email ? String(email).trim() : `${cleanErp.toLowerCase()}@bvimr.edu.in`;

  try {
    // 1. Verify batch exists
    const batch = await prisma.batch.findUnique({
      where: { id: String(batchId) },
      include: { department: true },
    });

    if (!batch) {
      return NextResponse.json(
        { error: `Batch with ID '${batchId}' not found` },
        { status: 400 }
      );
    }

    // 2. Verify section exists and belongs to selected batch
    const section = await prisma.section.findUnique({
      where: { id: String(sectionId) },
    });

    if (!section || section.batchId !== batch.id) {
      return NextResponse.json(
        { error: "Selected section does not exist or does not belong to the selected batch" },
        { status: 400 }
      );
    }

    // 3. Check duplicate ERP
    const existingUser = await prisma.user.findUnique({
      where: { username: cleanErp },
    });
    const existingErpProfile = await prisma.studentProfile.findUnique({
      where: { erpNo: cleanErp },
    });

    if (existingUser || existingErpProfile) {
      return NextResponse.json(
        { error: `Student with ERP No '${cleanErp}' already exists` },
        { status: 400 }
      );
    }

    // 4. Check duplicate PRN
    const existingPrnProfile = await prisma.studentProfile.findUnique({
      where: { prn: cleanPrn },
    });

    if (existingPrnProfile) {
      return NextResponse.json(
        { error: `Student with PRN '${cleanPrn}' already exists` },
        { status: 400 }
      );
    }

    // 5. Generate credentials
    const passwordPlain = generatePassword(10);
    const passwordHash = await hashPassword(passwordPlain);

    const { user, studentProfile } = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          username: cleanErp,
          passwordHash,
          role: Role.STUDENT,
          email: cleanEmail,
        },
      });

      const newStudent = await tx.studentProfile.create({
        data: {
          userId: newUser.id,
          name: cleanName,
          erpNo: cleanErp,
          prn: cleanPrn,
          batchId: batch.id,
          sectionId: section.id,
        },
        include: {
          batch: { include: { department: true } },
          section: true,
        },
      });

      return { user: newUser, studentProfile: newStudent };
    });

    credentialStore.set(user.id, {
      username: user.username,
      name: cleanName,
      passwordPlain,
    });

    return NextResponse.json(
      {
        message: "Student onboarded successfully",
        student: {
          id: studentProfile.id,
          name: studentProfile.name,
          erpNo: studentProfile.erpNo,
          prn: studentProfile.prn,
          batchId: studentProfile.batchId,
          batchLabel: studentProfile.batch.label,
          departmentName: studentProfile.batch.department.name,
          sectionId: studentProfile.sectionId,
          sectionName: studentProfile.section.name,
        },
        credentials: {
          username: user.username,
          passwordPlain,
          name: cleanName,
          prn: cleanPrn,
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to onboard student" },
      { status: 500 }
    );
  }
}
