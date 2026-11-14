"use client";

import { useEffect, useState } from "react";
import { fetchApi, getApiUrl } from "@/lib/api";
import HeaderNav from "@/components/HeaderNav";
import QueryThread, { QueryItem } from "@/components/QueryThread";
import { BookOpen, AlertCircle, Download, MessageSquare, Plus, CheckCircle2, Calculator } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { attendanceScore } from "@/services/gradingEngine";

export default function StudentSemesterView() {
  const [authorized, setAuthorized] = useState(false);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"marks" | "queries">("marks");

  // Queries state
  const [queries, setQueries] = useState<QueryItem[]>([]);
  const [loadingQueries, setLoadingQueries] = useState(false);
  const [queryModal, setQueryModal] = useState<{
    open: boolean;
    offeringSectionId: string;
    subjectName: string;
    components: Array<{ id: string; name: string }>;
  } | null>(null);
  const [selectedComponentId, setSelectedComponentId] = useState<string>("");
  const [queryMsg, setQueryMsg] = useState("");
  const [submittingQuery, setSubmittingQuery] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // What-If Attendance Calculator State (subjectId -> whatIfPercent)
  const [whatIfInputs, setWhatIfInputs] = useState<Record<string, number>>({});

  useEffect(() => {
    fetchApi("/auth/me")
      .then((res) => {
        if (res.authenticated && res.user?.role === "STUDENT") {
          setAuthorized(true);
          loadSemesterView();
          loadStudentQueries();
        } else {
          window.location.href = "/";
        }
      })
      .catch(() => {
        window.location.href = "/";
      });
  }, []);

  const loadSemesterView = async () => {
    try {
      const res = await fetchApi("/students/me/semester-view");
      setData(res);
    } catch (err) {
      console.error("Failed to load semester view", err);
    } finally {
      setLoading(false);
    }
  };

  const loadStudentQueries = async () => {
    setLoadingQueries(true);
    try {
      const res = await fetchApi("/queries");
      setQueries(res.queries || []);
    } catch (err) {
      console.error("Failed to load student queries", err);
    } finally {
      setLoadingQueries(false);
    }
  };

  const handleRaiseQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!queryModal || !queryMsg.trim()) return;
    setSubmittingQuery(true);

    try {
      await fetchApi("/queries", {
        method: "POST",
        body: JSON.stringify({
          subjectOfferingSectionId: queryModal.offeringSectionId,
          scoreComponentId: selectedComponentId || undefined,
          message: queryMsg.trim(),
        }),
      });
      setToastMsg("Grievance query submitted successfully! Your faculty has been notified.");
      setTimeout(() => setToastMsg(null), 4000);
      setQueryModal(null);
      setQueryMsg("");
      setSelectedComponentId("");
      await loadStudentQueries();
      setActiveTab("queries");
    } catch (err: any) {
      alert(err.data?.error || "Failed to submit query");
    } finally {
      setSubmittingQuery(false);
    }
  };

  if (!authorized) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-500 text-sm font-semibold">
        Verifying security credentials...
      </div>
    );
  }

  if (loading) {
    return <div className="p-8 text-center text-slate-500 font-medium">Loading Semester View...</div>;
  }

  if (!data || !data.student) {
    return <div className="p-8 text-center text-rose-500">Failed to load student data.</div>;
  }

  const openQueriesCount = queries.filter((q) => q.status !== "RESOLVED").length;

  return (
    <div className="min-h-screen bg-slate-50 p-6 max-w-6xl mx-auto space-y-8">
      {/* Top Header Bar */}
      <HeaderNav
        portalTitle={data.student.name}
        portalSubtitle={`${data.student.departmentName} | Batch ${data.student.batchLabel} | Section ${data.student.sectionName} | Current Semester ${data.student.currentSemester}`}
        roleBadge="STUDENT"
      />

      {/* Toast Alert */}
      {toastMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs rounded-xl flex items-center gap-2 shadow-sm">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <span className="font-semibold">{toastMsg}</span>
        </div>
      )}

      {/* Portal Tabs */}
      <div className="flex border-b border-slate-200 gap-2">
        <button
          onClick={() => setActiveTab("marks")}
          className={`px-4 py-2.5 font-semibold text-xs border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === "marks"
              ? "border-[#3730A3] text-[#3730A3]"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <BookOpen className="w-4 h-4" /> Current Semester Marks
        </button>

        <button
          onClick={() => setActiveTab("queries")}
          className={`px-4 py-2.5 font-semibold text-xs border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === "queries"
              ? "border-[#3730A3] text-[#3730A3]"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <MessageSquare className="w-4 h-4" /> My Grievance Queries
          {openQueriesCount > 0 && (
            <span className="bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full text-[10px]">
              {openQueriesCount} Active
            </span>
          )}
        </button>
      </div>

      {/* TAB 1: SEMESTER MARKS */}
      {activeTab === "marks" && (
        <div className="space-y-6">
          <div className="flex flex-wrap justify-between items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-[#3730A3]" /> Current Semester Subjects
            </h2>
            <div className="flex items-center gap-2.5">
              <a
                href={getApiUrl(`/students/${data.student.id}/transcript/pdf`)}
                download
                className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-[#3730A3] border border-indigo-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
                title="Download Multi-Term Cumulative Assessment Transcript"
              >
                <Download className="w-3.5 h-3.5" /> Cumulative Transcript (PDF)
              </a>
              <span className="text-xs text-slate-500">
                Total Offerings: <strong>{data.subjects.length}</strong>
              </span>
            </div>
          </div>

          {data.subjects.length === 0 ? (
            <div className="bg-white p-8 rounded-xl border border-slate-200 text-center text-slate-500">
              No active subject offerings available for your current semester yet.
            </div>
          ) : (
            data.subjects.map((sub: any) => {
              const chartData = [
                { name: "CES Weighted", score: sub.computedScores?.cesScore || 0, max: sub.policyWeightages?.ces || 0 },
                { name: "Internal Exam", score: sub.computedScores?.internalScore || 0, max: sub.policyWeightages?.internal || 0 },
                { name: "Attendance", score: sub.computedScores?.attendanceScore || 0, max: sub.policyWeightages?.attendance || 0 },
              ];

              return (
                <div key={sub.subjectId} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                  {/* Subject Header */}
                  <div className="bg-slate-100 p-4 border-b border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-indigo-[#3730A3] uppercase bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                          {sub.subjectCode}
                        </span>
                        {sub.isPublished ? (
                          <span className="pill-emerald text-[11px] py-0.5 px-2">
                            <CheckCircle2 className="w-3 h-3" /> Published
                          </span>
                        ) : (
                          <span className="pill-amber text-[11px] py-0.5 px-2">
                            <AlertCircle className="w-3 h-3" /> Not yet published
                          </span>
                        )}
                      </div>
                      <h3 className="text-lg font-bold text-slate-900 mt-1">{sub.subjectName}</h3>
                      <p className="text-xs text-slate-500">Faculty: {sub.facultyName}</p>
                    </div>

                    <div className="flex items-center gap-3">
                      {sub.offeringSectionId && sub.isPublished && (
                        <button
                          onClick={() => {
                            setQueryModal({
                              open: true,
                              offeringSectionId: sub.offeringSectionId,
                              subjectName: sub.subjectName,
                              components: sub.components || [],
                            });
                            setSelectedComponentId("");
                          }}
                          className="px-3 py-1.5 bg-amber-50 text-amber-800 border border-amber-300 rounded-lg text-xs font-semibold hover:bg-amber-100 transition-colors flex items-center gap-1.5 shadow-sm"
                        >
                          <AlertCircle className="w-3.5 h-3.5" /> Raise Query
                        </button>
                      )}

                      {sub.offeringId && sub.isPublished && (
                        <a
                          href={getApiUrl(`/reports/students/${data.student.id}/subject-offerings/${sub.offeringId}/pdf`)}
                          target="_blank"
                          rel="noreferrer"
                          className="px-3 py-1.5 bg-[#3730A3] text-white rounded-lg text-xs font-semibold hover:bg-[#4338CA] transition-colors flex items-center gap-1.5 shadow-sm"
                        >
                          <Download className="w-3.5 h-3.5" /> PDF Mark Sheet
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Attendance Shortfall Warning Banner */}
                  {sub.isPublished &&
                    sub.attendancePercent !== null &&
                    sub.attendancePercent < (sub.policyWeightages?.attendanceShortfallPercent ?? 75) && (
                      <div className="bg-rose-50 border-y border-rose-200 px-4 py-3 flex items-center gap-3">
                        <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0" />
                        <div className="text-xs text-rose-900 flex-1">
                          <strong>Attendance Shortfall Warning:</strong> Your current attendance is{" "}
                          <span className="font-bold underline">{sub.attendancePercent}%</span>, which is below the
                          institutional requirement of {sub.policyWeightages?.attendanceShortfallPercent ?? 75}%. You
                          are at risk of detention or attendance marks forfeiture.
                        </div>
                      </div>
                    )}

                  {/* Subject Breakdown & Chart Grid */}
                  {!sub.isPublished ? (
                    <div className="p-8 text-center bg-slate-50 border-t border-slate-200 text-slate-500 text-sm">
                      <p className="font-semibold text-slate-700">Marks Not Yet Published</p>
                      <p className="text-xs text-slate-500 mt-1">
                        Internal Assessment marks and attendance records have not been released by the course faculty yet.
                      </p>
                    </div>
                  ) : (
                    <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 space-y-4">
                      <h4 className="text-xs font-semibold text-slate-400 uppercase">Component Breakdown</h4>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm border-collapse">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase">
                              <th className="py-2.5 px-3">Component</th>
                              <th className="py-2.5 px-3">Group</th>
                              <th className="py-2.5 px-3 text-right">Max Marks</th>
                              <th className="py-2.5 px-3 text-right">Raw Obtained</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {sub.components.map((comp: any) => (
                              <tr key={comp.id}>
                                <td className="py-2.5 px-3 font-medium text-slate-800">{comp.name}</td>
                                <td className="py-2.5 px-3 text-xs text-slate-500">{comp.group}</td>
                                <td className="py-2.5 px-3 text-right tabular-nums">{comp.maxMarks}</td>
                                <td className="py-2.5 px-3 text-right tabular-nums font-semibold text-indigo-900">
                                  {comp.marksObtained !== null ? comp.marksObtained : "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="grid grid-cols-4 gap-3 pt-2 text-center">
                        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                          <div className="text-[10px] font-semibold uppercase text-slate-500">CES Weightage</div>
                          <div className="text-base font-bold text-slate-900 tabular-nums">
                            {sub.computedScores?.cesScore.toFixed(2) ?? "0.00"} / {sub.policyWeightages?.ces ?? 0}
                          </div>
                        </div>

                        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                          <div className="text-[10px] font-semibold uppercase text-slate-500">Internal Weightage</div>
                          <div className="text-base font-bold text-slate-900 tabular-nums">
                            {sub.computedScores?.internalScore.toFixed(2) ?? "0.00"} / {sub.policyWeightages?.internal ?? 0}
                          </div>
                        </div>

                        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                          <div className="text-[10px] font-semibold uppercase text-slate-500">Attendance ({sub.attendancePercent}%)</div>
                          <div className="text-base font-bold text-slate-900 tabular-nums">
                            {sub.computedScores?.attendanceScore ?? 0} / {sub.policyWeightages?.attendance ?? 0}
                          </div>
                        </div>

                        <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-200">
                          <div className="text-[10px] font-semibold uppercase text-indigo-800">Total IA Marks</div>
                          <div className="text-lg font-extrabold text-[#3730A3] tabular-nums">
                            {sub.computedScores?.totalIA !== null ? sub.computedScores?.totalIA.toFixed(2) : "N/A"} / {sub.policyWeightages?.totalIAMarks ?? 0}
                          </div>
                        </div>
                      </div>

                      {/* What-If Attendance Calculator */}
                      {sub.attendanceSlabs && sub.attendanceSlabs.length > 0 && (
                        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                              <Calculator className="w-3.5 h-3.5 text-indigo-700" />
                              What-If Attendance Simulator:
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] text-slate-500">Projected Attendance %:</span>
                              <input
                                type="number"
                                min={0}
                                max={100}
                                value={whatIfInputs[sub.subjectId] ?? sub.attendancePercent ?? 75}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 0;
                                  setWhatIfInputs((prev) => ({ ...prev, [sub.subjectId]: Math.min(100, Math.max(0, val)) }));
                                }}
                                className="w-16 px-2 py-0.5 border border-slate-300 rounded text-xs text-right font-mono"
                              />
                            </div>
                          </div>
                          {(() => {
                            const projectedPct = whatIfInputs[sub.subjectId] ?? sub.attendancePercent ?? 75;
                            const projectedAttScore = attendanceScore(projectedPct, sub.attendanceSlabs);
                            const ces = sub.computedScores?.cesScore || 0;
                            const internal = sub.computedScores?.internalScore || 0;
                            const projectedTotal = projectedAttScore !== null ? ces + internal + projectedAttScore : null;

                            return (
                              <div className="text-[11px] text-slate-600 flex items-center justify-between pt-1 border-t border-slate-200">
                                <span>
                                  Slab Score:{" "}
                                  <strong className="text-indigo-950 font-mono">
                                    {projectedAttScore !== null ? `${projectedAttScore}M` : "Gap (0M)"}
                                  </strong>
                                </span>
                                <span>
                                  Simulated Total IA:{" "}
                                  <strong className="text-indigo-950 font-mono">
                                    {projectedTotal !== null ? projectedTotal.toFixed(2) : "N/A"} / {sub.policyWeightages?.totalIAMarks ?? 0}
                                  </strong>
                                </span>
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </div>

                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col justify-between">
                      <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2">Performance Breakdown</h4>
                      <div className="h-44 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                            <YAxis tick={{ fontSize: 10 }} />
                            <Tooltip />
                            <Bar dataKey="score" fill="#3730A3" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="text-[10px] text-slate-400 text-center mt-2">
                        Dynamic evaluation derived live from HOD subject policy.
                      </div>
                    </div>
                  </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* TAB 2: MY GRIEVANCE QUERIES */}
      {activeTab === "queries" && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-[#3730A3]" /> My Grievance Queries
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Track status, review faculty replies, and escalate queries to HOD if needed.
              </p>
            </div>
            <button
              onClick={() => {
                if (data.subjects.length > 0) {
                  setQueryModal({
                    open: true,
                    offeringSectionId: data.subjects[0].offeringSectionId,
                    subjectName: data.subjects[0].subjectName,
                    components: data.subjects[0].components || [],
                  });
                }
              }}
              className="px-3.5 py-2 bg-[#3730A3] hover:bg-[#4338CA] text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-4 h-4" /> Raise New Query
            </button>
          </div>

          {loadingQueries ? (
            <div className="p-8 text-center text-slate-400 text-xs">Loading queries...</div>
          ) : queries.length === 0 ? (
            <div className="bg-white p-12 rounded-xl border border-slate-200 text-center space-y-3">
              <MessageSquare className="w-8 h-8 text-slate-300 mx-auto" />
              <h4 className="text-sm font-bold text-slate-800">No Grievance Queries Raised</h4>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                If you find discrepancies in your internal marks or attendance percentage, you can raise a query against any subject component.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {queries.map((q) => (
                <QueryThread
                  key={q.id}
                  query={q}
                  currentRole="STUDENT"
                  currentUserId={data.student.userId}
                  onRefresh={loadStudentQueries}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Raise Query Modal Dialog */}
      {queryModal?.open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full space-y-4 shadow-xl border border-slate-200">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Raise Grievance Query</h3>
              <p className="text-xs text-slate-500">
                Subject: <strong className="text-slate-800">{queryModal.subjectName}</strong>
              </p>
            </div>

            <form onSubmit={handleRaiseQuery} className="space-y-3">
              {queryModal.components && queryModal.components.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Specific Component (Optional)
                  </label>
                  <select
                    value={selectedComponentId}
                    onChange={(e) => setSelectedComponentId(e.target.value)}
                    className="w-full p-2.5 text-xs bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  >
                    <option value="">General Subject / Attendance Discrepancy</option>
                    {queryModal.components.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Query Description / Discrepancy Details
                </label>
                <textarea
                  required
                  rows={4}
                  value={queryMsg}
                  onChange={(e) => setQueryMsg(e.target.value)}
                  placeholder="Clearly explain the discrepancy or question regarding your marks..."
                  className="w-full p-3 border border-slate-300 rounded-lg text-xs text-slate-900 focus:ring-2 focus:ring-indigo-600 focus:outline-none"
                  disabled={submittingQuery}
                />
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-800 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <span>
                  Your query will first be routed to your assigned faculty member. If unresolved, you may escalate to the Department HOD.
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setQueryModal(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg"
                  disabled={submittingQuery}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingQuery || !queryMsg.trim()}
                  className="px-4 py-2 bg-[#3730A3] hover:bg-[#4338CA] disabled:bg-slate-300 text-white text-xs font-semibold rounded-lg shadow-sm"
                >
                  {submittingQuery ? "Submitting..." : "Submit Grievance"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
