import Company from "../../models/Company.model.js";
import User from "../../models/User.model.js";
import { ApiError } from "../../utils/apiError.js";

export const registerCompany = async (req, res, next) => {
    try {
        const {
            name,
            email,
            phone,
            vatNumber,
            address,
            logo,
            adminFirstName,
            adminLastName,
            adminEmail,
            adminPhone,
            adminPassword
        } = req.body;

        // 1. Validation
        if (!name || !email || !phone || !vatNumber) {
            return next(new ApiError(400, "Company name, email, phone, and vatNumber are required"));
        }

        if (!adminFirstName || !adminLastName || !adminEmail || !adminPhone || !adminPassword) {
            return next(new ApiError(400, "Admin first_name, last_name, email, phone, and password are required"));
        }

        // 2. Check duplicate company
        const existingCompany = await Company.findOne({
            $or: [
                { name },
                { email },
                { vatNumber }
            ]
        });

        if (existingCompany) {
            return next(new ApiError(400, "A company with this name, email, or VAT number is already registered"));
        }

        // 3. Check duplicate admin user
        const existingUser = await User.findOne({
            $or: [
                { email: adminEmail.toLowerCase() },
                { phone: adminPhone }
            ]
        });

        if (existingUser) {
            return next(new ApiError(400, "An admin user with this email or phone already exists"));
        }

        // 4. Create Company (pending)
        const company = new Company({
            name,
            email,
            phone,
            vatNumber,
            address,
            logo,
            status: "pending",
            walletBalance: 0
        });

        // 5. Create User (pending company_admin)
        const user = new User({
            first_name: adminFirstName,
            last_name: adminLastName,
            email: adminEmail,
            phone: adminPhone,
            password: adminPassword, // will be hashed automatically by pre-save middleware
            role: "company_admin",
            company: company._id,
            userStatus: "pending",
            isApproved: false
        });

        // 6. Link user to company and save both
        company.user = user._id;

        await Promise.all([
            company.save(),
            user.save()
        ]);

        res.status(201).json({
            success: true,
            message: "Company registration submitted successfully. It is pending Super Admin approval.",
            data: {
                company: {
                    _id: company._id,
                    name: company.name,
                    status: company.status
                },
                admin: {
                    _id: user._id,
                    first_name: user.first_name,
                    last_name: user.last_name,
                    email: user.email,
                    role: user.role
                }
            }
        });

    } catch (error) {
        next(new ApiError(500, error.message));
    }
};