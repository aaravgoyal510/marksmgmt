import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { Role, SubjectOfferingSection, SubjectOffering, GradingPolicy } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export interface JwtPayload {
  userId: string;
  username: string;
  role: Role;
  facultyId?: string;
  studentId?: string;
  isHOD?: boolean;
  hodDepartmentId?: string | null;
}

export type AuthResult =
  | { ok: true; user: JwtPayload; error?: never }
  | { ok: false; user?: never; error: NextResponse };

export function verifyAuth(req: NextRequest, roles?: Role[]): AuthResult {
  let token = req.cookies.get("accessToken")?.value;
  const authHeader = req.headers.get("authorization");
  if (!token && authHeader?.startsWith("Bearer ")) {
    token = authHeader.split(" ")[1];
  }

  if (!token) {
    return {
      ok: false,
      error: NextResponse.json(
        { error: "Missing or invalid authentication token" },
        { status: 401 }
      ),
    };
  }

  const secret = process.env.JWT_SECRET || "your-32-char-random-jwt-access-secret-here";

  try {
    const decoded = jwt.verify(token, secret) as JwtPayload;

    if (roles && roles.length > 0 && !roles.includes(decoded.role)) {
      return {
        ok: false,
        error: NextResponse.json(
          { error: "Forbidden: Insufficient role permissions" },
          { status: 403 }
        ),
      };
    }

    return { ok: true, user: decoded };
  } catch {
    return {
      ok: false,
      error: NextResponse.json(
        { error: "Invalid or expired token" },
        { status: 401 }
      ),
    };
  }
}

export type HODResult =
  | { ok: true; error?: never }
  | { ok: false; error: NextResponse };

export async function verifyHOD(
  user: JwtPayload,
  departmentId: string | null | undefined
): Promise<HODResult> {
  const facultyId = user.facultyId;
  if (!facultyId) {
    return {
      ok: false,
      error: NextResponse.json(
        { error: "Forbidden: Account is not associated with a Faculty profile" },
        { status: 403 }
      ),
    };
  }

  if (!departmentId) {
    return {
      ok: false,
      error: NextResponse.json(
        { error: "Missing department ID parameter" },
        { status: 400 }
      ),
    };
  }

  const assignment = await prisma.hODAssignment.findFirst({
    where: {
      facultyId: facultyId,
      departmentId: departmentId,
    },
  });

  if (!assignment) {
    return {
      ok: false,
      error: NextResponse.json(
        {
          error: "Forbidden: You are not authorized as HOD for this department",
          code: "HOD_DEPARTMENT_MISMATCH",
        },
        { status: 403 }
      ),
    };
  }

  return { ok: true };
}

export type SectionWithPolicy = SubjectOfferingSection & {
  subjectOffering: SubjectOffering & {
    gradingPolicy: GradingPolicy | null;
  };
};

export type UnlockedSectionResult =
  | { ok: true; section: SectionWithPolicy; error?: never }
  | { ok: false; section?: never; error: NextResponse };

export async function verifyUnlockedSection(
  sectionId: string | null | undefined
): Promise<UnlockedSectionResult> {
  if (!sectionId) {
    return {
      ok: false,
      error: NextResponse.json(
        { error: "Missing section ID parameter" },
        { status: 400 }
      ),
    };
  }

  const section = await prisma.subjectOfferingSection.findUnique({
    where: { id: sectionId },
    include: {
      subjectOffering: {
        include: {
          gradingPolicy: true,
        },
      },
    },
  });

  if (!section) {
    return {
      ok: false,
      error: NextResponse.json(
        { error: "Subject offering section not found" },
        { status: 404 }
      ),
    };
  }

  if (!section.facultyId) {
    return {
      ok: false,
      error: NextResponse.json(
        {
          error: "Section is locked: Faculty member is not assigned to this section yet.",
          code: "SECTION_LOCKED_NO_FACULTY",
        },
        { status: 423 }
      ),
    };
  }

  const policy = section.subjectOffering.gradingPolicy;
  if (!policy || !policy.confirmedAt) {
    return {
      ok: false,
      error: NextResponse.json(
        {
          error: "Section is locked: HOD has not confirmed the grading policy for this subject offering.",
          code: "SECTION_LOCKED_POLICY_UNCONFIRMED",
        },
        { status: 423 }
      ),
    };
  }

  return { ok: true, section };
}

export function setAuthCookies(
  res: NextResponse,
  tokens: { accessToken: string; refreshToken: string },
  user?: any
) {
  const isProd = process.env.NODE_ENV === "production";
  const maxAge = 7 * 24 * 60 * 60; // 7 days in seconds

  res.cookies.set("accessToken", tokens.accessToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "strict" : "lax",
    maxAge,
    path: "/",
  });

  res.cookies.set("refreshToken", tokens.refreshToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "strict" : "lax",
    maxAge,
    path: "/",
  });

  if (user) {
    res.cookies.set("userData", JSON.stringify(user), {
      httpOnly: false,
      secure: isProd,
      sameSite: isProd ? "strict" : "lax",
      maxAge,
      path: "/",
    });
  }
}

export function clearAuthCookies(res: NextResponse) {
  const isProd = process.env.NODE_ENV === "production";
  const clearOptions = {
    maxAge: 0,
    path: "/",
    secure: isProd,
    sameSite: (isProd ? "strict" : "lax") as "strict" | "lax",
  };

  res.cookies.set("accessToken", "", { ...clearOptions, httpOnly: true });
  res.cookies.set("refreshToken", "", { ...clearOptions, httpOnly: true });
  res.cookies.set("userData", "", { ...clearOptions, httpOnly: false });
}
