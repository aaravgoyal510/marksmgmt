import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import Papa from "papaparse";
import { prisma } from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth/guards";
import { StudentCsvRow, StudentPreviewRow } from "@/lib/studentImport";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = verifyAuth(req, [Role.ADMIN]);
  if (!auth.ok) {
    return auth.error;
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON request body" }, { status: 400 });
  }

  const { csvContent, rows: jsonRows, batchId } = body || {};

  if (!batchId) {
    return NextResponse.json(
      { error: "batchId is required to preview student onboarding" },
      { status: 400 }
    );
  }

  try {
    const batch = await prisma.batch.findUnique({
      where: { id: String(batchId) },
      include: {
        department: true,
        sections: true,
      },
    });

    if (!batch) {
      return NextResponse.json(
        { error: `Selected batch '${batchId}' does not exist` },
        { status: 400 }
      );
    }

    let parsedRows: StudentCsvRow[] = [];

    if (csvContent && typeof csvContent === "string") {
      if (csvContent.length > 3 * 1024 * 1024) {
        return NextResponse.json(
          { error: "CSV file exceeds maximum allowed limit of 3MB" },
          { status: 400 }
        );
      }

      const parsed = Papa.parse(csvContent, {
        header: true,
        skipEmptyLines: "greedy",
      });

      parsedRows = parsed.data.map((row: any) => {
        const erp = row["ERP No"] || row["ERP"] || row["erpNo"] || row["erp"] || "";
        const prn = row["PRN"] || row["prn"] || "";
        const name = row["Name"] || row["name"] || "";
        const email = row["Email"] || row["email"] || "";
        const section = row["Section"] || row["section"] || "";

        return {
          erpNo: erp.toString().trim(),
          prn: prn.toString().trim(),
          name: name.toString().trim(),
          email: email.toString().trim(),
          section: section.toString().trim(),
        };
      });
    } else if (Array.isArray(jsonRows)) {
      parsedRows = jsonRows.map((r: any) => ({
        erpNo: String(r.erpNo || r["ERP No"] || "").trim(),
        prn: String(r.prn || r["PRN"] || "").trim(),
        name: String(r.name || r["Name"] || "").trim(),
        email: String(r.email || r["Email"] || "").trim(),
        section: String(r.section || r["Section"] || "").trim(),
      }));
    } else {
      return NextResponse.json(
        { error: "Provide either csvContent string or rows array" },
        { status: 400 }
      );
    }

    if (parsedRows.length === 0) {
      return NextResponse.json(
        { error: "CSV does not contain any student records" },
        { status: 400 }
      );
    }

    // Pre-fetch all existing users & student profiles for conflict checking
    const existingUsers = await prisma.user.findMany({
      where: { username: { in: parsedRows.map((r) => r.erpNo).filter(Boolean) } },
      select: { username: true },
    });
    const existingUserSet = new Set(existingUsers.map((u) => u.username.toLowerCase()));

    const existingStudentErps = await prisma.studentProfile.findMany({
      where: { erpNo: { in: parsedRows.map((r) => r.erpNo).filter(Boolean) } },
      select: { erpNo: true },
    });
    const existingErpSet = new Set(existingStudentErps.map((s) => s.erpNo.toLowerCase()));

    const existingStudentPrns = await prisma.studentProfile.findMany({
      where: { prn: { in: parsedRows.map((r) => r.prn).filter(Boolean) } },
      select: { prn: true },
    });
    const existingPrnSet = new Set(existingStudentPrns.map((s) => s.prn.toLowerCase()));

    // Create Section lookup map (case-insensitive name match)
    const sectionMap = new Map<string, any>();
    for (const sec of batch.sections) {
      sectionMap.set(sec.name.toLowerCase().trim(), sec);
    }

    // Track duplicates inside the file itself
    const seenFileErps = new Set<string>();
    const seenFilePrns = new Set<string>();

    const previewResults: StudentPreviewRow[] = [];

    for (let i = 0; i < parsedRows.length; i++) {
      const row = parsedRows[i];
      const rowIndex = i + 1;

      // 1. Missing mandatory fields check
      if (!row.erpNo || !row.prn || !row.name || !row.section) {
        previewResults.push({
          rowIndex,
          erpNo: row.erpNo,
          prn: row.prn,
          name: row.name,
          email: row.email,
          sectionName: row.section,
          status: "INVALID_ROW",
          message: "Missing mandatory fields (ERP No, PRN, Name, and Section are required)",
        });
        continue;
      }

      const lowerErp = row.erpNo.toLowerCase();
      const lowerPrn = row.prn.toLowerCase();
      const lowerSec = row.section.toLowerCase();

      // 2. Section check
      const matchedSection = sectionMap.get(lowerSec);
      if (!matchedSection) {
        previewResults.push({
          rowIndex,
          erpNo: row.erpNo,
          prn: row.prn,
          name: row.name,
          email: row.email,
          sectionName: row.section,
          status: "UNKNOWN_SECTION",
          message: `Section '${row.section}' does not exist in batch '${batch.label}' (Available: ${batch.sections.map((s) => s.name).join(", ")})`,
        });
        continue;
      }

      // 3. Duplicate within CSV check
      if (seenFileErps.has(lowerErp)) {
        previewResults.push({
          rowIndex,
          erpNo: row.erpNo,
          prn: row.prn,
          name: row.name,
          email: row.email,
          sectionName: row.section,
          sectionId: matchedSection.id,
          status: "DUPLICATE_ERP",
          message: `Duplicate ERP No '${row.erpNo}' appears multiple times within CSV`,
        });
        continue;
      }
      seenFileErps.add(lowerErp);

      if (seenFilePrns.has(lowerPrn)) {
        previewResults.push({
          rowIndex,
          erpNo: row.erpNo,
          prn: row.prn,
          name: row.name,
          email: row.email,
          sectionName: row.section,
          sectionId: matchedSection.id,
          status: "DUPLICATE_PRN",
          message: `Duplicate PRN '${row.prn}' appears multiple times within CSV`,
        });
        continue;
      }
      seenFilePrns.add(lowerPrn);

      // 4. Existing in DB check
      if (existingUserSet.has(lowerErp) || existingErpSet.has(lowerErp)) {
        previewResults.push({
          rowIndex,
          erpNo: row.erpNo,
          prn: row.prn,
          name: row.name,
          email: row.email,
          sectionName: row.section,
          sectionId: matchedSection.id,
          status: "DUPLICATE_ERP",
          message: `ERP No '${row.erpNo}' is already registered in the system`,
        });
        continue;
      }

      if (existingPrnSet.has(lowerPrn)) {
        previewResults.push({
          rowIndex,
          erpNo: row.erpNo,
          prn: row.prn,
          name: row.name,
          email: row.email,
          sectionName: row.section,
          sectionId: matchedSection.id,
          status: "DUPLICATE_PRN",
          message: `PRN '${row.prn}' is already registered in the system`,
        });
        continue;
      }

      // 5. Ready row
      previewResults.push({
        rowIndex,
        erpNo: row.erpNo,
        prn: row.prn,
        name: row.name,
        email: row.email || `${row.erpNo.toLowerCase()}@bvimr.edu.in`,
        sectionName: matchedSection.name,
        sectionId: matchedSection.id,
        status: "READY",
      });
    }

    const readyCount = previewResults.filter((r) => r.status === "READY").length;
    const duplicateCount = previewResults.filter(
      (r) => r.status === "DUPLICATE_ERP" || r.status === "DUPLICATE_PRN"
    ).length;
    const unknownSectionCount = previewResults.filter(
      (r) => r.status === "UNKNOWN_SECTION"
    ).length;
    const invalidCount = previewResults.filter((r) => r.status === "INVALID_ROW").length;

    const blockingErrorsCount = duplicateCount + unknownSectionCount + invalidCount;
    const canCommit = readyCount > 0 && blockingErrorsCount === 0;

    return NextResponse.json(
      {
        batchId,
        batchLabel: batch.label,
        departmentName: batch.department.name,
        totalRows: previewResults.length,
        canCommit,
        summary: {
          readyCount,
          duplicateCount,
          unknownSectionCount,
          invalidCount,
          blockingErrorsCount,
        },
        rows: previewResults,
      },
      { status: 200 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to preview student CSV import" },
      { status: 500 }
    );
  }
}

