"use client";

import { useEffect } from "react";
import { AlertCircle, RefreshCw, Home } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log unexpected errors
    console.error("Application runtime error:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="bg-white border border-rose-200 shadow-xl rounded-2xl p-8 max-w-lg w-full text-center space-y-6">
        <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto">
          <AlertCircle className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-bold text-slate-900">Something went wrong</h1>
          <p className="text-xs text-slate-600">
            An unexpected error occurred while processing your request. The security and audit engine has captured this event.
          </p>
        </div>

        {error.message && (
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-left text-xs font-mono text-slate-700 max-h-32 overflow-y-auto">
            {error.message}
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <button
            onClick={() => reset()}
            className="w-full sm:w-auto px-5 py-2.5 bg-[#3730A3] hover:bg-[#4338CA] text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors shadow-sm"
          >
            <RefreshCw className="w-4 h-4" /> Try Again
          </button>

          <a
            href="/"
            className="w-full sm:w-auto px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors"
          >
            <Home className="w-4 h-4" /> Return to Login
          </a>
        </div>
      </div>
    </div>
  );
}

