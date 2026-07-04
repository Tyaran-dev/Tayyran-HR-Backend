import express from "express";
import { registerCompany } from "../../controllers/company/companyRegister.controller.js";
import {
    getPendingCompanies,
    approveCompany,
    rejectCompany,
    getCompanyById,
    getAllCompanies
} from "../../controllers/company/admin.company.controller.js";
import { protectedRoute } from "../../middlewares/protectedRoute.js";

const router = express.Router();

// Public route for company registration
router.post("/register", registerCompany);

// Protected routes (Super Admin scope is checked inside the controllers)
router.get("/pending", protectedRoute, getPendingCompanies);
router.put("/:companyId/approve", protectedRoute, approveCompany);
router.put("/:companyId/reject", protectedRoute, rejectCompany);
router.get("/:companyId", protectedRoute, getCompanyById);
router.get("/", protectedRoute, getAllCompanies);

export default router;
