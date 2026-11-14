import { NextRequest, NextResponse } from "next/server";
import { AuthService } from "@/services/authService";
import { verifyAuth } from "@/lib/auth/guards";
import { Role } from "@prisma/client";

export async function POST(req: NextRequest) {
  const auth = verifyAuth(req, [Role.ADMIN]);
  if (!auth.ok) return auth.error;

  await AuthService.clearAllLockouts();
  return NextResponse.json({
    message: "All account lockouts cleared successfully",
  });
}
