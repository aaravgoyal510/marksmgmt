import { Request, Response } from "express";
import { PrismaClient, ScoreGroup } from "@prisma/client";
import { validateSlabs } from "../services/gradingEngine";

const prisma = new PrismaClient();

// -----------------------------------------------------------------------------
// 1. Create or Update Grading Policy for a Subject Offering
// -----------------------------------------------------------------------------
export async function upsertGradingPolicy(req: Request, res: Response) {
  const offeringId = req.params.offeringId as string;
  const { cesGroupWeightage, internalWeightage, attendanceWeightage, scoreComponents, attendanceSlabRanges } = req.body;

  if (
    cesGroupWeightage === undefined ||
    internalWeightage === undefined ||
    attendanceWeightage === undefined ||
    !Array.isArray(scoreComponents) ||
    !Array.isArray(attendanceSlabRanges)
  ) {
    return res.status(400).json({
      error: "cesGroupWeightage, internalWeightage, attendanceWeightage, scoreComponents array, and attendanceSlabRanges array are required",
    });
  }

  const offering = await prisma.subjectOffering.findUnique({
    where: { id: offeringId },
    include: { subject: true },
  });

  if (!offering) {
    return res.status(404).json({ error: "Subject offering not found" });
  }

  const hodAssignment = await prisma.hODAssignment.findFirst({
    where: {
      facultyId: req.user!.facultyId,
      departmentId: offering.subject.departmentId,
    },
  });

  if (!hodAssignment) {
    return res.status(403).json({
      error: "Forbidden: You are not authorized as HOD for this department",
      code: "HOD_DEPARTMENT_MISMATCH",
    });
  }

  const existingPolicyCheck = await prisma.gradingPolicy.findUnique({
    where: { subjectOfferingId: offeringId },
  });

  if (existingPolicyCheck && existingPolicyCheck.confirmedAt !== null) {
    return res.status(400).json({
      error: "Grading policy is confirmed and locked. You must unlock/un-confirm the policy before modifying it.",
      code: "POLICY_LOCKED",
    });
  }

  const slabValidation = validateSlabs(attendanceSlabRanges, attendanceWeightage);
  if (!slabValidation.valid) {
    return res.status(400).json({
      error: "Invalid attendance slab ranges",
      details: slabValidation.errors,
    });
  }

  const calculatedTotalIA = cesGroupWeightage + internalWeightage + attendanceWeightage;

  const result = await prisma.$transaction(async (tx) => {
    const existingPolicy = await tx.gradingPolicy.findUnique({
      where: { subjectOfferingId: offeringId },
    });

    if (existingPolicy) {
      await tx.scoreComponent.deleteMany({ where: { gradingPolicyId: existingPolicy.id } });
      await tx.attendanceSlabRange.deleteMany({ where: { gradingPolicyId: existingPolicy.id } });
    }

    const policy = await tx.gradingPolicy.upsert({
      where: { subjectOfferingId: offeringId },
      update: {
        cesGroupWeightage,
        internalWeightage,
        attendanceWeightage,
        confirmedAt: null,
        confirmedByFacultyId: null,
      },
      create: {
        subjectOfferingId: offeringId,
        cesGroupWeightage,
        internalWeightage,
        attendanceWeightage,
        confirmedAt: null,
      },
    });

    const createdComponents = await Promise.all(
      scoreComponents.map((comp: { group: ScoreGroup; name: string; maxMarks: number; order: number }) =>
        tx.scoreComponent.create({
          data: {
            gradingPolicyId: policy.id,
            group: comp.group,
            name: comp.name,
            maxMarks: comp.maxMarks,
            order: comp.order,
          },
        })
      )
    );

    const createdSlabs = await Promise.all(
      attendanceSlabRanges.map((slab: { minPercent: number; maxPercent: number; marks: number }) =>
        tx.attendanceSlabRange.create({
          data: {
            gradingPolicyId: policy.id,
            minPercent: slab.minPercent,
            maxPercent: slab.maxPercent,
            marks: slab.marks,
          },
        })
      )
    );

    return { policy, components: createdComponents, slabs: createdSlabs };
  });

  return res.status(200).json({
    message: "Grading policy updated successfully (Confirmation pending)",
    policy: result.policy,
    totalIAMarks: calculatedTotalIA,
    components: result.components,
    slabs: result.slabs,
  });
}

