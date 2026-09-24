"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fetchApi } from "@/lib/api";
import { ShieldCheck, Lock, UserCheck, AlertTriangle } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [lockoutOptions, setLockoutOptions] = useState<string[] | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");
    setLockoutOptions(null);

    try {
      const res = await fetchApi("/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });

      localStorage.setItem("userData", JSON.stringify(res.user));

      if (res.user.role === "STUDENT") {
        router.push("/student");
      } else if (res.user.role === "ADMIN") {
        router.push("/admin");
      } else if (res.user.role === "FACULTY") {
        if (res.user.isHOD) {
          router.push("/hod");
        } else {
          router.push("/faculty");
        }
      }
    } catch (err: any) {
      if (err.status === 423) {
        setErrorMsg(err.data?.error || "Account locked after 10 failed attempts");
        setLockoutOptions(err.data?.options || ["request-password-reset", "wait-24h"]);
      } else {
        setErrorMsg(err.data?.error || "Invalid username or password");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-100">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg border border-slate-200 p-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-indigo-100 text-indigo-800 rounded-full mb-2">
            <ShieldCheck className="w-6 h-6 text-[#3730A3]" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">BVIMR Portal Login</h1>
          <p className="text-sm text-slate-500">
            Internal Assessment Marks & Attendance Management
          </p>
        </div>

        {errorMsg && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-sm space-y-2">
            <div className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="w-4 h-4 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
            {lockoutOptions && (
              <div className="pt-2 text-xs text-rose-700">
                <p className="font-semibold mb-1">Available Actions:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>Self-service password reset link via email</li>
                  <li>Wait 24 hours for security cooldown period</li>
                </ul>
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
              Username (ERP / Employee ID)
            </label>
            <div className="relative">
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. BCA25001 or EMP001"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600 text-sm text-slate-900"
              />
              <UserCheck className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
              Password
            </label>
            <div className="relative">
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600 text-sm text-slate-900"
              />
              <Lock className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 bg-[#3730A3] hover:bg-[#4338CA] text-white font-medium rounded-lg text-sm transition-colors shadow-sm disabled:opacity-50"
          >
            {loading ? "Authenticating..." : "Sign In"}
          </button>
        </form>

        <div className="text-center text-xs text-slate-500 pt-4 border-t border-slate-100">
          Accounts managed strictly by Department Admin. No self-signup.
        </div>
      </div>
    </div>
  );
}
