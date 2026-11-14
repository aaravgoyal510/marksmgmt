"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { fetchApi } from "@/lib/api";
import { DEFAULT_QUERY_SLA_HOURS, DEFAULT_QUERY_ESCALATION_HOURS } from "@/lib/slaConstants";
import {
  HelpCircle,
  BookOpen,
  GraduationCap,
  UserCheck,
  ShieldCheck,
  Building,
  Lock,
  Calculator,
  MessageSquare,
  Upload,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  Clock,
  LogOut,
  FileSpreadsheet,
} from "lucide-react";

export default function HelpCenterPage() {
  const [currentRole, setCurrentRole] = useState<"STUDENT" | "FACULTY" | "HOD" | "ADMIN">("STUDENT");
  const [activeTab, setActiveTab] = useState<"STUDENT" | "FACULTY" | "HOD" | "ADMIN">("STUDENT");

  useEffect(() => {
    fetchApi("/auth/me")
      .then((res) => {
        if (res.authenticated && res.user?.role) {
          if (res.user.role === "ADMIN") {
            setCurrentRole("ADMIN");
            setActiveTab("ADMIN");
          } else if (res.user.role === "FACULTY") {
            if (res.user.isHOD || res.user.hodDepartmentId) {
              setCurrentRole("HOD");
              setActiveTab("HOD");
            } else {
              setCurrentRole("FACULTY");
              setActiveTab("FACULTY");
            }
          } else {
            setCurrentRole("STUDENT");
            setActiveTab("STUDENT");
          }
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 p-4 sm:p-6 lg:p-8 font-sans">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Navigation & Title Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-indigo-50 text-[#3730A3] rounded-lg">
                <HelpCircle className="w-5 h-5" />
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-700">
                User Guide & Knowledge Base
              </span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">
              BVIMR IA Portal Documentation
            </h1>
            <p className="text-xs text-slate-500">
              Comprehensive operational guides, formulas, and workflow explanations for all portal roles.
            </p>
          </div>

          <Link
            href={
              currentRole === "ADMIN"
                ? "/admin"
                : currentRole === "HOD"
                ? "/hod"
                : currentRole === "FACULTY"
                ? "/faculty"
                : "/student"
            }
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition shadow-sm"
          >
            <ArrowLeft className="w-4 h-4" /> Return to Dashboard
          </Link>
        </div>

        {/* Role Selector Tabs */}
        <div className="flex bg-white p-1.5 rounded-xl border border-slate-200 shadow-sm gap-1 overflow-x-auto">
          <button
            onClick={() => setActiveTab("STUDENT")}
            className={`flex-1 min-w-[120px] py-2.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition ${
              activeTab === "STUDENT"
                ? "bg-[#3730A3] text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <GraduationCap className="w-4 h-4" /> Student Guide
          </button>

          <button
            onClick={() => setActiveTab("FACULTY")}
            className={`flex-1 min-w-[120px] py-2.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition ${
              activeTab === "FACULTY"
                ? "bg-[#3730A3] text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <UserCheck className="w-4 h-4" /> Faculty Guide
          </button>

          <button
            onClick={() => setActiveTab("HOD")}
            className={`flex-1 min-w-[120px] py-2.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition ${
              activeTab === "HOD"
                ? "bg-[#3730A3] text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <ShieldCheck className="w-4 h-4" /> HOD Guide
          </button>

          <button
            onClick={() => setActiveTab("ADMIN")}
            className={`flex-1 min-w-[120px] py-2.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition ${
              activeTab === "ADMIN"
                ? "bg-[#3730A3] text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <Building className="w-4 h-4" /> Admin Guide
          </button>
        </div>

        {/* Global Key Concepts Banner: Formula & 423 Lock */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Formula Card */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <div className="flex items-center gap-2 text-indigo-700">
              <Calculator className="w-5 h-5 text-[#3730A3]" />
              <h3 className="font-bold text-sm text-slate-900">
                Official IA Grading Formula
              </h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Every subject's total Internal Assessment (IA) is mathematically computed as:
            </p>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-800">
              Total IA = CES Score + Internal Exam Score + Attendance Score
            </div>
            <ul className="text-xs text-slate-600 space-y-1 list-disc pl-4">
              <li>
                <strong>CES Score</strong>: Proportional score across continuous components (CES-I, CES-II, Assignments) scaled to the policy CES weightage.
              </li>
              <li>
                <strong>Internal Exam Score</strong>: Scaled internal assessment score mapped to internal exam weightage.
              </li>
              <li>
                <strong>Attendance Score</strong>: Determined by looking up student attendance % in the HOD's configured slab ranges.
              </li>
            </ul>
          </div>

          {/* 423 Lock Card */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <div className="flex items-center gap-2 text-amber-600">
              <Lock className="w-5 h-5 text-amber-600" />
              <h3 className="font-bold text-sm text-slate-900">
                The HTTP 423 Lock Rule
              </h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Mark entries, Excel imports, and attendance submissions are strictly locked with <strong>HTTP 423 Locked</strong> until two prerequisites are met:
            </p>
            <div className="space-y-2">
              <div className="flex items-start gap-2 p-2.5 bg-amber-50/50 border border-amber-200 rounded-lg text-xs text-amber-900">
                <CheckCircle2 className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <span>
                  <strong>1. Policy Confirmed</strong>: The Department HOD must confirm and lock the grading policy for the subject offering.
                </span>
              </div>
              <div className="flex items-start gap-2 p-2.5 bg-amber-50/50 border border-amber-200 rounded-lg text-xs text-amber-900">
                <CheckCircle2 className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <span>
                  <strong>2. Faculty Assigned</strong>: The section must have an assigned teaching faculty member.
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Concrete Formula Breakdown Example */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center gap-2 text-emerald-700">
            <Calculator className="w-5 h-5 text-emerald-600" />
            <h3 className="font-bold text-base text-slate-900">
              Worked Example: Step-by-Step Mark Calculation
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <span className="font-bold text-slate-500 uppercase text-[10px]">Policy Weights</span>
              <p className="font-semibold text-slate-900 mt-1">CES: 20M</p>
              <p className="font-semibold text-slate-900">Internal Exam: 60M</p>
              <p className="font-semibold text-slate-900">Attendance: 20M</p>
            </div>
            <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-lg">
              <span className="font-bold text-indigo-700 uppercase text-[10px]">1. CES Score (20M)</span>
              <p className="text-slate-700 mt-1">CES-1: 9/10, CES-2: 8/10</p>
              <p className="text-slate-600">Total: 17/20 = 85%</p>
              <p className="font-bold text-indigo-950 mt-1">Scaled: 17.00 / 20</p>
            </div>
            <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg">
              <span className="font-bold text-blue-700 uppercase text-[10px]">2. Internal Exam (60M)</span>
              <p className="text-slate-700 mt-1">Exam Mark: 48/60</p>
              <p className="text-slate-600">Raw: 80%</p>
              <p className="font-bold text-blue-950 mt-1">Score: 48.00 / 60</p>
            </div>
            <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-lg">
              <span className="font-bold text-emerald-700 uppercase text-[10px]">3. Attendance (20M)</span>
              <p className="text-slate-700 mt-1">Attendance: 82%</p>
              <p className="text-slate-600">Slab 80-84.99% &rarr; 16M</p>
              <p className="font-bold text-emerald-950 mt-1">Score: 16.00 / 20</p>
            </div>
          </div>
          <div className="p-3 bg-emerald-100/60 border border-emerald-300 rounded-xl flex items-center justify-between text-xs">
            <span className="font-bold text-emerald-950">
              Total IA = 17.00 (CES) + 48.00 (Internal) + 16.00 (Attendance) = 81.00 / 100
            </span>
            <span className="px-2.5 py-1 bg-emerald-600 text-white font-bold rounded-lg text-xs">
              Grade: 75+ (Distinction)
            </span>
          </div>
        </div>

        {/* Tab 1: Student Guide */}
        {activeTab === "STUDENT" && (
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
            <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
              <GraduationCap className="w-5 h-5 text-[#3730A3]" />
              <h2 className="text-lg font-bold text-slate-900">Student Guide & Workflows</h2>
            </div>

            <div className="space-y-4">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-[#3730A3]" /> 1. Viewing Your Marks & Attendance
                </h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  You can view your marks once your teaching faculty officially publishes the section marks. If a section shows <em>"Not yet published"</em>, faculty is still entering or verifying grades. Once published, you see your component breakdown, attendance percentage, and total IA score.
                </p>
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-[#3730A3]" /> 2. Raising Grievance Queries
                </h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  If you notice a discrepancy in any mark component or attendance percentage:
                </p>
                <ol className="text-xs text-slate-600 space-y-1 list-decimal pl-4">
                  <li>Click <strong>"Raise Query"</strong> on the relevant subject offering card.</li>
                  <li>Select the component (or attendance) and describe your concern with supporting details.</li>
                  <li>Your assigned faculty is notified immediately and can reply directly in the thread.</li>
                  <li>You can add follow-up replies directly in the query thread.</li>
                </ol>
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-[#3730A3]" /> 3. Query SLA & HOD Escalation
                </h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Faculty has <strong>{DEFAULT_QUERY_SLA_HOURS} hours</strong> to respond to queries. If a query remains unanswered beyond {DEFAULT_QUERY_SLA_HOURS} hours, daily reminder notifications are dispatched. At <strong>{DEFAULT_QUERY_ESCALATION_HOURS} hours</strong>, the query automatically escalates to the Department HOD. You can also manually escalate your query to the HOD at any time.
                </p>
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Upload className="w-4 h-4 text-[#3730A3]" /> 4. Downloading Transcripts & PDFs
                </h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  You can download single-subject mark sheets and your <strong>Cumulative Multi-Term Transcript (PDF)</strong> directly from your student dashboard. The transcript includes all published terms with SGPA and CGPA equivalents. If any term remains in progress or unpublished, the transcript carries an <em>UNOFFICIAL</em> watermark.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Faculty Guide */}
        {activeTab === "FACULTY" && (
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
            <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
              <UserCheck className="w-5 h-5 text-[#3730A3]" />
              <h2 className="text-lg font-bold text-slate-900">Teaching Faculty Guide</h2>
            </div>

            <div className="space-y-4">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-[#3730A3]" /> 1. Bulk Marks Entry & Excel Import
                </h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Once your section is unlocked (policy confirmed and section assigned), you can enter marks directly using the interactive grid or by uploading CSV/Excel spreadsheets. Use <strong>"Download Marks Template"</strong> to get pre-filled student rosters matching the exact policy component names.
                </p>
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" /> 2. Publishing Marks vs Saving Drafts
                </h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Saving marks preserves your work as drafts without notifying students or revealing scores. When you are ready, click <strong>"Publish Marks"</strong> to make grades visible to students and enable transcript generation. If you re-edit published marks, an audit log is generated.
                </p>
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-[#3730A3]" /> 3. Section Analytics & Attendance Shortfalls
                </h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Click <strong>"View Analytics"</strong> on your section to inspect mean, median, standard deviation, pass rate, and grade-band distribution (0-39, 40-49, 50-59, 60-74, 75+). Students with attendance below 75% are automatically flagged in the shortfall tracker.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: HOD Guide */}
        {activeTab === "HOD" && (
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
            <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
              <ShieldCheck className="w-5 h-5 text-[#3730A3]" />
              <h2 className="text-lg font-bold text-slate-900">Head of Department (HOD) Guide</h2>
            </div>

            <div className="space-y-4">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Lock className="w-4 h-4 text-indigo-700" /> 1. Policy Configuration & Confirmation
                </h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  HODs configure the grading policy for each subject offering (CES weightage, Internal weightage, Attendance weightage, and attendance slabs). Click <strong>"Confirm Policy"</strong> to lock the configuration and unlock marks entry for teaching faculty across all sections of that offering.
                </p>
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-indigo-700" /> 2. Faculty Assignment & Reassignment
                </h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Assign teaching faculty to each section. If reassigning a section that already has faculty, a mandatory reason is required. Reassignment automatically transfers all open student queries to the new faculty member, audits the transition, and notifies both faculty members.
                </p>
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <ArrowRight className="w-4 h-4 text-indigo-700" /> 3. Batch Promotion & Dry-Run Preview
                </h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Promote batches to the next semester. Clicking <strong>"Promote Batch"</strong> opens a dry-run preview displaying the target semester, academic terms created/reused, section counts, and students with semester overrides—with zero database writes. Type the batch label to confirm.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: Admin Guide */}
        {activeTab === "ADMIN" && (
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
            <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
              <Building className="w-5 h-5 text-rose-600" />
              <h2 className="text-lg font-bold text-slate-900">System Administrator Guide</h2>
            </div>

            <div className="space-y-4">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Building className="w-4 h-4 text-rose-600" /> 1. Department, Batch & Section Management
                </h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Admins manage departments, batches, sections, and HOD assignments. Admins can run batch promotions across any department with dry-run previews.
                </p>
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-rose-600" /> 2. Account Lifecycle & Deactivation
                </h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Deactivating a student or faculty account revokes their login and refresh tokens while preserving all historical marks and audit trails. Deactivating a sitting HOD or faculty member with active section assignments is safely blocked until reassigned.
                </p>
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <LogOut className="w-4 h-4 text-rose-600" /> 3. Emergency Session Revocation (Logout-Everywhere)
                </h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Triggering <code>/api/auth/logout-everywhere</code> increments the user's <code>tokenVersion</code>, instantly invalidating all active refresh tokens. Outstanding 15-minute access tokens expire naturally within a maximum of 15 minutes.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function BarChart2(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}

