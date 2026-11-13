import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import Papa from "papaparse";
import { prisma } from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth/guards";
import { attendanceScore, SlabRange } from "@/services/gradingEngine";

export interface AttendanceCsvRow {
  erp?: string;
  prn?: string;
  name?: string;
  attendancePercent: number;
}

export interface PreviewRowResult {
  erp: string;
  prn: string;
  name: string;
  attendancePercent: number;
  studentId: string | null;
  studentName: string | null;
  status: "READY" | "BLOCKED_SLAB_GAP" | "UNMATCHED";
  marksPreview: number | null;
  message?: string;
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = verifyAuth(req, [Role.FACULTY]);
  if (!auth.ok) {
    return auth.error;
  }

  const sectionId = params.id;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON request body" },
      { status: 400 }
    );
  }

  const { csvContent, rows: jsonRows } = body || {};

  let parsedRows: AttendanceCsvRow[] = [];

  if (csvContent && typeof csvContent === "string") {
    if (csvContent.length > 2 * 1024 * 1024) {
      return NextResponse.json(
        { error: "CSV file exceeds maximum allowed size of 2MB" },
        { status: 400 }
      );
    }

    const firstLine = csvContent.split("\n")[0]?.toLowerCase() || "";
    if (
      !firstLine.includes("erp") &&
      !firstLine.includes("prn") &&
      !firstLine.includes("attendance")
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid CSV file format: Must contain valid headers (ERP No, PRN, Name, Attendance)",
          code: "INVALID_CSV_STRUCTURE",
        },
        { status: 400 }
      );
    }

    const parsed = Papa.parse(csvContent, {
      header: true,
      skipEmptyLines: true,
    });
    parsedRows = parsed.data.map((row: any) => {
      const erp =
        row["ERP No"] || row["ERP"] || row["erpNo"] || row["erp"] || "";
      const prn = row["PRN"] || row["prn"] || "";
      const name = row["Name"] || row["name"] || "";
      const attStr =
        row["Attendance%"] ||
        row["Attendance"] ||
        row["attendancePercent"] ||
        "0";
      const attPct = parseFloat(attStr.toString().replace("%", "").trim());

      return {
        erp: erp.toString().trim(),
        prn: prn.toString().trim(),
        name: name.toString().trim(),
        attendancePercent: isNaN(attPct) ? 0 : attPct,
      };
    });
  } else if (Array.isArray(jsonRows)) {
    parsedRows = jsonRows;
  } else {
    return NextResponse.json(
      { error: "Provide either csvContent string or rows array" },
      { status: 400 }
    );
  }

  try {
    const offeringSection = await prisma.subjectOfferingSection.findUnique({
      where: { id: sectionId },
      include: {
        section: {
          include: {
            students: {
              include: {
                batch: true,
              },
            },
          },
        },
        subjectOffering: {
          include: {
            academicTerm: true,
            gradingPolicy: {
              include: {
                attendanceSlabRanges: { orderBy: { minPercent: "asc" } },
              },
            },
          },
        },
      },
    });

    if (!offeringSection) {
      return NextResponse.json(
        { error: "Subject offering section not found" },
        { status: 404 }
      );
    }

    const policy = offeringSection.subjectOffering.gradingPolicy;
    if (!policy) {
      return NextResponse.json(
        {
          error:
            "Grading policy not configured for this subject offering",
        },
        { status: 400 }
      );
    }

    const offeringSem =
      offeringSection.subjectOffering.academicTerm.semesterNumber;
    const enrolledStudents = offeringSection.section.students.filter(
      (s: any) => {
        const effectiveSem =
          s.semesterOverride !== null && s.semesterOverride !== undefined
            ? s.semesterOverride
            : s.batch?.currentSemester;
        if (effectiveSem !== undefined) {
          return effectiveSem === offeringSem;
        }
        return true;
      }
    );

    const slabs: SlabRange[] = policy.attendanceSlabRanges.map((s: any) => ({
      minPercent: s.minPercent,
      maxPercent: s.maxPercent,
      marks: s.marks,
    }));

    const previewResults: PreviewRowResult[] = parsedRows.map((row) => {
      const student = enrolledStudents.find(
        (s: any) =>
          (row.erp && s.erpNo.toLowerCase() === row.erp.toLowerCase()) ||
          (row.prn && s.prn.toLowerCase() === row.prn.toLowerCase())
      );

      if (!student) {
        return {
          erp: row.erp || "",
          prn: row.prn || "",
          name: row.name || "",
          attendancePercent: row.attendancePercent,
          studentId: null,
          studentName: null,
          status: "UNMATCHED",
          marksPreview: null,
          message: "No enrolled student found with matching ERP or PRN",
        };
      }

      const marks = attendanceScore(row.attendancePercent, slabs);
      if (marks === null) {
        return {
          erp: row.erp || student.erpNo,
          prn: row.prn || student.prn,
          name: row.name || student.name,
          attendancePercent: row.attendancePercent,
          studentId: student.id,
          studentName: student.name,
          status: "BLOCKED_SLAB_GAP",
          marksPreview: null,
          message: `Attendance ${row.attendancePercent}% falls into a gap in the HOD attendance slab table. Blocked from import.`,
        };
      }

      return {
        erp: row.erp || student.erpNo,
        prn: row.prn || student.prn,
        name: row.name || student.name,
        attendancePercent: row.attendancePercent,
        studentId: student.id,
        studentName: student.name,
        status: "READY",
        marksPreview: marks,
      };
    });

    const readyCount = previewResults.filter((r) => r.status === "READY").length;
    const blockedCount = previewResults.filter(
      (r) => r.status === "BLOCKED_SLAB_GAP"
    ).length;
    const unmatchedCount = previewResults.filter(
      (r) => r.status === "UNMATCHED"
    ).length;

    const hasSlabGaps = blockedCount > 0;

    return NextResponse.json(
      {
        sectionId,
        totalRows: previewResults.length,
        canCommit: !hasSlabGaps,
        summary: {
          readyCount,
          blockedCount,
          unmatchedCount,
        },
        rows: previewResults,
      },
      { status: 200 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to preview attendance import" },
      { status: 500 }
    );
  }
}
