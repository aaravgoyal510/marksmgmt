export interface StudentCsvRow {
  erpNo: string;
  prn: string;
  name: string;
  email: string;
  section: string;
}

export interface StudentPreviewRow {
  rowIndex: number;
  erpNo: string;
  prn: string;
  name: string;
  email: string;
  sectionName: string;
  sectionId?: string;
  status: "READY" | "DUPLICATE_ERP" | "DUPLICATE_PRN" | "UNKNOWN_SECTION" | "INVALID_ROW";
  message?: string;
}

export interface CommitStudentRow {
  erpNo: string;
  prn: string;
  name: string;
  email?: string;
  sectionId: string;
  sectionName?: string;
}
