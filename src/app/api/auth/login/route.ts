import { NextRequest, NextResponse } from "next/server";
import { AuthService } from "@/services/authService";
import { setAuthCookies } from "@/lib/auth/guards";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { username, password } = body;
    if (!username || !password) {
      return NextResponse.json(
        { error: "Username and password are required" },
        { status: 400 }
      );
    }

    const result = await AuthService.login(username, password);

    if (result.status === "LOCKED") {
      return NextResponse.json(
        {
          error: "Account locked after 5 failed attempts",
          options: result.lockoutOptions,
        },
        { status: 423 }
      );
    }

    if (result.status === "INVALID_CREDENTIALS") {
      return NextResponse.json(
        {
          error: "Invalid username or password",
          failedAttempts: result.failedAttempts,
        },
        { status: 401 }
      );
    }

    const res = NextResponse.json({
      message: "Login successful",
      user: result.user,
      tokens: result.tokens,
    });

    if (result.tokens) {
      setAuthCookies(res, result.tokens, result.user);
    }

    return res;
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
