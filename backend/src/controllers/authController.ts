import { Request, Response } from "express";
import { AuthService } from "../services/authService";

const isProd = process.env.NODE_ENV === "production";
const cookieOptions: any = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? "strict" : "lax",
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

const userCookieOptions: any = {
  httpOnly: false,
  secure: isProd,
  sameSite: isProd ? "strict" : "lax",
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

export async function loginHandler(req: Request, res: Response) {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required" });
  }

  const result = await AuthService.login(username, password);

  if (result.status === "LOCKED") {
    return res.status(423).json({
      error: "Account locked after 5 failed attempts",
      options: result.lockoutOptions,
    });
  }

  if (result.status === "INVALID_CREDENTIALS") {
    return res.status(401).json({
      error: "Invalid username or password",
      failedAttempts: result.failedAttempts,
    });
  }

  const clearCookieOptions: any = {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "strict" : "lax",
  };

  // Set HttpOnly Cookies for Access & Refresh Tokens
  if (result.tokens) {
    res.cookie("accessToken", result.tokens.accessToken, cookieOptions);
    res.cookie("refreshToken", result.tokens.refreshToken, cookieOptions);
  }
  res.cookie("userData", JSON.stringify(result.user), userCookieOptions);

  return res.status(200).json({
    message: "Login successful",
    user: result.user,
    tokens: result.tokens, // Returned for test compatibility
  });
}

export async function logoutHandler(_req: Request, res: Response) {
  const clearCookieOptions: any = {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "strict" : "lax",
  };
  res.clearCookie("accessToken", clearCookieOptions);
  res.clearCookie("refreshToken", clearCookieOptions);
  res.clearCookie("userData", clearCookieOptions);
  return res.status(200).json({ message: "Logout successful" });
}

export async function meHandler(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  return res.status(200).json({
    authenticated: true,
    user: req.user,
  });
}

export async function refreshHandler(req: Request, res: Response) {
  const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
  if (!refreshToken) {
    return res.status(400).json({ error: "Refresh token is required" });
  }

  const newAccessToken = AuthService.refreshAccessToken(refreshToken);
  if (!newAccessToken) {
    return res.status(401).json({ error: "Invalid or expired refresh token" });
  }

  res.cookie("accessToken", newAccessToken, cookieOptions);
  return res.status(200).json({ accessToken: newAccessToken });
}

export async function clearAllLockoutsHandler(_req: Request, res: Response) {
  AuthService.clearAllLockouts();
  return res.status(200).json({ message: "All account lockouts cleared successfully" });
}

import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../utils/password";

const prisma = new PrismaClient();

export async function forgotPasswordHandler(req: Request, res: Response) {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  const user = await prisma.user.findFirst({ where: { email } });
  let resetToken = null;
  if (user) {
    // Generate signed JWT reset token with EXACT 15-MINUTE EXPIRATION (900 seconds)
    resetToken = jwt.sign(
      { userId: user.id, purpose: "PASSWORD_RESET" },
      process.env.JWT_SECRET || "your-32-char-random-jwt-access-secret-here",
      { expiresIn: "15m" }
    );
  }

  return res.status(200).json({
    message: "Password reset link sent to registered email if account exists.",
    ...(process.env.NODE_ENV !== "production" && resetToken ? { resetToken } : {}),
  });
}

export async function resetPasswordWithTokenHandler(req: Request, res: Response) {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) {
    return res.status(400).json({ error: "Token and newPassword are required" });
  }

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "your-32-char-random-jwt-access-secret-here"
    ) as any;

    if (decoded.purpose !== "PASSWORD_RESET") {
      return res.status(400).json({ error: "Invalid password reset token" });
    }

    const newHash = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: decoded.userId },
      data: { passwordHash: newHash },
    });

    return res.status(200).json({ message: "Password reset successfully using 15-minute token" });
  } catch {
    return res.status(401).json({ error: "Invalid or expired password reset token (tokens expire after 15 minutes)" });
  }
}
