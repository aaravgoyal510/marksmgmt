export interface MarksPreviewRow {
  erp: string;
  studentName: string;
  studentId: string | null;
  marks: Record<string, number | null>; // componentId -> mark obtained
  status: "READY" | "UNMATCHED" | "OUT_OF_BOUNDS" | "BLANK";
  message?: string;
  invalidComponents?: string[];
}

export function normalizeComponentHeader(header: string): string {
  // Strips trailing parentheses containing numbers and optional marks indicator:
  // e.g., "Assignment 1 (20M)", "Assignment 1 (20 Marks)", "Assignment 1 (20)", " (10m)"
  return header
    .replace(/\s*\(\s*\d+(\.\d+)?\s*(m|marks|mark)?\s*\)\s*$/i, "")
    .trim()
    .toLowerCase();
}

export function isErpHeader(h: string): boolean {
  const clean = h.trim().toLowerCase();
  return (
    /^(erp(\s*no\.?|\s*number)?)$/i.test(clean) ||
    ["erp", "erpno", "erp no", "erp no.", "enrollment", "enrollment no", "roll no"].includes(clean)
  );
}

export function isAuxiliaryHeader(h: string): boolean {
  const clean = h.trim().toLowerCase();
  return (
    /^(prn)$/i.test(clean) ||
    /^(name|student\s*name)$/i.test(clean)
  );
}
