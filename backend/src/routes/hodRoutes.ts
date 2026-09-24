import { Router } from "express";
import { Role } from "@prisma/client";
import { requireAuth, requireHODOfDepartment } from "../middleware/auth";
import {
  createSubject,
  listSubjects,
  listDepartmentFaculty,
  getSubjectOfferingsStatusBoard,
  assignFacultyToSection,
  hodPromoteBatch,
} from "../controllers/hodController";
import {
  upsertGradingPolicy,
  duplicatePolicyFromLastTerm,
  confirmGradingPolicy,
  unconfirmGradingPolicy,
  getGradingPolicy,
} from "../controllers/policyController";

const router = Router();

// Protect HOD routes strictly for Role.FACULTY (HODs)
router.use(requireAuth([Role.FACULTY]));

router.post("/subjects", requireHODOfDepartment("body", "departmentId"), createSubject);
router.get("/subjects", requireHODOfDepartment("query", "departmentId"), listSubjects);
router.get("/faculty-list", listDepartmentFaculty);
router.get("/subject-offerings", requireHODOfDepartment("query", "departmentId"), getSubjectOfferingsStatusBoard);
router.post(
  "/subject-offerings/:offeringId/sections/:sectionId/assign-faculty",
  assignFacultyToSection
);
router.post("/batches/:batchId/promote", hodPromoteBatch);

// Policy Management Routes
router.post("/subject-offerings/:offeringId/policy", upsertGradingPolicy);
router.post("/subject-offerings/:offeringId/policy/duplicate-last-term", duplicatePolicyFromLastTerm);
router.post("/subject-offerings/:offeringId/policy/confirm", confirmGradingPolicy);
router.post("/subject-offerings/:offeringId/policy/unconfirm", unconfirmGradingPolicy);
router.get("/subject-offerings/:offeringId/policy", getGradingPolicy);

export default router;
