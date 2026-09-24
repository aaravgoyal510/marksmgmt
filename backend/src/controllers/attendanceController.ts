import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import Papa from "papaparse";
import { attendanceScore, SlabRange } from "../services/gradingEngine";

const prisma = new PrismaClient();

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

// -----------------------------------------------------------------------------
// 1. Dry-Run Attendance Import Preview
// -----------------------------------------------------------------------------
export async function previewAttendanceImport(req: Request, res: Response) {
  const sectionId = req.params.id as string;
  const { csvContent, rows: jsonRows } = req.body;

  let parsedRows: AttendanceCsvRow[] = [];

  if (csvContent && typeof csvContent === "string") {
    if (csvContent.length > 2 * 1024 * 1024) {
      return res.status(400).json({ error: "CSV file exceeds maximum allowed size of 2MB" });
    }

    const firstLine = csvContent.split("\n")[0]?.toLowerCase() || "";
    if (!firstLine.includes("erp") && !firstLine.includes("prn") && !firstLine.includes("attendance")) {
      return res.status(400).json({
        error: "Invalid CSV file format: Must contain valid headers (ERP No, PRN, Name, Attendance)",
        code: "INVALID_CSV_STRUCTURE",
      });
    }

    const parsed = Papa.parse(csvContent, { header: true, skipEmptyLines: true });
    parsedRows = parsed.data.map((row: any) => {
      const erp = row["ERP No"] || row["ERP"] || row["erpNo"] || row["erp"] || "";
      const prn = row["PRN"] || row["prn"] || "";
      const name = row["Name"] || row["name"] || "";
      const attStr = row["Attendance%"] || row["Attendance"] || row["attendancePercent"] || "0";
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
    return res.status(400).json({ error: "Provide either csvContent string or rows array" });
  }

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
    return res.status(404).json({ error: "Subject offering section not found" });
  }

  const policy = offeringSection.subjectOffering.gradingPolicy;
  if (!policy) {
    return res.status(400).json({ error: "Grading policy not configured for this subject offering" });
  }

  const offeringSem = offeringSection.subjectOffering.academicTerm.semesterNumber;
  const enrolledStudents = offeringSection.section.students.filter((s: any) => {
    const effectiveSem = s.semesterOverride !== null && s.semesterOverride !== undefined
      ? s.semesterOverride
      : s.batch?.currentSemester;
    if (effectiveSem !== undefined) {
      return effectiveSem === offeringSem;
    }
    return true;
  });
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
  const blockedCount = previewResults.filter((r) => r.status === "BLOCKED_SLAB_GAP").length;
  const unmatchedCount = previewResults.filter((r) => r.status === "UNMATCHED").length;

  return res.status(200).json({
    sectionId,
    totalRows: previewResults.length,
    summary: {
      readyCount,
      blockedCount,
      unmatchedCount,
    },
    rows: previewResults,
  });
}

// -----------------------------------------------------------------------------
// 2. Commit Attendance Import (Overwrite Latest Snapshot)
// -----------------------------------------------------------------------------
export async function commitAttendanceImport(req: Request, res: Response) {
  const sectionId = req.params.id as string;
  const { entries } = req.body;

  if (!Array.isArray(entries) || entries.length === 0) {
    return res.status(400).json({ error: "entries array is required and cannot be empty" });
  }

  const offeringSection = await prisma.subjectOfferingSection.findUnique({
    where: { id: sectionId },
    include: {
      subjectOffering: {
        include: {
          gradingPolicy: {
            include: {
              attendanceSlabRanges: true,
            },
          },
        },
      },
    },
  });

  if (!offeringSection) {
    return res.status(404).json({ error: "Subject offering section not found" });
  }

  // Strict Section Teaching Faculty Ownership Enforcement
  const facultyId = req.user?.facultyId;
  if (!facultyId || offeringSection.facultyId !== facultyId) {
    return res.status(403).json({
      error: "Forbidden: Attendance import is restricted to the assigned teaching faculty for this section.",
      code: "TEACHING_FACULTY_ONLY",
    });
  }

  const policy = offeringSection.subjectOffering.gradingPolicy;
  if (!policy) {
    return res.status(400).json({ error: "Grading policy not configured for this section" });
  }

  const slabs: SlabRange[] = policy.attendanceSlabRanges.map((s: any) => ({
    minPercent: s.minPercent,
    maxPercent: s.maxPercent,
    marks: s.marks,
  }));

  const committedRecords = await prisma.$transaction(async (tx) => {
    const results = [];

    for (const entry of entries) {
      const { studentId, attendancePercent } = entry;

      if (!studentId || attendancePercent === undefined) continue;

      const marks = attendanceScore(attendancePercent, slabs);
      if (marks === null) {
        throw new Error(
          `Cannot commit row for studentId ${studentId}: attendance ${attendancePercent}% falls into an HOD slab gap.`
        );
      }

      const record = await tx.attendanceRecord.upsert({
        where: {
          subjectOfferingSectionId_studentId: {
            subjectOfferingSectionId: sectionId,
            studentId,
          },
        },
        update: {
          attendancePercent,
        },
        create: {
          subjectOfferingSectionId: sectionId,
          studentId,
          attendancePercent,
        },
      });

      results.push(record);
    }

    return results;
  });

  return res.status(200).json({
    message: "Attendance records committed successfully (latest snapshot overwritten)",
    committedCount: committedRecords.length,
  });
}
