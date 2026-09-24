import { Router } from "express";
import { loginHandler, refreshHandler, forgotPasswordHandler, resetPasswordWithTokenHandler, logoutHandler, meHandler, clearAllLockoutsHandler } from "../controllers/authController";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.post("/login", loginHandler);
router.post("/logout", logoutHandler);
router.post("/clear-lockouts", clearAllLockoutsHandler);
router.get("/me", requireAuth(), meHandler);
router.post("/refresh", refreshHandler);
router.post("/forgot-password", forgotPasswordHandler);
router.post("/reset-password", resetPasswordWithTokenHandler);

export default router;
