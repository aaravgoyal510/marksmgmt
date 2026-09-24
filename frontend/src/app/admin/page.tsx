"use client";

import { useEffect, useState } from "react";
import { fetchApi } from "@/lib/api";
import HeaderNav from "@/components/HeaderNav";
import { Building, GraduationCap, UserPlus, ArrowUpRight, CheckCircle, Lock, RefreshCw, UserCheck, Plus } from "lucide-react";

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

  const [activeTab, setActiveTab] = useState<"structure" | "students" | "faculty">("structure");

  const [departments, setDepartments] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [facultyList, setFacultyList] = useState<any[]>([]);

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

  const [hodPromoteModal, setHodPromoteModal] = useState<{ open: boolean; facultyId: string; facultyName: string } | null>(null);
  const [targetDeptId, setTargetDeptId] = useState<string>("");

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

  const handlePromoteBatch = async (batchId: string, label: string) => {
    if (!confirm(`Are you sure you want to promote Batch ${label} to the next semester?`)) return;
    try {
      const res = await fetchApi(`/admin/batches/${batchId}/promote`, {
        method: "POST",
      });
      setPromotionMessage(`Batch ${label} successfully promoted to Semester ${res.batch.currentSemester}! New semester Subject Offerings scaffolded.`);
      loadAllData();
    } catch (err: any) {
      alert(err.data?.error || "Failed to promote batch");
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
                            onClick={() => handlePromoteBatch(b.id, b.label)}
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

      {/* TAB 2: ENROLLED STUDENTS & REPEATER SEMESTER OVERRIDES */}
      {activeTab === "students" && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Enrolled Student Directory</h2>
              <p className="text-xs text-slate-500">
                Manage individual student <span className="font-bold text-indigo-900">semesterOverride</span> for repeaters without removing them from their batch.
              </p>
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
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {students.map((st: any) => (
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
                    <td className="py-3 px-4 text-right">
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
                        className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-[#3730A3] border border-indigo-200 text-xs font-semibold rounded-lg flex items-center gap-1 ml-auto"
                      >
                        <RefreshCw className="w-3.5 h-3.5" /> Set/Clear Override
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: FACULTY DIRECTORY & HOD PROMOTIONS */}
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

            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase">
                    <th className="py-3 px-4">Faculty Name</th>
                    <th className="py-3 px-4">Employee ID</th>
                    <th className="py-3 px-4">Home Department</th>
                    <th className="py-3 px-4">Current HOD Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {facultyList.map((f: any) => (
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
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => {
                            setHodPromoteModal({
                              open: true,
                              facultyId: f.id,
                              facultyName: f.name,
                            });
                          }}
                          className="px-3 py-1.5 bg-[#3730A3] hover:bg-[#4338CA] text-white text-xs font-semibold rounded-lg flex items-center gap-1 ml-auto"
                        >
                          <UserCheck className="w-3.5 h-3.5" /> Promote to HOD
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
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

      {/* FACULTY HOD PROMOTION MODAL (EXPLICIT REPLACEMENT WITH CONFIRMATION DIALOG) */}
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
    </div>
  );
}
