import Company from "../../models/Company.model";
import User from "../../models/User.model";
import { ApiError } from "../../utils/apiError.js";

export const getPendingCompanies = async (req, res, next) => {
    try {
        const { userId } = req.user;
        const user = await User.findById(userId);
        if (!user || user.role !== 'super_admin') {
            return next(new ApiError(403, 'Only super admin can view pending companies'));
        }
        const companies = await Company.find({ status: 'pending' })
            .populate('user', 'name email phone role userStatus')
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
        const { userId } = req.user;

        // 1. Verify super admin
        const superAdmin = await User.findById(userId);
        if (!superAdmin || superAdmin.role !== 'super_admin') {
            return next(new ApiError(403, 'Only super admin can approve companies'));
        }

        // 2. Find company with its admin user
        const company = await Company.findById(companyId).populate('user');
        if (!company) {
            return next(new ApiError(404, 'Company not found'));
        }

        if (company.status !== 'pending') {
            return next(new ApiError(400, `Company is already ${company.status}`));
        }

        if (!company.user) {
            return next(new ApiError(400, 'Company has no associated admin user'));
        }

        // 3. Update company status
        company.status = 'active';
        company.approvedBy = superAdmin._id;
        company.approvedAt = new Date();

        // 4. Activate the company admin user
        const companyAdmin = await User.findById(company.user._id);
        companyAdmin.userStatus = 'active';
        companyAdmin.isApproved = true;

        // 5. Save both documents
        await Promise.all([
            company.save(),
            companyAdmin.save()
        ]);

        // 6. Send approval email to company admin
        // try {
        //     await sendEmail({
        //         to: company.email,
        //         subject: 'Company Approved - Welcome to Tayyran-HR',
        //         html: `
        //             <h2>Congratulations! Your company has been approved</h2>
        //             <p>Dear ${companyAdmin.name},</p>
        //             <p>Your company <strong>${company.name}</strong> has been successfully approved and activated.</p>
        //             <p>You can now log in and start managing your travel bookings.</p>
        //             <p><strong>Company Details:</strong></p>
        //             <ul>
        //                 <li>Company Name: ${company.name}</li>
        //                 <li>Email: ${company.email}</li>
        //                 <li>Wallet Balance: $${company.walletBalance}</li>
        //             </ul>
        //             <p>Best regards,<br>Tayyran-HR Team</p>
        //         `
        //     });
        // } catch (emailError) {
        //     console.error('Failed to send approval email:', emailError);
        //     // Don't fail the approval if email fails
        // }

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
                admin: {
                    _id: companyAdmin._id,
                    name: companyAdmin.name,
                    email: companyAdmin.email,
                    userStatus: companyAdmin.userStatus
                }
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
        const { userId } = req.user;

        // 1. Validate rejection reason
        if (!rejectionReason || rejectionReason.trim().length === 0) {
            return next(new ApiError(400, 'Rejection reason is required'));
        }

        // 2. Verify super admin
        const superAdmin = await User.findById(userId);
        if (!superAdmin || superAdmin.role !== 'super_admin') {
            return next(new ApiError(403, 'Only super admin can reject companies'));
        }

        // 3. Find company with its admin user
        const company = await Company.findById(companyId).populate('user');
        if (!company) {
            return next(new ApiError(404, 'Company not found'));
        }

        if (company.status !== 'pending') {
            return next(new ApiError(400, `Company is already ${company.status}`));
        }

        // if (!company.user) {
        //     return next(new ApiError(400, 'Company has no associated admin user'));
        // }

        // 4. Update company status
        company.status = 'rejected';
        company.rejectedBy = superAdmin._id;
        company.rejectedAt = new Date();
        company.rejectionReason = rejectionReason;

        // 5. Update the company admin user
        // const companyAdmin = await User.findById(company.user._id);
        // companyAdmin.userStatus = 'suspended';
        // companyAdmin.isApproved = false;
        // companyAdmin.rejectionReason = rejectionReason;

        // 6. Save both documents
        await Promise.all([
            company.save(),
            // companyAdmin.save()
        ]);

        // 7. Send rejection email
        // try {
        //     await sendEmail({
        //         to: company.email,
        //         subject: 'Company Registration - Application Status',
        //         html: `
        //             <h2>Company Registration Update</h2>
        //             <p>Dear ${companyAdmin.name},</p>
        //             <p>We regret to inform you that your company registration for <strong>${company.name}</strong> has not been approved at this time.</p>
        //             <p><strong>Reason:</strong></p>
        //             <p>${rejectionReason}</p>
        //             <p>If you have any questions or would like to reapply, please contact our support team.</p>
        //             <p>Best regards,<br>Tayyran-HR Team</p>
        //         `
        //     });
        // } catch (emailError) {
        //     console.error('Failed to send rejection email:', emailError);
        //     // Don't fail the rejection if email fails
        // }

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
        const { userId } = req.user;
        
        const user = await User.findById(userId);
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
            .populate('user', 'name email phone role userStatus isApproved')
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

    } catch (error) {
        next(error);
    }
}