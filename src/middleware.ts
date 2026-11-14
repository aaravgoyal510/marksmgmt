import { NextRequest, NextResponse } from "next/server";

// In-memory sliding window rate-limiter for /api/auth/* routes
interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const authRateLimitMap = new Map<string, RateLimitRecord>();
const AUTH_RATE_LIMIT_MAX = 30; // 30 requests per minute per IP
const AUTH_RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || "127.0.0.1";
}

function checkAuthRateLimit(ip: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const record = authRateLimitMap.get(ip);

  // Periodic cleanup of expired records if map grows large
  if (authRateLimitMap.size > 2000) {
    authRateLimitMap.forEach((val, key) => {
      if (now > val.resetAt) {
        authRateLimitMap.delete(key);
      }
    });
  }

  if (!record || now > record.resetAt) {
    authRateLimitMap.set(ip, { count: 1, resetAt: now + AUTH_RATE_LIMIT_WINDOW_MS });
    return { allowed: true };
  }

  if (record.count >= AUTH_RATE_LIMIT_MAX) {
    const retryAfter = Math.ceil((record.resetAt - now) / 1000);
    return { allowed: false, retryAfter };
  }

  record.count += 1;
  return { allowed: true };
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Rate-limiting check specifically on authentication routes
  if (pathname.startsWith("/api/auth/")) {
    const ip = getClientIp(req);
    const limitResult = checkAuthRateLimit(ip);

    if (!limitResult.allowed) {
      return NextResponse.json(
        { error: "Too many authentication attempts. Please try again later." },
        {
          status: 429,
          headers: {
            "Retry-After": String(limitResult.retryAfter || 60),
            "Content-Type": "application/json",
          },
        }
      );
    }
  }

  const response = NextResponse.next();

  // Standard Security Hardening Headers
  let sentryIngestHost = "";
  if (process.env.SENTRY_DSN) {
    try {
      const dsnUrl = new URL(process.env.SENTRY_DSN);
      sentryIngestHost = ` https://${dsnUrl.host}`;
    } catch {
      // Ignore URL parsing errors for malformed DSN
    }
  }

  const cspConnectSrc = `'self'${sentryIngestHost}`;

  response.headers.set(
    "Content-Security-Policy",
    `default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self' data:; connect-src ${cspConnectSrc}; frame-ancestors 'none'; object-src 'none'; base-uri 'self';`
  );
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.headers.set("X-DNS-Prefetch-Control", "on");

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static files, _next, favicon.ico
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
