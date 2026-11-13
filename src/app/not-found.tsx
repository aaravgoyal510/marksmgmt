"use client";

import Link from "next/link";
import { AlertCircle, ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-xl border border-slate-200 shadow-xl p-8 max-w-md w-full text-center space-y-4">
        <div className="w-12 h-12 bg-rose-100 rounded-full flex items-center justify-center mx-auto text-rose-600">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h1 className="text-2xl font-extrabold text-slate-900">404 — Page Not Found</h1>
        <p className="text-xs text-slate-500">
          The requested page URL does not exist or has been moved.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-4 py-2 bg-[#3730A3] hover:bg-[#4338CA] text-white text-xs font-semibold rounded-lg shadow-sm"
        >
          <ArrowLeft className="w-4 h-4" /> Return to Login
        </Link>
      </div>
    </div>
  );
}
