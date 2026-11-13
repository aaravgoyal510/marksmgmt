import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth/guards";

export async function GET(req: NextRequest) {
  const auth = verifyAuth(req);
  if (!auth.ok) {
    return auth.error;
  }

  return NextResponse.json({
    authenticated: true,
    user: auth.user,
  });
}
