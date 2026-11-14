"use client";

import { useEffect, useState } from "react";
import { fetchApi } from "@/lib/api";
import { validateSlabsClient } from "@/lib/slabValidation";
import HeaderNav from "@/components/HeaderNav";
import QueryThread from "@/components/QueryThread";
import { Plus, Copy, CheckCircle, AlertTriangle, XCircle, ArrowUpRight, Lock, UserCheck, BookOpen, Layers, ArrowRightLeft, MessageSquare, ShieldAlert, Download, Archive, FileSpreadsheet, BarChart2 } from "lucide-react";
import { SectionAnalyticsCard } from "@/components/SectionAnalyticsCard";

export default function HODDashboard() {
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    fetchApi("/auth/me")
      .then((res) => {
        if (res.authenticated && res.user?.role === "FACULTY" && res.user?.hodDepartmentId) {
          setAuthorized(true);
        } else {
          window.location.href = "/";
        }
      })
      .catch(() => {
        window.location.href = "/";
      });
  }, []);

  const [activeTab, setActiveTab] = useState<"board" | "subjects" | "queries" | "history">("board");

  const [statusBoard, setStatusBoard] = useState<any[]>([]);
  const [masterSubjects, setMasterSubjects] = useState<any[]>([]);
  const [departmentBatches, setDepartmentBatches] = useState<any[]>([]);
  const [availableFaculty, setAvailableFaculty] = useState<any[]>([]);
  const [escalatedQueries, setEscalatedQueries] = useState<any[]>([]);
  const [loadingQueries, setLoadingQueries] = useState(false);

  // History & Reports State
  const [historyTerms, setHistoryTerms] = useState<any[]>([]);
  const [historyOfferings, setHistoryOfferings] = useState<any[]>([]);
  const [historyTermFilter, setHistoryTermFilter] = useState<string>("");
  const [loadingHistory, setLoadingHistory] = useState(false);

  const [loading, setLoading] = useState(true);

  // Department State
  const [selectedDeptId, setSelectedDeptId] = useState("");
  const [deptNameDisplay, setDeptNameDisplay] = useState("");
  const [authorizedDepartments, setAuthorizedDepartments] = useState<any[]>([]);
  const [promotionNotice, setPromotionNotice] = useState<string | null>(null);

  // Promotion Preview Modal
  const [promoteModal, setPromoteModal] = useState<{
    open: boolean;
    batchId: string;
    batchLabel: string;
    preview: any | null;
    loading: boolean;
  } | null>(null);
  const [typedConfirmLabel, setTypedConfirmLabel] = useState("");
  const [executingPromote, setExecutingPromote] = useState(false);

  // New Subject Form
  const [newSubName, setNewSubName] = useState("");
  const [newSubCode, setNewSubCode] = useState("");
  const [newSubSem, setNewSubSem] = useState(1);

  // Faculty Assignment Modal
  const [assignModal, setAssignModal] = useState<{
    open: boolean;
    offeringId: string;
    sectionId: string;
    sectionName: string;
    currentFacultyId: string | null;
  } | null>(null);
  const [selectedFacultyId, setSelectedFacultyId] = useState<string>("");
  const [reassignReason, setReassignReason] = useState<string>("");

  // Section Analytics Modal
  const [analyticsSectionId, setAnalyticsSectionId] = useState<string | null>(null);

  // Policy Builder Modal
  const [policyModal, setPolicyModal] = useState<{ open: boolean; offeringId: string; subjectName: string; isConfirmed?: boolean } | null>(null);
  const [cesWeight, setCesWeight] = useState(10);
  const [intWeight, setIntWeight] = useState(20);
  const [attWeight, setAttWeight] = useState(10);
  const [attShortfallThreshold, setAttShortfallThreshold] = useState(75);
  const [cesComponents, setCesComponents] = useState([
    { name: "CES-I", maxMarks: 10 },
    { name: "CES-II", maxMarks: 10 },
  ]);
  const [slabs, setSlabs] = useState([
    { minPercent: 0, maxPercent: 60, marks: 0 },
    { minPercent: 60.01, maxPercent: 75, marks: 4 },
    { minPercent: 75.01, maxPercent: 85, marks: 6 },
    { minPercent: 85.01, maxPercent: 100, marks: 10 },
  ]);

  useEffect(() => {
    // Read logged-in user's HOD department assignment from localStorage
    const rawUserData = localStorage.getItem("userData");
    if (rawUserData) {
      try {
        const u = JSON.parse(rawUserData);
        if (u.hodDepartmentId) {
          setSelectedDeptId(u.hodDepartmentId);
          setDeptNameDisplay(u.hodDepartmentName || "My Department");
        }
      } catch (err) {
        console.error(err);
      }
    }
  }, []);

  useEffect(() => {
    if (selectedDeptId) {
      loadDashboardData();
    }
  }, [selectedDeptId]);

  const loadEscalatedQueries = async () => {
    setLoadingQueries(true);
    try {
      const res = await fetchApi("/queries?scope=HOD");
      setEscalatedQueries(res.queries || []);
    } catch (err) {
      console.error("Failed to load escalated queries", err);
    } finally {
      setLoadingQueries(false);
    }
  };

  const loadHistoryData = async (termId?: string) => {
    if (!selectedDeptId) return;
    setLoadingHistory(true);
    try {
      const q = `/reports/history?departmentId=${selectedDeptId}${termId ? `&academicTermId=${termId}` : ""}`;
      const res = await fetchApi(q);
      setHistoryTerms(res.terms || []);
      setHistoryOfferings(res.offerings || []);
    } catch (err) {
      console.error("Failed to load history reports", err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const loadDashboardData = async () => {
    if (!selectedDeptId) return;
    setLoading(true);
    try {
      // 1. Fetch Subject Status Board for HOD's department
      const boardRes = await fetchApi(`/hod/subject-offerings?departmentId=${selectedDeptId}`).catch(() => null);
      setStatusBoard(boardRes?.statusBoard || []);

      // 2. Fetch Master Subjects for HOD's department
      const subRes = await fetchApi(`/hod/subjects?departmentId=${selectedDeptId}`).catch(() => null);
      setMasterSubjects(subRes?.subjects || []);

      // 3. Fetch Department Batches & Faculty List
      const deptRes = await fetchApi(`/admin/departments`).catch(() => null);
      setAuthorizedDepartments(deptRes?.departments || []);
      const currentDept = deptRes?.departments?.find((d: any) => d.id === selectedDeptId);
      if (currentDept) {
        setDepartmentBatches(currentDept.batches || []);
        setDeptNameDisplay(currentDept.name);
      }

      // Fetch complete teaching faculty list for HOD assignment
      const facRes = await fetchApi("/hod/faculty-list").catch(() => null);
      setAvailableFaculty(facRes?.faculty || []);

      // Load escalated queries for this HOD
      loadEscalatedQueries();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await fetchApi("/hod/subjects", {
        method: "POST",
        body: JSON.stringify({
          departmentId: selectedDeptId,
          name: newSubName,
          code: newSubCode,
          semesterNumber: Number(newSubSem),
        }),
      });
      alert(`Subject '${newSubName}' (${newSubCode}) created successfully for Semester ${newSubSem}!`);
      setNewSubName("");
      setNewSubCode("");
      loadDashboardData();
    } catch (err: any) {
      alert(err.data?.error || "Failed to create subject");
    }
  };

  const handleOpenHODPromoteModal = async (batchId: string, label: string) => {
    setPromoteModal({
      open: true,
      batchId,
      batchLabel: label,
      preview: null,
      loading: true,
    });
    setTypedConfirmLabel("");
    try {
      const preview = await fetchApi(`/hod/batches/${batchId}/promote/preview`);
      setPromoteModal((prev) => (prev ? { ...prev, preview, loading: false } : null));
    } catch (err: any) {
      alert(err.data?.error || "Failed to load promotion preview");
      setPromoteModal(null);
    }
  };

  const handleExecuteHODPromote = async () => {
    if (!promoteModal || !promoteModal.preview) return;
    if (typedConfirmLabel.trim() !== promoteModal.batchLabel.trim()) {
      alert(`Please type "${promoteModal.batchLabel}" exactly to confirm promotion.`);
      return;
    }

    setExecutingPromote(true);
    try {
      const res = await fetchApi(`/hod/batches/${promoteModal.batchId}/promote`, {
        method: "POST",
      });

      setPromotionNotice(
        `Batch ${promoteModal.batchLabel} successfully promoted to Semester ${res.batch.currentSemester}! Status board updated with new UNASSIGNED offerings below.`
      );
      setPromoteModal(null);
      loadDashboardData();
    } catch (err: any) {
      if (err.status === 403) {
        alert("Forbidden (HTTP 403): You are not authorized as HOD for this batch's department.");
      } else {
        alert(err.data?.error || "Failed to promote batch");
      }
    } finally {
      setExecutingPromote(false);
    }
  };

  const handleAssignFacultySubmit = async () => {
    if (!assignModal) return;

    const isReassign = Boolean(
      assignModal.currentFacultyId && assignModal.currentFacultyId !== selectedFacultyId
    );

    if (isReassign && !reassignReason.trim()) {
      alert("Please provide a reason for reassigning faculty.");
      return;
    }

    try {
      await fetchApi(
        `/hod/subject-offerings/${assignModal.offeringId}/sections/${assignModal.sectionId}/assign-faculty`,
        {
          method: "POST",
          body: JSON.stringify({
            facultyId: selectedFacultyId || null,
            reason: isReassign ? reassignReason.trim() : undefined,
          }),
        }
      );
      alert(
        selectedFacultyId
          ? isReassign
            ? "Faculty reassigned successfully!"
            : "Faculty assigned successfully!"
          : "Faculty unassigned successfully!"
      );
      setAssignModal(null);
      setReassignReason("");
      loadDashboardData();
    } catch (err: any) {
      alert(err.data?.error || "Failed to assign faculty member");
    }
  };

  const getSlabValidationWarnings = (slabsList: any[], attWeightage: number) => {
    return validateSlabsClient(slabsList, attWeightage);
  };

  const openPolicyModal = async (offeringId: string, subjectName: string, isConfirmed: boolean) => {
    try {
      const res = await fetchApi(`/hod/subject-offerings/${offeringId}/policy`).catch(() => null);
      if (res?.policy) {
        setCesWeight(res.policy.cesGroupWeightage);
        setIntWeight(res.policy.internalWeightage);
        setAttWeight(res.policy.attendanceWeightage);
        setAttShortfallThreshold(res.policy.attendanceShortfallPercent ?? 75);
        if (res.policy.scoreComponents?.length) {
          const cesComps = res.policy.scoreComponents
            .filter((c: any) => c.group === "CES")
            .map((c: any) => ({ name: c.name, maxMarks: c.maxMarks }));
          if (cesComps.length) setCesComponents(cesComps);
        }
        if (res.policy.attendanceSlabRanges?.length) {
          setSlabs(
            res.policy.attendanceSlabRanges.map((s: any) => ({
              minPercent: Number(s.minPercent),
              maxPercent: Number(s.maxPercent),
              marks: Number(s.marks),
            }))
          );
        }
      }
    } catch (e) {}

    setPolicyModal({
      open: true,
      offeringId,
      subjectName,
      isConfirmed,
    });
  };

  const handleSavePolicy = async () => {
    if (!policyModal) return;

    const components = [
      ...cesComponents.map((c, i) => ({ group: "CES", name: c.name, maxMarks: Number(c.maxMarks), order: i + 1 })),
      { group: "INTERNAL", name: "Internal Exam", maxMarks: 40, order: cesComponents.length + 1 },
    ];

    try {
      await fetchApi(`/hod/subject-offerings/${policyModal.offeringId}/policy`, {
        method: "POST",
        body: JSON.stringify({
          cesGroupWeightage: Number(cesWeight),
          internalWeightage: Number(intWeight),
          attendanceWeightage: Number(attWeight),
          attendanceShortfallPercent: Number(attShortfallThreshold),
          scoreComponents: components,
          attendanceSlabRanges: slabs,
        }),
      });
      alert("Policy saved! Click 'Confirm Policy' when ready to unlock sections.");
      setPolicyModal(null);
      loadDashboardData();
    } catch (err: any) {
      alert(err.data?.error || err.data?.details?.join("\n") || "Failed to save policy");
    }
  };

  const handleDuplicatePolicy = async (offeringId: string) => {
    try {
      await fetchApi(`/hod/subject-offerings/${offeringId}/policy/duplicate-last-term`, {
        method: "POST",
      });
      alert("Policy duplicated from previous term!");
      loadDashboardData();
    } catch (err: any) {
      alert(err.data?.error || "No previous policy found to duplicate");
    }
  };

  const handleConfirmPolicy = async (offeringId: string) => {
    try {
      await fetchApi(`/hod/subject-offerings/${offeringId}/policy/confirm`, {
        method: "POST",
      });
      alert("Policy confirmed! Sections with assigned faculty are now UNLOCKED.");
      loadDashboardData();
    } catch (err: any) {
      alert(err.data?.error || "Failed to confirm policy");
    }
  };

  const handleUnconfirmPolicy = async (offeringId: string) => {
    if (!confirm("Unlocking this policy will lock sections for faculty until re-confirmed. Proceed?")) {
      return;
    }
    try {
      await fetchApi(`/hod/subject-offerings/${offeringId}/policy/unconfirm`, {
        method: "POST",
      });
      alert("Grading policy unlocked for modifications.");
      if (policyModal?.open) {
        setPolicyModal((prev: any) => (prev ? { ...prev, isConfirmed: false } : null));
      }
      loadDashboardData();
    } catch (err: any) {
      alert(err.data?.error || "Failed to unlock policy");
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
        portalTitle={`HOD Academic Administration — ${deptNameDisplay || "Department"}`}
        portalSubtitle="Master Subjects Directory, Term Offerings, Grading Policies & Section Locking"
        roleBadge="HOD"
      />

      {/* HOD Quick Switcher to Teaching View */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex justify-between items-center">
        <div>
          <span className="text-xs font-semibold text-slate-500 uppercase block">Active HOD Department</span>
          <span className="text-sm font-bold text-slate-900">{deptNameDisplay || "Loading..."}</span>
        </div>

        <a
          href="/faculty"
          className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-[#3730A3] border border-indigo-200 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"
        >
          <ArrowRightLeft className="w-3.5 h-3.5" /> Switch to Teaching View (Marks & Attendance) →
        </a>
      </div>

      {promotionNotice && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-emerald-900 text-sm font-medium">
          <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          <span>{promotionNotice}</span>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 gap-4">
        <button
          onClick={() => setActiveTab("board")}
          className={`pb-3 text-sm font-semibold border-b-2 flex items-center gap-2 ${
            activeTab === "board"
              ? "border-[#3730A3] text-[#3730A3]"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <Layers className="w-4 h-4" /> Current Term Offerings & Status Board ({statusBoard.length})
        </button>

        <button
          onClick={() => setActiveTab("subjects")}
          className={`pb-3 text-sm font-semibold border-b-2 flex items-center gap-2 ${
            activeTab === "subjects"
              ? "border-[#3730A3] text-[#3730A3]"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <BookOpen className="w-4 h-4" /> Master Department Subjects & Creation ({masterSubjects.length})
        </button>

        <button
          onClick={() => {
            setActiveTab("queries");
            loadEscalatedQueries();
          }}
          className={`pb-3 text-sm font-semibold border-b-2 flex items-center gap-2 ${
            activeTab === "queries"
              ? "border-[#3730A3] text-[#3730A3]"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <MessageSquare className="w-4 h-4" /> Escalated Grievances ({escalatedQueries.length})
        </button>

        <button
          onClick={() => {
            setActiveTab("history");
            loadHistoryData(historyTermFilter);
          }}
          className={`pb-3 text-sm font-semibold border-b-2 flex items-center gap-2 ${
            activeTab === "history"
              ? "border-[#3730A3] text-[#3730A3]"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <Archive className="w-4 h-4" /> Past Terms & Reports History
        </button>
      </div>

      {/* TAB 1: CURRENT TERM OFFERINGS & STATUS BOARD */}
      {activeTab === "board" && (
        <div className="space-y-6">
          {/* HOD Department-Scoped Batch Promotion Card */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <ArrowUpRight className="w-5 h-5 text-[#3730A3]" /> Department Batch Promotion Console ({deptNameDisplay})
                </h2>
                <p className="text-xs text-slate-500">
                  Promoting a batch advances its semester and automatically scaffolds new term Subject Offerings into UNASSIGNED status.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {departmentBatches.length === 0 ? (
                <div className="col-span-2 p-4 text-center text-xs text-slate-400 border border-slate-200 rounded-lg">
                  No active batches found for department {deptNameDisplay}.
                </div>
              ) : (
                departmentBatches.map((b: any) => {
                  const maxSem = b.totalSemesters || 6;
                  const isMax = b.currentSemester >= maxSem;

                  return (
                    <div key={b.id} className="p-4 border border-slate-200 rounded-xl bg-slate-50 flex justify-between items-center">
                      <div>
                        <span className="font-bold text-slate-900 text-sm block">{b.label}</span>
                        <span className="text-xs text-slate-500">
                          Progress: <span className="font-semibold text-indigo-900">Semester {b.currentSemester} of {maxSem}</span>
                        </span>
                      </div>

                      <button
                        onClick={() => handleOpenHODPromoteModal(b.id, b.label)}
                        disabled={isMax}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1 ${
                          isMax
                            ? "bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300"
                            : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                        }`}
                      >
                        {isMax ? (
                          <>
                            <Lock className="w-3.5 h-3.5" /> Max Sem Reached ({maxSem})
                          </>
                        ) : (
                          <>
                            <ArrowUpRight className="w-3.5 h-3.5" /> Promote to Sem {b.currentSemester + 1}
                          </>
                        )}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Status Board List */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
            <h2 className="text-lg font-bold text-slate-900">Current Term Subject Offerings ({deptNameDisplay})</h2>

            {loading ? (
              <div className="p-8 text-center text-slate-500">Loading Status Board...</div>
            ) : statusBoard.length === 0 ? (
              <div className="p-8 text-center text-slate-500 border border-slate-200 rounded-lg">
                No active subject offerings found for {deptNameDisplay} current term. Promote a batch above to generate offerings.
              </div>
            ) : (
              <div className="space-y-6">
                {statusBoard.map((offering: any) => (
                  <div key={offering.offeringId} className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="bg-slate-100 p-4 border-b border-slate-200 flex justify-between items-center">
                      <div>
                        <span className="text-xs font-bold text-[#3730A3] bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                          {offering.subjectCode}
                        </span>
                        <h3 className="text-base font-bold text-slate-900 mt-1 inline-block ml-2">{offering.subjectName}</h3>
                        <span className="text-xs text-slate-500 block">Term: {offering.termLabel} | Semester {offering.semesterNumber}</span>
                      </div>

                      <div className="flex gap-2">
                        <a
                          href={`/api/reports/subject-offerings/${offering.offeringId}/export`}
                          download
                          className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-semibold rounded-lg flex items-center gap-1 transition-colors"
                          title="Export Consolidated IA Report (Excel)"
                        >
                          <Download className="w-3.5 h-3.5 text-emerald-700" /> Export Excel
                        </a>
                        <button
                          onClick={() => handleDuplicatePolicy(offering.offeringId)}
                          className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-semibold rounded-lg flex items-center gap-1"
                        >
                          <Copy className="w-3.5 h-3.5" /> Duplicate Last Term
                        </button>
                        <button
                          onClick={() => openPolicyModal(offering.offeringId, offering.subjectName, Boolean(offering.isPolicyConfirmed))}
                          className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg"
                        >
                          Configure Policy
                        </button>
                        {offering.isPolicyConfirmed ? (
                          <button
                            onClick={() => handleUnconfirmPolicy(offering.offeringId)}
                            className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1 shadow-sm"
                          >
                            <Lock className="w-3.5 h-3.5" /> Unlock Policy
                          </button>
                        ) : (
                          <button
                            onClick={() => handleConfirmPolicy(offering.offeringId)}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1 shadow-sm"
                          >
                            <CheckCircle className="w-3.5 h-3.5" /> Confirm Policy
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Sections Grid with Faculty Assignment Picker Button */}
                    <div className="p-4 bg-white divide-y divide-slate-100">
                      {offering.sections.map((sec: any) => (
                        <div key={sec.id} className="py-3 flex justify-between items-center">
                          <div>
                            <span className="font-bold text-slate-900 text-sm">Section {sec.sectionName}</span>
                            <span className="text-xs text-slate-500 block">
                              Faculty: <span className="font-semibold text-slate-700">{sec.facultyName || "Unassigned"}</span>
                            </span>
                            <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-medium bg-slate-100 text-slate-700 border border-slate-200">
                                <strong>Marks:</strong> {sec.marksEnteredStudents ?? 0} / {sec.totalStudents ?? 0} students
                              </span>
                              {sec.attendanceUploaded ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  Attendance Uploaded
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-medium bg-amber-50 text-amber-700 border border-amber-200">
                                  Attendance Pending
                                </span>
                              )}
                              {sec.isPublished ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-semibold bg-emerald-50 text-emerald-800 border border-emerald-300">
                                  Published
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-medium bg-slate-100 text-slate-500 border border-slate-200">
                                  Unpublished
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            {sec.status === "ACTIVE" && (
                              <span className="pill-emerald">
                                <CheckCircle className="w-3.5 h-3.5" /> ACTIVE (UNLOCKED)
                              </span>
                            )}
                            {sec.status === "POLICY_PENDING" && (
                              <span className="pill-amber">
                                <AlertTriangle className="w-3.5 h-3.5" /> POLICY PENDING
                              </span>
                            )}
                            {sec.status === "UNASSIGNED" && (
                              <span className="pill-rose">
                                <XCircle className="w-3.5 h-3.5" /> UNASSIGNED
                              </span>
                            )}

                            <button
                              onClick={() => setAnalyticsSectionId(sec.sectionId)}
                              className="px-2.5 py-1 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-semibold rounded flex items-center gap-1 shadow-sm"
                              title="View section performance and attendance analytics"
                            >
                              <BarChart2 className="w-3.5 h-3.5 text-indigo-600" /> Analytics
                            </button>

                            <button
                              onClick={() => {
                                setAssignModal({
                                  open: true,
                                  offeringId: offering.offeringId,
                                  sectionId: sec.sectionId,
                                  sectionName: sec.sectionName,
                                  currentFacultyId: sec.facultyId,
                                });
                                setSelectedFacultyId(sec.facultyId || "");
                                setReassignReason("");
                              }}
                              className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-[#3730A3] border border-indigo-200 text-xs font-semibold rounded flex items-center gap-1"
                            >
                              <UserCheck className="w-3.5 h-3.5" /> Assign Faculty
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: MASTER DEPARTMENT SUBJECTS & CREATION FORM */}
      {activeTab === "subjects" && (
        <div className="space-y-6">
          {/* Create Subject Form */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Plus className="w-5 h-5 text-[#3730A3]" /> Create New Subject ({deptNameDisplay})
            </h2>

            <form onSubmit={handleCreateSubject} className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Subject Name</label>
                <input
                  type="text"
                  required
                  value={newSubName}
                  onChange={(e) => setNewSubName(e.target.value)}
                  placeholder="e.g. Advanced Java"
                  className="w-full p-2 border border-slate-300 rounded text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Subject Code</label>
                <input
                  type="text"
                  required
                  value={newSubCode}
                  onChange={(e) => setNewSubCode(e.target.value)}
                  placeholder="e.g. MCA102"
                  className="w-full p-2 border border-slate-300 rounded text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Semester Number</label>
                <input
                  type="number"
                  required
                  min={1}
                  max={6}
                  value={newSubSem}
                  onChange={(e) => setNewSubSem(Number(e.target.value))}
                  onWheel={(e) => (e.target as HTMLElement).blur()}
                  className="w-full p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-indigo-600 focus:outline-none"
                />
              </div>

              <div className="col-span-3 flex justify-end">
                <button
                  type="submit"
                  className="px-6 py-2 bg-[#3730A3] hover:bg-[#4338CA] text-white text-xs font-semibold rounded-lg shadow-sm"
                >
                  Create Master Subject
                </button>
              </div>
            </form>
          </div>

          {/* Master Subject Directory */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
            <h2 className="text-lg font-bold text-slate-900">Master Subject Directory ({deptNameDisplay})</h2>

            {masterSubjects.length === 0 ? (
              <div className="p-8 text-center text-slate-500 border border-slate-200 rounded-lg">
                No subjects created for {deptNameDisplay} department yet.
              </div>
            ) : (
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase">
                      <th className="py-3 px-4">Subject Code</th>
                      <th className="py-3 px-4">Subject Name</th>
                      <th className="py-3 px-4 text-center">Semester Number</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {masterSubjects.map((s: any) => (
                      <tr key={s.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-mono font-bold text-[#3730A3]">{s.code}</td>
                        <td className="py-3 px-4 font-semibold text-slate-900">{s.name}</td>
                        <td className="py-3 px-4 text-center font-bold text-slate-700">Semester {s.semesterNumber}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: ESCALATED GRIEVANCES (HOD DIRECTIVE VIEW) */}
      {activeTab === "queries" && (
        <div className="space-y-6">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900 leading-relaxed">
              <strong className="font-semibold block text-sm mb-1 text-amber-950">
                HOD Department Scoping & Zero Direct Mark Modification Policy
              </strong>
              You are viewing escalated student grievance queries belonging exclusively to your department ({deptNameDisplay}).
              As HOD, you can review the query discussion and post instructional directives to teaching faculty. In compliance with academic integrity guidelines, HODs cannot directly overwrite student marks; all mark corrections must be executed by the assigned faculty member following your directive.
            </div>
          </div>

          {loadingQueries ? (
            <div className="p-12 text-center text-slate-500 bg-white rounded-xl border border-slate-200 font-medium text-sm">
              Loading escalated department grievances...
            </div>
          ) : escalatedQueries.length === 0 ? (
            <div className="p-12 text-center text-slate-500 bg-white rounded-xl border border-slate-200 font-medium text-sm">
              No escalated grievance queries found for {deptNameDisplay}.
            </div>
          ) : (
            <div className="space-y-4">
              {escalatedQueries.map((q) => (
                <QueryThread
                  key={q.id}
                  query={q}
                  currentRole="HOD"
                  onRefresh={loadEscalatedQueries}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: PAST TERMS & OFFERINGS ARCHIVE */}
      {activeTab === "history" && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Archive className="w-5 h-5 text-[#3730A3]" /> Past Terms & Academic Offerings Archive ({deptNameDisplay})
              </h2>
              <p className="text-xs text-slate-500">
                Read-only repository of current and historical subject offerings for {deptNameDisplay}. Download consolidated IA spreadsheets and audit historical grades.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate-600 uppercase">Filter Term:</label>
              <select
                value={historyTermFilter}
                onChange={(e) => {
                  setHistoryTermFilter(e.target.value);
                  loadHistoryData(e.target.value);
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
              No historical offerings found for {deptNameDisplay}.
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase">
                    <th className="py-3 px-4">Subject</th>
                    <th className="py-3 px-4">Academic Term</th>
                    <th className="py-3 px-4">Sections & Assigned Faculty</th>
                    <th className="py-3 px-4 text-center">Enrolled Students</th>
                    <th className="py-3 px-4 text-center">Grading Policy</th>
                    <th className="py-3 px-4 text-right">Consolidated Reports</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {historyOfferings.map((off: any) => (
                    <tr key={off.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{off.subjectName}</div>
                        <span className="font-mono text-xs font-semibold text-[#3730A3]">{off.subjectCode}</span>
                      </td>

                      <td className="py-3 px-4 text-xs">
                        <span className="font-semibold text-slate-800">{off.termLabel}</span>
                        <span className="text-slate-400 block text-[11px]">Semester {off.semesterNumber}</span>
                      </td>

                      <td className="py-3 px-4 text-xs space-y-1">
                        {off.sections.map((sec: any) => (
                          <div key={sec.id} className="text-slate-600">
                            <span className="font-bold text-slate-800">Sec {sec.name}:</span> {sec.facultyName} ({sec.studentsCount} students)
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
                          <span className="pill-amber">Draft / Unconfirmed</span>
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

      {/* Promotion Preview Modal */}
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
                    onClick={handleExecuteHODPromote}
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

      {/* Faculty Assignment Picker Modal */}
      {assignModal?.open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full space-y-4 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">
              Assign Faculty to Section {assignModal.sectionName}
            </h3>

            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Select Teaching Faculty</label>
              <select
                value={selectedFacultyId}
                onChange={(e) => setSelectedFacultyId(e.target.value)}
                className="w-full p-2.5 border border-slate-300 rounded-lg text-sm bg-slate-50 focus:ring-2 focus:ring-indigo-600 focus:outline-none font-medium"
              >
                <option value="">(Unassigned)</option>
                {availableFaculty.map((fac: any) => (
                  <option key={fac.id} value={fac.id}>
                    {fac.name} ({fac.employeeId})
                  </option>
                ))}
              </select>
            </div>

            {assignModal.currentFacultyId && assignModal.currentFacultyId !== selectedFacultyId && (
              <div className="space-y-1.5 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <label className="block text-xs font-semibold text-amber-800">
                  Reason for Reassignment <span className="text-red-500">*</span>
                </label>
                <p className="text-[11px] text-amber-700">
                  Reassigning this section will transfer open student queries to the new faculty, notify both faculty members, and record an audit log.
                </p>
                <textarea
                  value={reassignReason}
                  onChange={(e) => setReassignReason(e.target.value)}
                  placeholder="Enter mandatory reason for faculty reassignment..."
                  rows={2}
                  className="w-full p-2 border border-amber-300 rounded text-xs bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 font-medium"
                />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                onClick={() => setAssignModal(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleAssignFacultySubmit}
                className="px-4 py-2 bg-[#3730A3] hover:bg-[#4338CA] text-white text-xs font-semibold rounded-lg"
              >
                Save Assignment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Section Analytics Modal */}
      {analyticsSectionId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="max-w-2xl w-full my-8">
            <SectionAnalyticsCard
              sectionId={analyticsSectionId}
              onClose={() => setAnalyticsSectionId(null)}
              isCollapsible={false}
            />
          </div>
        </div>
      )}

      {/* Policy Builder Modal */}
      {policyModal?.open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-xl p-6 max-w-2xl w-full space-y-6 shadow-xl my-8">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-bold text-slate-900">Configure Grading Policy: {policyModal.subjectName}</h3>
              {policyModal.isConfirmed && (
                <span className="pill-rose flex items-center gap-1 text-xs">
                  <Lock className="w-3.5 h-3.5" /> CONFIRMED & LOCKED
                </span>
              )}
            </div>

            {policyModal.isConfirmed && (
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between text-amber-900 text-xs font-medium">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                  <span>This policy is <strong>CONFIRMED & LOCKED</strong>. Unlock it to make changes.</span>
                </div>
                <button
                  onClick={() => handleUnconfirmPolicy(policyModal.offeringId)}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1 shadow-sm"
                >
                  <Lock className="w-3.5 h-3.5" /> Unlock Policy to Edit
                </button>
              </div>
            )}

            <div className={`grid grid-cols-2 sm:grid-cols-4 gap-4 bg-indigo-50 p-4 rounded-lg border border-indigo-200 ${policyModal.isConfirmed ? "opacity-60 pointer-events-none" : ""}`}>
              <div>
                <label className="block text-xs font-bold text-indigo-900 uppercase mb-1">CES Weightage</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  disabled={policyModal.isConfirmed}
                  value={cesWeight}
                  onChange={(e) => setCesWeight(Number(e.target.value))}
                  onWheel={(e) => (e.target as HTMLElement).blur()}
                  className={`w-full p-2 border rounded text-sm font-semibold focus:ring-2 focus:outline-none ${
                    cesWeight < 0 || cesWeight > 100 ? "border-rose-500 bg-rose-50 text-rose-900" : "border-slate-300 focus:ring-indigo-600"
                  }`}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-indigo-900 uppercase mb-1">Internal Weightage</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  disabled={policyModal.isConfirmed}
                  value={intWeight}
                  onChange={(e) => setIntWeight(Number(e.target.value))}
                  onWheel={(e) => (e.target as HTMLElement).blur()}
                  className={`w-full p-2 border rounded text-sm font-semibold focus:ring-2 focus:outline-none ${
                    intWeight < 0 || intWeight > 100 ? "border-rose-500 bg-rose-50 text-rose-900" : "border-slate-300 focus:ring-indigo-600"
                  }`}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-indigo-900 uppercase mb-1">Attendance Weightage</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  disabled={policyModal.isConfirmed}
                  value={attWeight}
                  onChange={(e) => setAttWeight(Number(e.target.value))}
                  onWheel={(e) => (e.target as HTMLElement).blur()}
                  className={`w-full p-2 border rounded text-sm font-semibold focus:ring-2 focus:outline-none ${
                    attWeight < 0 || attWeight > 100 ? "border-rose-500 bg-rose-50 text-rose-900" : "border-slate-300 focus:ring-indigo-600"
                  }`}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-indigo-900 uppercase mb-1">Shortfall Warning (%)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  disabled={policyModal.isConfirmed}
                  value={attShortfallThreshold}
                  onChange={(e) => setAttShortfallThreshold(Number(e.target.value))}
                  onWheel={(e) => (e.target as HTMLElement).blur()}
                  placeholder="75"
                  className="w-full p-2 border border-slate-300 rounded text-sm font-semibold focus:ring-2 focus:ring-indigo-600 focus:outline-none"
                />
              </div>
            </div>

            <div className="text-center font-extrabold text-[#3730A3] text-lg bg-slate-100 p-3 rounded-lg border border-slate-200">
              Live Total IA Marks: {cesWeight + intWeight + attWeight} Marks
            </div>

            <div className={`space-y-3 ${policyModal.isConfirmed ? "opacity-60 pointer-events-none" : ""}`}>
              <div className="flex justify-between items-center">
                <h4 className="text-sm font-bold text-slate-800">CES Test Components</h4>
                {!policyModal.isConfirmed && (
                  <button
                    onClick={() => setCesComponents([...cesComponents, { name: `CES-${cesComponents.length + 1}`, maxMarks: 10 }])}
                    className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> Add Component
                  </button>
                )}
              </div>

              {cesComponents.map((comp, idx) => (
                <div key={idx} className="flex gap-3 items-center">
                  <input
                    type="text"
                    disabled={policyModal.isConfirmed}
                    value={comp.name}
                    onChange={(e) => {
                      const updated = [...cesComponents];
                      updated[idx].name = e.target.value;
                      setCesComponents(updated);
                    }}
                    className="flex-1 p-2 border border-slate-300 rounded text-sm"
                  />
                  <input
                    type="number"
                    min={1}
                    max={100}
                    disabled={policyModal.isConfirmed}
                    value={comp.maxMarks}
                    onChange={(e) => {
                      const updated = [...cesComponents];
                      updated[idx].maxMarks = Number(e.target.value);
                      setCesComponents(updated);
                    }}
                    onWheel={(e) => (e.target as HTMLElement).blur()}
                    placeholder="Max Marks"
                    className={`w-28 p-2 border rounded text-sm font-mono focus:ring-2 focus:outline-none ${
                      comp.maxMarks < 1 || comp.maxMarks > 100 ? "border-rose-500 bg-rose-50 text-rose-900" : "border-slate-300 focus:ring-indigo-600"
                    }`}
                  />
                </div>
              ))}
            </div>

            {/* Attendance Slab Ranges Table & Validation */}
            <div className={`space-y-3 pt-4 border-t border-slate-200 ${policyModal.isConfirmed ? "opacity-60 pointer-events-none" : ""}`}>
              <div className="flex justify-between items-center">
                <div>
                  <h4 className="text-sm font-bold text-slate-800">Attendance Slab Ranges Table</h4>
                  <p className="text-xs text-slate-500">Attendance % ranges mapped to slab marks.</p>
                </div>
                {!policyModal.isConfirmed && (
                  <button
                    onClick={() => setSlabs([...slabs, { minPercent: 85.01, maxPercent: 100, marks: attWeight }])}
                    className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> Add Slab Range
                  </button>
                )}
              </div>

              {getSlabValidationWarnings(slabs, attWeight).length > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-xs space-y-1">
                  {getSlabValidationWarnings(slabs, attWeight).map((w, idx) => (
                    <div key={idx} className="flex items-center gap-1.5 font-medium">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                      <span>{w}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200 text-slate-600 font-semibold uppercase">
                      <th className="py-2 px-3">Min %</th>
                      <th className="py-2 px-3">Max %</th>
                      <th className="py-2 px-3">Slab Marks</th>
                      {!policyModal.isConfirmed && <th className="py-2 px-3 text-center">Action</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {slabs.map((s, idx) => (
                      <tr key={idx}>
                        <td className="py-2 px-3">
                          <input
                            type="number"
                            step="0.01"
                            min={0}
                            max={100}
                            disabled={policyModal.isConfirmed}
                            value={s.minPercent}
                            onChange={(e) => {
                              const updated = [...slabs];
                              updated[idx].minPercent = Number(e.target.value);
                              setSlabs(updated);
                            }}
                            onWheel={(e) => (e.target as HTMLElement).blur()}
                            className="w-24 p-1.5 border border-slate-300 rounded font-semibold text-xs focus:ring-2 focus:ring-indigo-600 focus:outline-none"
                          />
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="number"
                            step="0.01"
                            min={0}
                            max={100}
                            disabled={policyModal.isConfirmed}
                            value={s.maxPercent}
                            onChange={(e) => {
                              const updated = [...slabs];
                              updated[idx].maxPercent = Number(e.target.value);
                              setSlabs(updated);
                            }}
                            onWheel={(e) => (e.target as HTMLElement).blur()}
                            className="w-24 p-1.5 border border-slate-300 rounded font-semibold text-xs focus:ring-2 focus:ring-indigo-600 focus:outline-none"
                          />
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="number"
                            min={0}
                            max={attWeight}
                            disabled={policyModal.isConfirmed}
                            value={s.marks}
                            onChange={(e) => {
                              const updated = [...slabs];
                              updated[idx].marks = Number(e.target.value);
                              setSlabs(updated);
                            }}
                            onWheel={(e) => (e.target as HTMLElement).blur()}
                            className="w-24 p-1.5 border border-slate-300 rounded font-semibold text-xs focus:ring-2 focus:ring-indigo-600 focus:outline-none"
                          />
                        </td>
                        {!policyModal.isConfirmed && (
                          <td className="py-2 px-3 text-center">
                            <button
                              onClick={() => setSlabs(slabs.filter((_, i) => i !== idx))}
                              className="text-rose-600 hover:text-rose-800 p-1"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
              <button
                onClick={() => setPolicyModal(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg"
              >
                Close
              </button>
              {!policyModal.isConfirmed && (
                <button
                  onClick={handleSavePolicy}
                  className="px-4 py-2 bg-[#3730A3] hover:bg-[#4338CA] text-white text-xs font-semibold rounded-lg"
                >
                  Save Policy
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
