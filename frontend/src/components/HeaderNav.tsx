"use client";

import { useEffect, useState } from "react";
import { fetchApi } from "@/lib/api";
import { User, LogOut, Settings, Key, Image as ImageIcon, ShieldCheck, UserCheck, GraduationCap, Building } from "lucide-react";

interface HeaderNavProps {
  portalTitle: string;
  portalSubtitle: string;
  roleBadge: "ADMIN" | "HOD" | "FACULTY" | "STUDENT";
}

export default function HeaderNav({ portalTitle, portalSubtitle, roleBadge }: HeaderNavProps) {
  const [profile, setProfile] = useState<any>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Edit Profile Form State
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [profilePicUrl, setProfilePicUrl] = useState("");

  // Change Password Form State
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pwdMsg, setPwdMsg] = useState<string | null>(null);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const res = await fetchApi("/profile/me");
      setProfile(res);
      setName(res.displayName || "");
      setEmail(res.email || "");
      setProfilePicUrl(res.profilePicUrl || "");
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetchApi("/profile/me", {
        method: "PUT",
        body: JSON.stringify({ name, email, profilePicUrl }),
      });
      alert("Profile updated successfully!");
      setModalOpen(false);
      await loadProfile();
    } catch (err: any) {
      alert(err.data?.error || "Failed to update profile");
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdMsg(null);
    try {
      const res = await fetchApi("/profile/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setPwdMsg(res.message);
      setCurrentPassword("");
      setNewPassword("");
    } catch (err: any) {
      alert(err.data?.error || "Failed to change password");
    }
  };

  const handleLogout = async () => {
    if (confirm("Are you sure you want to log out?")) {
      try {
        await fetchApi("/auth/logout", { method: "POST" });
      } catch (e) {
        // ignore errors
      }
      localStorage.clear();
      window.location.href = "/";
    }
  };

  return (
    <>
      <header className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            {roleBadge === "ADMIN" && (
              <span className="pill-rose inline-flex items-center gap-1">
                <Building className="w-3.5 h-3.5" /> System Administrator
              </span>
            )}
            {roleBadge === "HOD" && (
              <span className="pill-emerald inline-flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" /> HOD Administration
              </span>
            )}
            {roleBadge === "FACULTY" && (
              <span className="pill-indigo inline-flex items-center gap-1">
                <UserCheck className="w-3.5 h-3.5" /> Teaching Faculty
              </span>
            )}
            {roleBadge === "STUDENT" && (
              <span className="pill-amber inline-flex items-center gap-1">
                <GraduationCap className="w-3.5 h-3.5" /> Enrolled Student
              </span>
            )}
          </div>
          <h1 className="text-2xl font-bold text-slate-900">{portalTitle}</h1>
          <p className="text-sm text-slate-500">{portalSubtitle}</p>
        </div>

        {/* User Account Controls */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5 bg-slate-50 p-2 pr-3 rounded-lg border border-slate-200">
            {profile?.profilePicUrl ? (
              <img
                src={profile.profilePicUrl}
                alt="Profile"
                className="w-9 h-9 rounded-full object-cover border border-indigo-200"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-[#3730A3] text-white flex items-center justify-center font-bold text-sm">
                {(profile?.displayName || "U").charAt(0).toUpperCase()}
              </div>
            )}
            <div className="text-left">
              <span className="font-bold text-slate-900 text-xs block leading-tight">
                {profile?.displayName || "Loading..."}
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                {profile?.username || ""}
              </span>
            </div>
          </div>

          <button
            onClick={() => setModalOpen(true)}
            className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg border border-slate-200 text-xs font-semibold flex items-center gap-1 transition-colors"
            title="Profile Settings"
          >
            <Settings className="w-4 h-4 text-slate-600" />
            <span className="hidden sm:inline">Settings</span>
          </button>

          <button
            onClick={handleLogout}
            className="p-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg border border-rose-200 text-xs font-semibold flex items-center gap-1 transition-colors"
            title="Log Out"
          >
            <LogOut className="w-4 h-4 text-rose-600" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </header>

      {/* Profile & Security Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-xl p-6 max-w-lg w-full space-y-6 shadow-xl my-8">
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <User className="w-5 h-5 text-[#3730A3]" /> Profile & Security Settings
              </h3>
              <button
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-sm"
              >
                ✕
              </button>
            </div>

            {/* Profile Info Form */}
            <form onSubmit={handleUpdateProfile} className="space-y-4">
              <h4 className="text-xs font-bold uppercase text-slate-400">Account Details</h4>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Display Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1 flex items-center gap-1">
                  <ImageIcon className="w-3.5 h-3.5" /> Profile Picture URL (Supabase Storage)
                </label>
                <input
                  type="url"
                  value={profilePicUrl}
                  onChange={(e) => setProfilePicUrl(e.target.value)}
                  placeholder="https://xzydksmoexfhxyxwjgbu.supabase.co/storage/v1/object/public/avatars/user.png"
                  className="w-full p-2 border border-slate-300 rounded text-sm font-mono text-xs"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2 bg-[#3730A3] hover:bg-[#4338CA] text-white text-xs font-semibold rounded-lg"
              >
                Save Profile Details
              </button>
            </form>

            <hr className="border-slate-200" />

            {/* Optional Change Password Form */}
            <form onSubmit={handleChangePassword} className="space-y-3">
              <h4 className="text-xs font-bold uppercase text-slate-400 flex items-center gap-1">
                <Key className="w-3.5 h-3.5" /> Change Password (Optional)
              </h4>

              {pwdMsg && (
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded text-xs text-emerald-800 font-semibold">
                  {pwdMsg}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Current Password</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded text-sm"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-lg"
              >
                Update Password
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
