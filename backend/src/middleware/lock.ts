import { Request, Response, NextFunction } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
  * Enforces the locking rule for marks entry & attendance imports.
  * Rejects with HTTP 423 Locked if faculty is unassigned OR parent GradingPolicy is unconfirmed.
  */
export function requireUnlockedSection(location: "params" | "body" = "params", paramName: string = "sectionId") {
  return async (req: Request, res: Response, next: NextFunction) => {
    const targetSectionId = req[location]?.[paramName];
    if (!targetSectionId) {
      return res.status(400).json({ error: `Missing section ID in req.${location}.${paramName}` });
    }

    const section = await prisma.subjectOfferingSection.findUnique({
      where: { id: targetSectionId },
      include: {
        subjectOffering: {
          include: {
            gradingPolicy: true,
          },
        },
      },
    });

    if (!section) {
      return res.status(404).json({ error: "Subject offering section not found" });
    }

    if (!section.facultyId) {
      return res.status(423).json({
        error: "Section is locked: Faculty member is not assigned to this section yet.",
        code: "SECTION_LOCKED_NO_FACULTY",
      });
    }

    const policy = section.subjectOffering.gradingPolicy;
    if (!policy || !policy.confirmedAt) {
      return res.status(423).json({
        error: "Section is locked: HOD has not confirmed the grading policy for this subject offering.",
        code: "SECTION_LOCKED_POLICY_UNCONFIRMED",
      });
    }

    // Attach verified section to request for downstream route handlers
    (req as any).offeringSection = section;
    next();
  };
}
