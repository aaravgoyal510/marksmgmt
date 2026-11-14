"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { fetchApi } from "@/lib/api";
import {
  User,
  LogOut,
  Settings,
  Key,
  Image as ImageIcon,
  ShieldCheck,
  UserCheck,
  GraduationCap,
  Building,
  Bell,
  Check,
  CheckCheck,
  Clock,
  ExternalLink,
  MessageSquare,
  Sparkles,
  AlertTriangle,
  Lock,
  HelpCircle,
} from "lucide-react";

interface HeaderNavProps {
  portalTitle: string;
  portalSubtitle: string;
  roleBadge: "ADMIN" | "HOD" | "FACULTY" | "STUDENT";
}

export default function HeaderNav({ portalTitle, portalSubtitle, roleBadge }: HeaderNavProps) {
  const [profile, setProfile] = useState<any>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Notifications State
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [notifDropdownOpen, setNotifDropdownOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

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

  const fetchNotifications = async () => {
    try {
      const res = await fetchApi("/notifications?all=true");
      if (res && Array.isArray(res.notifications)) {
        setNotifications(res.notifications);
        const count = typeof res.unreadCount === "number"
          ? res.unreadCount
          : res.notifications.filter((n: any) => !n.isRead).length;
        setUnreadCount(count);
      }
    } catch (err) {
      // Non-blocking notification polling
    }
  };

  useEffect(() => {
    fetchNotifications();

    // 30-second polling interval with visibility state awareness
    const intervalId = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        fetchNotifications();
      }
    }, 30000);

    const handleVisibilityChange = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        fetchNotifications();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  // Close notifications dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setNotifDropdownOpen(false);
      }
    };

    if (notifDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [notifDropdownOpen]);

  const handleMarkAsRead = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      await fetchApi(`/notifications/${id}/read`, { method: "POST" });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error("Failed to mark notification as read", err);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await fetchApi("/notifications/read-all", { method: "POST" });
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error("Failed to mark all notifications as read", err);
    }
  };

  const handleNotificationClick = async (notif: any) => {
    if (!notif.isRead) {
      await handleMarkAsRead(notif.id);
    }
    setNotifDropdownOpen(false);

    if (!notif.link) return;

    let targetUrl = notif.link;
    if (notif.link.includes("/queries/")) {
      if (roleBadge === "STUDENT") {
        targetUrl = "/student";
      } else if (roleBadge === "FACULTY") {
        targetUrl = "/faculty";
      } else if (roleBadge === "HOD") {
        targetUrl = "/hod";
      }
    }

    window.location.href = targetUrl;
  };

  const formatRelativeTime = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      const now = new Date();
      const diffSec = Math.floor((now.getTime() - d.getTime()) / 1000);
      if (diffSec < 60) return "just now";
      const diffMin = Math.floor(diffSec / 60);
      if (diffMin < 60) return `${diffMin}m ago`;
      const diffHr = Math.floor(diffMin / 60);
      if (diffHr < 24) return `${diffHr}h ago`;
      const diffDay = Math.floor(diffHr / 24);
      return `${diffDay}d ago`;
    } catch {
      return "";
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "QUERY_REPLY":
      case "QUERY_ESCALATED":
      case "QUERY_RESOLVED":
        return <MessageSquare className="w-4 h-4 text-indigo-600" />;
      case "MARKS_PUBLISHED":
        return <Sparkles className="w-4 h-4 text-emerald-600" />;
      case "IMPORT_BLOCKED":
        return <AlertTriangle className="w-4 h-4 text-rose-600" />;
      case "OFFERING_UNLOCKED":
        return <Lock className="w-4 h-4 text-amber-600" />;
      default:
        return <Bell className="w-4 h-4 text-slate-500" />;
    }
  };

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
          {/* Notifications Bell Dropdown */}
          <div className="relative" ref={notifRef}>
            <button
              onClick={() => setNotifDropdownOpen((prev) => !prev)}
              className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg border border-slate-200 text-xs font-semibold relative transition-colors flex items-center justify-center"
              title="Notifications"
            >
              <Bell className="w-4 h-4 text-slate-600" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-rose-600 text-white text-[10px] font-bold rounded-full h-4 min-w-[16px] px-1 flex items-center justify-center animate-pulse">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>

            {notifDropdownOpen && (
              <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden text-left">
                <div className="p-3 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                  <div className="flex items-center gap-2">
                    <Bell className="w-4 h-4 text-[#3730A3]" />
                    <span className="font-bold text-xs text-slate-900">Notifications</span>
                    {unreadCount > 0 && (
                      <span className="px-1.5 py-0.5 bg-indigo-100 text-[#3730A3] font-bold text-[10px] rounded-full">
                        {unreadCount} new
                      </span>
                    )}
                  </div>
                  {unreadCount > 0 && (
                    <button
                      onClick={handleMarkAllAsRead}
                      className="text-[11px] font-semibold text-[#3730A3] hover:text-[#4338CA] flex items-center gap-1"
                    >
                      <CheckCheck className="w-3.5 h-3.5" /> Mark all read
                    </button>
                  )}
                </div>

                <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                  {notifications.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-400 font-medium">
                      No notifications yet
                    </div>
                  ) : (
                    notifications.map((n) => (
                      <div
                        key={n.id}
                        onClick={() => handleNotificationClick(n)}
                        className={`p-3 text-xs cursor-pointer hover:bg-slate-50 transition-colors flex items-start gap-2.5 ${
                          !n.isRead ? "bg-indigo-50/40" : ""
                        }`}
                      >
                        <div className="p-1.5 rounded-lg bg-white border border-slate-200 flex-shrink-0 mt-0.5">
                          {getNotificationIcon(n.type)}
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className={`line-clamp-2 leading-relaxed ${!n.isRead ? "font-semibold text-slate-900" : "text-slate-600"}`}>
                            {n.message}
                          </p>
                          <span className="text-[10px] text-slate-400 mt-1 block">
                            {formatRelativeTime(n.createdAt)}
                          </span>
                        </div>

                        {!n.isRead && (
                          <button
                            onClick={(e) => handleMarkAsRead(n.id, e)}
                            className="p-1 hover:bg-indigo-100 rounded text-slate-400 hover:text-[#3730A3] transition-colors flex-shrink-0"
                            title="Mark as read"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <Link
            href="/profile"
            className="flex items-center gap-2.5 bg-slate-50 hover:bg-slate-100 p-2 pr-3 rounded-lg border border-slate-200 transition-colors"
            title="View & Edit Profile"
          >
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
          </Link>

          <Link
            href="/help"
            className="p-2.5 bg-indigo-50 hover:bg-indigo-100 text-[#3730A3] rounded-lg border border-indigo-200 text-xs font-semibold flex items-center gap-1 transition-colors"
            title="Portal User Guides & Help Center"
          >
            <HelpCircle className="w-4 h-4 text-[#3730A3]" />
            <span className="hidden sm:inline">Help</span>
          </Link>

          <Link
            href="/profile"
            className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg border border-slate-200 text-xs font-semibold flex items-center gap-1 transition-colors"
            title="Profile & Password Settings"
          >
            <User className="w-4 h-4 text-slate-600" />
            <span className="hidden sm:inline">Profile</span>
          </Link>

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
