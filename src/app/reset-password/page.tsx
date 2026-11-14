"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { fetchApi } from "@/lib/api";
import { KeyRound, Lock, CheckCircle2, AlertTriangle, ArrowRight, ArrowLeft } from "lucide-react";

export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [token, setToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [isTokenInvalid, setIsTokenInvalid] = useState(false);

  useEffect(() => {
    const queryToken = searchParams?.get("token") || "";
    if (!queryToken) {
      setErrorMsg("Missing or incomplete password reset token. Please request a new reset link.");
      setIsTokenInvalid(true);
    } else {
      setToken(queryToken);
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (newPassword.length < 6) {
      setErrorMsg("Password must be at least 6 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg("Passwords do not match. Please ensure both fields are identical.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetchApi("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, newPassword }),
      });

      setSuccessMsg(res.message || "Password reset successfully!");
    } catch (err: any) {
      if (err.status === 401 || err.status === 400) {
        setIsTokenInvalid(true);
        setErrorMsg(
          err.data?.error ||
            "This password reset link is invalid or has expired (links expire after 15 minutes). Please request a new reset link."
        );
      } else {
        setErrorMsg(err.data?.error || "Failed to reset password. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-100">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg border border-slate-200 p-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-indigo-100 text-[#3730A3] rounded-full mb-2">
            <KeyRound className="w-6 h-6 text-[#3730A3]" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Set New Password</h1>
          <p className="text-xs text-slate-500 leading-relaxed">
            Please choose a secure new password for your BVIMR account.
          </p>
        </div>

        {errorMsg && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs space-y-2">
            <div className="flex items-center gap-2 font-semibold text-rose-900">
              <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
            {isTokenInvalid && (
              <div className="pt-2">
                <Link
                  href="/forgot-password"
                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded text-[11px] inline-flex items-center gap-1 transition-colors"
                >
                  Request New Reset Link <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            )}
          </div>
        )}

        {successMsg ? (
          <div className="space-y-4">
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-900 text-xs space-y-2">
              <div className="flex items-center gap-2 font-bold text-sm text-emerald-950">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <span>Password Successfully Updated</span>
              </div>
              <p className="leading-relaxed">
                Your account password has been updated and any temporary security lockouts have been cleared.
              </p>
            </div>

            <div className="pt-2">
              <Link
                href="/"
                className="w-full py-2.5 px-4 bg-[#3730A3] hover:bg-[#4338CA] text-white font-semibold rounded-lg text-xs flex items-center justify-center gap-2 transition-colors shadow-sm"
              >
                Sign In With New Password <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        ) : !isTokenInvalid ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                New Password
              </label>
              <div className="relative">
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600 text-sm text-slate-900 font-medium"
                />
                <Lock className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                Confirm New Password
              </label>
              <div className="relative">
                <input
                  type="password"
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600 text-sm text-slate-900 font-medium"
                />
                <Lock className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !newPassword || !confirmPassword}
              className="w-full py-2.5 px-4 bg-[#3730A3] hover:bg-[#4338CA] text-white font-medium rounded-lg text-sm transition-colors shadow-sm disabled:opacity-50"
            >
              {loading ? "Updating Password..." : "Update Password"}
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
        ) : null}

        <div className="text-center text-[11px] text-slate-400 pt-3 border-t border-slate-100">
          BVIMR IA Marks & Attendance Management Portal
        </div>
      </div>
    </div>
  );
}

