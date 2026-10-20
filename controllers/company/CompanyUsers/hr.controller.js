import bcrypt from "bcryptjs";
import Company from "../../../models/Company.model.js";
import User from "../../../models/User.model.js";
import Employee from "../../../models/Employee.model.js";
import { ApiError } from "../../../utils/apiError.js";


export const createCompanyHr = async (req, res, next) => {
    try {
        const companyAdmin = req.user;
        if (!companyAdmin || companyAdmin.role !== "company_admin") {
            return next(new ApiError(403, "Only company admins can create company HR users"));
        }

        const { name, email, phone, password, userStatus } = req.body;
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

export const deleteCompanyHr = async (req, res, next) => {
    try {
        const companyAdmin = req.user;
        if (!companyAdmin || companyAdmin.role !== "company_admin") {
            return next(new ApiError(403, "Only company admins can delete company HR users"));
        }
        const { hrUserId } = req.params;
        const hrUser = await User.findOneAndDelete({ _id: hrUserId, company: companyAdmin.company, role: "company_hr" });
        console.log(req.params, "req.params")

        if (!hrUser) {
            return next(new ApiError(404, "Company HR user not found"));
        }

        res.status(200).json({
            success: true,
            message: "Company HR user deleted successfully",
            data: { _id: hrUser._id }
        })

    } catch (error) {
        if (error.name === "CastError") {
            return next(new ApiError(400, "Invalid employee ID"));
        }
        next(error);
    }
}

export const updateCompanyHr = async (req, res, next) => {
    try {
        const companyAdmin = req.user;
        if (!companyAdmin || companyAdmin.role !== "company_admin") {
            return next(new ApiError(403, "Only company admins can update company HR users"));
        }

        const { hrUserId } = req.params;
        const { name, email, phone, password, userStatus } = req.body;
        const updates = {};

        if (name !== undefined) {
            if (typeof name !== "string" || !name.trim()) {
                return next(new ApiError(400, "Name must be a non-empty string"));
            }
            updates.name = name.trim();
        }

        if (email !== undefined) {
            if (typeof email !== "string" || !email.trim()) {
                return next(new ApiError(400, "Email must be a non-empty string"));
            }
            const normalizedEmail = email.trim().toLowerCase();
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
                return next(new ApiError(400, "A valid email is required"));
            }
            updates.email = normalizedEmail;
        }

        if (phone !== undefined) {
            if (typeof phone !== "string" || !phone.trim()) {
                return next(new ApiError(400, "Phone must be a non-empty string"));
            }
            updates.phone = phone.trim();
        }

        if (password !== undefined) {
            if (typeof password !== "string" || password.length < 8) {
                return next(new ApiError(400, "Password must be at least 8 characters long"));
            }
            updates.password = await bcrypt.hash(password, 12);
        }

        if (userStatus !== undefined) {
            if (!['pending', 'active', 'suspended'].includes(userStatus)) {
                return next(new ApiError(400, "User status must be pending, active, or suspended"));
            }
            updates.userStatus = userStatus;
            updates.isApproved = userStatus === "active";
        }

        if (!Object.keys(updates).length) {
            return next(new ApiError(400, "Provide at least one HR field to update"));
        }

        const hrUser = await User.findOneAndUpdate(
            { _id: hrUserId, company: companyAdmin.company, role: "company_hr" },
            { $set: updates },
            { new: true, runValidators: true }
        ).select("name email phone role company userStatus isApproved emailVerified createdAt updatedAt");

        if (!hrUser) {
            return next(new ApiError(404, "Company HR user not found"));
        }

        res.status(200).json({
            success: true,
            message: "Company HR user updated successfully",
            data: hrUser
        });
    } catch (error) {
        if (error.code === 11000) {
            return next(new ApiError(409, "A user with the same email or phone already exists"));
        }
        if (error.name === "CastError") {
            return next(new ApiError(400, "Invalid HR user ID"));
        }
        return next(error);
    }
}
