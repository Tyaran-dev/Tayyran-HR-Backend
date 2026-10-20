import express from "express";
import { registerCompany } from "../../controllers/company/companyRegister.controller.js";
import { approveCompany, getPendingCompanies, rejectCompany, getAllCompanies } from "../../controllers/company/admin.company.controller.js";
import { addEmployeeToCompany, getAllEmployees, getEmployeeById, updateEmployeeInfo, deleteEmployee } from "../../controllers/company/CompanyUsers/employee.controller.js";
import { createCompanyHr, deleteCompanyHr, updateCompanyHr } from "../../controllers/company/CompanyUsers/hr.controller.js";
import { protectedRoute } from "../../middlewares/protectedRoute.js";

const router = express.Router();

router.post("/register", registerCompany);
router.get("/pending", protectedRoute, getPendingCompanies);
router.get("/", protectedRoute, getAllCompanies);
router.post("/:companyId/approve", protectedRoute, approveCompany);
router.post("/:companyId/reject", protectedRoute, rejectCompany);

// hr methods
router.post("/users", protectedRoute, createCompanyHr);
router.delete("/users/:hrUserId", protectedRoute, deleteCompanyHr);
router.patch("/users/:hrUserId", protectedRoute, updateCompanyHr);

// employee methods
router.post("/employees", protectedRoute, addEmployeeToCompany);
router.get("/employees", protectedRoute, getAllEmployees);
router.get("/employees/:id", protectedRoute, getEmployeeById);
router.patch("/employee/:employeeId", protectedRoute, updateEmployeeInfo);
router.delete("/employee/:employeeId", protectedRoute, deleteEmployee);


export default router;