// -----------------------------------------------------------------------------
// 2. Duplicate Policy from Last Term
// -----------------------------------------------------------------------------
export async function duplicatePolicyFromLastTerm(req: Request, res: Response) {
  const offeringId = req.params.offeringId as string;

  const currentOffering = await prisma.subjectOffering.findUnique({
    where: { id: offeringId },
    include: { subject: true },
  });

  if (!currentOffering) {
    return res.status(404).json({ error: "Subject offering not found" });
  }

  const hodAssignment = await prisma.hODAssignment.findFirst({
    where: {
      facultyId: req.user!.facultyId,
      departmentId: currentOffering.subject.departmentId,
    },
  });

  if (!hodAssignment) {
    return res.status(403).json({ error: "Forbidden: Not HOD of this department" });
  }

  const previousOffering = await prisma.subjectOffering.findFirst({
    where: {
      subjectId: currentOffering.subjectId,
      id: { not: offeringId },
      gradingPolicy: { isNot: null },
    },
    orderBy: {
      academicTerm: { createdAt: "desc" },
    },
    include: {
      gradingPolicy: {
        include: {
          scoreComponents: true,
          attendanceSlabRanges: true,
        },
      },
    },
  });

  if (!previousOffering || !previousOffering.gradingPolicy) {
    return res.status(404).json({
      error: "No previous policy found for this subject to duplicate. Please configure a fresh policy.",
    });
  }

  const prevPolicy = previousOffering.gradingPolicy;

  const newPolicy = await prisma.$transaction(async (tx) => {
    const existing = await tx.gradingPolicy.findUnique({ where: { subjectOfferingId: offeringId } });
    if (existing) {
      await tx.scoreComponent.deleteMany({ where: { gradingPolicyId: existing.id } });
      await tx.attendanceSlabRange.deleteMany({ where: { gradingPolicyId: existing.id } });
      await tx.gradingPolicy.delete({ where: { id: existing.id } });
    }

    return tx.gradingPolicy.create({
      data: {
        subjectOfferingId: offeringId,
        cesGroupWeightage: prevPolicy.cesGroupWeightage,
        internalWeightage: prevPolicy.internalWeightage,
        attendanceWeightage: prevPolicy.attendanceWeightage,
        confirmedAt: null,
        scoreComponents: {
          create: prevPolicy.scoreComponents.map((c: any) => ({
            group: c.group,
            name: c.name,
            maxMarks: c.maxMarks,
            order: c.order,
          })),
        },
        attendanceSlabRanges: {
          create: prevPolicy.attendanceSlabRanges.map((s: any) => ({
            minPercent: s.minPercent,
            maxPercent: s.maxPercent,
            marks: s.marks,
          })),
        },
      },
      include: {
        scoreComponents: true,
        attendanceSlabRanges: true,
      },
    });
  });

  const totalIAMarks =
    newPolicy.cesGroupWeightage + newPolicy.internalWeightage + newPolicy.attendanceWeightage;

  return res.status(200).json({
    message: "Policy duplicated successfully from previous term (Confirmation required)",
    policy: newPolicy,
    totalIAMarks,
  });
}

// -----------------------------------------------------------------------------
// 3. Confirm Grading Policy
// -----------------------------------------------------------------------------
export async function confirmGradingPolicy(req: Request, res: Response) {
  const offeringId = req.params.offeringId as string;

  const offering = await prisma.subjectOffering.findUnique({
    where: { id: offeringId },
    include: { subject: true, gradingPolicy: true },
  });

  if (!offering || !offering.gradingPolicy) {
    return res.status(404).json({ error: "Grading policy not found for this offering" });
  }

  const hodAssignment = await prisma.hODAssignment.findFirst({
    where: {
      facultyId: req.user!.facultyId,
      departmentId: offering.subject.departmentId,
    },
  });

  if (!hodAssignment) {
    return res.status(403).json({ error: "Forbidden: Not HOD of this department" });
  }

  const confirmedPolicy = await prisma.gradingPolicy.update({
    where: { id: offering.gradingPolicy.id },
    data: {
      confirmedAt: new Date(),
      confirmedByFacultyId: req.user!.facultyId,
    },
    include: {
      scoreComponents: true,
      attendanceSlabRanges: true,
    },
  });

  await prisma.auditLog.create({
    data: {
      entityType: "GradingPolicy",
      entityId: confirmedPolicy.id,
      changedByUserId: req.user!.userId,
      oldValue: "UNCONFIRMED",
      newValue: "CONFIRMED",
    },
  });

  return res.status(200).json({
    message: "Grading policy confirmed successfully. Subject offering sections with assigned faculty are now UNLOCKED.",
    policy: confirmedPolicy,
  });
}

export async function unconfirmGradingPolicy(req: Request, res: Response) {
  const offeringId = req.params.offeringId as string;

  const offering = await prisma.subjectOffering.findUnique({
    where: { id: offeringId },
    include: { subject: true, gradingPolicy: true },
  });

  if (!offering || !offering.gradingPolicy) {
    return res.status(404).json({ error: "Grading policy not found for this offering" });
  }

  const hodAssignment = await prisma.hODAssignment.findFirst({
    where: {
      facultyId: req.user!.facultyId,
      departmentId: offering.subject.departmentId,
    },
  });

  if (!hodAssignment) {
    return res.status(403).json({ error: "Forbidden: Not HOD of this department" });
  }

  const unconfirmedPolicy = await prisma.gradingPolicy.update({
    where: { id: offering.gradingPolicy.id },
    data: {
      confirmedAt: null,
      confirmedByFacultyId: null,
    },
    include: {
      scoreComponents: true,
      attendanceSlabRanges: true,
    },
  });

  await prisma.auditLog.create({
    data: {
      entityType: "GradingPolicy",
      entityId: unconfirmedPolicy.id,
      changedByUserId: req.user!.userId,
      oldValue: "CONFIRMED",
      newValue: "UNCONFIRMED",
    },
  });

  return res.status(200).json({
    message: "Grading policy unlocked successfully for modifications",
    policy: unconfirmedPolicy,
  });
}

// -----------------------------------------------------------------------------
// 4. Get Policy Details
// -----------------------------------------------------------------------------
export async function getGradingPolicy(req: Request, res: Response) {
  const offeringId = req.params.offeringId as string;

  const policy = await prisma.gradingPolicy.findUnique({
    where: { subjectOfferingId: offeringId },
    include: {
      scoreComponents: { orderBy: { order: "asc" } },
      attendanceSlabRanges: { orderBy: { minPercent: "asc" } },
    },
  });

  if (!policy) {
    return res.status(404).json({ error: "Grading policy not configured yet" });
  }

  const totalIAMarks = policy.cesGroupWeightage + policy.internalWeightage + policy.attendanceWeightage;

  return res.status(200).json({ policy, totalIAMarks });
}
