import Employee from "../../models/Employee.model.js";
import { ApiError } from "../../utils/apiError.js";

// ✅ Add Employee (HR / Company Admin only)
export const createEmployee = async (req, res, next) => {
    try {
        const {
            first_name,
            last_name,
            email,
            profileImg,
            jobTitle,
            department,
            personalInfo
        } = req.body;

        const currentUser = req.user;

        if (!currentUser.company) {
            return next(new ApiError(400, "User must belong to a company to add employees"));
        }

        if (!first_name || !last_name || !email) {
            return next(new ApiError(400, "first_name, last_name, and email are required"));
        }

        // Check if employee with same email already exists
        const existingEmployee = await Employee.findOne({ email: email.toLowerCase() });
        if (existingEmployee) {
            return next(new ApiError(400, "An employee with this email already exists"));
        }

        const employee = new Employee({
            company: currentUser.company,
            addedBy: currentUser._id,
            first_name,
            last_name,
            email: email.toLowerCase(),
            profileImg,
            jobTitle,
            department,
            personalInfo: personalInfo || {}
        });

        await employee.save();

        res.status(201).json({
            success: true,
            message: "Employee added successfully",
            data: employee
        });
    } catch (error) {
        next(new ApiError(500, error.message));
    }
};

// ✅ Get all Employees for the current company
export const getEmployees = async (req, res, next) => {
    try {
        const currentUser = req.user;

        if (!currentUser.company) {
            return next(new ApiError(400, "User must belong to a company"));
        }

        const employees = await Employee.find({ company: currentUser.company })
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: employees.length,
            data: employees
        });
    } catch (error) {
        next(new ApiError(500, error.message));
    }
};

// ✅ Get Employee by ID
export const getEmployeeById = async (req, res, next) => {
    try {
        const { id } = req.params;
        const currentUser = req.user;

        if (!currentUser.company) {
            return next(new ApiError(400, "User must belong to a company"));
        }

        const employee = await Employee.findOne({ _id: id, company: currentUser.company });
        if (!employee) {
            return next(new ApiError(404, "Employee not found"));
        }

        res.status(200).json({
            success: true,
            data: employee
        });
    } catch (error) {
        next(new ApiError(500, error.message));
    }
};

// ✅ Update Employee details
export const updateEmployee = async (req, res, next) => {
    try {
        const { id } = req.params;
        const currentUser = req.user;
        const updateData = req.body;

        if (!currentUser.company) {
            return next(new ApiError(400, "User must belong to a company"));
        }

        // Email duplicates check if updating email
        if (updateData.email) {
            const duplicate = await Employee.findOne({
                email: updateData.email.toLowerCase(),
                _id: { $ne: id }
            });
            if (duplicate) {
                return next(new ApiError(400, "Another employee is already using this email"));
            }
            updateData.email = updateData.email.toLowerCase();
        }

        const employee = await Employee.findOneAndUpdate(
            { _id: id, company: currentUser.company },
            { $set: updateData },
            { new: true, runValidators: true }
        );

        if (!employee) {
            return next(new ApiError(404, "Employee not found"));
        }

        res.status(200).json({
            success: true,
            message: "Employee updated successfully",
            data: employee
        });
    } catch (error) {
        next(new ApiError(500, error.message));
    }
};

// ✅ Delete Employee
export const deleteEmployee = async (req, res, next) => {
    try {
        const { id } = req.params;
        const currentUser = req.user;

        if (!currentUser.company) {
            return next(new ApiError(400, "User must belong to a company"));
        }

        const employee = await Employee.findOneAndDelete({ _id: id, company: currentUser.company });
        if (!employee) {
            return next(new ApiError(404, "Employee not found"));
        }

        res.status(200).json({
            success: true,
            message: "Employee deleted successfully"
        });
    } catch (error) {
        next(new ApiError(500, error.message));
    }
};
