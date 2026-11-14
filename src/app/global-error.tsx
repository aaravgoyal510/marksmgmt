"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white border border-slate-200 p-8 rounded-2xl max-w-md w-full shadow-lg text-center space-y-4">
          <h2 className="text-xl font-bold text-slate-900">Something went wrong</h2>
          <p className="text-sm text-slate-600">
            An unexpected error occurred. Our team has been notified.
          </p>
          <button
            onClick={() => reset()}
            className="px-4 py-2 bg-[#3730A3] hover:bg-[#4338CA] text-white text-xs font-semibold rounded-lg transition"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}

