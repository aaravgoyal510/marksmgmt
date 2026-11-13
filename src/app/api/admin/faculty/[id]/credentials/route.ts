import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth/guards";
import { credentialStore } from "@/lib/credentialStore";
import ExcelJS from "exceljs";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = verifyAuth(req, [Role.ADMIN]);
  if (!auth.ok) {
    return auth.error;
  }

  const facultyId = params.id;

  try {
    const faculty = await prisma.facultyProfile.findUnique({
      where: { id: facultyId },
      include: { user: true },
    });

    if (!faculty) {
      return NextResponse.json(
        { error: "Faculty member not found" },
        { status: 404 }
      );
    }

    const stored = credentialStore.get(faculty.userId);
    const passwordPlain = stored?.passwordPlain || "(Password reset required)";

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Faculty Credentials");

    worksheet.columns = [
      { header: "Faculty Name", key: "name", width: 25 },
      { header: "Employee ID (Username)", key: "username", width: 25 },
      { header: "Initial Password", key: "passwordPlain", width: 25 },
    ];

    worksheet.addRow({
      name: faculty.name,
      username: faculty.employeeId,
      passwordPlain,
    });

    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(Buffer.from(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename=Credentials_${faculty.employeeId}.xlsx`,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to download credentials" },
      { status: 500 }
    );
  }
}
