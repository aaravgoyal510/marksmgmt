import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth/guards";

export async function GET(req: NextRequest) {
  const auth = verifyAuth(req, [Role.ADMIN]);
  if (!auth.ok) {
    return auth.error;
  }

  try {
    const students = await prisma.studentProfile.findMany({
      include: {
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
