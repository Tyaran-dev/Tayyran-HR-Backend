import User from "../../models/User.model.js";
import { ApiError } from "../../utils/apiError.js";

// ✅ Create an HR account (company_admin only)
export const createHRUser = async (req, res, next) => {
    try {
        const { first_name, last_name, email, phone, password } = req.body;
        const adminUser = req.user; // from protectedRoute

        if (adminUser.role !== "company_admin") {
            return next(new ApiError(403, "Only company admins can create HR accounts"));
        }

        if (!first_name || !last_name || !email || !phone || !password) {
            return next(new ApiError(400, "All fields are required (first_name, last_name, email, phone, password)"));
        }

        // Check if user already exists
        const existingUser = await User.findOne({
            $or: [
                { email: email.toLowerCase() },
                { phone }
            ]
        });

        if (existingUser) {
            return next(new ApiError(400, "A user with this email or phone already exists"));
        }

        // Create user under the same company
        const hrUser = new User({
            first_name,
            last_name,
            email,
            phone,
            password,
            role: "company_user", // HR account role
            company: adminUser.company,
            userStatus: "active",
            isApproved: true
        });

        await hrUser.save();

        res.status(201).json({
            success: true,
            message: "HR user account created successfully",
            data: {
                _id: hrUser._id,
                first_name: hrUser.first_name,
                last_name: hrUser.last_name,
                email: hrUser.email,
                role: hrUser.role,
                userStatus: hrUser.userStatus
            }
        });
    } catch (error) {
        next(new ApiError(500, error.message));
    }
};

// ✅ Get all users for the current company (company_admin and company_user)
export const getCompanyUsers = async (req, res, next) => {
    try {
        const currentUser = req.user;

        if (!currentUser.company) {
            return next(new ApiError(400, "User is not associated with any company"));
        }

        const users = await User.find({ company: currentUser.company })
            .select("-password")
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: users.length,
            data: users
        });
    } catch (error) {
        next(new ApiError(500, error.message));
    }
};

// ✅ Toggle/Update user status (company_admin only)
export const updateUserStatus = async (req, res, next) => {
    try {
        const { userId } = req.params;
        const { status } = req.body; // 'active' or 'suspended'
        const adminUser = req.user;

        if (adminUser.role !== "company_admin") {
            return next(new ApiError(403, "Only company admins can update user status"));
        }

        if (!["active", "suspended"].includes(status)) {
            return next(new ApiError(400, "Invalid status. Must be 'active' or 'suspended'"));
        }

        const targetUser = await User.findOne({ _id: userId, company: adminUser.company });
        if (!targetUser) {
            return next(new ApiError(404, "User not found in your company"));
        }

        if (targetUser.role === "company_admin") {
            return next(new ApiError(400, "Cannot change status of a company admin"));
        }

        targetUser.userStatus = status;
        
        // Invalidate token version if suspending
        if (status === "suspended") {
            targetUser.tokenVersion = (targetUser.tokenVersion || 0) + 1;
        }

        await targetUser.save();

        res.status(200).json({
            success: true,
            message: `User status updated to ${status} successfully`,
            data: {
                _id: targetUser._id,
                first_name: targetUser.first_name,
                last_name: targetUser.last_name,
                userStatus: targetUser.userStatus
            }
        });
    } catch (error) {
        next(new ApiError(500, error.message));
    }
};
