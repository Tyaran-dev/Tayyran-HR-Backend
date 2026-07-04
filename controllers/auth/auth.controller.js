import User from "../../models/User.model.js";
import jwt from "jsonwebtoken";
import { ApiError } from "../../utils/apiError.js";

export const login = async (req, res, next) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return next(new ApiError(400, "Email and password are required"));
        }

        // Find user by email
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            return next(new ApiError(401, "Invalid email or password"));
        }

        // Verify user status (super admin is always active, or we check if user is active)
        if (user.role !== "super_admin" && user.userStatus !== "active") {
            return next(new ApiError(403, `Account status is: ${user.userStatus}. Please contact support.`));
        }

        // Verify password
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return next(new ApiError(401, "Invalid email or password"));
        }

        // Generate JWT Token matching the structure in protectedRoute.js
        const accessToken = jwt.sign(
            {
                UserInfo: {
                    id: user._id,
                    tokenVersion: user.tokenVersion || 0
                }
            },
            process.env.JWT_Access_Token,
            { expiresIn: "1d" } // 1 day expiration
        );

        res.status(200).json({
            success: true,
            token: accessToken,
            user: {
                _id: user._id,
                first_name: user.first_name,
                last_name: user.last_name,
                email: user.email,
                role: user.role,
                company: user.company,
                userStatus: user.userStatus
            }
        });
    } catch (error) {
        next(new ApiError(500, error.message));
    }
};

export const getProfile = async (req, res, next) => {
    try {
        // req.user is already populated by protectedRoute middleware
        res.status(200).json({
            success: true,
            data: req.user
        });
    } catch (error) {
        next(new ApiError(500, error.message));
    }
};
