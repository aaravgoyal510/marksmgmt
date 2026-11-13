import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth/guards";

export async function GET(req: NextRequest) {
  try {
    const auth = verifyAuth(req);
    if (!auth.ok) {
      return auth.error;
    }

    const user = await prisma.user.findUnique({
      where: { id: auth.user.userId },
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

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const displayName =
      user.studentProfile?.name ||
      user.facultyProfile?.name ||
      user.username;

    return NextResponse.json({
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
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = verifyAuth(req);
    if (!auth.ok) {
      return auth.error;
    }

    const userId = auth.user.userId;
    const body = await req.json().catch(() => ({}));
    const { name, email, phone, profilePicUrl } = body;

    if (profilePicUrl && typeof profilePicUrl === "string") {
      const isDataUri =
        profilePicUrl.startsWith("data:image/png") ||
        profilePicUrl.startsWith("data:image/jpeg") ||
        profilePicUrl.startsWith("data:image/webp");
      const isHttpUrl =
        profilePicUrl.startsWith("http://") || profilePicUrl.startsWith("https://");
      const hasImageExt = /\.(jpg|jpeg|png|webp|gif|svg)(\?.*)?$/i.test(profilePicUrl);

      if (!isDataUri && (!isHttpUrl || !hasImageExt)) {
        return NextResponse.json(
          {
            error:
              "Invalid profile picture file format: Must be an image URL (.png, .jpg, .webp) or image Data URI",
            code: "INVALID_IMAGE_TYPE",
          },
          { status: 400 }
        );
      }
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

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

    return NextResponse.json({
      message: "Profile updated successfully",
      user: {
        ...updatedUser,
        displayName,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
