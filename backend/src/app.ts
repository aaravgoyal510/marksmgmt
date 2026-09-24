import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import { generalRateLimiter, authRateLimiter } from "./middleware/rateLimiter";
import authRoutes from "./routes/authRoutes";
import adminRoutes from "./routes/adminRoutes";
import hodRoutes from "./routes/hodRoutes";
import facultyRoutes from "./routes/facultyRoutes";
import studentRoutes from "./routes/studentRoutes";
import queryRoutes from "./routes/queryRoutes";
import notificationRoutes from "./routes/notificationRoutes";
import reportsRoutes from "./routes/reportsRoutes";
import profileRoutes from "./routes/profileRoutes";

dotenv.config();

// Production JWT Secret Hardening Safeguard
if (process.env.NODE_ENV === "production") {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret === "default-secret-change-me") {
    console.error("FATAL SECURITY ERROR: JWT_SECRET must be set to a secure string in production.");
    process.exit(1);
  }
}

export const app = express();

// Strict CORS Configuration (Restrict allowed origins)
const allowedOrigins = [
  process.env.FRONTEND_URL || "http://localhost:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("CORS policy violation: Access denied from unauthorized origin"));
    },
    credentials: true,
  })
);

// Enforce 2MB request body payload limit (DoS Prevention)
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));
app.use(cookieParser());

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "OK", timestamp: new Date().toISOString() });
});

// Rate limiting middleware
app.use("/api/auth/login", authRateLimiter);
app.use("/api", generalRateLimiter);

// Specific route mount points (Mounted before broad catch-all routes)
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/hod", hodRoutes);
app.use("/api/students", studentRoutes);
app.use("/api/queries", queryRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/profile", profileRoutes);

// Faculty routes (mounted at /api/faculty and /api)
app.use("/api/faculty", facultyRoutes);
app.use("/api", facultyRoutes);
