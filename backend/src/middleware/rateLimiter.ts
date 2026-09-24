import { Request, Response, NextFunction } from "express";

const requestCounts = new Map<string, { count: number; resetTime: number }>();

/**
 * In-memory sliding window rate limiter middleware.
 */
export function createRateLimiter(maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Skip rate limiting in development/testing environments or on localhost loopback
    const isDev = process.env.NODE_ENV !== "production";
    const ip = (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "unknown";
    const isLocalhost = ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1" || ip.includes("127.0.0.1");

    if (isDev || isLocalhost) {
      return next();
    }

    const now = Date.now();
    const record = requestCounts.get(ip) || { count: 0, resetTime: now + windowMs };

    if (now > record.resetTime) {
      record.count = 0;
      record.resetTime = now + windowMs;
    }

    record.count += 1;
    requestCounts.set(ip, record);

    res.setHeader("X-RateLimit-Limit", maxRequests.toString());
    res.setHeader("X-RateLimit-Remaining", Math.max(0, maxRequests - record.count).toString());

    if (record.count > maxRequests) {
      return res.status(429).json({
        error: "Too many requests. Please slow down and try again later.",
        code: "RATE_LIMIT_EXCEEDED",
      });
    }

    next();
  };
}

export const generalRateLimiter = createRateLimiter(300, 15 * 60 * 1000); // 300 req / 15 min
export const authRateLimiter = createRateLimiter(25, 15 * 60 * 1000);    // 25 req / 15 min
