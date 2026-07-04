import Company from "../../models/Company.model.js";
import User from "../../models/User.model.js";
import { ApiError } from "../../utils/apiError.js";

export const getPendingCompanies = async (req, res, next) => {
    try {
        const userId = req.user._id;
        const user = await User.findById(userId);
        if (!user || user.role !== 'super_admin') {
            return next(new ApiError(403, 'Only super admin can view pending companies'));
        }
        const companies = await Company.find({ status: 'pending' })
            .populate('user', 'first_name last_name email phone role userStatus')
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
        const userId = req.user._id;

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
                    first_name: companyAdmin.first_name,
                    last_name: companyAdmin.last_name,
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
        const userId = req.user._id;

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

        // 4. Update company status
        company.status = 'rejected';
        company.rejectedBy = superAdmin._id;
        company.rejectedAt = new Date();
        company.rejectionReason = rejectionReason;

        // 5. Update the company admin user if exists
        if (company.user) {
            const companyAdmin = await User.findById(company.user._id);
            if (companyAdmin) {
                companyAdmin.userStatus = 'suspended';
                companyAdmin.isApproved = false;
                companyAdmin.rejectionReason = rejectionReason;
                await companyAdmin.save();
            }
        }

        // 6. Save company
        await company.save();

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
        const userId = req.user._id;
        
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
            .populate('user', 'first_name last_name email phone role userStatus isApproved')
            .populate('approvedBy', 'first_name last_name email')
            .populate('rejectedBy', 'first_name last_name email')
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
        const userId = req.user._id;
        const user = await User.findById(userId);
        if (!user || user.role !== 'super_admin') {
            return next(new ApiError(403, 'Only super admin can view all companies'));
        }

        const companies = await Company.find()
            .populate('user', 'first_name last_name email phone role userStatus isApproved')
            .sort({ createdAt: -1 })
            .lean();

        res.status(200).json({
            success: true,
            count: companies.length,
            data: companies
        });
    } catch (error) {
        next(new ApiError(500, error.message));
    }
}