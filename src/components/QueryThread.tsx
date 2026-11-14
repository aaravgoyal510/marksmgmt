"use client";

import { useState } from "react";
import { fetchApi } from "@/lib/api";
import {
  MessageSquare,
  Send,
  AlertTriangle,
  CheckCircle,
  Clock,
  ShieldAlert,
  ArrowUpRight,
  User,
  Sparkles,
} from "lucide-react";

export interface QueryMessageItem {
  id: string;
  authorUserId: string;
  message: string;
  createdAt: string;
}

export interface QueryItem {
  id: string;
  status: "OPEN" | "ESCALATED" | "RESOLVED";
  message: string;
  resolutionRemarks?: string | null;
  resolvedAt?: string | null;
  createdAt: string;
  student?: {
    id: string;
    userId: string;
    name: string;
    erpNo: string;
    prn?: string;
  };
  faculty?: {
    id: string;
    userId: string;
    name: string;
    email?: string;
  };
  subjectOfferingSection?: {
    id: string;
    section?: {
      name: string;
    };
    subjectOffering?: {
      subject?: {
        name: string;
        code: string;
      };
    };
  };
  scoreComponent?: {
    id: string;
    name: string;
    group: string;
    maxMarks: number;
  } | null;
  messages: QueryMessageItem[];
}

interface QueryThreadProps {
  query: QueryItem;
  currentRole: "STUDENT" | "FACULTY" | "HOD" | "ADMIN";
  currentUserId?: string;
  onRefresh: () => void | Promise<void>;
}

