import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { getUserNotifications, markNotificationAsRead } from "../controllers/notificationController";

const router = Router();

router.use(requireAuth());

router.get("/", getUserNotifications);
router.put("/:id/read", markNotificationAsRead);

export default router;
