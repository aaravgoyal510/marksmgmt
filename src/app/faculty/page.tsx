"use client";

import { useEffect, useState } from "react";
import { fetchApi } from "@/lib/api";
import HeaderNav from "@/components/HeaderNav";
import QueryThread from "@/components/QueryThread";
import Toast, { ToastMessage } from "@/components/Toast";
import { Users, FileSpreadsheet, Upload, Lock, CheckCircle, AlertTriangle, XCircle, Send, ShieldAlert, ShieldCheck, ArrowRightLeft, Filter, Download, Archive, BarChart2 } from "lucide-react";
import { SectionAnalyticsCard } from "@/components/SectionAnalyticsCard";

export default function FacultyDashboard() {
  const [authorized, setAuthorized] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  useEffect(() => {
    fetchApi("/auth/me")
      .then((res) => {
        if (res.authenticated && res.user?.role === "FACULTY") {
          setAuthorized(true);
        } else {
          window.location.href = "/";
        }
      })
      .catch(() => {
        window.location.href = "/";
      });
  }, []);

  const [activeTab, setActiveTab] = useState<"marks" | "import-marks" | "attendance" | "queries" | "history">("marks");
  const [sections, setSections] = useState<any[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState<string>("");
  const [gridData, setGridData] = useState<any>(null);
  const [loadingGrid, setLoadingGrid] = useState(false);
  const [lockError, setLockError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [showAnalyticsDrawer, setShowAnalyticsDrawer] = useState(false);

  // Marks Bulk Import State
  const [marksImportFile, setMarksImportFile] = useState<File | null>(null);
  const [marksImportPreview, setMarksImportPreview] = useState<any | null>(null);
  const [loadingMarksPreview, setLoadingMarksPreview] = useState(false);
  const [committingMarks, setCommittingMarks] = useState(false);

  // History State
  const [historyTerms, setHistoryTerms] = useState<any[]>([]);
  const [historyOfferings, setHistoryOfferings] = useState<any[]>([]);
  const [historyTermFilter, setHistoryTermFilter] = useState<string>("");
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Attendance Upload State
  const [csvText, setCsvText] = useState("");
  const [previewData, setPreviewData] = useState<any>(null);

  // Queries State
  const [queries, setQueries] = useState<any[]>([]);
  const [queryStatusFilter, setQueryStatusFilter] = useState<"ALL" | "OPEN" | "ESCALATED" | "RESOLVED">("ALL");
  const [isHODUser, setIsHODUser] = useState(false);
  const [replyMessages, setReplyMessages] = useState<Record<string, string>>({});
  const [sendingQueryId, setSendingQueryId] = useState<string | null>(null);

  useEffect(() => {
    loadFacultyStatusBoard();
    loadQueries();

    const rawUserData = localStorage.getItem("userData");
    if (rawUserData) {
      try {
        const u = JSON.parse(rawUserData);
        if (u.isHOD) setIsHODUser(true);
      } catch (e) {}
    }
  }, []);

  const loadFacultyStatusBoard = async () => {
    try {
      const res = await fetchApi("/faculty/my-sections").catch(() => null);
      if (res?.sections) {
        setSections(res.sections);
        if (res.sections.length > 0) setSelectedSectionId(res.sections[0].id);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const loadQueries = async () => {
    try {
      const res = await fetchApi("/queries");
      setQueries(res.queries || []);
    } catch (err) {
      console.error(err);
    }
  };

  const loadFacultyHistory = async (termId?: string) => {
    setLoadingHistory(true);
    try {
      const q = `/reports/history${termId ? `?academicTermId=${termId}` : ""}`;
      const res = await fetchApi(q);
      setHistoryTerms(res.terms || []);
      setHistoryOfferings(res.offerings || []);
    } catch (err) {
      console.error("Failed to load faculty report history", err);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (selectedSectionId) {
      loadMarksGrid(selectedSectionId);
    }
  }, [selectedSectionId]);

  const loadMarksGrid = async (secId: string) => {
    setLoadingGrid(true);
    setLockError(null);
    try {
      const res = await fetchApi(`/sections/${secId}/marks`);
      setGridData(res);
    } catch (err: any) {
      if (err.status === 423) {
        setLockError(err.data?.error || "Section is locked: policy unconfirmed or faculty unassigned");
      }
      setGridData(null);
    } finally {
      setLoadingGrid(false);
    }
  };

  const handleMarksCellChange = (studentId: string, componentId: string, val: string) => {
    if (!gridData) return;
    const rawVal = val.trim();
    const numVal = rawVal === "" ? "" : parseFloat(rawVal);

    const newStudents = gridData.students.map((st: any) => {
      if (st.studentId === studentId) {
        const updatedMarks = {
          ...st.marks,
          [componentId]: numVal,
        };

        // Recompute live total IA
        const ces = computeGroupScore(gridData.components, updatedMarks, "CES", gridData.policyWeightages?.ces || 0);
        const internal = computeGroupScore(gridData.components, updatedMarks, "INTERNAL", gridData.policyWeightages?.internal || 0);
        const attScore = st.computedScores?.attendanceScore;
        const newTotalIA = attScore === null || attScore === undefined ? null : ces + internal + attScore;

        return {
          ...st,
          marks: updatedMarks,
          computedScores: {
            ...st.computedScores,
            cesScore: ces,
            internalScore: internal,
            totalIA: newTotalIA,
          },
        };
      }
      return st;
    });

    setGridData({ ...gridData, students: newStudents });
  };

  const handleAttendanceCellChange = (studentId: string, val: string) => {
    if (!gridData) return;
    const rawVal = val.trim();
    const attNum = rawVal === "" ? "" : parseFloat(rawVal);

    const newStudents = gridData.students.map((st: any) => {
      if (st.studentId === studentId) {
        let attScore: number | null = null;
        if (typeof attNum === "number" && !isNaN(attNum) && gridData.slabs) {
          const match = gridData.slabs.find((s: any) => attNum >= s.minPercent && attNum <= s.maxPercent);
          attScore = match ? match.marks : null;
        }

        const ces = computeGroupScore(gridData.components, st.marks, "CES", gridData.policyWeightages?.ces || 0);
        const internal = computeGroupScore(gridData.components, st.marks, "INTERNAL", gridData.policyWeightages?.internal || 0);
        const newTotalIA = attScore === null ? null : ces + internal + attScore;

        return {
          ...st,
          attendancePercent: attNum,
          computedScores: {
            ...st.computedScores,
            attendanceScore: attScore,
            totalIA: newTotalIA,
          },
        };
      }
      return st;
    });

    setGridData({ ...gridData, students: newStudents });
  };

  // Helper to compute group score client-side
  const computeGroupScore = (components: any[], marks: Record<string, any>, group: "CES" | "INTERNAL", weightage: number) => {
    if (!components || components.length === 0) return 0;
    const groupComps = components.filter((c) => c.group === group);
    const maxTotal = groupComps.reduce((sum, c) => sum + (c.maxMarks || 0), 0);
    if (maxTotal === 0) return 0;

    const obtainedTotal = groupComps.reduce((sum, c) => {
      const mVal = marks[c.id];
      return sum + (typeof mVal === "number" && !isNaN(mVal) ? mVal : 0);
    }, 0);

    return (obtainedTotal / maxTotal) * weightage;
  };

  const handleSaveMarks = async () => {
    if (!selectedSectionId || !gridData) return;

    const entries: any[] = [];
    const attendanceEntries: any[] = [];

    for (const st of gridData.students) {
      for (const [compKey, val] of Object.entries(st.marks)) {
        if (val !== "" && val !== null && val !== undefined) {
          entries.push({
            scoreComponentId: compKey,
            studentId: st.studentId,
            marksObtained: Number(val),
          });
        }
      }

      if (st.attendancePercent !== "" && st.attendancePercent !== null && st.attendancePercent !== undefined) {
        attendanceEntries.push({
          studentId: st.studentId,
          attendancePercent: Number(st.attendancePercent),
        });
      }
    }

    try {
      const res = await fetchApi("/marks/bulk", {
        method: "PUT",
        body: JSON.stringify({ sectionId: selectedSectionId, entries, attendanceEntries }),
      });
      if (res?.warning) {
        setToast({ type: "success", message: `Saved! Note: ${res.warning}` });
      } else {
        setToast({ type: "success", message: "Marks & Attendance saved successfully! Audit trail updated." });
      }
      loadMarksGrid(selectedSectionId);
    } catch (err: any) {
      setToast({ type: "error", message: err.data?.error || "Failed to save marks/attendance" });
    }
  };

  const handleTogglePublish = async () => {
    if (!selectedSectionId || !gridData) return;
    const isCurrentlyPublished = Boolean(gridData.isPublished);

    if (isCurrentlyPublished) {
      if (!confirm("Unpublishing marks will immediately hide marks and IA totals from enrolled students. Proceed?")) {
        return;
      }
      setPublishing(true);
      try {
        await fetchApi(`/sections/${selectedSectionId}/marks/publish`, {
          method: "DELETE",
        });
        setToast({ type: "success", message: "Marks unpublished. Students can no longer view them." });
        await loadMarksGrid(selectedSectionId);
      } catch (err: any) {
        setToast({ type: "error", message: err.data?.error || "Failed to unpublish marks" });
      } finally {
        setPublishing(false);
      }
    } else {
      if (!confirm("Publishing marks will immediately make them visible to all enrolled students and send them notifications. Proceed?")) {
        return;
      }
      setPublishing(true);
      try {
        await fetchApi(`/sections/${selectedSectionId}/marks/publish`, {
          method: "POST",
        });
        setToast({ type: "success", message: "Marks published successfully! Enrolled students have been notified." });
        await loadMarksGrid(selectedSectionId);
      } catch (err: any) {
        setToast({ type: "error", message: err.data?.error || "Failed to publish marks" });
      } finally {
        setPublishing(false);
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        setCsvText(text);
      }
    };
    reader.readAsText(file);
  };

  const handleMarksImportFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMarksImportFile(file);
    await runMarksImportPreview(file);
  };

  const runMarksImportPreview = async (file: File) => {
    if (!selectedSectionId) return;
    setLoadingMarksPreview(true);
    setMarksImportPreview(null);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`/api/sections/${selectedSectionId}/marks/import/preview`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to preview marks file");
      }
      setMarksImportPreview(data);
      setToast({ type: "info", message: `Preview ready: ${data.readyCount} valid rows of ${data.totalRows}.` });
    } catch (err: any) {
      setToast({ type: "error", message: err.message || "Failed to preview marks file" });
    } finally {
      setLoadingMarksPreview(false);
    }
  };

  const handleCommitMarksImport = async () => {
    if (!selectedSectionId || !marksImportPreview) return;
    if (!marksImportPreview.canCommit) {
      setToast({ type: "error", message: "Cannot commit import: unresolved blocking rows (UNMATCHED or OUT_OF_BOUNDS) exist." });
      return;
    }

    if (!confirm(`Commit marks for ${marksImportPreview.readyCount} students? This will overwrite existing values and update the audit log.`)) {
      return;
    }

    setCommittingMarks(true);
    try {
      const res = await fetchApi(`/sections/${selectedSectionId}/marks/import/commit`, {
        method: "POST",
        body: JSON.stringify({ rows: marksImportPreview.rows }),
      });
      if (res?.warning) {
        setToast({ type: "success", message: `Import successful! Note: ${res.warning}` });
      } else {
        setToast({ type: "success", message: `Imported marks for ${res.studentsCount} students successfully!` });
      }
      setMarksImportPreview(null);
      setMarksImportFile(null);
      await loadMarksGrid(selectedSectionId);
      setActiveTab("marks");
    } catch (err: any) {
      setToast({ type: "error", message: err.data?.error || "Failed to commit marks import" });
    } finally {
      setCommittingMarks(false);
    }
  };

  const handlePreviewAttendance = async () => {
    if (!selectedSectionId || !csvText.trim()) return;

    try {
      const res = await fetchApi(`/sections/${selectedSectionId}/attendance/preview`, {
        method: "POST",
        body: JSON.stringify({ csvContent: csvText }),
      });
      setPreviewData(res);
    } catch (err: any) {
      alert(err.data?.error || "Failed to preview attendance CSV");
    }
  };

  const handleCommitAttendance = async () => {
    if (!selectedSectionId || !previewData) return;

    const readyEntries = previewData.rows
      .filter((r: any) => r.status === "READY")
      .map((r: any) => ({
        studentId: r.studentId,
        attendancePercent: r.attendancePercent,
      }));

    try {
      await fetchApi(`/sections/${selectedSectionId}/attendance/commit`, {
        method: "POST",
        body: JSON.stringify({ entries: readyEntries }),
      });
      setToast({ type: "success", message: "Attendance committed successfully!" });
      setPreviewData(null);
      setCsvText("");
      loadMarksGrid(selectedSectionId);
    } catch (err: any) {
      setToast({ type: "error", message: err.data?.error || "Failed to commit attendance" });
    }
  };

  const handleSendQueryReply = async (queryId: string) => {
    const text = replyMessages[queryId]?.trim();
    if (!text) return;

    setSendingQueryId(queryId);
    try {
      await fetchApi(`/queries/${queryId}/messages`, {
        method: "POST",
        body: JSON.stringify({ message: text }),
      });
      setReplyMessages({ ...replyMessages, [queryId]: "" });
      setToast({ type: "success", message: "Message posted to thread" });
      await loadQueries();
    } catch (err: any) {
      setToast({ type: "error", message: err.data?.error || "Failed to post message to thread" });
    } finally {
      setSendingQueryId(null);
    }
  };

  const handleResolveQuery = async (queryId: string) => {
    try {
      await fetchApi(`/queries/${queryId}/resolve`, { method: "POST" });
      setToast({ type: "success", message: "Query resolved successfully" });
      await loadQueries();
    } catch (err: any) {
      setToast({ type: "error", message: err.data?.error || "Failed to resolve query" });
    }
  };

  const handleEscalateQuery = async (queryId: string) => {
    try {
      await fetchApi(`/queries/${queryId}/escalate`, { method: "POST" });
      setToast({ type: "success", message: "Query escalated to HOD successfully!" });
      await loadQueries();
    } catch (err: any) {
      setToast({ type: "error", message: err.data?.error || "Failed to escalate query" });
    }
  };

  if (!authorized) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-500 text-sm font-semibold">
        Verifying security credentials...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Header Bar with Profile Settings & Logout */}
      <HeaderNav
        portalTitle="Faculty Dashboard"
        portalSubtitle="Bulk Marks Entry, Attendance Import & Student Discrepancy Desk"
        roleBadge="FACULTY"
      />

      {isHODUser && (
        <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-200 shadow-sm flex justify-between items-center text-emerald-900 text-sm">
          <span className="font-semibold flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600" /> Authorized HOD Account (Teaching View)
          </span>
          <a
            href="/hod"
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm"
          >
            ← Return to HOD Department Management
          </a>
        </div>
      )}

      {/* Section Selector & Direct Export */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase block mb-1 sm:mb-0">Select Teaching Section</label>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
          <select
            value={selectedSectionId}
            onChange={(e) => setSelectedSectionId(e.target.value)}
            className="w-full sm:w-72 p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm font-medium focus:ring-2 focus:ring-indigo-600 focus:outline-none"
          >
            {sections.length === 0 ? (
              <option value="">(No assigned sections)</option>
            ) : (
              sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))
            )}
          </select>

          {(() => {
            const currentSec = sections.find((s) => s.id === selectedSectionId);
            if (!currentSec?.subjectOfferingId) return null;
            return (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowAnalyticsDrawer(!showAnalyticsDrawer)}
                  className="px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-[#3730A3] border border-indigo-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
                  title="Toggle section performance and attendance analytics"
                >
                  <BarChart2 className="w-3.5 h-3.5" /> {showAnalyticsDrawer ? "Hide Analytics" : "View Analytics"}
                </button>
                <a
                  href={`/api/reports/subject-offerings/${currentSec.subjectOfferingId}/export`}
                  download
                  className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
                  title="Export Consolidated IA Excel Spreadsheet"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-700" /> Export Excel
                </a>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Section Analytics Collapsible Drawer */}
      {selectedSectionId && showAnalyticsDrawer && (
        <div className="mb-4">
          <SectionAnalyticsCard
            sectionId={selectedSectionId}
            onClose={() => setShowAnalyticsDrawer(false)}
            isCollapsible={true}
          />
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-4 overflow-x-auto">
        <button
          onClick={() => setActiveTab("marks")}
          className={`pb-3 text-sm font-semibold border-b-2 flex items-center gap-2 flex-shrink-0 ${
            activeTab === "marks"
              ? "border-[#3730A3] text-[#3730A3]"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" /> Bulk Marks Entry Grid
        </button>

        <button
          onClick={() => setActiveTab("import-marks")}
          className={`pb-3 text-sm font-semibold border-b-2 flex items-center gap-2 flex-shrink-0 ${
            activeTab === "import-marks"
              ? "border-[#3730A3] text-[#3730A3]"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <Upload className="w-4 h-4" /> Import Marks (CSV/Excel)
        </button>

        <button
          onClick={() => setActiveTab("attendance")}
          className={`pb-3 text-sm font-semibold border-b-2 flex items-center gap-2 flex-shrink-0 ${
            activeTab === "attendance"
              ? "border-[#3730A3] text-[#3730A3]"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <Upload className="w-4 h-4" /> Attendance CSV Dry-Run
        </button>

        <button
          onClick={() => setActiveTab("queries")}
          className={`pb-3 text-sm font-semibold border-b-2 flex items-center gap-2 flex-shrink-0 ${
            activeTab === "queries"
              ? "border-[#3730A3] text-[#3730A3]"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <Users className="w-4 h-4" /> Student Queries ({queries.length})
        </button>

        <button
          onClick={() => {
            setActiveTab("history");
            loadFacultyHistory(historyTermFilter);
          }}
          className={`pb-3 text-sm font-semibold border-b-2 flex items-center gap-2 flex-shrink-0 ${
            activeTab === "history"
              ? "border-[#3730A3] text-[#3730A3]"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <Archive className="w-4 h-4" /> Past Terms & Reports Archive
        </button>
      </div>

      {/* TAB 1: BULK MARKS ENTRY GRID */}
      {activeTab === "marks" && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
          {lockError ? (
            <div className="p-6 bg-rose-50 border border-rose-200 rounded-xl text-center space-y-2">
              <Lock className="w-8 h-8 text-rose-600 mx-auto" />
              <h3 className="text-lg font-bold text-rose-900">Section Locked (HTTP 423)</h3>
              <p className="text-sm text-rose-700">{lockError}</p>
              <p className="text-xs text-slate-500">
                Marks entry is disabled until HOD confirms the grading policy and assigns a faculty member.
              </p>
            </div>
          ) : loadingGrid ? (
            <div className="p-8 text-center text-slate-500">Loading Grid...</div>
          ) : !gridData ? (
            <div className="p-8 text-center text-slate-500">Select a section above to view marks grid.</div>
          ) : (
            <div className="space-y-4">
              {/* Check if any marks or attendance entries in the grid are out of bounds or in a slab gap */}
              {(() => {
                let hasInvalidEntries = false;
                if (gridData?.students) {
                  for (const st of gridData.students) {
                    if (gridData.components) {
                      for (const comp of gridData.components) {
                        const val = st.marks[comp.id];
                        if (val !== undefined && val !== null && val !== "") {
                          const num = Number(val);
                          if (isNaN(num) || num < 0 || num > comp.maxMarks) {
                            hasInvalidEntries = true;
                            break;
                          }
                        }
                      }
                    }
                    if (st.attendancePercent !== undefined && st.attendancePercent !== null && st.attendancePercent !== "") {
                      const attNum = Number(st.attendancePercent);
                      const isAttOutOfBounds = isNaN(attNum) || attNum < 0 || attNum > 100;
                      const isAttGap = gridData.slabs && gridData.slabs.length > 0 && !gridData.slabs.some((s: any) => attNum >= s.minPercent && attNum <= s.maxPercent);
                      if (isAttOutOfBounds || isAttGap) {
                        hasInvalidEntries = true;
                        break;
                      }
                    }
                    if (hasInvalidEntries) break;
                  }
                }
                return (
                  <>
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg font-bold text-slate-900">Enrolled Student Marks Sheet</h3>
                          {gridData.isPublished ? (
                            <span className="pill-emerald">
                              <CheckCircle className="w-3.5 h-3.5" /> Published {gridData.marksPublishedAt ? `(${new Date(gridData.marksPublishedAt).toLocaleDateString()})` : ""}
                            </span>
                          ) : (
                            <span className="pill-amber">
                              <AlertTriangle className="w-3.5 h-3.5" /> Draft / Unpublished
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Policy Total IA: <span className="font-semibold text-indigo-900">{gridData.policyWeightages?.totalIAMarks} Marks</span>
                        </p>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <button
                          onClick={handleTogglePublish}
                          disabled={publishing}
                          className={`px-3 py-2 text-xs font-semibold rounded-lg shadow-sm border transition-colors flex items-center gap-1.5 ${
                            gridData.isPublished
                              ? "bg-rose-50 hover:bg-rose-100 text-rose-800 border-rose-300"
                              : "bg-emerald-600 hover:bg-emerald-700 text-white border-transparent"
                          } disabled:opacity-50`}
                        >
                          {gridData.isPublished ? (
                            <>
                              <XCircle className="w-3.5 h-3.5" /> Unpublish Marks
                            </>
                          ) : (
                            <>
                              <CheckCircle className="w-3.5 h-3.5" /> Publish Marks to Students
                            </>
                          )}
                        </button>
                        <button
                          onClick={handleSaveMarks}
                          disabled={hasInvalidEntries}
                          className="px-4 py-2 bg-[#3730A3] hover:bg-[#4338CA] text-white text-xs font-semibold rounded-lg shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Save Marks & Attendance (Audit Logged)
                        </button>
                      </div>
                    </div>

                    {gridData.isPublished && (
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-xs font-medium flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                        <span>
                          <strong>Section is published:</strong> Enrolled students currently see these marks. Any updates saved will be live immediately and tracked in the audit log.
                        </span>
                      </div>
                    )}

                    {hasInvalidEntries && (
                      <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs font-semibold flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-rose-600" />
                        One or more mark entries or attendance percentages exceed valid ranges or fall into an unmapped slab gap. Please correct highlighted cells before saving.
                      </div>
                    )}
                  </>
                );
              })()}

              {/* Table Grid */}
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase">
                      <th className="py-3 px-4 sticky left-0 bg-slate-100 z-10">ERP / Student Name</th>
                      {gridData.components.map((comp: any) => (
                        <th key={comp.id} className="py-3 px-4 text-center">
                          {comp.name} ({comp.maxMarks}M)
                        </th>
                      ))}
                      <th className="py-3 px-4 text-center">Attendance %</th>
                      <th className="py-3 px-4 text-center bg-indigo-50 text-indigo-900">Total IA Marks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {gridData.students.map((st: any) => (
                      <tr key={st.studentId} className="hover:bg-slate-50">
                        <td className="py-2.5 px-4 sticky left-0 bg-white hover:bg-slate-50 font-medium text-slate-900 border-r border-slate-200">
                          <div>{st.name}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{st.erpNo}</div>
                        </td>

                        {gridData.components.map((comp: any) => {
                          const rawVal = st.marks[comp.id];
                          const numVal = rawVal !== undefined && rawVal !== null && rawVal !== "" ? Number(rawVal) : null;
                          const isInvalid = numVal !== null && (isNaN(numVal) || numVal < 0 || numVal > comp.maxMarks);

                          return (
                            <td key={comp.id} className="py-2 px-3 text-center">
                              <input
                                type="number"
                                step="0.5"
                                min={0}
                                max={comp.maxMarks}
                                value={st.marks[comp.id] ?? ""}
                                onChange={(e) => handleMarksCellChange(st.studentId, comp.id, e.target.value)}
                                onWheel={(e) => (e.target as HTMLElement).blur()}
                                className={`w-16 p-1.5 border rounded text-center text-sm font-mono focus:ring-2 focus:outline-none ${
                                  isInvalid
                                    ? "border-rose-500 bg-rose-50 text-rose-900 font-bold focus:ring-rose-500"
                                    : "border-slate-300 focus:ring-indigo-600 text-slate-900"
                                }`}
                                title={isInvalid ? `Must be between 0 and ${comp.maxMarks}` : undefined}
                              />
                            </td>
                          );
                        })}

                        {/* Inline Editable Attendance Cell */}
                        {(() => {
                          const rawAtt = st.attendancePercent;
                          const attNum = rawAtt !== undefined && rawAtt !== null && rawAtt !== "" ? Number(rawAtt) : null;
                          const isAttOutOfBounds = attNum !== null && (isNaN(attNum) || attNum < 0 || attNum > 100);
                          const isAttGap = attNum !== null && !isAttOutOfBounds && gridData.slabs && gridData.slabs.length > 0 && !gridData.slabs.some((s: any) => attNum >= s.minPercent && attNum <= s.maxPercent);
                          const isInvalidAtt = isAttOutOfBounds || isAttGap;

                          return (
                            <td className="py-2 px-3 text-center">
                              <div className="flex flex-col items-center gap-0.5">
                                <input
                                  type="number"
                                  step="0.01"
                                  min={0}
                                  max={100}
                                  value={st.attendancePercent ?? ""}
                                  onChange={(e) => handleAttendanceCellChange(st.studentId, e.target.value)}
                                  onWheel={(e) => (e.target as HTMLElement).blur()}
                                  className={`w-20 p-1.5 border rounded text-center text-sm font-mono focus:ring-2 focus:outline-none ${
                                    isInvalidAtt
                                      ? "border-rose-500 bg-rose-50 text-rose-900 font-bold focus:ring-rose-500"
                                      : "border-slate-300 focus:ring-indigo-600 text-slate-900"
                                  }`}
                                  title={
                                    isAttOutOfBounds
                                      ? "Attendance % must be between 0 and 100"
                                      : isAttGap
                                      ? "BLOCKED: Attendance % falls into an unmapped slab gap"
                                      : undefined
                                  }
                                />
                                {isAttGap && (
                                  <span className="text-[10px] font-bold text-rose-600">Slab Gap</span>
                                )}
                              </div>
                            </td>
                          );
                        })()}

                        <td className="py-2.5 px-4 text-center font-extrabold text-indigo-900 bg-indigo-50/50 tabular-nums">
                          {st.computedScores?.totalIA !== null ? st.computedScores?.totalIA.toFixed(2) : "N/A"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB: BULK MARKS IMPORT (CSV / EXCEL) */}
      {activeTab === "import-marks" && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Bulk Marks Upload (CSV / Excel)</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Upload student marks via <span className="font-mono text-slate-700">.csv</span> or <span className="font-mono text-slate-700">.xlsx</span> spreadsheet. Column headers must match policy components (case-insensitive, e.g. <span className="font-mono text-slate-700">Assignment 1 (20M)</span> or <span className="font-mono text-slate-700">Assignment 1</span>).
              </p>
            </div>
            {selectedSectionId && (
              <a
                href={`/api/sections/${selectedSectionId}/marks/import/template`}
                download
                className="px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-[#3730A3] border border-indigo-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm flex-shrink-0"
                title="Download pre-filled CSV template for this section"
              >
                <Download className="w-3.5 h-3.5" /> Download Marks Template
              </a>
            )}
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
            <label className="block text-xs font-bold text-slate-700 uppercase">
              Select Marks Spreadsheet (.csv, .xlsx, .xls)
            </label>
            <input
              type="file"
              accept=".csv, text/csv, .xlsx, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, .xls"
              onChange={handleMarksImportFileChange}
              disabled={loadingMarksPreview}
              className="block w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-[#3730A3] hover:file:bg-indigo-100 cursor-pointer disabled:opacity-50"
            />
            {marksImportFile && (
              <p className="text-xs text-slate-500">
                Selected file: <span className="font-mono font-semibold text-slate-800">{marksImportFile.name}</span> ({(marksImportFile.size / 1024).toFixed(1)} KB)
              </p>
            )}
          </div>

          {loadingMarksPreview && (
            <div className="p-8 text-center text-slate-500 border border-slate-200 rounded-xl bg-slate-50">
              <p className="font-medium">Validating spreadsheet against policy and student roster...</p>
            </div>
          )}

          {marksImportPreview && !loadingMarksPreview && (
            <div className="border border-slate-200 rounded-xl p-6 bg-slate-50 space-y-5">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <h4 className="text-sm font-bold text-slate-900">Dry-Run Preview Result</h4>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="pill-emerald">
                    <CheckCircle className="w-3.5 h-3.5" /> Ready: {marksImportPreview.readyCount}
                  </span>
                  {marksImportPreview.unmatchedCount > 0 && (
                    <span className="pill-rose">
                      <XCircle className="w-3.5 h-3.5" /> Unmatched: {marksImportPreview.unmatchedCount}
                    </span>
                  )}
                  {marksImportPreview.outOfBoundsCount > 0 && (
                    <span className="pill-rose">
                      <AlertTriangle className="w-3.5 h-3.5" /> Out of Bounds: {marksImportPreview.outOfBoundsCount}
                    </span>
                  )}
                  {marksImportPreview.blankCount > 0 && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-200 text-slate-700">
                      Blank (Skipped): {marksImportPreview.blankCount}
                    </span>
                  )}
                </div>
              </div>

              {!marksImportPreview.canCommit && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                  <span>
                    Import blocked: There are {marksImportPreview.unmatchedCount + marksImportPreview.outOfBoundsCount} invalid rows (unmatched ERP or marks exceeding max bounds). Resolve all blocking errors before committing.
                  </span>
                </div>
              )}

              <div className="overflow-x-auto border border-slate-200 rounded-lg bg-white">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200 text-slate-600 font-semibold uppercase">
                      <th className="py-2.5 px-3">ERP No</th>
                      <th className="py-2.5 px-3">Student Name</th>
                      {marksImportPreview.components?.map((c: any) => (
                        <th key={c.id} className="py-2.5 px-3 text-center">
                          {c.name} ({c.maxMarks}M)
                        </th>
                      ))}
                      <th className="py-2.5 px-3 text-center">Status</th>
                      <th className="py-2.5 px-3">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {marksImportPreview.rows.map((row: any, idx: number) => {
                      const isBlocking = row.status === "UNMATCHED" || row.status === "OUT_OF_BOUNDS";
                      return (
                        <tr key={idx} className={isBlocking ? "bg-rose-50/40" : row.status === "BLANK" ? "bg-slate-50/60 opacity-60" : ""}>
                          <td className="py-2 px-3 font-mono font-medium">{row.erp || "—"}</td>
                          <td className="py-2 px-3 font-medium text-slate-800">{row.studentName}</td>
                          {marksImportPreview.components?.map((c: any) => {
                            const val = row.marks?.[c.id];
                            return (
                              <td key={c.id} className="py-2 px-3 text-center font-mono font-semibold text-indigo-900">
                                {val !== null && val !== undefined ? val : "—"}
                              </td>
                            );
                          })}
                          <td className="py-2 px-3 text-center">
                            {row.status === "READY" && <span className="pill-emerald">READY</span>}
                            {row.status === "UNMATCHED" && <span className="pill-rose">UNMATCHED</span>}
                            {row.status === "OUT_OF_BOUNDS" && <span className="pill-rose">OUT OF BOUNDS</span>}
                            {row.status === "BLANK" && <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-500 border border-slate-200">BLANK</span>}
                          </td>
                          <td className="py-2 px-3 text-slate-500 text-[11px] max-w-xs truncate">
                            {row.message}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={handleCommitMarksImport}
                  disabled={!marksImportPreview.canCommit || committingMarks}
                  className="px-5 py-2.5 bg-[#3730A3] hover:bg-[#4338CA] text-white text-xs font-semibold rounded-lg shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  <CheckCircle className="w-4 h-4" />
                  {committingMarks ? "Committing to Database..." : `Commit ${marksImportPreview.readyCount} Valid Marks to Database (Audit Logged)`}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: ATTENDANCE CSV DRY-RUN */}
      {activeTab === "attendance" && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Upload Dated Attendance Snapshot CSV</h3>
            <p className="text-xs text-slate-500">
              Format: <span className="font-mono text-slate-700">ERP No, PRN, Name, Attendance</span> (Decimals like 88.89, 55.56 accepted).
            </p>
          </div>

          <div className="space-y-4">
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg flex flex-col sm:flex-row items-center gap-4">
              <div className="flex-1 w-full">
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Select CSV File from Computer
                </label>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFileUpload}
                  className="block w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-[#3730A3] hover:file:bg-indigo-100 cursor-pointer"
                />
              </div>
              <span className="text-xs font-semibold text-slate-400">OR</span>
              <div className="w-full sm:w-auto">
                <span className="text-xs font-medium text-slate-500 block mb-1">Paste CSV raw text below</span>
              </div>
            </div>

            <textarea
              rows={4}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder={`ERP No, PRN, Name, Attendance\nBCA25001, PRN25001, Aarav Gupta, 88.89\nBCA25002, PRN25002, Ananya Sharma, 55.56`}
              className="w-full p-3 font-mono text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-600 focus:outline-none"
            />
            <button
              onClick={handlePreviewAttendance}
              disabled={!csvText.trim()}
              className="px-4 py-2 bg-[#3730A3] hover:bg-[#4338CA] text-white text-xs font-semibold rounded-lg flex items-center gap-2 disabled:opacity-50"
            >
              <Upload className="w-4 h-4" /> Run Dry-Run Preview
            </button>
          </div>

          {/* Dry Run Preview Table */}
          {previewData && (
            <div className="border border-slate-200 rounded-xl p-6 bg-slate-50 space-y-4">
              <div className="flex justify-between items-center">
                <h4 className="text-sm font-bold text-slate-900">Dry-Run Preview Result</h4>
                <div className="flex gap-2">
                  <span className="pill-emerald">
                    <CheckCircle className="w-3.5 h-3.5" /> Ready: {previewData.summary.readyCount}
                  </span>
                  <span className="pill-rose">
                    <XCircle className="w-3.5 h-3.5" /> Blocked Gap: {previewData.summary.blockedCount}
                  </span>
                  <span className="pill-amber">
                    <AlertTriangle className="w-3.5 h-3.5" /> Unmatched: {previewData.summary.unmatchedCount}
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-lg bg-white">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200 text-slate-600 font-semibold uppercase">
                      <th className="py-2.5 px-3">ERP</th>
                      <th className="py-2.5 px-3">Name</th>
                      <th className="py-2.5 px-3">Attendance %</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Marks Preview</th>
                      <th className="py-2.5 px-3">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {previewData.rows.map((r: any, idx: number) => (
                      <tr key={idx} className={r.status === "BLOCKED_SLAB_GAP" ? "bg-rose-50/50" : ""}>
                        <td className="py-2 px-3 font-mono">{r.erp}</td>
                        <td className="py-2 px-3">{r.name}</td>
                        <td className="py-2 px-3 tabular-nums font-semibold">{r.attendancePercent}%</td>
                        <td className="py-2 px-3">
                          {r.status === "READY" && <span className="pill-emerald">READY</span>}
                          {r.status === "BLOCKED_SLAB_GAP" && <span className="pill-rose">BLOCKED SLAB GAP</span>}
                          {r.status === "UNMATCHED" && <span className="pill-amber">UNMATCHED</span>}
                        </td>
                        <td className="py-2 px-3 tabular-nums font-bold">
                          {r.marksPreview !== null ? `${r.marksPreview} Marks` : "—"}
                        </td>
                        <td className="py-2 px-3 text-slate-500 text-[11px]">{r.message || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setPreviewData(null)}
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-semibold rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCommitAttendance}
                  disabled={previewData.summary.readyCount === 0}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg disabled:opacity-50"
                >
                  Commit {previewData.summary.readyCount} Ready Rows (Overwrite)
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: QUERY INBOX */}
      {activeTab === "queries" && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Student Discrepancy Query Desk</h3>
              <p className="text-xs text-slate-500">
                Reply to student query threads, mark grievances resolved, or escalate to HOD.
              </p>
            </div>

            {/* Status Filter Buttons */}
            <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs">
              {(["ALL", "OPEN", "ESCALATED", "RESOLVED"] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => setQueryStatusFilter(st)}
                  className={`px-3 py-1 font-semibold rounded-md transition-colors ${
                    queryStatusFilter === st
                      ? "bg-white text-indigo-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          {(() => {
            const filteredQueries = queries.filter((q) => {
              if (queryStatusFilter === "ALL") return true;
              return q.status === queryStatusFilter;
            });

            if (filteredQueries.length === 0) {
              return (
                <div className="p-10 text-center text-slate-500 border border-slate-200 rounded-xl bg-slate-50 space-y-2">
                  <Users className="w-8 h-8 text-slate-300 mx-auto" />
                  <p className="font-semibold text-xs text-slate-700">No {queryStatusFilter.toLowerCase()} queries found.</p>
                  <p className="text-[11px] text-slate-400">Queries raised by students in your assigned sections will appear here.</p>
                </div>
              );
            }

            return (
              <div className="space-y-6">
                {filteredQueries.map((q: any) => (
                  <QueryThread
                    key={q.id}
                    query={q}
                    currentRole="FACULTY"
                    onRefresh={loadQueries}
                  />
                ))}
              </div>
            );
          })()}
        </div>
      )}

      {/* TAB 4: PAST TERMS & REPORTS ARCHIVE */}
      {activeTab === "history" && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Archive className="w-5 h-5 text-[#3730A3]" /> Past Terms & Assigned Offerings Archive
              </h2>
              <p className="text-xs text-slate-500">
                Read-only archive of your teaching assignments across academic terms. Download consolidated Excel spreadsheets and review historical course components.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate-600 uppercase">Term Filter:</label>
              <select
                value={historyTermFilter}
                onChange={(e) => {
                  setHistoryTermFilter(e.target.value);
                  loadFacultyHistory(e.target.value);
                }}
                className="p-2 border border-slate-300 rounded-lg text-xs bg-slate-50 font-medium focus:ring-2 focus:ring-indigo-600"
              >
                <option value="">All Academic Terms</option>
                {historyTerms.map((t: any) => (
                  <option key={t.id} value={t.id}>
                    {t.label} (Sem {t.semesterNumber})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {loadingHistory ? (
            <div className="p-12 text-center text-slate-500 font-medium text-sm">
              Loading historical offerings and reports...
            </div>
          ) : historyOfferings.length === 0 ? (
            <div className="p-12 text-center text-slate-400 font-medium text-xs border border-slate-200 rounded-lg">
              No historical teaching assignments found.
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase">
                    <th className="py-3 px-4">Subject</th>
                    <th className="py-3 px-4">Term</th>
                    <th className="py-3 px-4">Department</th>
                    <th className="py-3 px-4">Assigned Section(s)</th>
                    <th className="py-3 px-4 text-center">Enrolled Students</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {historyOfferings.map((off: any) => (
                    <tr key={off.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{off.subjectName}</div>
                        <span className="font-mono text-xs font-semibold text-[#3730A3]">{off.subjectCode}</span>
                      </td>

                      <td className="py-3 px-4 text-xs font-semibold text-slate-800">
                        {off.termLabel}
                      </td>

                      <td className="py-3 px-4 text-xs font-medium text-slate-700">
                        {off.departmentName}
                      </td>

                      <td className="py-3 px-4 text-xs">
                        {off.sections.map((s: any) => (
                          <span key={s.id} className="inline-block px-2 py-0.5 bg-slate-100 rounded text-slate-800 font-semibold mr-1">
                            Sec {s.name} ({s.studentsCount} students)
                          </span>
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
                        <a
                          href={off.exportUrl}
                          download
                          className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded text-xs font-semibold inline-flex items-center gap-1 transition-colors"
                          title="Export Consolidated Excel Report"
                        >
                          <Download className="w-3.5 h-3.5 text-emerald-600" /> Excel
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Global Notification Toast */}
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
