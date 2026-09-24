import { Request, Response } from "express";
import { PrismaClient, Role } from "@prisma/client";
import { comparePassword, hashPassword } from "../utils/password";

const prisma = new PrismaClient();

export async function getProfile(req: Request, res: Response) {
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      studentProfile: {
        include: {
          batch: { include: { department: true } },
          section: true,
        },
      },
      facultyProfile: {
        include: {
          homeDepartment: true,
          hodAssignments: { include: { department: true } },
        },
      },
    },
  });

  if (!user) return res.status(404).json({ error: "User not found" });

  const displayName =
    user.studentProfile?.name ||
    user.facultyProfile?.name ||
    user.username;

  return res.status(200).json({
    id: user.id,
    username: user.username,
    role: user.role,
    email: user.email,
    phone: user.phone,
    profilePicUrl: user.profilePicUrl,
    displayName,
    studentProfile: user.studentProfile,
    facultyProfile: user.facultyProfile,
  });
}

export async function updateProfile(req: Request, res: Response) {
  const userId = req.user?.userId;
  const { name, email, phone, profilePicUrl } = req.body;

  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  if (profilePicUrl && typeof profilePicUrl === "string") {
    const isDataUri = profilePicUrl.startsWith("data:image/png") || profilePicUrl.startsWith("data:image/jpeg") || profilePicUrl.startsWith("data:image/webp");
    const isHttpUrl = profilePicUrl.startsWith("http://") || profilePicUrl.startsWith("https://");
    const hasImageExt = /\.(jpg|jpeg|png|webp|gif|svg)(\?.*)?$/i.test(profilePicUrl);

    if (!isDataUri && (!isHttpUrl || !hasImageExt)) {
      return res.status(400).json({
        error: "Invalid profile picture file format: Must be an image URL (.png, .jpg, .webp) or image Data URI",
        code: "INVALID_IMAGE_TYPE",
      });
    }
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return res.status(404).json({ error: "User not found" });

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      email: email !== undefined ? email : undefined,
      phone: phone !== undefined ? phone : undefined,
      profilePicUrl: profilePicUrl !== undefined ? profilePicUrl : undefined,
    },
  });

  if (name && typeof name === "string") {
    if (user.role === Role.ADMIN) {
      await prisma.facultyProfile.upsert({
        where: { userId },
        update: { name },
        create: {
          userId,
          name,
          employeeId: user.username,
        },
      });
    } else if (user.role === Role.FACULTY) {
      await prisma.facultyProfile.updateMany({
        where: { userId },
        data: { name },
      });
    } else if (user.role === Role.STUDENT) {
      await prisma.studentProfile.updateMany({
        where: { userId },
        data: { name },
      });
    }
  }

  const refreshedUser = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      studentProfile: true,
      facultyProfile: true,
    },
  });

  const displayName =
    refreshedUser?.studentProfile?.name ||
    refreshedUser?.facultyProfile?.name ||
    refreshedUser?.username;

  return res.status(200).json({
    message: "Profile updated successfully",
    user: {
      ...updatedUser,
      displayName,
    },
  });
}

export async function changePassword(req: Request, res: Response) {
  const userId = req.user?.userId;
  const { currentPassword, newPassword } = req.body;

  if (!userId || !currentPassword || !newPassword) {
    return res.status(400).json({ error: "currentPassword and newPassword are required" });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return res.status(404).json({ error: "User not found" });

  const isMatch = await comparePassword(currentPassword, user.passwordHash);
  if (!isMatch) {
    return res.status(400).json({ error: "Incorrect current password" });
  }

  const newHash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: newHash },
  });

  // Security AuditLog for password change event
  await prisma.auditLog.create({
    data: {
      entityType: "User",
      entityId: userId,
      changedByUserId: userId,
      oldValue: "ACTIVE",
      newValue: "PASSWORD_CHANGED",
    },
  });

  return res.status(200).json({ message: "Password changed successfully" });
}
