"use client";

import { useEffect, useState } from "react";
import ExcelJS from "exceljs";
import { fetchApi } from "@/lib/api";
import HeaderNav from "@/components/HeaderNav";
import {
  Building,
  GraduationCap,
  UserPlus,
  ArrowUpRight,
  CheckCircle,
  Lock,
  RefreshCw,
  UserCheck,
  Plus,
  Upload,
  Download,
  Search,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  FileSpreadsheet,
  X,
  CheckCircle2,
  Archive,
  ShieldCheck,
  History,
  Filter,
} from "lucide-react";
import Toast, { ToastMessage } from "@/components/Toast";

export default function AdminDashboard() {
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    fetchApi("/auth/me")
      .then((res) => {
        if (res.authenticated && res.user?.role === "ADMIN") {
          setAuthorized(true);
        } else {
          window.location.href = "/";
        }
      })
      .catch(() => {
        window.location.href = "/";
      });
  }, []);

  const [activeTab, setActiveTab] = useState<"structure" | "students" | "faculty" | "reports" | "audit">("structure");
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const [departments, setDepartments] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [facultyList, setFacultyList] = useState<any[]>([]);

  // Consolidated Reports & History State
  const [reportTerms, setReportTerms] = useState<any[]>([]);
  const [reportOfferings, setReportOfferings] = useState<any[]>([]);
  const [reportDeptFilter, setReportDeptFilter] = useState<string>("");
  const [reportTermFilter, setReportTermFilter] = useState<string>("");
  const [loadingReports, setLoadingReports] = useState(false);

  // Faculty Search & Pagination State
  const [facultySearch, setFacultySearch] = useState("");
  const [facultyPage, setFacultyPage] = useState(1);
  const [facultyPageSize, setFacultyPageSize] = useState(10);

  // Audit Logs State
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [auditEntityType, setAuditEntityType] = useState("");
  const [auditSearch, setAuditSearch] = useState("");
  const [auditPage, setAuditPage] = useState(1);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditTotalPages, setAuditTotalPages] = useState(1);

  // Department Form
  const [deptName, setDeptName] = useState("");
  const [deptSems, setDeptSems] = useState(6);

  // Batch Creation Form
  const [selectedDeptId, setSelectedDeptId] = useState("");
  const [batchLabel, setBatchLabel] = useState("");
  const [startYear, setStartYear] = useState(new Date().getFullYear());

  // Faculty Onboarding Form
  const [facName, setFacName] = useState("");
  const [facEmpId, setFacEmpId] = useState("");
  const [facEmail, setFacEmail] = useState("");
  const [isHod, setIsHod] = useState(false);
  const [hodDeptId, setHodDeptId] = useState("");

  const [createdCreds, setCreatedCreds] = useState<{ username: string; passwordPlain: string } | null>(null);
  const [promotionMessage, setPromotionMessage] = useState<string | null>(null);

  // Modals
  const [studentOverrideModal, setStudentOverrideModal] = useState<{ open: boolean; studentId: string; studentName: string; maxSems: number; currentOverride: number | null } | null>(null);
  const [overrideVal, setOverrideVal] = useState<string>("");

  const [promoteModal, setPromoteModal] = useState<{
    open: boolean;
    batchId: string;
    batchLabel: string;
    preview: any | null;
    loading: boolean;
  } | null>(null);
  const [typedConfirmLabel, setTypedConfirmLabel] = useState("");
  const [executingPromote, setExecutingPromote] = useState(false);

  const [hodPromoteModal, setHodPromoteModal] = useState<{ open: boolean; facultyId: string; facultyName: string } | null>(null);
  const [targetDeptId, setTargetDeptId] = useState<string>("");

  // Student Search & Pagination State
  const [studentSearch, setStudentSearch] = useState("");
  const [studentPage, setStudentPage] = useState(1);
  const [studentPageSize, setStudentPageSize] = useState(10);

  // Single Student Onboarding Form State
  const [addStudentModalOpen, setAddStudentModalOpen] = useState(false);
  const [newStudentName, setNewStudentName] = useState("");
  const [newStudentErp, setNewStudentErp] = useState("");
  const [newStudentPrn, setNewStudentPrn] = useState("");
  const [newStudentEmail, setNewStudentEmail] = useState("");
  const [newStudentBatchId, setNewStudentBatchId] = useState("");
  const [newStudentSectionId, setNewStudentSectionId] = useState("");
  const [newStudentSubmitting, setNewStudentSubmitting] = useState(false);

  // Bulk CSV Import State
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importBatchId, setImportBatchId] = useState("");
  const [importCsvText, setImportCsvText] = useState("");
  const [importPreviewData, setImportPreviewData] = useState<any | null>(null);
  const [importingPreview, setImportingPreview] = useState(false);
  const [importingCommit, setImportingCommit] = useState(false);

  // Bulk Credentials Export Modal State
  const [studentCredsModal, setStudentCredsModal] = useState<{
    open: boolean;
    credentials: any[];
    title: string;
    batchLabel?: string;
  } | null>(null);

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    await Promise.all([loadDepartments(), loadStudents(), loadFaculty()]);
  };

  const loadDepartments = async () => {
    try {
      const res = await fetchApi("/admin/departments");
      const depts = res.departments || [];
      setDepartments(depts);
      if (depts.length > 0 && !selectedDeptId) {
        setSelectedDeptId(depts[0].id);
        setTargetDeptId(depts[0].id);
      }

      const allBatches = depts.flatMap((d: any) =>
        (d.batches || []).map((b: any) => ({
          ...b,
          department: d,
        }))
      );
      setBatches(allBatches);
    } catch (err) {
      console.error(err);
    }
  };

  const loadStudents = async () => {
    try {
      const res = await fetchApi("/admin/students");
      setStudents(res.students || []);
    } catch (err) {
      console.error(err);
    }
  };

  const loadFaculty = async () => {
    try {
      const res = await fetchApi("/admin/faculty");
      setFacultyList(res.faculty || []);
    } catch (err) {
      console.error(err);
    }
  };

  const loadAdminReportsHistory = async (deptId?: string, termId?: string) => {
    setLoadingReports(true);
    try {
      const params = new URLSearchParams();
      if (deptId) params.set("departmentId", deptId);
      if (termId) params.set("academicTermId", termId);
      const res = await fetchApi(`/reports/history?${params.toString()}`);
      setReportTerms(res.terms || []);
      setReportOfferings(res.offerings || []);
    } catch (err) {
      console.error("Failed to load admin reports", err);
    } finally {
      setLoadingReports(false);
    }
  };

  const loadAuditLogs = async (page = 1, entityType = auditEntityType, search = auditSearch) => {
    setLoadingAudit(true);
    try {
      const q = new URLSearchParams();
      q.set("page", String(page));
      q.set("limit", "25");
      if (entityType) q.set("entityType", entityType);
      if (search) q.set("search", search);
      const res = await fetchApi(`/admin/audit-logs?${q.toString()}`);
      setAuditLogs(res.logs || []);
      setAuditTotal(res.total || 0);
      setAuditPage(res.page || 1);
      setAuditTotalPages(res.totalPages || 1);
    } catch (err: any) {
      console.error("Failed to load audit logs", err);
      setToast({ type: "error", message: err.data?.error || "Failed to load audit logs" });
    } finally {
      setLoadingAudit(false);
    }
  };

  const selectedDepartmentObj = departments.find((d) => d.id === selectedDeptId);

  const handleCreateDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await fetchApi("/admin/departments", {
        method: "POST",
        body: JSON.stringify({ name: deptName, totalSemesters: Number(deptSems) }),
      });
      alert(`Department ${deptName} created successfully!`);
      setDeptName("");
      loadAllData();
    } catch (err: any) {
      alert(err.data?.error || "Failed to create department");
    }
  };

  const handleCreateBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDeptId) return alert("Select a department");
    try {
      await fetchApi("/admin/batches", {
        method: "POST",
        body: JSON.stringify({
          departmentId: selectedDeptId,
          label: batchLabel,
          startYear: Number(startYear),
        }),
      });
      alert(`Batch ${batchLabel} created successfully!`);
      setBatchLabel("");
      loadAllData();
    } catch (err: any) {
      alert(err.data?.error || "Failed to create batch");
    }
  };

  const handleOpenPromoteModal = async (batchId: string, label: string) => {
    setPromoteModal({
      open: true,
      batchId,
      batchLabel: label,
      preview: null,
      loading: true,
    });
    setTypedConfirmLabel("");
    try {
      const preview = await fetchApi(`/admin/batches/${batchId}/promote/preview`);
      setPromoteModal((prev) => (prev ? { ...prev, preview, loading: false } : null));
    } catch (err: any) {
      alert(err.data?.error || "Failed to load promotion preview");
      setPromoteModal(null);
    }
  };

  const handleExecutePromote = async () => {
    if (!promoteModal || !promoteModal.preview) return;
    if (typedConfirmLabel.trim() !== promoteModal.batchLabel.trim()) {
      alert(`Please type "${promoteModal.batchLabel}" exactly to confirm promotion.`);
      return;
    }

    setExecutingPromote(true);
    try {
      const res = await fetchApi(`/admin/batches/${promoteModal.batchId}/promote`, {
        method: "POST",
      });
      setToast({
        type: "success",
        message: `Batch ${promoteModal.batchLabel} successfully promoted to Semester ${res.batch.currentSemester}!`,
      });
      setPromoteModal(null);
      loadAllData();
    } catch (err: any) {
      setToast({
        type: "error",
        message: err.data?.error || "Failed to promote batch",
      });
    } finally {
      setExecutingPromote(false);
    }
  };

  const handleToggleUserStatus = async (userId: string, currentStatus: boolean, userName: string) => {
    const action = currentStatus ? "deactivate" : "reactivate";
    const msg = currentStatus
      ? `Are you sure you want to deactivate ${userName}? They will be blocked from logging in or refreshing sessions.`
      : `Reactivate account for ${userName}?`;
    if (!confirm(msg)) return;

    try {
      const res = await fetchApi(`/admin/users/${userId}/${action}`, {
        method: "POST",
      });
      setToast({ type: "success", message: res.message || `User account ${action}d successfully.` });
      await Promise.all([loadStudents(), loadFaculty()]);
    } catch (err: any) {
      setToast({ type: "error", message: err.data?.error || `Failed to ${action} user` });
    }
  };

  const handleAddSectionToBatch = async (batchId: string, batchLabel: string) => {
    const sectionName = prompt(`Enter new section name for Batch ${batchLabel} (e.g. "AFT" or "B"):`);
    if (!sectionName || !sectionName.trim()) return;

    try {
      const res = await fetchApi(`/admin/batches/${batchId}/sections`, {
        method: "POST",
        body: JSON.stringify({ name: sectionName.trim() }),
      });
      alert(res.message);
      loadAllData();
    } catch (err: any) {
      alert(err.data?.error || "Failed to add section to batch");
    }
  };

  const handleOnboardFaculty = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetchApi("/admin/faculty", {
        method: "POST",
        body: JSON.stringify({
          name: facName,
          employeeId: facEmpId,
          email: facEmail,
          isHOD: isHod,
          hodDepartmentId: isHod ? hodDeptId : undefined,
        }),
      });

      setCreatedCreds(res.credentials);
      alert("Faculty onboarded successfully!");
      setFacName("");
      setFacEmpId("");
      setFacEmail("");
      setIsHod(false);
      loadAllData();
    } catch (err: any) {
      alert(err.data?.error || "Failed to onboard faculty");
    }
  };

  const handleSaveStudentOverride = async () => {
    if (!studentOverrideModal) return;
    const numVal = overrideVal ? Number(overrideVal) : null;

    try {
      const res = await fetchApi(`/admin/students/${studentOverrideModal.studentId}/semester-override`, {
        method: "PUT",
        body: JSON.stringify({ semesterOverride: numVal }),
      });
      alert(res.message);
      setStudentOverrideModal(null);
      loadStudents();
    } catch (err: any) {
      alert(err.data?.error || "Failed to set semester override");
    }
  };

  // Download Student Credentials Excel Sheet
  const downloadStudentCredentialsExcel = async (credentials: any[], label: string) => {
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Student Credentials");
      worksheet.columns = [
        { header: "ERP No (Username)", key: "username", width: 22 },
        { header: "Permanent Reg. No (PRN)", key: "prn", width: 22 },
        { header: "Student Name", key: "name", width: 26 },
        { header: "Institutional Email", key: "email", width: 30 },
        { header: "Section", key: "section", width: 14 },
        { header: "Initial Password", key: "passwordPlain", width: 24 },
      ];

      for (const c of credentials) {
        worksheet.addRow({
          username: c.username || c.erpNo,
          prn: c.prn,
          name: c.name,
          email: c.email || `${(c.username || c.erpNo).toLowerCase()}@bvimr.edu.in`,
          section: c.section || c.sectionName || "",
          passwordPlain: c.passwordPlain,
        });
      }

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `BVIMR_Student_Credentials_${label.replace(/\s+/g, "_")}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to generate Excel sheet", err);
      alert("Failed to generate credentials Excel file.");
    }
  };

  const handleCreateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setNewStudentSubmitting(true);
    try {
      const res = await fetchApi("/admin/students", {
        method: "POST",
        body: JSON.stringify({
          erpNo: newStudentErp,
          prn: newStudentPrn,
          name: newStudentName,
          email: newStudentEmail,
          batchId: newStudentBatchId,
          sectionId: newStudentSectionId,
        }),
      });

      setAddStudentModalOpen(false);
      setNewStudentName("");
      setNewStudentErp("");
      setNewStudentPrn("");
      setNewStudentEmail("");
      setNewStudentBatchId("");
      setNewStudentSectionId("");

      await loadStudents();

      setStudentCredsModal({
        open: true,
        title: "Student Onboarded Successfully",
        credentials: [res.credentials],
        batchLabel: res.student?.batchLabel || "Batch",
      });
    } catch (err: any) {
      alert(err.data?.error || "Failed to onboard student");
    } finally {
      setNewStudentSubmitting(false);
    }
  };

  const handlePreviewCsv = async () => {
    if (!importBatchId) {
      alert("Please select a target Academic Batch.");
      return;
    }
    if (!importCsvText.trim()) {
      alert("Please provide CSV content with columns: ERP No, PRN, Name, Email, Section");
      return;
    }

    setImportingPreview(true);
    try {
      const res = await fetchApi("/admin/students/import/preview", {
        method: "POST",
        body: JSON.stringify({
          batchId: importBatchId,
          csvContent: importCsvText,
        }),
      });
      setImportPreviewData(res);
    } catch (err: any) {
      alert(err.data?.error || "Failed to generate CSV preview");
    } finally {
      setImportingPreview(false);
    }
  };

  const handleCommitCsv = async () => {
    if (!importPreviewData || !importPreviewData.canCommit) {
      alert("Cannot commit import while blocking errors exist. Please resolve them first.");
      return;
    }

    const readyRows = importPreviewData.rows.filter((r: any) => r.status === "READY");
    if (readyRows.length === 0) {
      alert("No ready rows to import.");
      return;
    }

    setImportingCommit(true);
    try {
      const res = await fetchApi("/admin/students/import/commit", {
        method: "POST",
        body: JSON.stringify({
          batchId: importBatchId,
          rows: readyRows,
        }),
      });

      setImportModalOpen(false);
      setImportCsvText("");
      setImportPreviewData(null);
      await loadStudents();

      setStudentCredsModal({
        open: true,
        title: `Batch CSV Import Complete (${res.importedCount} Students)`,
        credentials: res.credentials,
        batchLabel: res.batchLabel || "Batch",
      });
    } catch (err: any) {
      alert(err.data?.error || "Failed to commit student import");
    } finally {
      setImportingCommit(false);
    }
  };

  // Faculty HOD Promotion with Explicit Confirmation Dialog
  const handlePromoteFacultyHOD = async () => {
    if (!hodPromoteModal) return;

    const targetDeptObj = departments.find((d) => d.id === targetDeptId);
    const existingHODName = targetDeptObj?.hodAssignment?.faculty?.name;

    if (targetDeptId && existingHODName) {
      const confirmReplace = confirm(
        `Department '${targetDeptObj.name}' already has an assigned HOD (${existingHODName}).\n\nAre you sure you want to replace ${existingHODName} with ${hodPromoteModal.facultyName}?`
      );
      if (!confirmReplace) return;
    }

    try {
      const res = await fetchApi(`/admin/faculty/${hodPromoteModal.facultyId}/assign-hod`, {
        method: "POST",
        body: JSON.stringify({ departmentId: targetDeptId || null }),
      });
      alert(res.message);
      setHodPromoteModal(null);
      loadFaculty();
      loadDepartments();
    } catch (err: any) {
      alert(err.data?.error || "Failed to promote faculty to HOD");
    }
  };

  if (!authorized) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-500 text-sm font-semibold">
        Verifying security credentials...
      </div>
    );
  }

  const filteredStudents = students.filter((s: any) => {
    const q = studentSearch.toLowerCase();
    const name = s.user?.name?.toLowerCase() || "";
    const erp = s.erpNumber?.toLowerCase() || "";
    const prn = s.prnNumber?.toLowerCase() || "";
    const batch = s.batch?.name?.toLowerCase() || "";
    return name.includes(q) || erp.includes(q) || prn.includes(q) || batch.includes(q);
  });
  const totalStudentPages = Math.max(1, Math.ceil(filteredStudents.length / studentPageSize));
  const paginatedStudents = filteredStudents.slice((studentPage - 1) * studentPageSize, studentPage * studentPageSize);

  const filteredFaculty = facultyList.filter((f: any) => {
    const q = facultySearch.toLowerCase();
    const name = f.name?.toLowerCase() || "";
    const emp = f.employeeId?.toLowerCase() || "";
    const dept = f.homeDepartmentName?.toLowerCase() || "";
    return name.includes(q) || emp.includes(q) || dept.includes(q);
  });
  const totalFacultyPages = Math.max(1, Math.ceil(filteredFaculty.length / facultyPageSize));
  const paginatedFaculty = filteredFaculty.slice((facultyPage - 1) * facultyPageSize, facultyPage * facultyPageSize);

  return (
    <div className="min-h-screen bg-slate-50 p-6 max-w-7xl mx-auto space-y-6">
      {/* Header Bar with Integrated Profile Settings & Logout */}
      <HeaderNav
        portalTitle="Institute Admin Console"
        portalSubtitle="Departments, Batches, Student Repeater Overrides & Faculty HOD Promotions"
        roleBadge="ADMIN"
      />

      {promotionMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex justify-between items-center text-emerald-900 text-sm">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-emerald-600" />
            <span className="font-semibold">{promotionMessage}</span>
          </div>
          <a href="/hod" className="text-xs font-bold underline flex items-center gap-1 hover:text-emerald-700">
            View Status Board <ArrowUpRight className="w-3.5 h-3.5" />
          </a>
        </div>
      )}

      {/* Admin Navigation Tabs */}
      <div className="flex border-b border-slate-200 gap-4">
        <button
          onClick={() => setActiveTab("structure")}
          className={`pb-3 text-sm font-semibold border-b-2 flex items-center gap-2 ${
            activeTab === "structure"
              ? "border-[#3730A3] text-[#3730A3]"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <Building className="w-4 h-4" /> Academic Structure & Batches
        </button>

        <button
          onClick={() => setActiveTab("students")}
          className={`pb-3 text-sm font-semibold border-b-2 flex items-center gap-2 ${
            activeTab === "students"
              ? "border-[#3730A3] text-[#3730A3]"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <GraduationCap className="w-4 h-4" /> Enrolled Students & Repeater Overrides ({students.length})
        </button>

        <button
          onClick={() => setActiveTab("faculty")}
          className={`pb-3 text-sm font-semibold border-b-2 flex items-center gap-2 ${
            activeTab === "faculty"
              ? "border-[#3730A3] text-[#3730A3]"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <UserPlus className="w-4 h-4" /> Faculty Directory & HOD Promotions ({facultyList.length})
        </button>

        <button
          onClick={() => {
            setActiveTab("reports");
            loadAdminReportsHistory(reportDeptFilter, reportTermFilter);
          }}
          className={`pb-3 text-sm font-semibold border-b-2 flex items-center gap-2 ${
            activeTab === "reports"
              ? "border-[#3730A3] text-[#3730A3]"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <Archive className="w-4 h-4" /> Consolidated IA Reports & Term Archive
        </button>

        <button
          onClick={() => {
            setActiveTab("audit");
            loadAuditLogs(1);
          }}
          className={`pb-3 text-sm font-semibold border-b-2 flex items-center gap-2 ${
            activeTab === "audit"
              ? "border-[#3730A3] text-[#3730A3]"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <ShieldCheck className="w-4 h-4" /> Security & Audit Trail
        </button>
      </div>

      {/* TAB 1: ACADEMIC STRUCTURE & BATCHES */}
      {activeTab === "structure" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-8">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Building className="w-5 h-5 text-[#3730A3]" /> 1. Create Department
              </h2>

              <form onSubmit={handleCreateDepartment} className="space-y-3 bg-slate-50 p-4 rounded-lg border border-slate-200">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Department Name</label>
                  <input
                    type="text"
                    required
                    value={deptName}
                    onChange={(e) => setDeptName(e.target.value)}
                    placeholder="e.g. BCA, MCA, B.Tech"
                    className="w-full p-2 border border-slate-300 rounded text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Total Semesters</label>
                  <input
                    type="number"
                    required
                    min={1}
                    max={12}
                    value={deptSems}
                    onChange={(e) => setDeptSems(Number(e.target.value))}
                    onWheel={(e) => (e.target as HTMLElement).blur()}
                    className="w-full p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-indigo-600 focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-2 bg-[#3730A3] text-white text-xs font-semibold rounded-lg hover:bg-[#4338CA]"
                >
                  Create Department
                </button>
              </form>
            </div>

            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-[#3730A3]" /> 2. Create Academic Batch
              </h2>

              <form onSubmit={handleCreateBatch} className="space-y-3 bg-slate-50 p-4 rounded-lg border border-slate-200">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Department</label>
                  <select
                    value={selectedDeptId}
                    onChange={(e) => setSelectedDeptId(e.target.value)}
                    className="w-full p-2 border border-slate-300 rounded text-sm"
                  >
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.totalSemesters} Semesters)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Batch Label</label>
                  <input
                    type="text"
                    required
                    value={batchLabel}
                    onChange={(e) => setBatchLabel(e.target.value)}
                    placeholder="e.g. 2025-28"
                    className="w-full p-2 border border-slate-300 rounded text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Start Year</label>
                  <input
                    type="number"
                    required
                    min={2000}
                    max={2100}
                    value={startYear}
                    onChange={(e) => setStartYear(Number(e.target.value))}
                    onWheel={(e) => (e.target as HTMLElement).blur()}
                    className="w-full p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-indigo-600 focus:outline-none"
                  />
                </div>

                {selectedDepartmentObj && (
                  <div className="text-xs text-slate-500 bg-indigo-50 p-2.5 rounded border border-indigo-100 font-medium">
                    Semester Bounds: Starts at <span className="font-bold text-indigo-900">Semester 1</span> up to max <span className="font-bold text-indigo-900">Semester {selectedDepartmentObj.totalSemesters}</span>.
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full py-2 bg-[#3730A3] text-white text-xs font-semibold rounded-lg hover:bg-[#4338CA]"
                >
                  Create Batch
                </button>
              </form>
            </div>
          </div>

          <div className="space-y-8">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <ArrowUpRight className="w-5 h-5 text-[#3730A3]" /> Whole-Batch Promotion Console
              </h2>

              <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg bg-white overflow-hidden">
                {batches.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-400">No batches created yet.</div>
                ) : (
                  batches.map((b) => {
                    const maxSem = b.department?.totalSemesters || 6;
                    const isMaxReached = b.currentSemester >= maxSem;

                    return (
                      <div key={b.id} className="p-3.5 flex justify-between items-center hover:bg-slate-50">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 text-sm">{b.label}</span>
                            <span className="text-[10px] font-bold text-indigo-900 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200">
                              {b.department?.name}
                            </span>
                          </div>
                          <span className="text-xs text-slate-500 block mt-0.5">
                            Progress: <span className="font-semibold text-slate-800">Semester {b.currentSemester} of {maxSem}</span>
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleAddSectionToBatch(b.id, b.label)}
                            className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-200 flex items-center gap-1"
                          >
                            <Plus className="w-3.5 h-3.5 text-slate-500" /> + Add Section
                          </button>
                          <button
                            onClick={() => handleOpenPromoteModal(b.id, b.label)}
                            disabled={isMaxReached}
                            className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1 ${
                              isMaxReached
                                ? "bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200"
                                : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                            }`}
                          >
                            {isMaxReached ? (
                              <>
                                <Lock className="w-3 h-3" /> Max Sem Reached ({maxSem})
                              </>
                            ) : (
                              <>
                                <ArrowUpRight className="w-3.5 h-3.5" /> Promote to Sem {b.currentSemester + 1}
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "students" && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Enrolled Student Directory ({students.length})</h2>
              <p className="text-xs text-slate-500">
                Onboard students individually or via CSV import, and manage individual repeater semester overrides.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setNewStudentBatchId(batches[0]?.id || "");
                  const defaultBatch = batches[0];
                  setNewStudentSectionId(defaultBatch?.sections?.[0]?.id || "");
                  setAddStudentModalOpen(true);
                }}
                className="px-3 py-2 bg-[#3730A3] hover:bg-[#4338CA] text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors"
              >
                <UserPlus className="w-3.5 h-3.5" /> Add Student
              </button>

              <button
                onClick={() => {
                  setImportBatchId(batches[0]?.id || "");
                  setImportCsvText("");
                  setImportPreviewData(null);
                  setImportModalOpen(true);
                }}
                className="px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-[#3730A3] border border-indigo-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <Upload className="w-3.5 h-3.5" /> Import Students (CSV)
              </button>
            </div>
          </div>

          {/* Search Bar & Pagination Controls */}
          <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pt-2">
            <div className="relative w-full sm:w-72">
              <input
                type="text"
                value={studentSearch}
                onChange={(e) => {
                  setStudentSearch(e.target.value);
                  setStudentPage(1);
                }}
                placeholder="Search name, ERP, PRN, batch..."
                className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-indigo-600 focus:outline-none"
              />
              <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
            </div>

            <div className="flex items-center gap-3 text-xs text-slate-600 w-full sm:w-auto justify-between sm:justify-end">
              <div className="flex items-center gap-1.5">
                <span>Show</span>
                <select
                  value={studentPageSize}
                  onChange={(e) => {
                    setStudentPageSize(Number(e.target.value));
                    setStudentPage(1);
                  }}
                  className="p-1 border border-slate-300 rounded text-xs bg-slate-50 focus:outline-none"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
                <span>per page</span>
              </div>

              <div className="flex items-center gap-1">
                <span className="text-slate-500 mr-2">
                  Page {studentPage} of {totalStudentPages} ({filteredStudents.length} total)
                </span>
                <button
                  onClick={() => setStudentPage((p) => Math.max(1, p - 1))}
                  disabled={studentPage <= 1}
                  className="p-1.5 border border-slate-200 rounded hover:bg-slate-100 disabled:opacity-40"
                  title="Previous Page"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setStudentPage((p) => Math.min(totalStudentPages, p + 1))}
                  disabled={studentPage >= totalStudentPages}
                  className="p-1.5 border border-slate-200 rounded hover:bg-slate-100 disabled:opacity-40"
                  title="Next Page"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase">
                  <th className="py-3 px-4">Student Name</th>
                  <th className="py-3 px-4">ERP / PRN</th>
                  <th className="py-3 px-4">Department & Batch</th>
                  <th className="py-3 px-4">Section</th>
                  <th className="py-3 px-4 text-center">Effective Semester</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {paginatedStudents.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400 text-xs">
                      {studentSearch ? "No students matching your search query." : "No students enrolled yet."}
                    </td>
                  </tr>
                ) : (
                  paginatedStudents.map((st: any) => (
                    <tr key={st.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-bold text-slate-900">{st.name}</td>
                      <td className="py-3 px-4">
                        <div className="font-mono text-xs text-slate-800">{st.erpNo}</div>
                        <div className="font-mono text-[10px] text-slate-400">{st.prn}</div>
                      </td>
                      <td className="py-3 px-4 text-xs">
                        <span className="font-semibold text-indigo-900">{st.departmentName}</span> | Batch {st.batchLabel}
                      </td>
                      <td className="py-3 px-4 text-xs font-medium text-slate-700">Section {st.sectionName}</td>
                      <td className="py-3 px-4 text-center">
                        {st.semesterOverride !== null ? (
                          <span className="pill-rose">
                            Repeater: Sem {st.effectiveSemester} (Override)
                          </span>
                        ) : (
                          <span className="pill-emerald">
                            Sem {st.effectiveSemester} (Batch Default)
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {st.isActive === false ? (
                          <span className="pill-rose">Deactivated</span>
                        ) : (
                          <span className="pill-emerald">Active</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {st.userId && (
                            <button
                              onClick={() => handleToggleUserStatus(st.userId, st.isActive !== false, st.name)}
                              className={`px-2 py-1 text-xs font-semibold rounded border ${
                                st.isActive === false
                                  ? "bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300"
                                  : "bg-rose-50 hover:bg-rose-100 text-rose-800 border-rose-300"
                              }`}
                            >
                              {st.isActive === false ? "Reactivate" : "Deactivate"}
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setStudentOverrideModal({
                                open: true,
                                studentId: st.id,
                                studentName: st.name,
                                maxSems: st.maxSemesters || 6,
                                currentOverride: st.semesterOverride,
                              });
                              setOverrideVal(st.semesterOverride !== null ? String(st.semesterOverride) : "");
                            }}
                            className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-[#3730A3] border border-indigo-200 text-xs font-semibold rounded flex items-center gap-1"
                          >
                            <RefreshCw className="w-3.5 h-3.5" /> Override
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "faculty" && (
        <div className="space-y-8">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-[#3730A3]" /> Onboard New Faculty Member
            </h2>

            <form onSubmit={handleOnboardFaculty} className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Faculty Name</label>
                <input
                  type="text"
                  required
                  value={facName}
                  onChange={(e) => setFacName(e.target.value)}
                  placeholder="e.g. Dr. Rajesh Sharma"
                  className="w-full p-2 border border-slate-300 rounded text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Employee ID (Username)</label>
                <input
                  type="text"
                  required
                  value={facEmpId}
                  onChange={(e) => setFacEmpId(e.target.value)}
                  placeholder="e.g. EMP001"
                  className="w-full p-2 border border-slate-300 rounded text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Email</label>
                <input
                  type="email"
                  value={facEmail}
                  onChange={(e) => setFacEmail(e.target.value)}
                  placeholder="faculty@bvimr.edu.in"
                  className="w-full p-2 border border-slate-300 rounded text-sm"
                />
              </div>

              <div className="col-span-3 flex justify-end">
                <button
                  type="submit"
                  className="px-6 py-2 bg-[#3730A3] text-white text-xs font-semibold rounded-lg hover:bg-[#4338CA]"
                >
                  Onboard Faculty Member
                </button>
              </div>
            </form>

            {createdCreds && (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg space-y-1 text-xs">
                <p className="font-bold text-emerald-900">Generated Credentials</p>
                <p>Username: <span className="font-mono font-bold text-slate-900">{createdCreds.username}</span></p>
                <p>Initial Password: <span className="font-mono font-bold text-emerald-900">{createdCreds.passwordPlain}</span></p>
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
            <h2 className="text-lg font-bold text-slate-900">Faculty Directory & HOD Promotion Desk</h2>

            {/* Search Bar & Pagination Controls */}
            <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pt-2">
              <div className="relative w-full sm:w-72">
                <input
                  type="text"
                  value={facultySearch}
                  onChange={(e) => {
                    setFacultySearch(e.target.value);
                    setFacultyPage(1);
                  }}
                  placeholder="Search name, employee ID, department..."
                  className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-indigo-600 focus:outline-none"
                />
                <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
              </div>

              <div className="flex items-center gap-3 text-xs text-slate-600 w-full sm:w-auto justify-between sm:justify-end">
                <div className="flex items-center gap-1.5">
                  <span>Show</span>
                  <select
                    value={facultyPageSize}
                    onChange={(e) => {
                      setFacultyPageSize(Number(e.target.value));
                      setFacultyPage(1);
                    }}
                    className="p-1 border border-slate-300 rounded text-xs bg-slate-50 focus:outline-none"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                  </select>
                  <span>per page</span>
                </div>

                <div className="flex items-center gap-1">
                  <span className="text-slate-500 mr-2">
                    Page {facultyPage} of {totalFacultyPages} ({filteredFaculty.length} total)
                  </span>
                  <button
                    onClick={() => setFacultyPage((p) => Math.max(1, p - 1))}
                    disabled={facultyPage <= 1}
                    className="p-1.5 border border-slate-200 rounded hover:bg-slate-100 disabled:opacity-40"
                    title="Previous Page"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setFacultyPage((p) => Math.min(totalFacultyPages, p + 1))}
                    disabled={facultyPage >= totalFacultyPages}
                    className="p-1.5 border border-slate-200 rounded hover:bg-slate-100 disabled:opacity-40"
                    title="Next Page"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase">
                    <th className="py-3 px-4">Faculty Name</th>
                    <th className="py-3 px-4">Employee ID</th>
                    <th className="py-3 px-4">Home Department</th>
                    <th className="py-3 px-4">Current HOD Status</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {paginatedFaculty.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400 text-xs">
                        No faculty members found matching your search.
                      </td>
                    </tr>
                  ) : (
                    paginatedFaculty.map((f: any) => (
                    <tr key={f.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-bold text-slate-900">{f.name}</td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-700">{f.employeeId}</td>
                      <td className="py-3 px-4 text-xs font-medium text-slate-700">{f.homeDepartmentName}</td>
                      <td className="py-3 px-4">
                        {f.isHOD ? (
                          <span className="pill-emerald">
                            HOD of {f.hodDepartmentName}
                          </span>
                        ) : (
                          <span className="pill-amber">Regular Faculty</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {f.isActive === false ? (
                          <span className="pill-rose">Deactivated</span>
                        ) : (
                          <span className="pill-emerald">Active</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {f.userId && (
                            <button
                              onClick={() => handleToggleUserStatus(f.userId, f.isActive !== false, f.name)}
                              className={`px-2 py-1 text-xs font-semibold rounded border ${
                                f.isActive === false
                                  ? "bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300"
                                  : "bg-rose-50 hover:bg-rose-100 text-rose-800 border-rose-300"
                              }`}
                            >
                              {f.isActive === false ? "Reactivate" : "Deactivate"}
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setHodPromoteModal({
                                open: true,
                                facultyId: f.id,
                                facultyName: f.name,
                              });
                            }}
                            className="px-2.5 py-1 bg-[#3730A3] hover:bg-[#4338CA] text-white text-xs font-semibold rounded flex items-center gap-1"
                          >
                            <UserCheck className="w-3.5 h-3.5" /> HOD
                          </button>
                        </div>
                      </td>
                    </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: CONSOLIDATED IA REPORTS & TERM ARCHIVE */}
      {activeTab === "reports" && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Archive className="w-5 h-5 text-[#3730A3]" /> Consolidated IA Reports & Term Archive
              </h2>
              <p className="text-xs text-slate-500">
                System-wide institutional grade and attendance export console. Filter by department and academic term to export official workbooks.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <div>
                <select
                  value={reportDeptFilter}
                  onChange={(e) => {
                    setReportDeptFilter(e.target.value);
                    loadAdminReportsHistory(e.target.value, reportTermFilter);
                  }}
                  className="p-2 border border-slate-300 rounded-lg text-xs bg-slate-50 font-medium focus:ring-2 focus:ring-indigo-600"
                >
                  <option value="">All Departments</option>
                  {departments.map((d: any) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.totalSemesters} Semesters)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <select
                  value={reportTermFilter}
                  onChange={(e) => {
                    setReportTermFilter(e.target.value);
                    loadAdminReportsHistory(reportDeptFilter, e.target.value);
                  }}
                  className="p-2 border border-slate-300 rounded-lg text-xs bg-slate-50 font-medium focus:ring-2 focus:ring-indigo-600"
                >
                  <option value="">All Academic Terms</option>
                  {reportTerms.map((t: any) => (
                    <option key={t.id} value={t.id}>
                      {t.label} (Sem {t.semesterNumber})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {loadingReports ? (
            <div className="p-12 text-center text-slate-500 font-medium text-sm">
              Loading consolidated reports repository...
            </div>
          ) : reportOfferings.length === 0 ? (
            <div className="p-12 text-center text-slate-400 font-medium text-xs border border-slate-200 rounded-lg">
              No academic subject offerings found for the selected criteria.
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase">
                    <th className="py-3 px-4">Subject Code & Name</th>
                    <th className="py-3 px-4">Department</th>
                    <th className="py-3 px-4">Term</th>
                    <th className="py-3 px-4">Sections & Teachers</th>
                    <th className="py-3 px-4 text-center">Enrolled</th>
                    <th className="py-3 px-4 text-center">Grading Policy</th>
                    <th className="py-3 px-4 text-right">Export Reports</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {reportOfferings.map((off: any) => (
                    <tr key={off.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{off.subjectName}</div>
                        <span className="font-mono text-xs font-semibold text-[#3730A3]">{off.subjectCode}</span>
                      </td>

                      <td className="py-3 px-4 text-xs font-semibold text-indigo-950">
                        {off.departmentName}
                      </td>

                      <td className="py-3 px-4 text-xs font-semibold text-slate-800">
                        {off.termLabel}
                        <span className="text-slate-400 block text-[11px]">Semester {off.semesterNumber}</span>
                      </td>

                      <td className="py-3 px-4 text-xs space-y-1">
                        {off.sections.map((s: any) => (
                          <div key={s.id} className="text-slate-600">
                            <span className="font-bold text-slate-800">Sec {s.name}:</span> {s.facultyName} ({s.studentsCount} students)
                          </div>
                        ))}
                      </td>

                      <td className="py-3 px-4 text-center font-bold text-slate-700">
                        {off.enrolledStudentsCount}
                      </td>

                      <td className="py-3 px-4 text-center">
                        {off.isPolicyConfirmed ? (
                          <span className="pill-emerald">Confirmed</span>
                        ) : (
                          <span className="pill-amber">Draft</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex justify-end gap-2">
                          <a
                            href={off.exportUrl}
                            download
                            className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded text-xs font-semibold inline-flex items-center gap-1 transition-colors"
                            title="Download Excel Workbook"
                          >
                            <Download className="w-3.5 h-3.5 text-emerald-600" /> Excel
                          </a>
                          <a
                            href={`${off.exportUrl}?format=csv`}
                            download
                            className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded text-xs font-semibold inline-flex items-center gap-1 transition-colors"
                            title="Download CSV"
                          >
                            <FileSpreadsheet className="w-3.5 h-3.5 text-slate-500" /> CSV
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 5: SECURITY AUDIT TRAIL */}
      {activeTab === "audit" && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-[#3730A3]" /> Institutional Security & Audit Trail
              </h2>
              <p className="text-xs text-slate-500">
                Immutable, append-only security logs tracking authentication lockouts, password resets, marks edits, and policy changes.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <div>
                <select
                  value={auditEntityType}
                  onChange={(e) => {
                    setAuditEntityType(e.target.value);
                    loadAuditLogs(1, e.target.value, auditSearch);
                  }}
                  className="p-2 border border-slate-300 rounded-lg text-xs bg-slate-50 font-medium focus:ring-2 focus:ring-indigo-600"
                >
                  <option value="">All Entity Types</option>
                  <option value="User">User / Auth</option>
                  <option value="Mark">Marks Record</option>
                  <option value="AttendanceRecord">Attendance</option>
                  <option value="GradingPolicy">Grading Policy</option>
                  <option value="SubjectOffering">Subject Offering</option>
                  <option value="Query">Query / Grievance</option>
                </select>
              </div>

              <div className="relative">
                <input
                  type="text"
                  value={auditSearch}
                  onChange={(e) => setAuditSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      loadAuditLogs(1, auditEntityType, auditSearch);
                    }
                  }}
                  placeholder="Search user, entity, values..."
                  className="pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-slate-50 focus:ring-2 focus:ring-indigo-600 focus:outline-none"
                />
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              </div>

              <button
                onClick={() => loadAuditLogs(1, auditEntityType, auditSearch)}
                className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors"
                title="Refresh Audit Logs"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {loadingAudit ? (
            <div className="p-12 text-center text-slate-500 font-medium text-sm">
              Loading security audit records...
            </div>
          ) : auditLogs.length === 0 ? (
            <div className="p-12 text-center text-slate-400 font-medium text-xs border border-slate-200 rounded-lg">
              No audit log entries found for the selected criteria.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase">
                      <th className="py-3 px-4">Timestamp</th>
                      <th className="py-3 px-4">Actor / User</th>
                      <th className="py-3 px-4">Target Entity</th>
                      <th className="py-3 px-4">Entity ID</th>
                      <th className="py-3 px-4">Previous Value</th>
                      <th className="py-3 px-4">Updated Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {auditLogs.map((log: any) => (
                      <tr key={log.id} className="hover:bg-slate-50 font-sans">
                        <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">
                          {new Date(log.changedAt).toLocaleString()}
                        </td>

                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="font-bold text-xs text-slate-900">
                            {log.changedByUser?.username || "SYSTEM"}
                          </div>
                          {log.changedByUser?.role && (
                            <span className="text-[10px] font-semibold text-slate-500">
                              {log.changedByUser.role}
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${
                            log.entityType === "User"
                              ? "bg-purple-100 text-purple-800"
                              : log.entityType === "Mark"
                              ? "bg-amber-100 text-amber-800"
                              : log.entityType === "GradingPolicy"
                              ? "bg-indigo-100 text-indigo-800"
                              : "bg-slate-100 text-slate-800"
                          }`}>
                            {log.entityType}
                          </span>
                        </td>

                        <td className="py-3 px-4 font-mono text-xs text-slate-500 whitespace-nowrap">
                          {log.entityId?.length > 18 ? `${log.entityId.slice(0, 18)}...` : log.entityId}
                        </td>

                        <td className="py-3 px-4 text-xs text-slate-600 font-mono max-w-xs truncate" title={log.oldValue}>
                          {log.oldValue || "—"}
                        </td>

                        <td className="py-3 px-4 whitespace-nowrap">
                          {log.newValue === "AUTH_LOCKOUT" ? (
                            <span className="pill-rose">AUTH_LOCKOUT</span>
                          ) : log.newValue === "PASSWORD_CHANGED" ? (
                            <span className="pill-emerald">PASSWORD_CHANGED</span>
                          ) : (
                            <span className="text-xs font-mono font-semibold text-slate-800 max-w-xs truncate block" title={log.newValue}>
                              {log.newValue}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination controls */}
              <div className="flex justify-between items-center text-xs text-slate-600 pt-2">
                <span>
                  Showing page {auditPage} of {auditTotalPages} ({auditTotal} total records)
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => loadAuditLogs(Math.max(1, auditPage - 1))}
                    disabled={auditPage <= 1}
                    className="p-1.5 border border-slate-200 rounded hover:bg-slate-100 disabled:opacity-40"
                    title="Previous Page"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => loadAuditLogs(Math.min(auditTotalPages, auditPage + 1))}
                    disabled={auditPage >= auditTotalPages}
                    className="p-1.5 border border-slate-200 rounded hover:bg-slate-100 disabled:opacity-40"
                    title="Next Page"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* STUDENT SEMESTER OVERRIDE MODAL */}
      {studentOverrideModal?.open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full space-y-4 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">
              Set Semester Override: {studentOverrideModal.studentName}
            </h3>

            <p className="text-xs text-slate-500">
              Sets an individual <span className="font-bold text-slate-800">semesterOverride</span> (repeater case). Leave empty to clear override and restore batch default semester.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Override Semester Number</label>
              <select
                value={overrideVal}
                onChange={(e) => setOverrideVal(e.target.value)}
                className="w-full p-2.5 border border-slate-300 rounded-lg text-sm bg-slate-50 font-medium focus:ring-2 focus:ring-indigo-600"
              >
                <option value="">(None - Use Batch Default Semester)</option>
                {Array.from({ length: studentOverrideModal.maxSems }, (_, i) => i + 1).map((s) => (
                  <option key={s} value={s}>
                    Semester {s}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                onClick={() => setStudentOverrideModal(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveStudentOverride}
                className="px-4 py-2 bg-[#3730A3] hover:bg-[#4338CA] text-white text-xs font-semibold rounded-lg"
              >
                Save Override
              </button>
            </div>
          </div>
        </div>
      )}

      {promoteModal?.open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 max-w-lg w-full space-y-4 shadow-xl">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <ArrowUpRight className="w-5 h-5 text-emerald-600" />
                Promote Batch Preview: {promoteModal.batchLabel}
              </h3>
              <button
                onClick={() => setPromoteModal(null)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            {promoteModal.loading ? (
              <div className="p-8 text-center text-slate-500 text-sm">
                Generating promotion dry-run preview...
              </div>
            ) : promoteModal.preview ? (
              <div className="space-y-4">
                {promoteModal.preview.warning && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-xs font-semibold flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                    <span>{promoteModal.preview.warning}</span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                    <span className="text-slate-500 block uppercase text-[10px] font-bold">Target Semester</span>
                    <span className="text-base font-extrabold text-slate-900">
                      Sem {promoteModal.preview.currentSemester} → Sem {promoteModal.preview.targetSemester}
                    </span>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                    <span className="text-slate-500 block uppercase text-[10px] font-bold">Academic Term</span>
                    <span className="text-sm font-bold text-indigo-900">
                      {promoteModal.preview.academicTermLabel}
                    </span>
                    <span className="text-[10px] text-slate-500 block">
                      {promoteModal.preview.termWillBeCreated ? "(Will be created)" : "(Reusing existing term)"}
                    </span>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                    <span className="text-slate-500 block uppercase text-[10px] font-bold">Subject Offerings</span>
                    <span className="text-base font-extrabold text-slate-900">
                      {promoteModal.preview.newOfferingsCount} new ({promoteModal.preview.subjectsCount} subjects)
                    </span>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                    <span className="text-slate-500 block uppercase text-[10px] font-bold">Section Offerings</span>
                    <span className="text-base font-extrabold text-slate-900">
                      {promoteModal.preview.newSectionsCount} new ({promoteModal.preview.sectionsCount} sections)
                    </span>
                  </div>
                </div>

                {promoteModal.preview.studentsWithOverride?.length > 0 && (
                  <div className="p-3 bg-indigo-50/60 border border-indigo-200 rounded-lg text-xs space-y-1">
                    <span className="font-bold text-indigo-900 block">
                      Students with Semester Override ({promoteModal.preview.studentsWithOverride.length}):
                    </span>
                    <p className="text-[11px] text-slate-600">
                      These students will remain evaluated in their overridden semester and will not advance to Sem {promoteModal.preview.targetSemester}:
                    </p>
                    <div className="max-h-24 overflow-y-auto space-y-0.5 pt-1 font-mono text-[11px]">
                      {promoteModal.preview.studentsWithOverride.map((st: any) => (
                        <div key={st.id} className="text-slate-700">
                          {st.erpNo} - {st.name} (Sem {st.semesterOverride})
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="pt-2 border-t border-slate-200 space-y-2">
                  <label className="block text-xs font-bold text-slate-700">
                    To confirm promotion, please type the batch label <span className="font-mono text-indigo-900">"{promoteModal.batchLabel}"</span> below:
                  </label>
                  <input
                    type="text"
                    value={typedConfirmLabel}
                    onChange={(e) => setTypedConfirmLabel(e.target.value)}
                    placeholder={promoteModal.batchLabel}
                    className="w-full p-2 border border-slate-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-600 focus:outline-none"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                  <button
                    onClick={() => setPromoteModal(null)}
                    disabled={executingPromote}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleExecutePromote}
                    disabled={typedConfirmLabel.trim() !== promoteModal.batchLabel.trim() || executingPromote}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {executingPromote ? "Promoting..." : "Confirm & Execute Promotion"}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {hodPromoteModal?.open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full space-y-4 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">
              Promote to HOD: {hodPromoteModal.facultyName}
            </h3>

            <p className="text-xs text-slate-500">
              Select target department. If the department already has an HOD, saving will <span className="font-bold text-amber-800">replace the previous HOD</span>. Select "(Remove HOD)" to clear status.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Target Department</label>
              <select
                value={targetDeptId}
                onChange={(e) => setTargetDeptId(e.target.value)}
                className="w-full p-2.5 border border-slate-300 rounded-lg text-sm bg-slate-50 font-medium focus:ring-2 focus:ring-indigo-600"
              >
                <option value="">(Remove HOD Status)</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    HOD of {d.name} ({d.hodAssignment ? `Current: ${d.hodAssignment.faculty?.name}` : "Vacant"})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                onClick={() => setHodPromoteModal(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handlePromoteFacultyHOD}
                className="px-4 py-2 bg-[#3730A3] hover:bg-[#4338CA] text-white text-xs font-semibold rounded-lg"
              >
                Confirm HOD Promotion
              </button>
            </div>
          </div>
        </div>
      )}

      {addStudentModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-xl p-6 max-w-lg w-full space-y-5 shadow-xl my-8">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-[#3730A3]" /> Onboard New Student
              </h3>
              <button
                onClick={() => setAddStudentModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateStudent} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                  Full Student Name
                </label>
                <input
                  type="text"
                  required
                  value={newStudentName}
                  onChange={(e) => setNewStudentName(e.target.value)}
                  placeholder="e.g. Aarav Gupta"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                    ERP No (Username)
                  </label>
                  <input
                    type="text"
                    required
                    value={newStudentErp}
                    onChange={(e) => setNewStudentErp(e.target.value)}
                    placeholder="e.g. BCA25001"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                    Permanent Reg. No (PRN)
                  </label>
                  <input
                    type="text"
                    required
                    value={newStudentPrn}
                    onChange={(e) => setNewStudentPrn(e.target.value)}
                    placeholder="e.g. PRN25001"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                  Email Address (Optional)
                </label>
                <input
                  type="email"
                  value={newStudentEmail}
                  onChange={(e) => setNewStudentEmail(e.target.value)}
                  placeholder="student@bvimr.edu.in (defaults to ERP@bvimr.edu.in)"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                    Academic Batch
                  </label>
                  <select
                    required
                    value={newStudentBatchId}
                    onChange={(e) => {
                      const selectedId = e.target.value;
                      setNewStudentBatchId(selectedId);
                      const targetBatch = batches.find((b) => b.id === selectedId);
                      setNewStudentSectionId(targetBatch?.sections?.[0]?.id || "");
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-slate-50 focus:ring-2 focus:ring-indigo-600 font-medium"
                  >
                    <option value="">Select Batch</option>
                    {batches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.label} ({b.department?.name})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                    Assigned Section
                  </label>
                  <select
                    required
                    value={newStudentSectionId}
                    onChange={(e) => setNewStudentSectionId(e.target.value)}
                    disabled={!newStudentBatchId}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-slate-50 focus:ring-2 focus:ring-indigo-600 font-medium disabled:opacity-50"
                  >
                    <option value="">Select Section</option>
                    {(batches.find((b) => b.id === newStudentBatchId)?.sections || []).map((sec: any) => (
                      <option key={sec.id} value={sec.id}>
                        Section {sec.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-lg text-indigo-900 text-xs">
                A secure, ambiguity-free password will be automatically generated upon creation.
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setAddStudentModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={newStudentSubmitting}
                  className="px-4 py-2 bg-[#3730A3] hover:bg-[#4338CA] text-white text-xs font-semibold rounded-lg shadow-sm disabled:opacity-50"
                >
                  {newStudentSubmitting ? "Onboarding..." : "Onboard Student"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {importModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-xl p-6 max-w-3xl w-full space-y-5 shadow-xl my-8 max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3 flex-shrink-0">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-[#3730A3]" /> Import Students via CSV
              </h3>
              <button
                onClick={() => setImportModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="overflow-y-auto space-y-4 flex-1 pr-1">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                  Target Academic Batch
                </label>
                <select
                  value={importBatchId}
                  onChange={(e) => {
                    setImportBatchId(e.target.value);
                    setImportPreviewData(null);
                  }}
                  className="w-full p-2.5 border border-slate-300 rounded-lg text-sm bg-slate-50 font-medium focus:ring-2 focus:ring-indigo-600"
                >
                  <option value="">Select target batch</option>
                  {batches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label} ({b.department?.name}) — Sections: {(b.sections || []).map((s: any) => s.name).join(", ") || "None"}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-xs font-semibold uppercase text-slate-600">
                    CSV Content (ERP No, PRN, Name, Email, Section)
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const sample = `ERP No,PRN,Name,Email,Section\nBCA25010,PRN25010,Ananya Sharma,ananya@bvimr.edu.in,A\nBCA25011,PRN25011,Kabir Mehta,kabir@bvimr.edu.in,A\nBCA25012,PRN25012,Rohan Varma,rohan@bvimr.edu.in,B`;
                      setImportCsvText(sample);
                    }}
                    className="text-[11px] text-[#3730A3] hover:underline font-semibold"
                  >
                    Insert Sample CSV Template
                  </button>
                </div>

                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = () => {
                          if (typeof reader.result === "string") {
                            setImportCsvText(reader.result);
                            setImportPreviewData(null);
                          }
                        };
                        reader.readAsText(file);
                      }
                    }}
                    className="text-xs text-slate-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-[#3730A3] hover:file:bg-indigo-100 cursor-pointer"
                  />
                </div>

                <textarea
                  rows={6}
                  value={importCsvText}
                  onChange={(e) => {
                    setImportCsvText(e.target.value);
                    setImportPreviewData(null);
                  }}
                  placeholder="ERP No,PRN,Name,Email,Section&#10;BCA25001,PRN25001,Aarav Gupta,aarav@bvimr.edu.in,A"
                  className="w-full p-2.5 font-mono text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-600"
                />
              </div>

              <div className="flex justify-start">
                <button
                  type="button"
                  onClick={handlePreviewCsv}
                  disabled={importingPreview || !importCsvText.trim() || !importBatchId}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-lg shadow-sm disabled:opacity-50"
                >
                  {importingPreview ? "Validating..." : "Validate & Preview CSV"}
                </button>
              </div>

              {/* Preview Table & Summary */}
              {importPreviewData && (
                <div className="space-y-3 pt-2 border-t border-slate-200">
                  <div className="flex flex-wrap gap-2 items-center text-xs">
                    <span className="font-bold text-slate-800">Preview Results:</span>
                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full font-bold">
                      {importPreviewData.summary.readyCount} Ready
                    </span>
                    {importPreviewData.summary.duplicateCount > 0 && (
                      <span className="px-2 py-0.5 bg-rose-100 text-rose-800 rounded-full font-bold">
                        {importPreviewData.summary.duplicateCount} Duplicates
                      </span>
                    )}
                    {importPreviewData.summary.unknownSectionCount > 0 && (
                      <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full font-bold">
                        {importPreviewData.summary.unknownSectionCount} Unknown Section
                      </span>
                    )}
                    {importPreviewData.summary.invalidCount > 0 && (
                      <span className="px-2 py-0.5 bg-rose-100 text-rose-800 rounded-full font-bold">
                        {importPreviewData.summary.invalidCount} Invalid Rows
                      </span>
                    )}
                  </div>

                  {!importPreviewData.canCommit && (
                    <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-900 text-xs flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                      <span>
                        Import cannot be committed while blocking errors exist. Please correct duplicate ERPs or invalid sections in the CSV.
                      </span>
                    </div>
                  )}

                  <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-lg">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600 sticky top-0">
                        <tr>
                          <th className="py-2 px-3">#</th>
                          <th className="py-2 px-3">ERP No</th>
                          <th className="py-2 px-3">PRN</th>
                          <th className="py-2 px-3">Student Name</th>
                          <th className="py-2 px-3">Section</th>
                          <th className="py-2 px-3">Status</th>
                          <th className="py-2 px-3">Message</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {importPreviewData.rows.map((r: any, idx: number) => (
                          <tr key={idx} className={r.status === "READY" ? "hover:bg-slate-50" : "bg-rose-50/40"}>
                            <td className="py-2 px-3 font-mono text-slate-400">{r.rowIndex}</td>
                            <td className="py-2 px-3 font-mono font-semibold">{r.erpNo || "-"}</td>
                            <td className="py-2 px-3 font-mono text-slate-500">{r.prn || "-"}</td>
                            <td className="py-2 px-3 font-medium text-slate-900">{r.name || "-"}</td>
                            <td className="py-2 px-3 font-semibold">{r.sectionName || "-"}</td>
                            <td className="py-2 px-3">
                              {r.status === "READY" ? (
                                <span className="pill-emerald">READY</span>
                              ) : (
                                <span className="pill-rose">{r.status}</span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-slate-500">{r.message || "Valid"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 flex-shrink-0">
              <button
                type="button"
                onClick={() => setImportModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCommitCsv}
                disabled={importingCommit || !importPreviewData || !importPreviewData.canCommit}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-sm disabled:opacity-50"
              >
                {importingCommit ? "Importing Students..." : "Commit Student Import"}
              </button>
            </div>
          </div>
        </div>
      )}

      {studentCredsModal?.open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-xl p-6 max-w-2xl w-full space-y-4 shadow-xl my-8">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <h3 className="text-lg font-bold text-slate-900">{studentCredsModal.title}</h3>
              </div>
              <button
                onClick={() => setStudentCredsModal(null)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Generated initial credentials for onboarded students. Download the official credentials workbook to distribute to students.
            </p>

            <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">
                  <tr>
                    <th className="py-2.5 px-3">ERP No (Username)</th>
                    <th className="py-2.5 px-3">Student Name</th>
                    <th className="py-2.5 px-3">PRN</th>
                    <th className="py-2.5 px-3">Section</th>
                    <th className="py-2.5 px-3">Initial Password</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {studentCredsModal.credentials.map((c: any, idx: number) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="py-2 px-3 font-bold text-[#3730A3]">{c.username || c.erpNo}</td>
                      <td className="py-2 px-3 font-sans font-semibold text-slate-900">{c.name}</td>
                      <td className="py-2 px-3 text-slate-600">{c.prn}</td>
                      <td className="py-2 px-3 font-sans">{c.section || "-"}</td>
                      <td className="py-2 px-3 font-bold text-emerald-700 bg-emerald-50/50">
                        {c.passwordPlain}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-slate-100">
              <button
                onClick={() =>
                  downloadStudentCredentialsExcel(
                    studentCredsModal.credentials,
                    studentCredsModal.batchLabel || "Batch"
                  )
                }
                className="px-4 py-2 bg-[#3730A3] hover:bg-[#4338CA] text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-sm transition-colors"
              >
                <Download className="w-4 h-4" /> Download Credentials (Excel .xlsx)
              </button>

              <button
                onClick={() => setStudentCredsModal(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global Notification Toast */}
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
