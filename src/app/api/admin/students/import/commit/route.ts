import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth/guards";
import { generatePassword, hashPassword } from "@/utils/password";
import { credentialStore } from "@/lib/credentialStore";
import { CommitStudentRow } from "@/lib/studentImport";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = verifyAuth(req, [Role.ADMIN]);
  if (!auth.ok) {
    return auth.error;
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON request body" }, { status: 400 });
  }

  const { batchId, rows } = body || {};

  if (!batchId || !Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json(
      { error: "batchId and a non-empty rows array are required for commit" },
      { status: 400 }
    );
  }

  // Pre-validate that all rows are valid and ready
  for (const r of rows) {
    if (!r.erpNo || !r.prn || !r.name || !r.sectionId) {
      return NextResponse.json(
        {
          error: "Cannot commit import: One or more rows are missing mandatory fields",
          code: "BLOCKING_IMPORT_ERRORS",
        },
        { status: 400 }
      );
    }
  }

  try {
    const batch = await prisma.batch.findUnique({
      where: { id: String(batchId) },
      include: { department: true },
    });

    if (!batch) {
      return NextResponse.json(
        { error: `Batch '${batchId}' does not exist` },
        { status: 400 }
      );
    }

    // Verify no duplicates were introduced in the interim
    const erpList = rows.map((r: any) => String(r.erpNo).trim());
    const existingUsers = await prisma.user.findMany({
      where: { username: { in: erpList } },
    });

    if (existingUsers.length > 0) {
      return NextResponse.json(
        {
          error: `Cannot commit: ERP No '${existingUsers[0].username}' already exists in database`,
          code: "DUPLICATE_ERP",
        },
        { status: 400 }
      );
    }

    // Prepare credentials and password hashes
    const preparedRecords: any[] = [];
    for (const r of rows) {
      const cleanErp = String(r.erpNo).trim();
      const cleanPrn = String(r.prn).trim();
      const cleanName = String(r.name).trim();
      const cleanEmail = r.email ? String(r.email).trim() : `${cleanErp.toLowerCase()}@bvimr.edu.in`;
      const passwordPlain = generatePassword(10);
      const passwordHash = await hashPassword(passwordPlain);

      preparedRecords.push({
        erpNo: cleanErp,
        prn: cleanPrn,
        name: cleanName,
        email: cleanEmail,
        sectionId: String(r.sectionId),
        sectionName: r.sectionName || "",
        passwordPlain,
        passwordHash,
      });
    }

    // Execute atomic transaction
    const createdCredentials: any[] = [];

    await prisma.$transaction(async (tx) => {
      for (const item of preparedRecords) {
        const user = await tx.user.create({
          data: {
            username: item.erpNo,
            passwordHash: item.passwordHash,
            role: Role.STUDENT,
            email: item.email,
          },
        });

        const studentProfile = await tx.studentProfile.create({
          data: {
            userId: user.id,
            name: item.name,
            erpNo: item.erpNo,
            prn: item.prn,
            batchId: batch.id,
            sectionId: item.sectionId,
          },
        });

        credentialStore.set(user.id, {
          username: user.username,
          name: item.name,
          passwordPlain: item.passwordPlain,
        });

        createdCredentials.push({
          erpNo: item.erpNo,
          prn: item.prn,
          name: item.name,
          email: item.email,
          section: item.sectionName,
          username: item.erpNo,
          passwordPlain: item.passwordPlain,
        });
      }
    });

    return NextResponse.json(
      {
        message: "Students successfully onboarded and enrolled",
        importedCount: createdCredentials.length,
        batchLabel: batch.label,
        departmentName: batch.department.name,
        credentials: createdCredentials,
      },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to commit student import" },
      { status: 500 }
    );
  }
}

