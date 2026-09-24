import { Router } from "express";
import { Role } from "@prisma/client";
import { requireAuth } from "../middleware/auth";
import { getStudentSemesterView } from "../controllers/studentController";

const router = Router();

// Protect student routes with STUDENT role
router.use(requireAuth([Role.STUDENT]));

router.get("/me/semester-view", getStudentSemesterView);

export default router;