export default function QueryThread({
  query,
  currentRole,
  currentUserId,
  onRefresh,
}: QueryThreadProps) {
  const [replyText, setReplyText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [resolutionRemarks, setResolutionRemarks] = useState("");
  const [showEscalateModal, setShowEscalateModal] = useState(false);
  const [escalateReason, setEscalateReason] = useState("");

  const subjectName =
    query.subjectOfferingSection?.subjectOffering?.subject?.name || "Subject";
  const subjectCode =
    query.subjectOfferingSection?.subjectOffering?.subject?.code || "";
  const sectionName = query.subjectOfferingSection?.section?.name || "";
  const componentName = query.scoreComponent?.name;

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || submitting) return;
    setSubmitting(true);
    setErrorMsg("");

    try {
      await fetchApi(`/queries/${query.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ message: replyText.trim() }),
      });
      setReplyText("");
      await onRefresh();
    } catch (err: any) {
      setErrorMsg(err.data?.error || "Failed to post message");
    } finally {
      setSubmitting(false);
    }
  };

  const handleResolve = async () => {
    setSubmitting(true);
    setErrorMsg("");
    try {
      await fetchApi(`/queries/${query.id}/resolve`, {
        method: "POST",
        body: JSON.stringify({ resolutionRemarks: resolutionRemarks.trim() }),
      });
      setShowResolveModal(false);
      setResolutionRemarks("");
      await onRefresh();
    } catch (err: any) {
      setErrorMsg(err.data?.error || "Failed to resolve query");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEscalate = async () => {
    setSubmitting(true);
    setErrorMsg("");
    try {
      await fetchApi(`/queries/${query.id}/escalate`, {
        method: "POST",
        body: JSON.stringify({ reason: escalateReason.trim() }),
      });
      setShowEscalateModal(false);
      setEscalateReason("");
      await onRefresh();
    } catch (err: any) {
      setErrorMsg(err.data?.error || "Failed to escalate query");
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden space-y-0">
      {/* Thread Header */}
      <div className="p-5 bg-slate-50/80 border-b border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            {subjectCode && (
              <span className="text-[10px] font-bold text-indigo-800 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded uppercase">
                {subjectCode}
              </span>
            )}
            <h4 className="text-base font-bold text-slate-900">{subjectName}</h4>
            {sectionName && (
              <span className="text-xs text-slate-500 font-medium bg-slate-200/60 px-2 py-0.5 rounded">
                Sec {sectionName}
              </span>
            )}
            {componentName && (
              <span className="text-xs font-semibold text-amber-900 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                Component: {componentName}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 flex items-center gap-3">
            <span>
              Student: <strong className="text-slate-700">{query.student?.name}</strong>{" "}
              <span className="font-mono text-slate-400">({query.student?.erpNo})</span>
            </span>
            {query.faculty?.name && (
              <span>
                Faculty: <strong className="text-slate-700">{query.faculty.name}</strong>
              </span>
            )}
            <span>Opened: {formatDate(query.createdAt)}</span>
          </p>
        </div>

        {/* Status Badge */}
        <div className="flex items-center gap-2">
          {query.status === "RESOLVED" && (
            <span className="pill-emerald">
              <CheckCircle className="w-3.5 h-3.5" /> Resolved
            </span>
          )}
          {query.status === "ESCALATED" && (
            <span className="bg-purple-100 text-purple-900 border border-purple-300 font-semibold px-2.5 py-0.5 rounded-full text-xs flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-purple-700" /> Escalated to HOD
            </span>
          )}
          {query.status === "OPEN" && (
            <span className="pill-amber">
              <Clock className="w-3.5 h-3.5" /> Open / In Progress
            </span>
          )}
        </div>
      </div>

      {/* Resolution Banner */}
      {query.status === "RESOLVED" && query.resolutionRemarks && (
        <div className="mx-5 mt-4 p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-900 text-xs space-y-1">
          <div className="flex items-center gap-1.5 font-bold text-emerald-800">
            <CheckCircle className="w-4 h-4 text-emerald-600" />
            <span>Resolution Remarks</span>
            {query.resolvedAt && (
              <span className="font-normal text-emerald-700">
                — {formatDate(query.resolvedAt)}
              </span>
            )}
          </div>
          <p className="text-emerald-800 whitespace-pre-wrap">{query.resolutionRemarks}</p>
        </div>
      )}

      {/* Escalation Notice */}
      {query.status === "ESCALATED" && (
        <div className="mx-5 mt-4 p-3.5 bg-purple-50/70 border border-purple-200 rounded-lg text-xs text-purple-900 flex items-start gap-2.5">
          <ShieldAlert className="w-4 h-4 text-purple-700 mt-0.5 flex-shrink-0" />
          <div className="space-y-0.5">
            <p className="font-semibold text-purple-900">
              This grievance has been escalated to the Department Head.
            </p>
            <p className="text-purple-700 text-[11px]">
              The HOD provides formal instruction to the faculty. All mark adjustments, if needed, are performed by the assigned faculty member under audit trail.
            </p>
          </div>
        </div>
      )}

      {/* Error alert */}
      {errorMsg && (
        <div className="mx-5 mt-4 p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Messages Feed */}
      <div className="p-5 space-y-4 max-h-[420px] overflow-y-auto">
        {query.messages && query.messages.length > 0 ? (
          query.messages.map((msg, idx) => {
            const isMe = currentUserId ? msg.authorUserId === currentUserId : false;
            const isStudentAuthor = msg.authorUserId === query.student?.userId;
            const isFacultyAuthor = msg.authorUserId === query.faculty?.userId;
            const isHODAuthor = !isStudentAuthor && !isFacultyAuthor;

            return (
              <div
                key={msg.id || idx}
                className={`flex flex-col ${
                  isHODAuthor
                    ? "items-stretch"
                    : isMe
                    ? "items-end"
                    : "items-start"
                }`}
              >
                <div
                  className={`max-w-[85%] rounded-xl p-3.5 text-xs space-y-1.5 shadow-sm ${
                    isHODAuthor
                      ? "max-w-full bg-purple-50/90 border border-purple-300 text-purple-950"
                      : isMe
                      ? "bg-[#3730A3] text-white"
                      : "bg-slate-100 text-slate-800 border border-slate-200"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3 text-[11px] opacity-80 pb-1 border-b border-white/20">
                    <span className="font-semibold flex items-center gap-1">
                      {isHODAuthor ? (
                        <>
                          <ShieldAlert className="w-3.5 h-3.5 text-purple-700" />
                          <span>HOD Instruction / Directive</span>
                        </>
                      ) : isStudentAuthor ? (
                        <>
                          <User className="w-3 h-3" />
                          <span>{query.student?.name} (Student)</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3 h-3" />
                          <span>{query.faculty?.name || "Faculty"} (Assigned Faculty)</span>
                        </>
                      )}
                    </span>
                    <span className="text-[10px] tabular-nums">
                      {formatDate(msg.createdAt)}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap leading-relaxed">{msg.message}</p>
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-center py-6 text-slate-400 text-xs">
            No messages recorded in this query.
          </div>
        )}
      </div>

      {/* Action Bar / Reply Box */}
      <div className="p-4 bg-slate-50 border-t border-slate-200 space-y-3">
        {query.status !== "RESOLVED" ? (
          <>
            <form onSubmit={handleSendReply} className="space-y-2">
              <div className="relative">
                <textarea
                  rows={2}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder={
                    currentRole === "HOD"
                      ? "Post instruction / directive to faculty and student..."
                      : "Type your reply to this thread..."
                  }
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 placeholder-slate-400"
                  disabled={submitting}
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {/* Faculty Actions: Resolve or Escalate */}
                  {currentRole === "FACULTY" && (
                    <>
                      <button
                        type="button"
                        onClick={() => setShowResolveModal(true)}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
                        disabled={submitting}
                      >
                        <CheckCircle className="w-3.5 h-3.5" /> Mark as Resolved
                      </button>

                      {query.status !== "ESCALATED" && (
                        <button
                          type="button"
                          onClick={() => setShowEscalateModal(true)}
                          className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
                          disabled={submitting}
                        >
                          <ArrowUpRight className="w-3.5 h-3.5" /> Escalate to HOD
                        </button>
                      )}
                    </>
                  )}

                  {/* Student Action: Escalate if open */}
                  {currentRole === "STUDENT" && query.status === "OPEN" && (
                    <button
                      type="button"
                      onClick={() => setShowEscalateModal(true)}
                      className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
                      disabled={submitting}
                    >
                      <ArrowUpRight className="w-3.5 h-3.5" /> Escalate to HOD
                    </button>
                  )}

                  {/* HOD Notice */}
                  {currentRole === "HOD" && (
                    <span className="text-[11px] text-purple-700 font-medium flex items-center gap-1">
                      <ShieldAlert className="w-3.5 h-3.5" /> HOD Advisory Mode: Direct mark editing is restricted.
                    </span>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={submitting || !replyText.trim()}
                  className="px-4 py-1.5 bg-[#3730A3] hover:bg-[#4338CA] disabled:bg-slate-300 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors shadow-sm ml-auto"
                >
                  <Send className="w-3.5 h-3.5" />
                  {submitting ? "Sending..." : "Send Reply"}
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="text-center py-2 text-xs text-slate-500 font-medium flex items-center justify-center gap-1.5">
            <CheckCircle className="w-4 h-4 text-emerald-600" />
            <span>This query thread has been marked as resolved. Replies are disabled.</span>
          </div>
        )}
      </div>

      {/* Resolve Modal */}
      {showResolveModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-5 space-y-4 shadow-xl border border-slate-200">
            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-600" /> Mark Query as Resolved
            </h4>
            <p className="text-xs text-slate-500">
              Provide resolution remarks explaining the action taken (e.g. marks verified, correction applied via audit trail, explanation provided).
            </p>
            <textarea
              rows={3}
              value={resolutionRemarks}
              onChange={(e) => setResolutionRemarks(e.target.value)}
              placeholder="e.g. Reviewed test paper; mark updated in grid and confirmed with student."
              className="w-full p-2.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowResolveModal(false)}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg"
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleResolve}
                disabled={submitting}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-sm"
              >
                {submitting ? "Resolving..." : "Confirm Resolution"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Escalate Modal */}
      {showEscalateModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-5 space-y-4 shadow-xl border border-slate-200">
            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <ArrowUpRight className="w-4 h-4 text-purple-600" /> Escalate Grievance to HOD
            </h4>
            <p className="text-xs text-slate-500">
              This will escalate the issue to the Department Head for review and formal instruction.
            </p>
            <textarea
              rows={3}
              value={escalateReason}
              onChange={(e) => setEscalateReason(e.target.value)}
              placeholder="Optional: Explain why HOD intervention is required..."
              className="w-full p-2.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowEscalateModal(false)}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg"
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleEscalate}
                disabled={submitting}
                className="px-3.5 py-1.5 bg-purple-700 hover:bg-purple-800 text-white text-xs font-semibold rounded-lg shadow-sm"
              >
                {submitting ? "Escalating..." : "Confirm Escalation"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

