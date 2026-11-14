export default function GlobalLoading() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="relative">
          <div className="w-12 h-12 rounded-full border-4 border-indigo-200 border-t-[#3730A3] animate-spin" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-slate-800">BVIMR IA & Attendance Portal</h3>
          <p className="text-xs text-slate-500 animate-pulse">Loading workspace & verifying permissions...</p>
        </div>
      </div>
    </div>
  );
}

