"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fetchApi } from "@/lib/api";
import HeaderNav from "@/components/HeaderNav";
import {
  User,
  Mail,
  Phone,
  Key,
  Camera,
  ArrowLeft,
  CheckCircle,
  AlertTriangle,
  Building,
  GraduationCap,
  ShieldCheck,
  UserCheck,
  Lock,
} from "lucide-react";

export default function ProfilePage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [authorized, setAuthorized] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Edit Profile Form State
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [profilePicUrl, setProfilePicUrl] = useState("");
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [loggingOutEverywhere, setLoggingOutEverywhere] = useState(false);

  // Change Password Form State
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    loadProfileData();
  }, []);

  const loadProfileData = async () => {
    try {
      const res = await fetchApi("/profile/me");
      setProfile(res);
      setDisplayName(res.displayName || "");
      setEmail(res.email || "");
      setPhone(res.phone || "");
      setProfilePicUrl(res.profilePicUrl || "");
      setEmailNotifications(res.emailNotifications ?? true);
      setAuthorized(true);
    } catch (err) {
      router.push("/");
    } finally {
      setLoading(false);
    }
  };

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate mime-type
    const validTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!validTypes.includes(file.type)) {
      setProfileMsg({
        type: "error",
        text: "Invalid image format. Only JPEG, PNG, and WEBP formats are accepted.",
      });
      return;
    }

    // Validate size (max 1.5MB)
    if (file.size > 1.5 * 1024 * 1024) {
      setProfileMsg({
        type: "error",
        text: "Image file exceeds maximum allowed size of 1.5MB.",
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setProfilePicUrl(reader.result);
        setProfileMsg(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileMsg(null);

    try {
      await fetchApi("/profile/me", {
        method: "PUT",
        body: JSON.stringify({
          name: displayName,
          email,
          phone,
          profilePicUrl,
          emailNotifications,
        }),
      });

      setProfileMsg({
        type: "success",
        text: "Profile updated successfully!",
      });
      await loadProfileData();
    } catch (err: any) {
      setProfileMsg({
        type: "error",
        text: err.data?.error || "Failed to update profile information.",
      });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMsg(null);

    if (newPassword.length < 6) {
      setPasswordMsg({
        type: "error",
        text: "New password must be at least 6 characters long.",
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordMsg({
        type: "error",
        text: "New passwords do not match. Please verify both inputs.",
      });
      return;
    }

    setSavingPassword(true);

    try {
      const res = await fetchApi("/profile/change-password", {
        method: "POST",
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });

      setPasswordMsg({
        type: "success",
        text: res.message || "Password changed successfully!",
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setPasswordMsg({
        type: "error",
        text: err.data?.error || "Failed to change password. Please check your current password.",
      });
    } finally {
      setSavingPassword(false);
    }
  };

  const getDashboardHref = () => {
    if (!profile) return "/";
    if (profile.role === "STUDENT") return "/student";
    if (profile.role === "ADMIN") return "/admin";
    if (profile.role === "FACULTY") {
      if (profile.facultyProfile?.hodAssignments?.length > 0) return "/hod";
      return "/faculty";
    }
    return "/";
  };

  const handleLogoutEverywhere = async () => {
    if (!confirm("Are you sure you want to sign out of all active sessions and devices?")) {
      return;
    }
    setLoggingOutEverywhere(true);
    try {
      await fetchApi("/auth/logout-everywhere", { method: "POST" });
    } catch {
      // Proceed with redirect regardless of errors
    } finally {
      localStorage.removeItem("auth_token");
      router.push("/");
    }
  };

  if (loading || !authorized) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-500 text-sm font-semibold">
        Loading profile settings...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6 max-w-5xl mx-auto space-y-6">
      <HeaderNav
        portalTitle="Account & Security Settings"
        portalSubtitle="Manage personal contact information, institutional credentials, and access passwords"
        roleBadge={
          profile.role === "FACULTY" && profile.facultyProfile?.hodAssignments?.length > 0
            ? "HOD"
            : profile.role
        }
      />

      {/* Back to Dashboard Navigation */}
      <div>
        <Link
          href={getDashboardHref()}
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-[#3730A3] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: Profile Card */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-5 text-center flex flex-col items-center">
          <div className="relative group">
            {profilePicUrl ? (
              <img
                src={profilePicUrl}
                alt="Profile Avatar"
                className="w-28 h-28 rounded-full object-cover border-4 border-indigo-100 shadow-sm"
              />
            ) : (
              <div className="w-28 h-28 rounded-full bg-[#3730A3] text-white flex items-center justify-center font-bold text-3xl shadow-sm border-4 border-indigo-100">
                {(displayName || profile.username || "U").charAt(0).toUpperCase()}
              </div>
            )}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="absolute bottom-0 right-0 p-2 bg-[#3730A3] hover:bg-[#4338CA] text-white rounded-full shadow transition-transform hover:scale-105"
              title="Upload new picture"
            >
              <Camera className="w-4 h-4" />
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImageFileChange}
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
            />
          </div>

          <div>
            <h2 className="text-lg font-bold text-slate-900">{displayName || profile.username}</h2>
            <span className="text-xs font-mono text-slate-400 block mt-0.5">{profile.username}</span>
            <div className="mt-2 inline-flex items-center gap-1">
              {profile.role === "ADMIN" && (
                <span className="pill-rose text-[11px] font-bold">System Administrator</span>
              )}
              {profile.role === "FACULTY" && profile.facultyProfile?.hodAssignments?.length > 0 && (
                <span className="pill-emerald text-[11px] font-bold">Head of Department (HOD)</span>
              )}
              {profile.role === "FACULTY" && !(profile.facultyProfile?.hodAssignments?.length > 0) && (
                <span className="pill-indigo text-[11px] font-bold">Teaching Faculty</span>
              )}
              {profile.role === "STUDENT" && (
                <span className="pill-amber text-[11px] font-bold">Enrolled Student</span>
              )}
            </div>
          </div>

          {/* Institutional Enrollment / Appointment Details */}
          <div className="w-full pt-4 border-t border-slate-100 text-left text-xs space-y-2 text-slate-600">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Last Login</span>
              <span className="font-semibold text-slate-800">
                {profile.lastLoginAt
                  ? new Date(profile.lastLoginAt).toLocaleString("en-IN", {
                      timeZone: "Asia/Kolkata",
                      dateStyle: "medium",
                      timeStyle: "short",
                    })
                  : "First active session"}
              </span>
            </div>
            <div className="pt-2">
              <button
                type="button"
                onClick={handleLogoutEverywhere}
                disabled={loggingOutEverywhere}
                className="w-full py-2 px-3 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <Lock className="w-3.5 h-3.5" />
                {loggingOutEverywhere ? "Revoking..." : "Log out of all devices"}
              </button>
            </div>
            {profile.studentProfile && (
              <>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Department</span>
                  <span className="font-semibold text-slate-800">
                    {profile.studentProfile.batch?.department?.name || "N/A"}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Batch & Section</span>
                  <span className="font-semibold text-slate-800">
                    {profile.studentProfile.batch?.name || "Batch"} — Section {profile.studentProfile.section?.name || "N/A"}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Permanent Reg. No (PRN)</span>
                  <span className="font-mono text-slate-800">{profile.studentProfile.prn || "N/A"}</span>
                </div>
              </>
            )}

            {profile.facultyProfile && (
              <>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Home Department</span>
                  <span className="font-semibold text-slate-800">
                    {profile.facultyProfile.homeDepartment?.name || "N/A"}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Employee ID</span>
                  <span className="font-mono text-slate-800">{profile.facultyProfile.employeeId || profile.username}</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right Column: Forms */}
        <div className="md:col-span-2 space-y-6">
          {/* Edit Profile Form */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <User className="w-5 h-5 text-[#3730A3]" /> Personal Information
            </h3>

            {profileMsg && (
              <div
                className={`p-3.5 rounded-lg text-xs font-semibold flex items-center gap-2 ${
                  profileMsg.type === "success"
                    ? "bg-emerald-50 text-emerald-900 border border-emerald-200"
                    : "bg-rose-50 text-rose-900 border border-rose-200"
                }`}
              >
                {profileMsg.type === "success" ? (
                  <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                )}
                <span>{profileMsg.text}</span>
              </div>
            )}

            <form onSubmit={handleUpdateProfile} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">Display Name</label>
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                    Institutional Email Address
                  </label>
                  <div className="relative">
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="user@bvimr.ac.in"
                      className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                    />
                    <Mail className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">Contact Phone</label>
                  <div className="relative">
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+91 98765 43210"
                      className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                    />
                    <Phone className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
                  </div>
                </div>
              </div>

              {/* Email Notifications Toggle */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <div>
                  <label className="text-xs font-semibold text-slate-800 block">Email Notifications</label>
                  <span className="text-[11px] text-slate-500">
                    Receive email digests, marks release alerts, and grievance thread updates
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={emailNotifications}
                    onChange={(e) => setEmailNotifications(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="px-5 py-2.5 bg-[#3730A3] hover:bg-[#4338CA] text-white text-xs font-semibold rounded-lg shadow-sm transition-colors disabled:opacity-50"
                >
                  {savingProfile ? "Saving Changes..." : "Save Profile Details"}
                </button>
              </div>
            </form>
          </div>

          {/* Change Password Form */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Key className="w-5 h-5 text-[#3730A3]" /> Change Security Password
            </h3>

            {passwordMsg && (
              <div
                className={`p-3.5 rounded-lg text-xs font-semibold flex items-center gap-2 ${
                  passwordMsg.type === "success"
                    ? "bg-emerald-50 text-emerald-900 border border-emerald-200"
                    : "bg-rose-50 text-rose-900 border border-rose-200"
                }`}
              >
                {passwordMsg.type === "success" ? (
                  <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                )}
                <span>{passwordMsg.text}</span>
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                  Current Password
                </label>
                <div className="relative">
                  <input
                    type="password"
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                    className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  />
                  <Lock className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">New Password</label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min. 6 characters"
                    className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat new password"
                    className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={savingPassword || !currentPassword || !newPassword || !confirmPassword}
                  className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors disabled:opacity-50"
                >
                  {savingPassword ? "Updating Password..." : "Update Password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

