"use client";

import { useEffect, useState } from "react";
import { fetchApi } from "@/lib/api";
import HeaderNav from "@/components/HeaderNav";
import { BookOpen, AlertCircle, Download } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

export default function StudentSemesterView() {
  const [authorized, setAuthorized] = useState(false);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [queryModal, setQueryModal] = useState<{ open: boolean; offeringSectionId: string; subjectName: string } | null>(null);
  const [queryMsg, setQueryMsg] = useState("");

  useEffect(() => {
    fetchApi("/auth/me")
      .then((res) => {
        if (res.authenticated && res.user?.role === "STUDENT") {
          setAuthorized(true);
          loadSemesterView();
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
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleRaiseQuery = async () => {
    if (!queryModal || !queryMsg) return;
    try {
      await fetchApi("/queries", {
        method: "POST",
        body: JSON.stringify({
          subjectOfferingSectionId: queryModal.offeringSectionId,
          message: queryMsg,
        }),
      });
      alert("Query submitted successfully!");
      setQueryModal(null);
      setQueryMsg("");
    } catch (err: any) {
      alert(err.data?.error || "Failed to submit query");
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

  return (
    <div className="min-h-screen bg-slate-50 p-6 max-w-6xl mx-auto space-y-8">
      {/* Top Header Bar with Profile Settings & Logout */}
      <HeaderNav
        portalTitle={data.student.name}
        portalSubtitle={`${data.student.departmentName} | Batch ${data.student.batchLabel} | Section ${data.student.sectionName} | Current Semester ${data.student.currentSemester}`}
        roleBadge="STUDENT"
      />

      {/* Stacked Subject Cards */}
      <div className="space-y-6">
        <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-[#3730A3]" /> Current Semester Subjects
        </h2>

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
                    <span className="text-xs font-bold text-indigo-[#3730A3] uppercase bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                      {sub.subjectCode}
                    </span>
                    <h3 className="text-lg font-bold text-slate-900 mt-1">{sub.subjectName}</h3>
                    <p className="text-xs text-slate-500">Faculty: {sub.facultyName}</p>
                  </div>

                  <div className="flex items-center gap-3">
                    {sub.offeringSectionId && (
                      <button
                        onClick={() =>
                          setQueryModal({
                            open: true,
                            offeringSectionId: sub.offeringSectionId,
                            subjectName: sub.subjectName,
                          })
                        }
                        className="px-3 py-1.5 bg-amber-50 text-amber-800 border border-amber-300 rounded-lg text-xs font-semibold hover:bg-amber-100 transition-colors flex items-center gap-1.5"
                      >
                        <AlertCircle className="w-3.5 h-3.5" /> Raise Query
                      </button>
                    )}

                    {sub.offeringId && (
                      <a
                        href={`http://localhost:5000/api/reports/students/${data.student.id}/subject-offerings/${sub.offeringId}/pdf`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1.5 bg-[#3730A3] text-white rounded-lg text-xs font-semibold hover:bg-[#4338CA] transition-colors flex items-center gap-1.5"
                      >
                        <Download className="w-3.5 h-3.5" /> PDF Mark Sheet
                      </a>
                    )}
                  </div>
                </div>

                {/* Subject Breakdown & Chart Grid */}
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
              </div>
            );
          })
        )}
      </div>

      {/* Raise Query Modal */}
      {queryModal?.open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full space-y-4 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">Raise Query: {queryModal.subjectName}</h3>
            <p className="text-xs text-slate-500">
              Your message will be sent directly to the assigned faculty member first.
            </p>
            <textarea
              rows={4}
              value={queryMsg}
              onChange={(e) => setQueryMsg(e.target.value)}
              placeholder="Describe your discrepancy or concern regarding marks or attendance..."
              className="w-full p-3 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-600 focus:outline-none"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setQueryModal(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleRaiseQuery}
                className="px-4 py-2 bg-[#3730A3] hover:bg-[#4338CA] text-white text-xs font-semibold rounded-lg"
              >
                Submit Query
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
