import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { QueryStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getQuerySlaHours } from "@/lib/slaConstants";

export const dynamic = "force-dynamic";

function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

async function handleQuerySla(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || cronSecret.trim() === "") {
    return NextResponse.json(
      { error: "Forbidden: CRON_SECRET is not configured" },
      { status: 403 }
    );
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "Forbidden: Missing or invalid authorization header" },
      { status: 403 }
    );
  }

  const token = authHeader.slice(7);
  if (!constantTimeEqual(token, cronSecret)) {
    return NextResponse.json(
      { error: "Forbidden: Invalid authorization token" },
      { status: 403 }
    );
  }

  try {
    const { reminderHours, escalationHours } = getQuerySlaHours();

    const now = new Date();
    const slaThreshold = new Date(now.getTime() - reminderHours * 60 * 60 * 1000);
    const escalationThreshold = new Date(now.getTime() - escalationHours * 60 * 60 * 1000);

    const pendingQueries = await prisma.query.findMany({
      where: {
        status: QueryStatus.OPEN,
        createdAt: {
          lte: slaThreshold,
        },
      },
      include: {
        student: true,
        faculty: {
          include: {
            user: true,
          },
        },
        subjectOfferingSection: {
          include: {
            section: true,
            subjectOffering: {
              include: {
                subject: true,
              },
            },
          },
        },
      },
    });

    let remindersSent = 0;
    let escalationsProcessed = 0;

    for (const query of pendingQueries) {
      const subjectName =
        query.subjectOfferingSection?.subjectOffering?.subject?.name || "Subject";
      const sectionName = query.subjectOfferingSection?.section?.name || "";
      const deptId =
        query.subjectOfferingSection?.subjectOffering?.subject?.departmentId;

      if (query.createdAt <= escalationThreshold) {
        // Escalate to HOD at 2x SLA (96h)
        let hodAssignment: any = null;
        if (deptId) {
          hodAssignment = await prisma.hODAssignment.findUnique({
            where: { departmentId: deptId },
            include: {
              faculty: {
                include: { user: true },
              },
            },
          });
        }

        await prisma.query.update({
          where: { id: query.id },
          data: {
            status: QueryStatus.ESCALATED,
            hodId: hodAssignment?.facultyId || null,
          },
        });

        // Notify HOD
        if (hodAssignment?.faculty?.userId) {
          try {
            await prisma.notification.create({
              data: {
                userId: hodAssignment.faculty.userId,
                type: "QUERY_ESCALATED",
                message: `Query in ${subjectName} (Section ${sectionName}) was escalated to HOD after exceeding ${escalationHours}h SLA.`,
                link: "/hod",
              },
            });
          } catch {
            // Non-blocking notification
          }
        }

        // Notify Faculty of SLA escalation
        if (query.faculty?.userId) {
          try {
            await prisma.notification.create({
              data: {
                userId: query.faculty.userId,
                type: "QUERY_SLA_BREACH",
                message: `Query in ${subjectName} (Section ${sectionName}) exceeded ${escalationHours}h SLA and was escalated to HOD.`,
                link: "/faculty",
              },
            });
          } catch {
            // Non-blocking notification
          }
        }

        escalationsProcessed++;
      } else {
        // Reminder notification to faculty (> SLA, <= 2x SLA)
        if (query.faculty?.userId) {
          try {
            await prisma.notification.create({
              data: {
                userId: query.faculty.userId,
                type: "QUERY_SLA_REMINDER",
                message: `Reminder: Query in ${subjectName} (Section ${sectionName}) has been open for >${reminderHours}h.`,
                link: "/faculty",
              },
            });
            remindersSent++;
          } catch {
            // Non-blocking notification
          }
        }
      }
    }

    return NextResponse.json({
      message: "Query SLA check completed successfully",
      slaHours: reminderHours,
      escalationHours,
      remindersSent,
      escalationsProcessed,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to process query SLA checks" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return handleQuerySla(req);
}

export async function POST(req: NextRequest) {
  return handleQuerySla(req);
}
