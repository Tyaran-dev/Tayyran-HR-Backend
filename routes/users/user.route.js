import express from "express";
import {
    createHRUser,
    getCompanyUsers,
    updateUserStatus
} from "../../controllers/users/user.controller.js";
import { protectedRoute } from "../../middlewares/protectedRoute.js";

const router = express.Router();

// Apply protected route middleware to all user routes
router.use(protectedRoute);

router.post("/hr", createHRUser);
router.get("/", getCompanyUsers);
router.put("/:userId/status", updateUserStatus);

export default router;
