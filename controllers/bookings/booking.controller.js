import { ApiError } from "../../utils/apiError.js";
import axios from "axios";
import Booking from "../../models/Booking.model.js";
import Employee from "../../models/Employee.model.js";
import User from "../../models/User.model.js";
import Company from "../../models/Company.model.js";
import crypto from "crypto";

// 🔥 SEPARATED LOGIC: Employee Hydration
async function hydrateEmployee(traveler, companyId) {
    // Validate _id is provided
    if (!traveler._id) {
        throw new ApiError(400, "Employee _id is required when type is 'employee'");
    }

    // Fetch employee from DB
    const employee = await Employee.findOne({
        _id: traveler._id,
        company: companyId  // Security: Ensure employee belongs to this company
    });

    if (!employee) {
        throw new ApiError(404, `Employee not found or doesn't belong to your company`);
    }

    // Validate required travel information
    if (!employee.personalInfo?.passport?.number) {
        throw new ApiError(400, `Employee ${employee.first_name} ${employee.last_name} is missing passport information`);
    }

    if (!employee.personalInfo?.dateOfBirth?.year) {
        throw new ApiError(400, `Employee ${employee.first_name} ${employee.last_name} is missing date of birth`);
    }

    // Return flat traveler object matching Booking Schema
    return {
        employeeId: employee._id,
        firstName: employee.first_name,
        lastName: employee.last_name,
        email: employee.email,
        passportNumber: employee.personalInfo.passport.number
    };
}

// 🔥 SEPARATED LOGIC: Guest Hydration
function hydrateGuest(traveler) {
    // Validate guest has required information
    if (!traveler.personalInfo) {
        throw new ApiError(400, "Guest traveler must include personalInfo");
    }

    const { personalInfo } = traveler;

    // Validate required fields
    if (!personalInfo.first_name || !personalInfo.last_name) {
        throw new ApiError(400, "Guest traveler must have first_name and last_name");
    }

    if (!personalInfo.passport?.number) {
        throw new ApiError(400, "Guest traveler must have passport information");
    }

    if (!personalInfo.dateOfBirth?.year) {
        throw new ApiError(400, "Guest traveler must have date of birth");
    }

    // Return flat traveler object matching Booking Schema
    return {
        employeeId: null,
        firstName: personalInfo.first_name,
        lastName: personalInfo.last_name,
        email: personalInfo.contact?.email || "",
        passportNumber: personalInfo.passport.number
    };
}

export const createBooking = async (req, res, next) => {
    try {
        const { bookingType, bookingPayload, finalAmount, travelers } = req.body;
        const userId = req.user._id;

        // Fetch user and company
        const user = await User.findById(userId);
        if (!user) {
            return next(new ApiError(404, "User not found"));
        }
        
        const company = await Company.findById(user.company);
        if (!company) {
            return next(new ApiError(404, "Company not found"));
        }

        // Validate travelers array
        if (!travelers || !Array.isArray(travelers) || travelers.length === 0) {
            return next(new ApiError(400, "At least one traveler is required"));
        }

        // 🔥 TRAVELER HYDRATION
        const hydratedTravelers = await Promise.all(
            travelers.map(async (traveler) => {
                // Validate type
                if (!traveler.type || !['employee', 'guest'].includes(traveler.type)) {
                    throw new ApiError(400, "Each traveler must have a valid type: 'employee' or 'guest'");
                }

                // Handle Employee Type
                if (traveler.type === "employee") {
                    return await hydrateEmployee(traveler, company._id);
                }

                // Handle Guest Type
                return hydrateGuest(traveler);
            })
        );

        // Determine approval workflow
        const approvalStatus = user.role === "company_admin" ? "not_required" : "pending";
        const status = user.role === "company_admin" ? "pending_payment" : "pending_approval";

        // Generate human-readable reference
        const bookingReference = `TYR-HR-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;

        // Create booking
        const booking = new Booking({
            user: user._id,
            company: company._id,
            bookingType,
            travelers: hydratedTravelers,
            bookingPayload,
            bookingReference,
            approvalStatus,
            status,
            finalAmount,
        });

        await booking.save();

        res.status(201).json({
            success: true,
            data: booking,
        });
    } catch (error) {
        const errorMessage = error.response?.data || error.message;
        console.error("Create Booking Error:", errorMessage);
        return next(new ApiError(500, errorMessage));
    }
};

export const getBookings = async (req, res, next) => {
    try {
        const user = req.user;
        let query = { company: user.company };

        // HR can filter by own bookings, or super_admin can see all if they are calling (if super_admin is supported)
        if (user.role === "company_user" && req.query.own === "true") {
            query.user = user._id;
        }

        // Support super_admin viewing all bookings across companies
        if (user.role === "super_admin") {
            query = {}; // super_admin can view all bookings
            if (req.query.companyId) {
                query.company = req.query.companyId;
            }
        }

        const bookings = await Booking.find(query)
            .populate('user', 'first_name last_name email role')
            .populate('company', 'name email status')
            .sort({ createdAt: -1 })
            .lean();

        res.json({
            success: true,
            count: bookings.length,
            data: bookings
        });
    } catch (error) {
        return next(new ApiError(500, error.message));
    }
};

export const getBookingById = async (req, res, next) => {
    try {
        const { bookingId } = req.params;
        const user = req.user;

        let query = { _id: bookingId };
        if (user.role !== "super_admin") {
            query.company = user.company;
        }

        const booking = await Booking.findOne(query)
            .populate('user', 'first_name last_name email role')
            .populate('company', 'name email status')
            .lean();

        if (!booking) {
            return next(new ApiError(404, "Booking not found or access denied"));
        }

        res.json({
            success: true,
            data: booking
        });
    } catch (error) {
        return next(new ApiError(500, error.message));
    }
};



