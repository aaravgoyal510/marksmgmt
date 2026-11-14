import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyAuth, verifyUnlockedSection } from "@/lib/auth/guards";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = verifyAuth(req, [Role.FACULTY]);
  if (!auth.ok) {
    return auth.error;
  }

  const sectionId = params.id;

  const lockCheck = await verifyUnlockedSection(sectionId);
  if (!lockCheck.ok) {
    return lockCheck.error;
  }
  const offeringSection = lockCheck.section;

  if (offeringSection.facultyId !== auth.user.facultyId) {
    return NextResponse.json(
      {
        error:
          "Forbidden: Template download is restricted to the assigned teaching faculty for this section.",
        code: "TEACHING_FACULTY_ONLY",
      },
      { status: 403 }
    );
  }

  const fullSection = await prisma.subjectOfferingSection.findUnique({
    where: { id: sectionId },
    include: {
      subjectOffering: {
        include: {
          subject: true,
          academicTerm: true,
          gradingPolicy: {
            include: {
              scoreComponents: { orderBy: { order: "asc" } },
            },
          },
        },
      },
      section: {
        include: {
          students: {
            include: { batch: true },
            orderBy: { erpNo: "asc" },
          },
        },
      },
    },
  });

  if (!fullSection || !fullSection.subjectOffering.gradingPolicy) {
    return NextResponse.json(
      { error: "Grading policy or section not found" },
      { status: 404 }
    );
  }

  const policy = fullSection.subjectOffering.gradingPolicy;
  const components = policy.scoreComponents;
  const offeringSem = fullSection.subjectOffering.academicTerm.semesterNumber;

  const enrolledStudents = (fullSection.section.students || []).filter((s: any) => {
    const effectiveSem =
      s.semesterOverride !== null && s.semesterOverride !== undefined
        ? s.semesterOverride
        : s.batch?.currentSemester;
    if (effectiveSem !== undefined && offeringSem !== undefined) {
      return effectiveSem === offeringSem;
    }
    return true;
  });

  // Construct CSV Header
  const headerCols = [
    "ERP No",
    "Student Name",
    ...components.map((c) => `${c.name} (${c.maxMarks}M)`),
  ];

  const rows = [headerCols.join(",")];

  for (const st of enrolledStudents) {
    const escapedName = `"${st.name.replace(/"/g, '""')}"`;
    const blanks = components.map(() => "");
    rows.push([st.erpNo, escapedName, ...blanks].join(","));
  }

  const csvContent = rows.join("\n");
  const subjectCode = fullSection.subjectOffering.subject.code;
  const sectionName = fullSection.section.name;

  return new NextResponse(csvContent, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="MarksTemplate_${subjectCode}_Sec${sectionName}.csv"`,
    },
  });
}

