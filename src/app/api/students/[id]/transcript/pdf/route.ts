import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import PDFDocument from "pdfkit";
import { prisma } from "@/lib/prisma";
import { verifyAuth, verifyHOD } from "@/lib/auth/guards";
import {
  totalIA,
  ScoreComponent,
  Mark,
  SlabRange,
} from "@/services/gradingEngine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = verifyAuth(req, [Role.ADMIN, Role.FACULTY, Role.STUDENT]);
  if (!auth.ok) {
    return auth.error;
  }

  const studentId = params.id;

  try {
    const student = await prisma.studentProfile.findUnique({
      where: { id: studentId },
      include: {
        batch: {
          include: { department: true },
        },
        section: true,
        user: true,
      },
    });

    if (!student) {
      return NextResponse.json(
        { error: "Student profile not found" },
        { status: 404 }
      );
    }

    // IDOR Protection: Students can only download their own transcript
    if (auth.user.role === Role.STUDENT && student.userId !== auth.user.userId) {
      return NextResponse.json(
        {
          error: "Forbidden: You are not authorized to view another student's transcript",
          code: "IDOR_FORBIDDEN",
        },
        { status: 403 }
      );
    }

    // Scoping for Faculty: must be HOD of the student's department
    if (auth.user.role === Role.FACULTY) {
      const hodCheck = await verifyHOD(auth.user, student.batch.departmentId);
      if (!hodCheck.ok) {
        return hodCheck.error;
      }
    }

    // Determine current semester
    const currentSem =
      student.semesterOverride ?? student.batch.currentSemester;

    // Fetch all terms up to current semester for this student's department
    const terms = await prisma.academicTerm.findMany({
      where: {
        departmentId: student.batch.departmentId,
        semesterNumber: { lte: currentSem },
      },
      include: {
        subjectOfferings: {
          include: {
            subject: true,
            gradingPolicy: {
              include: {
                scoreComponents: { orderBy: { order: "asc" } },
                attendanceSlabRanges: { orderBy: { minPercent: "asc" } },
              },
            },
            sections: {
              where: { sectionId: student.sectionId },
            },
          },
          orderBy: { subject: { code: "asc" } },
        },
      },
      orderBy: { semesterNumber: "asc" },
    });

    // Collect marks and calculate IA per term
    let totalOfferingsCount = 0;
    let publishedOfferingsCount = 0;
    let cumulativeObtained = 0;
    let cumulativeMax = 0;

    const termResults = [];

    for (const term of terms) {
      const subjects = [];
      let termObtained = 0;
      let termMax = 0;
      let termPublishedCount = 0;

      for (const offering of term.subjectOfferings) {
        totalOfferingsCount++;
        const offeringSection = offering.sections[0];
        const isPublished = Boolean(offeringSection?.marksPublishedAt);

        if (!isPublished || !offering.gradingPolicy) {
          // Unconfirmed or Unpublished: NEVER print unpublished marks per Amendment
          subjects.push({
            code: offering.subject.code,
            name: offering.subject.name,
            isPublished: false,
            obtained: null,
            max: null,
            status: "Not published",
          });
          continue;
        }

        // Section is published: calculate marks
        publishedOfferingsCount++;
        termPublishedCount++;
        const policy = offering.gradingPolicy;

        const studentMarks = await prisma.mark.findMany({
          where: {
            studentId: student.id,
            scoreComponentId: { in: policy.scoreComponents.map((c: any) => c.id) },
          },
        });

        const attendanceRec = offeringSection
          ? await prisma.attendanceRecord.findFirst({
              where: {
                studentId: student.id,
                subjectOfferingSectionId: offeringSection.id,
              },
            })
          : null;

        const attPct = attendanceRec ? attendanceRec.attendancePercent : 0;

        const formattedComponents: ScoreComponent[] = policy.scoreComponents.map(
          (c: any) => ({
            id: c.id,
            group: c.group as "CES" | "INTERNAL",
            name: c.name,
            maxMarks: c.maxMarks,
          })
        );

        const formattedSlabs: SlabRange[] = policy.attendanceSlabRanges.map(
          (s: any) => ({
            minPercent: s.minPercent,
            maxPercent: s.maxPercent,
            marks: s.marks,
          })
        );

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

        const maxSubjectIA =
          policy.cesGroupWeightage +
          policy.internalWeightage +
          policy.attendanceWeightage;

        const finalScore = computed.totalIA ?? 0;

        subjects.push({
          code: offering.subject.code,
          name: offering.subject.name,
          isPublished: true,
          obtained: finalScore,
          max: maxSubjectIA,
          status: "Published",
        });

        termObtained += finalScore;
        termMax += maxSubjectIA;
      }

      cumulativeObtained += termObtained;
      cumulativeMax += termMax;

      const termPct = termMax > 0 ? (termObtained / termMax) * 100 : 0;
      const sgpa = (termPct / 10).toFixed(2);

      termResults.push({
        termLabel: term.label,
        semesterNumber: term.semesterNumber,
        subjects,
        termObtained,
        termMax,
        termPublishedCount,
        sgpa,
      });
    }

    const isAllPublished =
      totalOfferingsCount > 0 &&
      publishedOfferingsCount === totalOfferingsCount;
    const watermarkText = isAllPublished ? "OFFICIAL" : "UNOFFICIAL";

    const cumulativePct =
      cumulativeMax > 0 ? (cumulativeObtained / cumulativeMax) * 100 : 0;
    const cgpa = (cumulativePct / 10).toFixed(2);

    // Build PDF Document
    const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40 });
      const chunks: Buffer[] = [];

      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", (err: Error) => reject(err));

      // Watermark
      doc.save();
      doc.opacity(0.08);
      doc.fontSize(65);
      doc.fillColor("#475569");
      doc.rotate(-45, { origin: [doc.page.width / 2, doc.page.height / 2] });
      doc.text(watermarkText, 0, doc.page.height / 2 - 40, {
        align: "center",
        width: doc.page.width,
      });
      doc.restore();

      // Header
      doc
        .fontSize(16)
        .font("Helvetica-Bold")
        .text("BHARATI VIDYAPEETH INSTITUTE OF MANAGEMENT & RESEARCH", {
          align: "center",
        });
      doc
        .fontSize(11)
        .font("Helvetica")
        .text("A-4, Paschim Vihar, Rohtak Road, New Delhi - 110063", {
          align: "center",
        });
      doc
        .fontSize(13)
        .font("Helvetica-Bold")
        .text("CUMULATIVE ACADEMIC INTERNAL ASSESSMENT TRANSCRIPT", {
          align: "center",
        });
      doc.moveDown(0.8);

      // Student Metadata Block
      doc.fontSize(10).font("Helvetica");
      doc.text(`Student Name: ${student.name}`);
      doc.text(`ERP No: ${student.erpNo}   |   PRN: ${student.prn}`);
      doc.text(`Department: ${student.batch.department.name}`);
      doc.text(
        `Batch: ${student.batch.label}   |   Section: ${student.section.name}   |   Current Semester: ${currentSem}`
      );
      doc.text(`Transcript Status: ${watermarkText} (All Published: ${isAllPublished ? "YES" : "NO"})`);
      doc.moveDown(0.5);

      doc.text(
        "--------------------------------------------------------------------------------------------------"
      );
      doc.moveDown(0.5);

      // Terms breakdown
      for (const t of termResults) {
        doc
          .fontSize(11)
          .font("Helvetica-Bold")
          .text(`Semester ${t.semesterNumber} (${t.termLabel})`);
        doc.moveDown(0.3);

        doc.fontSize(9).font("Helvetica");
        for (const sub of t.subjects) {
          if (sub.isPublished) {
            doc.text(
              `  [${sub.code}] ${sub.name}: ${sub.obtained?.toFixed(2)} / ${sub.max} IA Marks  (Published)`
            );
          } else {
            doc.text(
              `  [${sub.code}] ${sub.name}: Not published`
            );
          }
        }

        doc.moveDown(0.3);
        doc
          .font("Helvetica-Bold")
          .text(
            `  Term Summary: ${t.termObtained.toFixed(2)} / ${t.termMax} IA Marks | SGPA Equivalent: ${t.sgpa}`
          );
        doc.font("Helvetica");
        doc.moveDown(0.6);
      }

      doc.text(
        "--------------------------------------------------------------------------------------------------"
      );
      doc.moveDown(0.5);

      // Cumulative Summary
      doc.fontSize(11).font("Helvetica-Bold");
      doc.text("CUMULATIVE ASSESSMENT SUMMARY", { underline: true });
      doc.moveDown(0.3);
      doc.fontSize(10).font("Helvetica");
      doc.text(`Total Published Subjects: ${publishedOfferingsCount} / ${totalOfferingsCount}`);
      doc.text(
        `Cumulative Aggregate IA: ${cumulativeObtained.toFixed(2)} / ${cumulativeMax} (${cumulativePct.toFixed(2)}%)`
      );
      doc.text(`Cumulative GPA Equivalent: ${cgpa} / 10.00`);
      doc.moveDown(1.5);

      doc.fontSize(8).text(
        `Generated on: ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} | Document Verified: ${watermarkText}`,
        { align: "center" }
      );

      doc.end();
    });

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="Transcript_${student.erpNo}.pdf"`,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to generate transcript PDF" },
      { status: 500 }
    );
  }
}

