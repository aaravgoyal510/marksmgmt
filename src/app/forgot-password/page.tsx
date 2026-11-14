"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { fetchApi } from "@/lib/api";
import { ShieldCheck, Mail, ArrowLeft, CheckCircle2, AlertTriangle, ExternalLink } from "lucide-react";

export default function ForgotPasswordPage() {
  const searchParams = useSearchParams();
  const [identifier, setIdentifier] = useState("");
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [devResetLink, setDevResetLink] = useState<string | null>(null);

  useEffect(() => {
    const prefill = searchParams?.get("username") || searchParams?.get("email") || "";
    if (prefill) {
      setIdentifier(prefill);
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");
    setSuccessMsg("");
    setDevResetLink(null);

    try {
      const res = await fetchApi("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({
          email: identifier.includes("@") ? identifier : undefined,
          username: !identifier.includes("@") ? identifier : undefined,
        }),
      });

      setSuccessMsg(
        res.message ||
          "If an account with that email or username exists, a password reset link has been dispatched to its registered email address."
      );

      if (res.resetLink) {
        setDevResetLink(res.resetLink);
      }
    } catch (err: any) {
      setErrorMsg(err.data?.error || "Failed to process password reset request. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-100">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg border border-slate-200 p-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-indigo-100 text-[#3730A3] rounded-full mb-2">
            <ShieldCheck className="w-6 h-6 text-[#3730A3]" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Forgot Password</h1>
          <p className="text-xs text-slate-500 leading-relaxed">
            Enter your BVIMR ERP No, Employee ID, or registered institutional email address to receive a secure 15-minute reset link.
          </p>
        </div>

        {errorMsg && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs flex items-center gap-2 font-medium">
            <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg ? (
          <div className="space-y-4">
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-900 text-xs space-y-2">
              <div className="flex items-center gap-2 font-bold text-sm text-emerald-950">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <span>Reset Instructions Dispatched</span>
              </div>
              <p className="leading-relaxed">{successMsg}</p>
              <p className="text-[11px] text-emerald-700 font-medium">
                Please check your inbox (and spam folder). Reset links expire automatically after 15 minutes.
              </p>
            </div>

            {devResetLink && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-xs">
                <span className="font-bold block mb-1">Development Shortcut:</span>
                <a
                  href={devResetLink}
                  className="text-[#3730A3] underline font-semibold flex items-center gap-1 hover:text-[#4338CA] break-all"
                >
                  Click here to proceed to Reset Screen <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
                </a>
              </div>
            )}

            <div className="pt-2">
              <Link
                href="/"
                className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs flex items-center justify-center gap-2 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" /> Return to Login
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                ERP No / Employee ID / Email
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="e.g. BCA25001 or student@bvimr.ac.in"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600 text-sm text-slate-900 font-medium"
                />
                <Mail className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !identifier.trim()}
              className="w-full py-2.5 px-4 bg-[#3730A3] hover:bg-[#4338CA] text-white font-medium rounded-lg text-sm transition-colors shadow-sm disabled:opacity-50"
            >
              {loading ? "Verifying..." : "Send Reset Link"}
            </button>

            <div className="text-center pt-2">
              <Link
                href="/"
                className="text-xs text-slate-500 hover:text-[#3730A3] font-semibold inline-flex items-center gap-1.5 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back to Sign In
              </Link>
            </div>
          </form>
        )}

        <div className="text-center text-[11px] text-slate-400 pt-3 border-t border-slate-100">
          BVIMR IA Marks & Attendance Management Portal
        </div>
      </div>
    </div>
  );
}

