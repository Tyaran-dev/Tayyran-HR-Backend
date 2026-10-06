import bcrypt from "bcryptjs";
import Company from "../../models/Company.model.js";
import User from "../../models/User.model.js";
import Employee from "../../models/Employee.model.js";
import { ApiError } from "../../utils/apiError.js";

export const createCompanyHr = async (req, res, next) => {
    try {
        const companyAdmin = req.user;
        if (!companyAdmin || companyAdmin.role !== "company_admin") {
            return next(new ApiError(403, "Only company admins can create company HR users"));
        }

        const { name, email, phone, password } = req.body;
        const requiredValues = [name, email, phone, password];
        if (requiredValues.some((value) => typeof value !== "string" || !value.trim())) {
            return next(new ApiError(400, "Name, email, phone, and password are required"));
        }

        if (password.length < 8) {
            return next(new ApiError(400, "Password must be at least 8 characters long"));
        }

        const company = await Company.findOne({ _id: companyAdmin.company, status: "active" });
        if (!company) {
            return next(new ApiError(403, "Your company is not active"));
        }

        const hrUser = await User.create({
            name,
            email,
            phone,
            password: await bcrypt.hash(password, 12),
            role: "company_hr",
            company: company._id,
            userStatus: "active",
            isApproved: true
        });
        company.users.addToSet(hrUser._id);
        try {
            await company.save();
        } catch (error) {
            await User.deleteOne({ _id: hrUser._id });
            throw error;
        }

        res.status(201).json({
            success: true,
            message: "Company HR user created successfully",
            data: {
                _id: hrUser._id,
                name: hrUser.name,
                email: hrUser.email,
                phone: hrUser.phone,
                role: hrUser.role,
                company: hrUser.company
            }
        });
    } catch (error) {
        if (error.code === 11000) {
            return next(new ApiError(409, "A user with the same email or phone already exists"));
        }
        next(error);
    }
};

export const addEmployeeToCompany = async (req, res, next) => {
    try {
        const companyUser = req.user;
        if (!companyUser || (companyUser.role !== "company_admin" && companyUser.role !== "company_hr")) {
            return next(new ApiError(403, "Only company admins and HR users can add employees to the company"));
        }

        const { employeeData } = req.body;
        if (!employeeData || typeof employeeData !== "object" || Array.isArray(employeeData)) {
            return next(new ApiError(400, "Employee data is required and must be an object"));
        }

        const { first_name, last_name, email } = employeeData;
        if ([first_name, last_name, email].some((value) => typeof value !== "string" || !value.trim())) {
            return next(new ApiError(400, "First name, last name, and email are required"));
        }

        const normalizedEmail = email.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
            return next(new ApiError(400, "A valid employee email is required"));
        }

        const company = await Company.findOne({ _id: companyUser.company, status: "active" });
        if (!company) {
            return next(new ApiError(403, "Your company is not active"));
        }

        const employee = await Employee.create({
            first_name: first_name.trim(),
            last_name: last_name.trim(),
            email: normalizedEmail,
            profileImg: employeeData.profileImg,
            jobTitle: employeeData.jobTitle,
            department: employeeData.department,
            personalInfo: employeeData.personalInfo,
            company: company._id,
            addedBy: companyUser._id
        });

        res.status(201).json({
            success: true,
            message: "Employee added to company successfully",
            data: employee
        });
    } catch (error) {
        if (error.code === 11000) {
            return next(new ApiError(409, "An employee with the same email already exists"));
        }
        if (error.name === "ValidationError" || error.name === "CastError") {
            return next(new ApiError(400, error.message));
        }
        return next(error);
    }
}

