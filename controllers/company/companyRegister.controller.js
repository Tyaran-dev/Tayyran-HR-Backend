import bcrypt from "bcryptjs";
import Company from "../../models/Company.model.js";
import User from "../../models/User.model.js";
import { ApiError } from "../../utils/apiError.js";
import sendEmail from "../../utils/sendEmail.js";

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
}[character]));

export const registerCompany = async (req, res, next) => {
    let company;
    let companyAdmin;

    try {
        const { name, email, phone, vatNumber, address, logo, admin } = req.body;
        const requiredValues = [name, email, phone, vatNumber, admin?.name, admin?.email, admin?.phone, admin?.password];

        if (requiredValues.some((value) => typeof value !== "string" || !value.trim())) {
            return next(new ApiError(400, "Company details and admin name, email, phone, and password are required"));
        }

        if (admin.password.length < 8) {
            return next(new ApiError(400, "Admin password must be at least 8 characters long"));
        }

        const passwordHash = await bcrypt.hash(admin.password, 12);
        company = new Company({
            name,
            email,
            phone,
            vatNumber,
            address,
            logo
        });
        companyAdmin = await User.create({
            name: admin.name,
            email: admin.email,
            phone: admin.phone,
            password: passwordHash,
            role: "company_admin",
            company: company._id,
            userStatus: "pending",
            isApproved: false
        });
        company.admins.addToSet(companyAdmin._id);
        await company.save();

        if (!process.env.ADMIN_EMAIL) {
            console.error("ADMIN_EMAIL is not configured; company registration notification was not sent");
        } else {
            try {
                await sendEmail({
                    email: process.env.ADMIN_EMAIL,
                    subject: "New company registration awaiting review",
                    message: `
                        <h2>New company registration</h2>
                        <p>A company has registered and is waiting for review.</p>
                        <p><strong>Company:</strong> ${escapeHtml(company.name)}</p>
                        <p><strong>Company email:</strong> ${escapeHtml(company.email)}</p>
                        <p><strong>Company admin:</strong> ${escapeHtml(companyAdmin.name)}</p>
                        <p><strong>Admin email:</strong> ${escapeHtml(companyAdmin.email)}</p>
                    `
                });
            } catch (emailError) {
                console.error("Failed to send company registration notification:", emailError);
            }
        }

        res.status(201).json({
            success: true,
            message: "Company registration submitted for approval",
            data: {
                _id: company._id,
                name: company.name,
                email: company.email,
                status: company.status,
                admin: {
                    _id: companyAdmin._id,
                    name: companyAdmin.name,
                    email: companyAdmin.email,
                    phone: companyAdmin.phone,
                    role: companyAdmin.role,
                    userStatus: companyAdmin.userStatus
                }
            }
        });
    } catch (error) {
        if (companyAdmin?._id) {
            await User.deleteOne({ _id: companyAdmin._id }).catch(() => {});
        }
        if (company?._id) {
            await Company.deleteOne({ _id: company._id }).catch(() => {});
        }
        if (error.code === 11000) {
            return next(new ApiError(409, "A company or user with the same name, email, phone, or VAT number is already registered"));
        }
        next(error);
    }
};