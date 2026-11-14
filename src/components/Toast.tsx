"use client";

import { useEffect } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

export interface ToastMessage {
  type: "success" | "error" | "info";
  message: string;
}

export default function Toast({
  toast,
  onClose,
  duration = 4000,
}: {
  toast: ToastMessage | null;
  onClose: () => void;
  duration?: number;
}) {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => {
      onClose();
    }, duration);
    return () => clearTimeout(timer);
  }, [toast, duration, onClose]);

  if (!toast) return null;

  const isSuccess = toast.type === "success";
  const isError = toast.type === "error";

  return (
    <div
      role="alert"
      className={`fixed bottom-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl border text-xs font-semibold transition-all duration-200 bg-white ${
        isSuccess
          ? "border-emerald-300 text-emerald-950 shadow-emerald-500/10"
          : isError
          ? "border-rose-300 text-rose-950 shadow-rose-500/10"
          : "border-indigo-300 text-indigo-950 shadow-indigo-500/10"
      }`}
    >
      {isSuccess && <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />}
      {isError && <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />}
      {!isSuccess && !isError && <Info className="w-4 h-4 text-indigo-600 flex-shrink-0" />}
      
      <span className="max-w-xs break-words">{toast.message}</span>

      <button
        type="button"
        onClick={onClose}
        className="ml-2 text-slate-400 hover:text-slate-600 p-0.5 rounded transition-colors"
        aria-label="Close notification"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

