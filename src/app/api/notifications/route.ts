import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = verifyAuth(req);
  if (!auth.ok) {
    return auth.error;
  }

  const userId = auth.user.userId;
  const allParam = req.nextUrl.searchParams.get("all");

  const whereClause: { userId: string; isRead?: boolean } = { userId };
  if (allParam !== "true") {
    whereClause.isRead = false;
  }

  const notifications = await prisma.notification.findMany({
    where: whereClause,
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return NextResponse.json({
    notifications,
    unreadCount,
  });
}
