"use client";

import React, { useState, useEffect } from "react";
import {
  BarChart2,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle,
  Users,
  Percent,
  TrendingUp,
  X,
} from "lucide-react";

interface SectionAnalyticsProps {
  sectionId: string;
  onClose?: () => void;
  isCollapsible?: boolean;
}

export function SectionAnalyticsCard({
  sectionId,
  onClose,
  isCollapsible = false,
}: SectionAnalyticsProps) {
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showShortfallList, setShowShortfallList] = useState(false);

  useEffect(() => {
    if (!sectionId) return;

    let isMounted = true;
    setLoading(true);
    setError(null);

    fetch(`/api/sections/${sectionId}/analytics`)
      .then(async (res) => {
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || "Failed to load section analytics");
        }
        return res.json();
      })
      .then((json) => {
        if (isMounted) {
          setData(json);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message);
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [sectionId]);

  if (loading) {
    return (
      <div className="p-5 bg-white border border-slate-200 rounded-xl shadow-sm animate-pulse space-y-4">
        <div className="h-6 bg-slate-200 rounded w-1/3"></div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="h-16 bg-slate-100 rounded-lg"></div>
          <div className="h-16 bg-slate-100 rounded-lg"></div>
          <div className="h-16 bg-slate-100 rounded-lg"></div>
          <div className="h-16 bg-slate-100 rounded-lg"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex justify-between items-center">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
          <span>{error}</span>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-rose-500 hover:text-rose-700">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    );
  }

  if (!data) return null;

  const totalStudents = data.totalStudents || 1;
  const gradeBands = data.gradeBands || {};
  const maxBandCount = Math.max(1, ...Object.values(gradeBands).map((v) => Number(v) || 0));

  const bandsConfig = [
    { label: "75% and above", key: "75+", color: "bg-emerald-500", bgLight: "bg-emerald-50 text-emerald-800" },
    { label: "60% - 74%", key: "60-74", color: "bg-blue-500", bgLight: "bg-blue-50 text-blue-800" },
    { label: "50% - 59%", key: "50-59", color: "bg-yellow-500", bgLight: "bg-yellow-50 text-yellow-800" },
    { label: "40% - 49%", key: "40-49", color: "bg-amber-500", bgLight: "bg-amber-50 text-amber-800" },
    { label: "0% - 39% (Fail)", key: "0-39", color: "bg-rose-500", bgLight: "bg-rose-50 text-rose-800" },
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden transition-all">
      {/* Header */}
      <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-indigo-100 text-indigo-700 rounded-lg">
            <BarChart2 className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-900">
              Section Analytics: {data.subjectName} ({data.subjectCode}) - Section {data.sectionName}
            </h4>
            <p className="text-xs text-slate-500">
              Calculated across {data.totalStudents} enrolled students
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isCollapsible && (
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="p-1 hover:bg-slate-200 text-slate-600 rounded transition"
              title={isCollapsed ? "Expand analytics" : "Collapse analytics"}
            >
              {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 hover:bg-slate-200 text-slate-500 rounded transition"
              title="Close analytics"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {!isCollapsed && (
        <div className="p-5 space-y-6">
          {/* Key Metric Tiles */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-indigo-50/50 border border-indigo-100 rounded-lg">
              <span className="text-[11px] font-semibold text-slate-500 uppercase flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5 text-indigo-600" /> Mean Score
              </span>
              <p className="text-xl font-bold text-slate-900 mt-1">
                {data.mean} <span className="text-xs font-normal text-slate-500">/ {data.totalIAMax}</span>
              </p>
            </div>

            <div className="p-3 bg-purple-50/50 border border-purple-100 rounded-lg">
              <span className="text-[11px] font-semibold text-slate-500 uppercase flex items-center gap-1">
                <BarChart2 className="w-3.5 h-3.5 text-purple-600" /> Median Score
              </span>
              <p className="text-xl font-bold text-slate-900 mt-1">
                {data.median} <span className="text-xs font-normal text-slate-500">/ {data.totalIAMax}</span>
              </p>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <span className="text-[11px] font-semibold text-slate-500 uppercase flex items-center gap-1">
                <Percent className="w-3.5 h-3.5 text-slate-600" /> Std Deviation
              </span>
              <p className="text-xl font-bold text-slate-900 mt-1">
                {data.stdDev}
              </p>
            </div>

            <div className="p-3 bg-emerald-50/50 border border-emerald-100 rounded-lg">
              <span className="text-[11px] font-semibold text-slate-500 uppercase flex items-center gap-1">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-600" /> Pass Rate
              </span>
              <p className="text-xl font-bold text-emerald-800 mt-1">
                {data.passRate}% <span className="text-xs font-normal text-emerald-600">(&ge;{data.passThreshold}%)</span>
              </p>
            </div>
          </div>

          {/* Pure Tailwind Bar Chart: Grade-Band Distribution */}
          <div className="space-y-3">
            <h5 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <BarChart2 className="w-3.5 h-3.5 text-slate-500" /> Grade-Band Distribution
            </h5>
            <div className="space-y-2">
              {bandsConfig.map((band) => {
                const count = gradeBands[band.key] || 0;
                const percentOfTotal = Math.round((count / totalStudents) * 100);
                const barWidth = Math.max(3, Math.round((count / maxBandCount) * 100));

                return (
                  <div key={band.key} className="space-y-1">
                    <div className="flex justify-between text-xs font-medium">
                      <span className="text-slate-700">{band.label}</span>
                      <span className="text-slate-500">
                        {count} student{count === 1 ? "" : "s"} ({percentOfTotal}%)
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden flex">
                      <div
                        className={`h-full ${band.color} transition-all duration-500 rounded-full`}
                        style={{ width: `${barWidth}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Attendance Shortfall Section */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle
                  className={`w-4 h-4 ${
                    data.attendanceShortfallCount > 0 ? "text-amber-600" : "text-emerald-600"
                  }`}
                />
                <span className="text-xs font-bold text-slate-800">
                  Attendance Shortfall (&lt; {data.attendanceThreshold}%):
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-xs font-bold ${
                    data.attendanceShortfallCount > 0
                      ? "bg-rose-100 text-rose-700"
                      : "bg-emerald-100 text-emerald-700"
                  }`}
                >
                  {data.attendanceShortfallCount} Student{data.attendanceShortfallCount === 1 ? "" : "s"}
                </span>
              </div>

              {data.attendanceShortfallCount > 0 && (
                <button
                  onClick={() => setShowShortfallList(!showShortfallList)}
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                >
                  {showShortfallList ? "Hide List" : "Show List"}
                </button>
              )}
            </div>

            {showShortfallList && data.attendanceShortfallList?.length > 0 && (
              <div className="mt-2 pt-2 border-t border-slate-200 max-h-40 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="text-slate-400 uppercase text-[10px] font-semibold border-b border-slate-200">
                      <th className="py-1">ERP No</th>
                      <th className="py-1">Name</th>
                      <th className="py-1 text-right">Attendance %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.attendanceShortfallList.map((st: any) => (
                      <tr key={st.studentId} className="hover:bg-slate-100/50">
                        <td className="py-1.5 font-medium text-slate-700">{st.erpNo}</td>
                        <td className="py-1.5 text-slate-800">{st.name}</td>
                        <td className="py-1.5 text-right font-bold text-rose-600">
                          {st.attendancePercent}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

