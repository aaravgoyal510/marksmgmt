import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import PDFDocument from "pdfkit";
import { prisma } from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth/guards";
import { totalIA, ScoreComponent, Mark, SlabRange } from "@/services/gradingEngine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { studentId: string; offeringId: string } }
) {
  const auth = verifyAuth(req, [Role.ADMIN, Role.FACULTY, Role.STUDENT]);
  if (!auth.ok) {
    return auth.error;
  }

  const { studentId, offeringId } = params;

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
    return NextResponse.json(
      { error: "Student or offering policy not found" },
      { status: 404 }
    );
  }

  // IDOR Protection: Students can only generate/download their own PDF mark sheet
  if (auth.user.role === Role.STUDENT && student.userId !== auth.user.userId) {
    return NextResponse.json(
      {
        error: "Forbidden: You are not authorized to view another student's report",
        code: "IDOR_FORBIDDEN",
      },
      { status: 403 }
    );
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

  const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40 });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", (err: Error) => reject(err));

    // PDF Layout Styling
    doc.fontSize(18).text(
      "BHARATI VIDYAPEETH INSTITUTE OF MANAGEMENT & RESEARCH",
      { align: "center" }
    );
    doc.fontSize(12).text("Internal Assessment Mark Sheet", {
      align: "center",
    });
    doc.moveDown();

    doc.fontSize(10).text(`Department: ${student.batch.department.name}`);
    doc.text(`Academic Term: ${offering.academicTerm.label}`);
    doc.text(`Subject: ${offering.subject.name} (${offering.subject.code})`);
    doc.text(`Student Name: ${student.name}`);
    doc.text(`ERP / Enrollment No: ${student.erpNo} | PRN: ${student.prn}`);
    doc.text(`Batch: ${student.batch.label} | Section: ${student.section.name}`);
    doc.moveDown();

    doc.text(
      "----------------------------------------------------------------------------------"
    );
    doc.fontSize(11).text("Component Breakdown & Scores", { underline: true });
    doc.moveDown(0.5);

    doc.fontSize(10);
    for (const comp of policy.scoreComponents) {
      const mark = studentMarks.find((m: any) => m.scoreComponentId === comp.id);
      doc.text(
        `${comp.name} (${comp.group}): ${mark ? mark.marksObtained : 0} / ${comp.maxMarks}`
      );
    }

    doc.moveDown();
    doc.text(
      `CES Group Weightage Score: ${computed.cesScore.toFixed(2)} / ${policy.cesGroupWeightage}`
    );
    doc.text(
      `Internal Exam Weightage Score: ${computed.internalScore.toFixed(2)} / ${policy.internalWeightage}`
    );
    doc.text(
      `Attendance (%: ${attPct}%): ${computed.attendanceScore ?? 0} / ${policy.attendanceWeightage}`
    );
    doc.moveDown();
    doc.fontSize(12).text(
      `TOTAL IA MARKS: ${computed.totalIA !== null ? computed.totalIA.toFixed(2) : "N/A"} / ${
        policy.cesGroupWeightage +
        policy.internalWeightage +
        policy.attendanceWeightage
      }`
    );

    doc.end();
  });

  return new NextResponse(pdfBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="MarkSheet_${student.erpNo}_${offering.subject.code}.pdf"`,
    },
  });
}
