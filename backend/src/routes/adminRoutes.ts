import { Router } from "express";
import { Role } from "@prisma/client";
import { requireAuth } from "../middleware/auth";
import {
  createDepartment,
  listDepartments,
  createBatch,
  promoteBatch,
  createSectionForBatch,
  onboardFaculty,
  listFaculty,
  assignFacultyHOD,
  downloadFacultyCredentials,
  listStudents,
  setStudentSemesterOverride,
  forceResetPassword,
} from "../controllers/adminController";

const router = Router();

// Protect all admin routes with ADMIN role
router.use(requireAuth([Role.ADMIN]));

router.post("/departments", createDepartment);
router.get("/departments", listDepartments);

router.post("/batches", createBatch);
router.post("/batches/:id/promote", promoteBatch);
router.post("/batches/:id/sections", createSectionForBatch);

router.get("/faculty", listFaculty);
router.post("/faculty", onboardFaculty);
router.post("/faculty/:id/assign-hod", assignFacultyHOD);
router.get("/faculty/:id/credentials", downloadFacultyCredentials);

router.get("/students", listStudents);
router.put("/students/:id/semester-override", setStudentSemesterOverride);

router.post("/users/:id/force-reset", forceResetPassword);

export default router;
