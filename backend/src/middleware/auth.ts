import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { Role, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export interface JwtPayload {
  userId: string;
  username: string;
  role: Role;
  facultyId?: string;
  studentId?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/**
 * Validates JWT authentication and checks role permissions.
 */
export function requireAuth(roles?: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    let token = req.cookies?.accessToken;
    if (!token && req.headers.authorization?.startsWith("Bearer ")) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      return res.status(401).json({ error: "Missing or invalid authentication token" });
    }

    const secret = process.env.JWT_SECRET || "your-32-char-random-jwt-access-secret-here";

    try {
      const decoded = jwt.verify(token, secret) as JwtPayload;

      if (roles && roles.length > 0 && !roles.includes(decoded.role)) {
        return res.status(403).json({ error: "Forbidden: Insufficient role permissions" });
      }
      req.user = decoded;
      next();
    } catch {
      return res.status(401).json({ error: "Invalid or expired token" });
    }
  };
}

/**
  * Enforces server-side HOD department scoping.
  * Checks if the authenticated user is an HOD assigned to the specified department.
  */
export function requireHODOfDepartment(
  location: "params" | "body" | "query",
  paramName: string = "departmentId"
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const facultyId = req.user.facultyId;
    if (!facultyId) {
      return res.status(403).json({ error: "Forbidden: Account is not associated with a Faculty profile" });
    }

    const targetDeptId = req[location]?.[paramName];
    if (!targetDeptId) {
      return res.status(400).json({ error: `Missing department ID in ${location}.${paramName}` });
    }

    const assignment = await prisma.hODAssignment.findFirst({
      where: {
        facultyId: facultyId,
        departmentId: targetDeptId,
      },
    });

    if (!assignment) {
      return res.status(403).json({
        error: "Forbidden: You are not authorized as HOD for this department",
        code: "HOD_DEPARTMENT_MISMATCH",
      });
    }

    next();
  };
}
