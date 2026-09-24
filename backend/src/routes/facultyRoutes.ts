import { Router } from "express";
import { Role } from "@prisma/client";
import { requireAuth } from "../middleware/auth";
import { requireUnlockedSection } from "../middleware/lock";
import {
  getMyAssignedSections,
  getSectionComponents,
  getSectionMarksGrid,
  bulkUpsertMarks,
} from "../controllers/marksController";
import {
  previewAttendanceImport,
  commitAttendanceImport,
} from "../controllers/attendanceController";

const router = Router();

// Require FACULTY role for all faculty marks & attendance routes
router.use(requireAuth([Role.FACULTY]));

router.get("/my-sections", getMyAssignedSections);
router.get("/sections/:id/components", getSectionComponents);
router.get("/sections/:id/marks", getSectionMarksGrid);

// Bulk marks entry route — protected by section lock enforcement!
router.put(
  "/marks/bulk",
  requireUnlockedSection("body", "sectionId"),
  bulkUpsertMarks
);

// Attendance CSV Dry-Run Preview & Commit (Commit is lock-protected!)
router.post("/sections/:id/attendance/preview", previewAttendanceImport);
router.post(
  "/sections/:id/attendance/commit",
  requireUnlockedSection("params", "id"),
  commitAttendanceImport
);

export default router;
