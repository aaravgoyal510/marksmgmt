import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = verifyAuth(req, [Role.ADMIN, Role.FACULTY]);
  if (!auth.ok) {
    return auth.error;
  }

  const departmentIdParam = req.nextUrl.searchParams.get("departmentId");
  const termIdParam = req.nextUrl.searchParams.get("academicTermId");

  try {
    let allowedDepartmentIds: string[] | null = null;
    let facultyProfileId: string | null = null;

    if (auth.user.role === Role.FACULTY) {
      const faculty = await prisma.facultyProfile.findUnique({
        where: { userId: auth.user.userId },
        include: { hodAssignments: true },
      });

      if (!faculty) {
        return NextResponse.json(
          { error: "Faculty profile not found" },
          { status: 404 }
        );
      }

      facultyProfileId = faculty.id;
      const hodDeptIds = (faculty.hodAssignments || []).map((h) => h.departmentId);
      if (auth.user.hodDepartmentId && !hodDeptIds.includes(auth.user.hodDepartmentId)) {
        hodDeptIds.push(auth.user.hodDepartmentId);
      }

      if (hodDeptIds.length > 0) {
        // HOD user: scoped to own department(s)
        if (departmentIdParam && !hodDeptIds.includes(departmentIdParam)) {
          return NextResponse.json(
            {
              error: "Access denied: HOD can only view reports for their own department",
              code: "HOD_CROSS_DEPARTMENT_DENIED",
            },
            { status: 403 }
          );
        }
        allowedDepartmentIds = departmentIdParam ? [departmentIdParam] : hodDeptIds;
      } else {
        // Normal teaching faculty: not HOD
        allowedDepartmentIds = null;
      }
    } else if (auth.user.role === Role.ADMIN) {
      allowedDepartmentIds = departmentIdParam ? [departmentIdParam] : null;
    }

    // Build Prisma query condition
    const whereCondition: any = {};

    if (termIdParam) {
      whereCondition.academicTermId = termIdParam;
    }

    if (allowedDepartmentIds) {
      whereCondition.subject = {
        departmentId: { in: allowedDepartmentIds },
      };
    } else if (auth.user.role === Role.FACULTY && facultyProfileId) {
      // Teaching faculty: restrict to offerings where they are assigned to a section
      whereCondition.sections = {
        some: { facultyId: facultyProfileId },
      };
    }

    const [terms, offerings] = await Promise.all([
      prisma.academicTerm.findMany({
        orderBy: [{ semesterNumber: "desc" }, { createdAt: "desc" }],
      }),
      prisma.subjectOffering.findMany({
        where: whereCondition,
        include: {
          subject: {
            include: { department: true },
          },
          academicTerm: true,
          gradingPolicy: {
            select: {
              id: true,
              confirmedAt: true,
              scoreComponents: { select: { id: true, name: true } },
            },
          },
          sections: {
            include: {
              section: {
                include: {
                  students: { select: { id: true } },
                },
              },
              faculty: {
                select: { id: true, name: true, employeeId: true },
              },
            },
          },
        },
        orderBy: [
          { academicTerm: { label: "desc" } },
          { subject: { code: "asc" } },
        ],
      }),
    ]);

    const formattedOfferings = offerings.map((off) => {
      const isPolicyConfirmed = Boolean(off.gradingPolicy?.confirmedAt);
      const studentIds = new Set(
        off.sections.flatMap((s) => s.section.students.map((st) => st.id))
      );

      return {
        id: off.id,
        subjectCode: off.subject.code,
        subjectName: off.subject.name,
        departmentId: off.subject.departmentId || off.subject.department?.id,
        departmentName: off.subject.department?.name,
        academicTermId: off.academicTermId,
        termLabel: off.academicTerm?.label,
        semesterNumber: off.academicTerm?.semesterNumber,
        isPolicyConfirmed,
        sectionsCount: off.sections?.length || 0,
        sections: (off.sections || []).map((s: any) => ({
          id: s.id,
          name: s.section?.name,
          facultyName: s.faculty?.name || s.faculty?.user?.name || "Unassigned",
          studentsCount: s.section?.students?.length || 0,
        })),
        enrolledStudentsCount: studentIds.size,
        componentsCount: off.gradingPolicy?.scoreComponents?.length || 0,
        exportUrl: `/api/reports/subject-offerings/${off.id}/export`,
      };
    });

    return NextResponse.json(
      {
        terms,
        offerings: formattedOfferings,
      },
      { status: 200 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to fetch offerings report history" },
      { status: 500 }
    );
  }
}
