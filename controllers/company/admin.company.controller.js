import Company from "../../models/Company.model.js";
import { ApiError } from "../../utils/apiError.js";
import sendEmail from "../../utils/sendEmail.js";

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
}[character]));

export const getPendingCompanies = async (req, res, next) => {
    try {
        const user = req.user;
        if (!user || user.role !== 'super_admin') {
            return next(new ApiError(403, 'Only super admin can view pending companies'));
        }
        const companies = await Company.find({ status: 'pending' })
            .populate('admins', 'name email phone role userStatus')
            .sort({ createdAt: -1 })
            .lean();

        res.status(200).json({
            success: true,
            count: companies.length,
            data: companies
        });
    } catch (error) {
        return next(new ApiError(500, error.message));
    }
}

export const approveCompany = async (req, res, next) => {
    try {
        const { companyId } = req.params;
        const superAdmin = req.user;
        if (!superAdmin || superAdmin.role !== 'super_admin') {
            return next(new ApiError(403, 'Only super admin can approve companies'));
        }

        const company = await Company.findById(companyId).populate('admins');
        if (!company) {
            return next(new ApiError(404, 'Company not found'));
        }

        if (company.status !== 'pending') {
            return next(new ApiError(400, `Company is already ${company.status}`));
        }

        const companyAdmins = company.admins.filter((admin) => admin.role === 'company_admin');
        if (!companyAdmins.length) {
            return next(new ApiError(400, 'Company has no associated company admin user'));
        }

        company.status = 'active';
        company.approvedBy = superAdmin._id;
        company.approvedAt = new Date();
        for (const companyAdmin of companyAdmins) {
            companyAdmin.userStatus = 'active';
            companyAdmin.isApproved = true;
        }
        await Promise.all([company.save(), ...companyAdmins.map((admin) => admin.save())]);

        await Promise.all(companyAdmins.map(async (companyAdmin) => {
            try {
                await sendEmail({
                    email: companyAdmin.email,
                    subject: "Your company registration has been approved",
                    message: `
                        <h2>Company registration approved</h2>
                        <p>Hello ${escapeHtml(companyAdmin.name)},</p>
                        <p>Your company, <strong>${escapeHtml(company.name)}</strong>, has been approved.</p>
                        <p>Your company admin account is now active and you can sign in to Tayyran HR.</p>
                    `
                });
            } catch (emailError) {
                console.error(`Failed to send company approval email to ${companyAdmin.email}:`, emailError);
            }
        }));

        res.status(200).json({
            success: true,
            message: 'Company approved successfully',
            data: {
                company: {
                    _id: company._id,
                    name: company.name,
                    email: company.email,
                    status: company.status,
                    approvedAt: company.approvedAt
                },
                admins: companyAdmins.map((admin) => ({
                    _id: admin._id,
                    name: admin.name,
                    email: admin.email,
                    userStatus: admin.userStatus
                }))
            }
        });
    } catch (error) {
        return next(new ApiError(500, error.message));
    }
}

export const rejectCompany = async (req, res, next) => {
    try {
        const { companyId } = req.params;
        const { rejectionReason } = req.body;
        // 1. Validate rejection reason
        if (!rejectionReason || rejectionReason.trim().length === 0) {
            return next(new ApiError(400, 'Rejection reason is required'));
        }

        // 2. Verify super admin
        const superAdmin = req.user;
        if (!superAdmin || superAdmin.role !== 'super_admin') {
            return next(new ApiError(403, 'Only super admin can reject companies'));
        }

        // 3. Find company with its admin user
        const company = await Company.findById(companyId).populate('admins');
        if (!company) {
            return next(new ApiError(404, 'Company not found'));
        }

        if (company.status !== 'pending') {
            return next(new ApiError(400, `Company is already ${company.status}`));
        }

        // 4. Update company status
        company.status = 'rejected';
        company.rejectedBy = superAdmin._id;
        company.rejectedAt = new Date();
        company.rejectionReason = rejectionReason;

        const companyAdmins = company.admins.filter((admin) => admin.role === 'company_admin');
        for (const companyAdmin of companyAdmins) {
            companyAdmin.userStatus = 'suspended';
            companyAdmin.isApproved = false;
            companyAdmin.rejectionReason = rejectionReason;
        }

        await Promise.all([
            company.save(),
            ...companyAdmins.map((admin) => admin.save())
        ]);

         await Promise.all(companyAdmins.map(async (companyAdmin) => {
            try {
                await sendEmail({
                    email: companyAdmin.email,
                    subject: "Your company registration has been rejected",
                    message: `
                        <h2>Company registration rejected</h2>
                        <p>Hello ${escapeHtml(companyAdmin.name)},</p>
                        <p>Your company, <strong>${escapeHtml(company.name)}</strong>, has been rejected.</p>
                        <p><strong>Reason:</strong></p>
                        <p>${rejectionReason}</p>
                        <p>If you have any questions or would like to reapply, please contact our support team.</p>
                        <p>Best regards,<br>Tayyran-HR Team</p>
                    `
                });
            } catch (emailError) {
                console.error(`Failed to send company rejection email to ${companyAdmin.email}:`, emailError);
            }
        }));

        res.status(200).json({
            success: true,
            message: 'Company rejected successfully',
            data: {
                company: {
                    _id: company._id,
                    name: company.name,
                    email: company.email,
                    status: company.status,
                    rejectionReason: company.rejectionReason,
                    rejectedAt: company.rejectedAt
                }
            }
        });
    } catch (error) {
        return next(new ApiError(500, error.message));
    }
}

export const getCompanyById = async (req, res, next) => {
    try {
        const { companyId } = req.params;
        const user = req.user;
        if (!user) {
            return next(new ApiError(404, 'User not found'));
        }

        // 🔐 Access control
        if (user.role !== 'super_admin') {
            if (!user.company || user.company.toString() !== companyId) {
                return next(new ApiError(403, 'Access denied'));
            }
        }

        const company = await Company.findById(companyId)
            .populate('admins', 'name email phone role userStatus isApproved')
            .populate('users', 'name email phone role userStatus isApproved')
            .populate('approvedBy', 'name email')
            .populate('rejectedBy', 'name email')
            .lean();

        if (!company) {
            return next(new ApiError(404, 'Company not found'));
        }

        res.status(200).json({
            success: true,
            data: company
        });
    } catch (error) {
        return next(new ApiError(500, error.message));
    }
};

export const getAllCompanies = async (req, res, next) => {
    try {
        const user = req.user;
        if (!user || user.role !== 'super_admin') {
            return next(new ApiError(403, 'Only super admin can view all companies'));
        }
        const companies = await Company.find()
        if (!companies || companies.length === 0) {
            return next(new ApiError(404, 'No companies found'));
        }

        res.status(200).json({
            success: true,
            count: companies.length,
            data: companies
        });
    } catch (error) {
        return next(new ApiError(500, error.message));
    }
}