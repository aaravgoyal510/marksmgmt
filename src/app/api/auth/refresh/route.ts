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

    const result = await AuthService.refreshAccessToken(refreshToken);
    if (!result) {
      return NextResponse.json(
        { error: "Invalid or expired refresh token" },
        { status: 401 }
      );
    }

    if (result === "DEACTIVATED") {
      return NextResponse.json(
        { error: "Account is deactivated" },
        { status: 401 }
      );
    }

    if (result === "INVALID_VERSION") {
      return NextResponse.json(
        { error: "Session has expired or was revoked" },
        { status: 401 }
      );
    }

    const newAccessToken = result.accessToken;

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
