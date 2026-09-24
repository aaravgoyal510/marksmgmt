import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function getUserNotifications(req: Request, res: Response) {
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const notifications = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return res.status(200).json({ unreadCount, notifications });
}

export async function markNotificationAsRead(req: Request, res: Response) {
  const id = req.params.id as string;
  const userId = req.user?.userId;

  const notification = await prisma.notification.findFirst({
    where: { id, userId },
  });

  if (!notification) {
    return res.status(404).json({ error: "Notification not found" });
  }

  const updated = await prisma.notification.update({
    where: { id },
    data: { isRead: true },
  });

  return res.status(200).json({ notification: updated });
}
