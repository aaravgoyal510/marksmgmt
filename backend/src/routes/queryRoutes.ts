import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import {
  createQuery,
  addQueryMessage,
  escalateQuery,
  resolveQuery,
  listQueries,
} from "../controllers/queryController";

const router = Router();

router.use(requireAuth());

router.post("/", createQuery);
router.get("/", listQueries);
router.post("/:id/messages", addQueryMessage);
router.post("/:id/escalate", escalateQuery);
router.post("/:id/resolve", resolveQuery);

export default router;
