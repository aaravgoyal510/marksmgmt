import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { Role } from "@prisma/client";

export interface TestTokenPayload {
  userId: string;
  username: string;
  role: Role;
  facultyId?: string;
  studentId?: string;
  isHOD?: boolean;
  hodDepartmentId?: string | null;
}

export function createToken(payload: TestTokenPayload): string {
  const secret = process.env.JWT_SECRET || "your-32-char-random-jwt-access-secret-here";
  return jwt.sign(payload, secret, { expiresIn: "1h" });
}

export interface TestRequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD";
  token?: string;
  cookies?: Record<string, string>;
  headers?: Record<string, string>;
  body?: any;
}

export function createTestRequest(url: string, options?: TestRequestOptions): NextRequest {
  const fullUrl = url.startsWith("http://") || url.startsWith("https://")
    ? url
    : `http://localhost:3000${url.startsWith("/") ? url : `/${url}`}`;

  const headers = new Headers(options?.headers || {});

  if (options?.token) {
    headers.set("authorization", `Bearer ${options.token}`);
  }

  if (options?.cookies) {
    const cookieStr = Object.entries(options.cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
    headers.set("cookie", cookieStr);
  }

  const method = options?.method || (options?.body !== undefined ? "POST" : "GET");

  if (options?.body !== undefined && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const hasBody = method !== "GET" && method !== "HEAD" && options?.body !== undefined;
  const body = hasBody
    ? typeof options?.body === "string"
      ? options.body
      : JSON.stringify(options.body)
    : undefined;

  return new NextRequest(fullUrl, {
    method,
    headers,
    body,
  });
}

export async function parseJsonResponse<T = any>(
  res: Response | NextResponse
): Promise<{ status: number; data: T }> {
  const data = await res.json().catch(() => ({}));
  return {
    status: res.status,
    data,
  };
}
