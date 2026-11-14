import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import Papa from "papaparse";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { verifyAuth, verifyUnlockedSection } from "@/lib/auth/guards";
import {
  MarksPreviewRow,
  normalizeComponentHeader,
  isErpHeader,
  isAuxiliaryHeader,
} from "@/lib/marksImport";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = verifyAuth(req, [Role.FACULTY]);
  if (!auth.ok) {
    return auth.error;
  }

  const sectionId = params.id;

  // 1. Enforce section lock via verifyUnlockedSection (423 if locked)
  const lockCheck = await verifyUnlockedSection(sectionId);
  if (!lockCheck.ok) {
    return lockCheck.error;
  }
  const verifiedSection = lockCheck.section;

  // 2. Strict Section Teaching Faculty Ownership Enforcement
  if (verifiedSection.facultyId !== auth.user.facultyId) {
    return NextResponse.json(
      {
        error:
          "Forbidden: Marks import is restricted to the assigned teaching faculty for this section.",
        code: "TEACHING_FACULTY_ONLY",
      },
      { status: 403 }
    );
  }

  try {
    const offeringSection = await prisma.subjectOfferingSection.findUnique({
      where: { id: sectionId },
      include: {
        subjectOffering: {
          include: {
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
    if (!policy || !policy.confirmedAt) {
      return NextResponse.json(
        {
          error:
            "Section is locked: HOD has not confirmed the grading policy for this subject offering.",
          code: "SECTION_LOCKED_POLICY_UNCONFIRMED",
        },
        { status: 423 }
      );
    }

    const components = policy.scoreComponents || [];
    if (components.length === 0) {
      return NextResponse.json(
        { error: "Grading policy has no configured score components", code: "NO_COMPONENTS" },
        { status: 400 }
      );
    }

    // Parse incoming data: support multipart/form-data or JSON (csvContent, fileBase64, rows)
    let parsedRows: Record<string, any>[] = [];
    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      if (!file) {
        return NextResponse.json(
          { error: "No file provided in form-data", code: "MISSING_FILE" },
          { status: 400 }
        );
      }

      const fileName = file.name.toLowerCase();
      const buffer = Buffer.from(await file.arrayBuffer());

      if (buffer.length > 5 * 1024 * 1024) {
        return NextResponse.json(
          { error: "File exceeds maximum allowed size of 5MB", code: "FILE_TOO_LARGE" },
          { status: 400 }
        );
      }

      if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer as any);
        const worksheet = workbook.worksheets[0];
        if (!worksheet) {
          return NextResponse.json(
            { error: "Excel file has no worksheets", code: "EMPTY_FILE" },
            { status: 400 }
          );
        }

        const headers: string[] = [];
        worksheet.eachRow((row, rowNumber) => {
          if (rowNumber === 1) {
            row.eachCell((cell, colNumber) => {
              headers[colNumber] = cell.value ? String(cell.value).trim() : "";
            });
          } else {
            const rowData: Record<string, any> = {};
            row.eachCell((cell, colNumber) => {
              const h = headers[colNumber];
              if (h) {
                let val = cell.value;
                if (val && typeof val === "object" && "result" in val) {
                  val = (val as any).result;
                }
                rowData[h] = val;
              }
            });
            if (Object.keys(rowData).length > 0) {
              parsedRows.push(rowData);
            }
          }
        });
      } else {
        // Assume CSV
        const csvText = buffer.toString("utf-8");
        const parsed = Papa.parse<Record<string, any>>(csvText, {
          header: true,
          skipEmptyLines: true,
        });
        parsedRows = parsed.data || [];
      }
    } else {
      let body: any;
      try {
        body = await req.json();
      } catch {
        return NextResponse.json(
          { error: "Invalid JSON request body" },
          { status: 400 }
        );
      }

      const { csvContent, fileBase64, fileName = "", rows: jsonRows } = body || {};

      if (Array.isArray(jsonRows)) {
        parsedRows = jsonRows;
      } else if (fileBase64 && typeof fileBase64 === "string") {
        const buffer = Buffer.from(fileBase64, "base64");
        if (fileName.toLowerCase().endsWith(".xlsx") || fileName.toLowerCase().endsWith(".xls")) {
          const workbook = new ExcelJS.Workbook();
          await workbook.xlsx.load(buffer as any);
          const worksheet = workbook.worksheets[0];
          if (!worksheet) {
            return NextResponse.json(
              { error: "Excel file has no worksheets", code: "EMPTY_FILE" },
              { status: 400 }
            );
          }
          const headers: string[] = [];
          worksheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) {
              row.eachCell((cell, colNumber) => {
                headers[colNumber] = cell.value ? String(cell.value).trim() : "";
              });
            } else {
              const rowData: Record<string, any> = {};
              row.eachCell((cell, colNumber) => {
                const h = headers[colNumber];
                if (h) {
                  let val = cell.value;
                  if (val && typeof val === "object" && "result" in val) {
                    val = (val as any).result;
                  }
                  rowData[h] = val;
                }
              });
              if (Object.keys(rowData).length > 0) {
                parsedRows.push(rowData);
              }
            }
          });
        } else {
          const csvText = buffer.toString("utf-8");
          const parsed = Papa.parse<Record<string, any>>(csvText, {
            header: true,
            skipEmptyLines: true,
          });
          parsedRows = parsed.data || [];
        }
      } else if (csvContent && typeof csvContent === "string") {
        const parsed = Papa.parse<Record<string, any>>(csvContent, {
          header: true,
          skipEmptyLines: true,
        });
        parsedRows = parsed.data || [];
      } else {
        return NextResponse.json(
          {
            error: "Provide csvContent, fileBase64, or rows array in request body",
            code: "MISSING_PAYLOAD",
          },
          { status: 400 }
        );
      }
    }

    if (parsedRows.length === 0) {
      return NextResponse.json(
        { error: "Uploaded file contains no data rows", code: "EMPTY_ROWS" },
        { status: 400 }
      );
    }

    // Inspect headers from the first row
    const rawHeaders = Object.keys(parsedRows[0] || {});
    let erpHeaderKey: string | null = null;
    const headerToComponentMap = new Map<string, typeof components[0]>();

    for (const rawHeader of rawHeaders) {
      const clean = rawHeader.trim();
      if (!clean) continue;

      if (isErpHeader(clean)) {
        erpHeaderKey = rawHeader;
        continue;
      }

      if (isAuxiliaryHeader(clean)) {
        continue;
      }

      const normalized = normalizeComponentHeader(clean);
      const matchedComp = components.find(
        (c) => normalizeComponentHeader(c.name) === normalized
      );

      if (matchedComp) {
        headerToComponentMap.set(rawHeader, matchedComp);
      } else {
        // Unknown header -> reject with clear error as per spec amendment
        return NextResponse.json(
          {
            error: `Unknown column header: "${rawHeader}". Allowed component headers are: ${components.map((c) => c.name).join(", ")}`,
            code: "UNKNOWN_HEADER",
            header: rawHeader,
            allowedHeaders: ["ERP No", ...components.map((c) => c.name)],
          },
          { status: 400 }
        );
      }
    }

    if (!erpHeaderKey) {
      return NextResponse.json(
        {
          error: "Required column 'ERP No' was not found in the uploaded file",
          code: "MISSING_ERP_COLUMN",
        },
        { status: 400 }
      );
    }

    // Filter enrolled students by offering semester
    const offeringSem = offeringSection.subjectOffering.academicTerm.semesterNumber;
    const allStudents = offeringSection.section.students || [];
    const enrolledStudents = allStudents.filter((s: any) => {
      const effectiveSem =
        s.semesterOverride !== null && s.semesterOverride !== undefined
          ? s.semesterOverride
          : s.batch?.currentSemester;
      if (effectiveSem !== undefined && offeringSem !== undefined) {
        return effectiveSem === offeringSem;
      }
      return true;
    });

    const studentsByErp = new Map<string, typeof enrolledStudents[0]>();
    for (const st of enrolledStudents) {
      studentsByErp.set(st.erpNo.trim().toLowerCase(), st);
    }

    // Process each row
    const previewRows: MarksPreviewRow[] = [];

    for (const row of parsedRows) {
      const rawErp = row[erpHeaderKey];
      const erpStr = rawErp ? String(rawErp).trim() : "";

      // Check if row is completely empty
      const isCompletelyEmpty = rawHeaders.every((h) => {
        const val = row[h];
        return val === undefined || val === null || String(val).trim() === "";
      });
      if (isCompletelyEmpty) {
        continue;
      }

      if (!erpStr) {
        previewRows.push({
          erp: "",
          studentName: "Unknown",
          studentId: null,
          marks: {},
          status: "UNMATCHED",
          message: "Missing ERP number for this row",
        });
        continue;
      }

      const matchedStudent = studentsByErp.get(erpStr.toLowerCase());

      if (!matchedStudent) {
        previewRows.push({
          erp: erpStr,
          studentName: row["Name"] || row["Student Name"] || "Unmatched Student",
          studentId: null,
          marks: {},
          status: "UNMATCHED",
          message: `Student with ERP '${erpStr}' is not enrolled in this section.`,
        });
        continue;
      }

      // Matched student found: check component marks
      let hasAnyMark = false;
      let hasInvalidMark = false;
      const rowMarks: Record<string, number | null> = {};
      const invalidReasons: string[] = [];

      headerToComponentMap.forEach((comp, header) => {
        const rawVal = row[header];

        if (rawVal === undefined || rawVal === null || String(rawVal).trim() === "") {
          rowMarks[comp.id] = null;
        } else {
          const num = Number(rawVal);
          if (isNaN(num) || num < 0 || num > comp.maxMarks) {
            hasInvalidMark = true;
            invalidReasons.push(
              `${comp.name}: ${rawVal} (valid range: 0..${comp.maxMarks})`
            );
            rowMarks[comp.id] = isNaN(num) ? null : num;
          } else {
            hasAnyMark = true;
            rowMarks[comp.id] = num;
          }
        }
      });

      let status: MarksPreviewRow["status"] = "READY";
      let message = "Ready to import";

      if (hasInvalidMark) {
        status = "OUT_OF_BOUNDS";
        message = `Marks outside valid bounds: ${invalidReasons.join("; ")}`;
      } else if (!hasAnyMark) {
        status = "BLANK";
        message = "All component marks are empty (row will be skipped)";
      }

      previewRows.push({
        erp: matchedStudent.erpNo,
        studentName: matchedStudent.name,
        studentId: matchedStudent.id,
        marks: rowMarks,
        status,
        message,
        invalidComponents: invalidReasons,
      });
    }

    const readyCount = previewRows.filter((r) => r.status === "READY").length;
    const unmatchedCount = previewRows.filter((r) => r.status === "UNMATCHED").length;
    const outOfBoundsCount = previewRows.filter((r) => r.status === "OUT_OF_BOUNDS").length;
    const blankCount = previewRows.filter((r) => r.status === "BLANK").length;
    const canCommit = unmatchedCount === 0 && outOfBoundsCount === 0 && readyCount > 0;

    return NextResponse.json(
      {
        totalRows: previewRows.length,
        readyCount,
        unmatchedCount,
        outOfBoundsCount,
        blankCount,
        canCommit,
        components: components.map((c) => ({
          id: c.id,
          name: c.name,
          maxMarks: c.maxMarks,
          group: c.group,
        })),
        rows: previewRows,
      },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to preview marks file" },
      { status: 500 }
    );
  }
}
