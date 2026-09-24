import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import ExcelJS from "exceljs";
import Papa from "papaparse";
import PDFDocument from "pdfkit";
import { totalIA, ScoreComponent, Mark, SlabRange } from "../services/gradingEngine";

const prisma = new PrismaClient();

// -----------------------------------------------------------------------------
// 1. Dynamic Column Report Export (XLSX / CSV)
// -----------------------------------------------------------------------------
export async function exportSubjectOfferingReport(req: Request, res: Response) {
  const offeringId = req.params.id as string;
  const format = (req.query.format as string) || "xlsx";

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
    return res.status(404).json({ error: "Subject offering or policy not found" });
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

  // Build dynamic headers matching reference format:
  // Enrollment No | PRN | Name | Section | [CES-I] | [CES-II] | Weightage of CES | [Internal] | Weightage of Internals | Attendance% | Attendance Marks | Total IA Marks
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

    rowObj[`Weightage of CES (${policy.cesGroupWeightage})`] = Number(computed.cesScore.toFixed(2));

    // Populate dynamic Internal columns
    for (const intComp of internalComponents) {
      const mark = studentMarks.find((m: any) => m.scoreComponentId === intComp.id);
      rowObj[intComp.name] = mark ? mark.marksObtained : 0;
    }

    rowObj[`Weightage of Internals (${policy.internalWeightage})`] = Number(computed.internalScore.toFixed(2));
    rowObj["Attendance %"] = `${attPct}%`;
    rowObj[`Attendance Marks (${policy.attendanceWeightage})`] = computed.attendanceScore ?? 0;
    rowObj["Total IA Marks"] = computed.totalIA !== null ? Number(computed.totalIA.toFixed(2)) : "N/A";

    return rowObj;
  });

  const filename = `${offering.subject.code}_${offering.academicTerm.label}_Report`;

  if (format === "csv") {
    const csv = Papa.unparse(rowsData);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}.csv"`);
    return res.status(200).send(csv);
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

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}.xlsx"`);

  await workbook.xlsx.write(res);
  return res.end();
}

// -----------------------------------------------------------------------------
// 2. Per-Student PDF Mark Sheet
// -----------------------------------------------------------------------------
export async function exportStudentPdfMarkSheet(req: Request, res: Response) {
  const studentId = req.params.studentId as string;
  const offeringId = req.params.offeringId as string;

  const student = await prisma.studentProfile.findUnique({
    where: { id: studentId },
    include: {
      batch: { include: { department: true } },
      section: true,
    },
  });

  const offering = await prisma.subjectOffering.findUnique({
    where: { id: offeringId },
    include: {
      subject: true,
      academicTerm: true,
      gradingPolicy: {
        include: {
          scoreComponents: { orderBy: { order: "asc" } },
          attendanceSlabRanges: { orderBy: { minPercent: "asc" } },
        },
      },
    },
  });

  if (!student || !offering || !offering.gradingPolicy) {
    return res.status(404).json({ error: "Student or offering policy not found" });
  }

  // IDOR Protection: Students can only generate/download their own PDF mark sheet
  if (req.user?.role === "STUDENT" && student.userId !== req.user.userId) {
    return res.status(403).json({
      error: "Forbidden: You are not authorized to view another student's report",
      code: "IDOR_FORBIDDEN",
    });
  }

  const policy = offering.gradingPolicy;

  // Fetch marks and attendance
  const studentMarks = await prisma.mark.findMany({
    where: {
      studentId,
      scoreComponentId: { in: policy.scoreComponents.map((c: any) => c.id) },
    },
  });

  const attendanceRec = await prisma.attendanceRecord.findFirst({
    where: {
      studentId,
      subjectOfferingSection: { subjectOfferingId: offeringId },
    },
  });

  const attPct = attendanceRec ? attendanceRec.attendancePercent : 0;

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

  // Generate PDF document using pdfkit
  const doc = new PDFDocument({ margin: 40 });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `inline; filename="MarkSheet_${student.erpNo}_${offering.subject.code}.pdf"`
  );

  doc.pipe(res);

  // PDF Layout Styling
  doc.fontSize(18).text("BHARATI VIDYAPEETH INSTITUTE OF MANAGEMENT & RESEARCH", { align: "center" });
  doc.fontSize(12).text("Internal Assessment Mark Sheet", { align: "center" });
  doc.moveDown();

  doc.fontSize(10).text(`Department: ${student.batch.department.name}`);
  doc.text(`Academic Term: ${offering.academicTerm.label}`);
  doc.text(`Subject: ${offering.subject.name} (${offering.subject.code})`);
  doc.text(`Student Name: ${student.name}`);
  doc.text(`ERP / Enrollment No: ${student.erpNo} | PRN: ${student.prn}`);
  doc.text(`Batch: ${student.batch.label} | Section: ${student.section.name}`);
  doc.moveDown();

  doc.text("----------------------------------------------------------------------------------");
  doc.fontSize(11).text("Component Breakdown & Scores", { underline: true });
  doc.moveDown(0.5);

  doc.fontSize(10);
  for (const comp of policy.scoreComponents) {
    const mark = studentMarks.find((m: any) => m.scoreComponentId === comp.id);
    doc.text(`${comp.name} (${comp.group}): ${mark ? mark.marksObtained : 0} / ${comp.maxMarks}`);
  }

  doc.moveDown();
  doc.text(`CES Group Weightage Score: ${computed.cesScore.toFixed(2)} / ${policy.cesGroupWeightage}`);
  doc.text(`Internal Exam Weightage Score: ${computed.internalScore.toFixed(2)} / ${policy.internalWeightage}`);
  doc.text(`Attendance (%: ${attPct}%): ${computed.attendanceScore ?? 0} / ${policy.attendanceWeightage}`);
  doc.moveDown();
  doc.fontSize(12).text(`TOTAL IA MARKS: ${computed.totalIA !== null ? computed.totalIA.toFixed(2) : "N/A"} / ${policy.cesGroupWeightage + policy.internalWeightage + policy.attendanceWeightage}`);

  doc.end();
}
