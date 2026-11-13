import { NextResponse } from "next/server";
import { AuthService } from "@/services/authService";

export async function POST() {
  AuthService.clearAllLockouts();
  return NextResponse.json({
    message: "All account lockouts cleared successfully",
  });
}
