import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import ExcelJS from "exceljs";
import Papa from "papaparse";
import { prisma } from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth/guards";
import { totalIA, ScoreComponent, Mark, SlabRange } from "@/services/gradingEngine";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = verifyAuth(req, [Role.ADMIN, Role.FACULTY]);
  if (!auth.ok) {
    return auth.error;
  }

  const offeringId = params.id;
  const format = req.nextUrl.searchParams.get("format") || "xlsx";

  const offering = await prisma.subjectOffering.findUnique({
    where: { id: offeringId },
    include: {
      subject: { include: { department: true } },
      academicTerm: true,
      gradingPolicy: {
        include: {
          scoreComponents: { orderBy: { order: "asc" } },
          attendanceSlabRanges: { orderBy: { minPercent: "asc" } },
        },
      },
      sections: {
        include: {
          section: {
            include: {
              students: { orderBy: { erpNo: "asc" } },
            },
          },
        },
      },
    },
  });

  if (!offering || !offering.gradingPolicy) {
    return NextResponse.json(
      { error: "Subject offering or policy not found" },
      { status: 404 }
    );
  }

  const policy = offering.gradingPolicy;

  // Flatten all enrolled students across sections
  const allStudentsWithSection = offering.sections.flatMap((sec: any) =>
    sec.section.students.map((st: any) => ({
      student: st,
      sectionName: sec.section.name,
      offeringSectionId: sec.id,
    }))
  );

  const studentIds = allStudentsWithSection.map((s: any) => s.student.id);
  const componentIds = policy.scoreComponents.map((c: any) => c.id);

  const allMarks = await prisma.mark.findMany({
    where: {
      studentId: { in: studentIds },
      scoreComponentId: { in: componentIds },
    },
  });

  const allAttendance = await prisma.attendanceRecord.findMany({
    where: {
      subjectOfferingSectionId: { in: offering.sections.map((s: any) => s.id) },
      studentId: { in: studentIds },
    },
  });

  const formattedComponents: ScoreComponent[] = policy.scoreComponents.map((c: any) => ({
    id: c.id,
    group: c.group as "CES" | "INTERNAL",
    name: c.name,
    maxMarks: c.maxMarks,
  }));

  const formattedSlabs: SlabRange[] = policy.attendanceSlabRanges.map((s: any) => ({
    minPercent: s.minPercent,
    maxPercent: s.maxPercent,
    marks: s.marks,
  }));

  const cesComponents = policy.scoreComponents.filter((c: any) => c.group === "CES");
  const internalComponents = policy.scoreComponents.filter((c: any) => c.group === "INTERNAL");

  const rowsData = allStudentsWithSection.map((item: any) => {
    const student = item.student;
    const studentMarks = allMarks.filter((m: any) => m.studentId === student.id);
    const attRec = allAttendance.find((a: any) => a.studentId === student.id);
    const attPct = attRec ? attRec.attendancePercent : 0;

    const engineMarks: Mark[] = studentMarks.map((m: any) => ({
      scoreComponentId: m.scoreComponentId,
      marksObtained: m.marksObtained,
    }));

    const computed = totalIA(
      formattedComponents,
      engineMarks,
      policy.cesGroupWeightage,
      policy.internalWeightage,
      attPct,
      formattedSlabs
    );

    const rowObj: Record<string, any> = {
      "Enrollment No": student.erpNo,
      PRN: student.prn,
      Name: student.name,
      Section: item.sectionName,
    };

    // Populate dynamic CES columns
    for (const cesComp of cesComponents) {
      const mark = studentMarks.find((m: any) => m.scoreComponentId === cesComp.id);
      rowObj[cesComp.name] = mark ? mark.marksObtained : 0;
    }

    rowObj[`Weightage of CES (${policy.cesGroupWeightage})`] = Number(
      computed.cesScore.toFixed(2)
    );

    // Populate dynamic Internal columns
    for (const intComp of internalComponents) {
      const mark = studentMarks.find((m: any) => m.scoreComponentId === intComp.id);
      rowObj[intComp.name] = mark ? mark.marksObtained : 0;
    }

    rowObj[`Weightage of Internals (${policy.internalWeightage})`] = Number(
      computed.internalScore.toFixed(2)
    );
    rowObj["Attendance %"] = `${attPct}%`;
    rowObj[`Attendance Marks (${policy.attendanceWeightage})`] = computed.attendanceScore ?? 0;
    rowObj["Total IA Marks"] =
      computed.totalIA !== null ? Number(computed.totalIA.toFixed(2)) : "N/A";

    return rowObj;
  });

  const filename = `${offering.subject.code}_${offering.academicTerm.label}_Report`;

  if (format === "csv") {
    const csv = Papa.unparse(rowsData);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}.csv"`,
      },
    });
  }

  // Generate XLSX
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Consolidated IA Report");

  if (rowsData.length > 0) {
    const headers = Object.keys(rowsData[0]);
    worksheet.columns = headers.map((h) => ({ header: h, key: h, width: 20 }));
    for (const r of rowsData) {
      worksheet.addRow(r);
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}.xlsx"`,
    },
  });
}
