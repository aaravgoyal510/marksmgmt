import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth/guards";
import { Role } from "@prisma/client";

export async function GET(req: NextRequest) {
  const auth = verifyAuth(req, [Role.ADMIN]);
  if (!auth.ok) return auth.error;

  const url = new URL(req.url);
  const entityType = url.searchParams.get("entityType")?.trim() || "";
  const userId = url.searchParams.get("userId")?.trim() || "";
  const startDateStr = url.searchParams.get("startDate")?.trim() || "";
  const endDateStr = url.searchParams.get("endDate")?.trim() || "";
  const search = url.searchParams.get("search")?.trim() || "";

  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "25", 10)));

  const where: any = {};

  if (entityType) {
    where.entityType = entityType;
  }

  if (userId) {
    where.changedByUserId = userId;
  }

  if (startDateStr || endDateStr) {
    where.changedAt = {};
    if (startDateStr) {
      const sDate = new Date(startDateStr);
      if (!isNaN(sDate.getTime())) {
        where.changedAt.gte = sDate;
      }
    }
    if (endDateStr) {
      const eDate = new Date(endDateStr);
      if (!isNaN(eDate.getTime())) {
        // Set to end of day if only YYYY-MM-DD passed
        if (endDateStr.length <= 10) {
          eDate.setHours(23, 59, 59, 999);
        }
        where.changedAt.lte = eDate;
      }
    }
  }

  if (search) {
    where.OR = [
      { entityId: { contains: search, mode: "insensitive" } },
      { oldValue: { contains: search, mode: "insensitive" } },
      { newValue: { contains: search, mode: "insensitive" } },
      { changedByUser: { username: { contains: search, mode: "insensitive" } } },
    ];
  }

  try {
    const [total, logs] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        include: {
          changedByUser: {
            select: {
              id: true,
              username: true,
              role: true,
              email: true,
            },
          },
        },
        orderBy: { changedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));

    return NextResponse.json({
      logs,
      total,
      page,
      limit,
      totalPages,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to retrieve audit logs" },
      { status: 500 }
    );
  }
}

