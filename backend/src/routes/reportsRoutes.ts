import { Router } from "express";
import { Role } from "@prisma/client";
import { requireAuth } from "../middleware/auth";
import { exportSubjectOfferingReport, exportStudentPdfMarkSheet } from "../controllers/reportsController";

const router = Router();

// Subject Offering Report Export — Restricted to ADMIN, HOD, and FACULTY roles
router.get(
  "/subject-offerings/:id/export",
  requireAuth([Role.ADMIN, Role.FACULTY]),
  exportSubjectOfferingReport
);

// Student PDF Mark Sheet — Requires Auth (controller verifies IDOR for STUDENT role)
router.get(
  "/students/:studentId/subject-offerings/:offeringId/pdf",
  requireAuth([Role.ADMIN, Role.FACULTY, Role.STUDENT]),
  exportStudentPdfMarkSheet
);

export default router;
