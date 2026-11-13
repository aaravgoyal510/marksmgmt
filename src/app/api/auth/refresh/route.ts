import { NextRequest, NextResponse } from "next/server";
import { AuthService } from "@/services/authService";

export async function POST(req: NextRequest) {
  try {
    let refreshToken = req.cookies.get("refreshToken")?.value;
    if (!refreshToken) {
      const body = await req.json().catch(() => ({}));
      refreshToken = body.refreshToken;
    }

    if (!refreshToken) {
      return NextResponse.json(
        { error: "Refresh token is required" },
        { status: 400 }
      );
    }

    const newAccessToken = AuthService.refreshAccessToken(refreshToken);
    if (!newAccessToken) {
      return NextResponse.json(
        { error: "Invalid or expired refresh token" },
        { status: 401 }
      );
    }

    const isProd = process.env.NODE_ENV === "production";
    const res = NextResponse.json({ accessToken: newAccessToken });
    res.cookies.set("accessToken", newAccessToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? "strict" : "lax",
      maxAge: 7 * 24 * 60 * 60,
      path: "/",
    });

    return res;
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
