import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return handleReadAll(req);
}

export async function PUT(req: NextRequest) {
  return handleReadAll(req);
}

async function handleReadAll(req: NextRequest) {
  const auth = verifyAuth(req);
  if (!auth.ok) {
    return auth.error;
  }

  const userId = auth.user.userId;

  const result = await prisma.notification.updateMany({
    where: {
      userId,
      isRead: false,
    },
    data: {
      isRead: true,
    },
  });

  return NextResponse.json({
    message: "All notifications marked as read",
    count: result.count,
  });
}

