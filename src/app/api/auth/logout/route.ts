import { NextResponse } from "next/server";
import { clearAuthCookies } from "@/lib/auth/guards";

export async function POST() {
  const res = NextResponse.json({ message: "Logout successful" });
  clearAuthCookies(res);
  return res;
}
