import express from "express";
import { registerCompany } from "../../controllers/company/companyRegister.controller.js";
import { approveCompany, getPendingCompanies, rejectCompany, getAllCompanies } from "../../controllers/company/admin.company.controller.js";
import { createCompanyHr, addEmployeeToCompany, getAllEmployees, updateEmployeeInfo, deleteEmployee } from "../../controllers/company/companyUsers.controller.js";
import { protectedRoute } from "../../middlewares/protectedRoute.js";

const router = express.Router();

router.post("/register", registerCompany);
router.get("/pending", protectedRoute, getPendingCompanies);
router.get("/", protectedRoute, getAllCompanies);
router.post("/:companyId/approve", protectedRoute, approveCompany);
router.post("/:companyId/reject", protectedRoute, rejectCompany);

router.post("/users", protectedRoute, createCompanyHr);
router.post("/employees", protectedRoute, addEmployeeToCompany);
router.get("/employees", protectedRoute, getAllEmployees);
router.patch("/:employeeId", protectedRoute, updateEmployeeInfo);
router.delete("/:employeeId", protectedRoute, deleteEmployee);


export default router;