export const getAllEmployees = async (req, res, next) => {
    try {
        const companyUser = req.user;
        if (
            !companyUser ||
            (companyUser.role !== "company_admin" && companyUser.role !== "company_hr")
        ) {
            return next(new ApiError(403, "Only company admins and HR users can view employees"));
        }

        // Pagination
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
        const skip = (page - 1) * limit;

        // Filters
        const filter = { company: companyUser.company };

        if (req.query.search?.trim()) {
            const search = req.query.search.trim();
            const regex = new RegExp(search, "i");
            filter.$or = [
                { first_name: regex },
                { last_name: regex },
                { email: regex },
                { jobTitle: regex },
                { department: regex }
            ];
        }
        if (req.query.department?.trim()) {
            filter.department = req.query.department.trim();
        }
        if (req.query.jobTitle?.trim()) {
            filter.jobTitle = req.query.jobTitle.trim();
        }

        // Sorting
        const sortField = req.query.sortBy || "createdAt";
        const sortOrder = req.query.order === "asc" ? 1 : -1;

        const [employees, total] = await Promise.all([
            Employee.find(filter)
                .sort({ [sortField]: sortOrder })
                .skip(skip)
                .limit(limit)
                .lean(),
            Employee.countDocuments(filter)
        ]);

        res.status(200).json({
            success: true,
            message: "Employees retrieved successfully",
            data: employees,
            pagination: {
                total,
                page,
                limit,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        next(error);
    }
};

export const updateEmployeeInfo = async (req, res, next) => {
    try {
        const companyUser = req.user;
        if (
            !companyUser ||
            (companyUser.role !== "company_admin" && companyUser.role !== "company_hr")
        ) {
            return next(new ApiError(403, "Only company admins and HR users can update employees"));
        }

        const { employeeId } = req.params;
        const { employeeData } = req.body;

        if (!employeeData || typeof employeeData !== "object" || Array.isArray(employeeData)) {
            return next(new ApiError(400, "Employee data is required and must be an object"));
        }

        // Tenant-scoped lookup
        const employee = await Employee.findOne({
            _id: employeeId,
            company: companyUser.company
        });
        if (!employee) {
            return next(new ApiError(404, "Employee not found"));
        }

        // Whitelist of updatable top-level fields
        const updatableFields = [
            "first_name",
            "last_name",
            "email",
            "profileImg",
            "jobTitle",
            "department",
            "personalInfo"
        ];

        for (const field of updatableFields) {
            if (employeeData[field] === undefined) continue;

            if (field === "first_name" || field === "last_name") {
                if (typeof employeeData[field] !== "string" || !employeeData[field].trim()) {
                    return next(new ApiError(400, `${field} must be a non-empty string`));
                }
                employee[field] = employeeData[field].trim();
            } else if (field === "email") {
                if (typeof employeeData.email !== "string" || !employeeData.email.trim()) {
                    return next(new ApiError(400, "Email must be a non-empty string"));
                }
                const normalized = employeeData.email.trim().toLowerCase();
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
                    return next(new ApiError(400, "A valid employee email is required"));
                }
                employee.email = normalized;
            } else if (field === "personalInfo") {
                if (typeof employeeData.personalInfo !== "object" || Array.isArray(employeeData.personalInfo)) {
                    return next(new ApiError(400, "personalInfo must be an object"));
                }
                // Shallow merge so partial updates don't wipe the rest
                employee.personalInfo = {
                    ...employee.personalInfo?.toObject?.() ?? employee.personalInfo ?? {},
                    ...employeeData.personalInfo
                };
            } else {
                employee[field] = employeeData[field];
            }
        }

        await employee.save();

        res.status(200).json({
            success: true,
            message: "Employee updated successfully",
            data: employee
        });
    } catch (error) {
        if (error.code === 11000) {
            return next(new ApiError(409, "An employee with the same email already exists"));
        }
        if (error.name === "ValidationError" || error.name === "CastError") {
            return next(new ApiError(400, error.message));
        }
        next(error);
    }
};

export const deleteEmployee = async (req, res, next) => {
    try {
        const companyUser = req.user;
        if (
            !companyUser ||
            (companyUser.role !== "company_admin" && companyUser.role !== "company_hr")
        ) {
            return next(new ApiError(403, "Only company admins and HR users can delete employees"));
        }

        const { employeeId } = req.params;

        const employee = await Employee.findOneAndDelete({
            _id: employeeId,
            company: companyUser.company
        });

        if (!employee) {
            return next(new ApiError(404, "Employee not found"));
        }

        res.status(200).json({
            success: true,
            message: "Employee deleted successfully",
            data: { _id: employee._id }
        });
    } catch (error) {
        if (error.name === "CastError") {
            return next(new ApiError(400, "Invalid employee ID"));
        }
        next(error);
    }
};
