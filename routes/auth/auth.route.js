import express from "express";
import { login, getProfile } from "../../controllers/auth/auth.controller.js";
import { protectedRoute } from "../../middlewares/protectedRoute.js";

const router = express.Router();

router.post("/login", login);
router.get("/me", protectedRoute, getProfile);

export default router;
