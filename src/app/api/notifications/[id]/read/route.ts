import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  return markRead(req, params.id);
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  return markRead(req, params.id);
}

async function markRead(req: NextRequest, notificationId: string) {
  const auth = verifyAuth(req);
  if (!auth.ok) {
    return auth.error;
  }

  const userId = auth.user.userId;

  const notification = await prisma.notification.findFirst({
    where: {
      id: notificationId,
      userId,
    },
  });

  if (!notification) {
    return NextResponse.json(
      { error: "Notification not found" },
      { status: 404 }
    );
  }

  const updated = await prisma.notification.update({
    where: { id: notificationId },
    data: { isRead: true },
  });

  return NextResponse.json({
    message: "Notification marked as read",
    notification: updated,
  });
}
