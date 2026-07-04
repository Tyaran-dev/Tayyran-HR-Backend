import { ApiError } from "../../utils/apiError.js";
import Booking from "../../models/Booking.model.js";
import User from "../../models/User.model.js";
import Company from "../../models/Company.model.js";
import Notification from "../../models/Notification.model.js";
import { emitToCompanyAdmins, emitToUser } from "../../socket/socket.js";

// ✅ Get all pending bookings for approval (company_admin only)
export const getPendingBookings = async (req, res, next) => {
    try {
        const userId = req.user._id;
        const user = await User.findById(userId);

        // Only company_admin can view pending approvals
        if (user.role !== 'company_admin') {
            return next(new ApiError(403, "Only company admins can view pending bookings"));
        }

        const pendingBookings = await Booking.find({
            company: user.company,
            approvalStatus: 'pending',
            status: 'pending_approval'
        })
        .populate('user', 'first_name last_name email role')
        .populate('travelers.employeeId', 'first_name last_name email jobTitle department')
        .sort({ createdAt: -1 })
        .lean();

        res.json({
            success: true,
            count: pendingBookings.length,
            data: pendingBookings
        });
    } catch (error) {
        return next(new ApiError(500, error.message));
    }
};

// ✅ Approve a booking
export const approveBooking = async (req, res, next) => {
    try {
        const { bookingId } = req.params;
        const userId = req.user._id;

        const user = await User.findById(userId);

        // Only company_admin can approve
        if (user.role !== 'company_admin') {
            return next(new ApiError(403, "Only company admins can approve bookings"));
        }

        const booking = await Booking.findOne({
            _id: bookingId,
            company: user.company
        }).populate('user', 'first_name last_name email');

        if (!booking) {
            return next(new ApiError(404, "Booking not found or doesn't belong to your company"));
        }

        if (booking.approvalStatus !== 'pending') {
            return next(new ApiError(400, `Booking is already ${booking.approvalStatus}`));
        }

        // Update booking status
        booking.approvalStatus = 'approved';
        booking.status = 'pending_payment';
        booking.approvedBy = user._id;
        booking.approvedAt = new Date();

        await booking.save();

        // 🔔 Create notification for the requester
        const notification = await Notification.create({
            company: user.company,
            recipient: booking.user._id,
            type: 'booking_approved',
            title: 'Booking Approved',
            message: `Your booking ${booking.bookingReference} has been approved by ${user.first_name} ${user.last_name}`,
            booking: booking._id,
            metadata: {
                bookingReference: booking.bookingReference,
                bookingType: booking.bookingType,
                finalAmount: booking.finalAmount,
                requesterName: `${booking.user.first_name} ${booking.user.last_name}`
            }
        });

        // 🔥 Emit real-time notification to the requester
        emitToUser(booking.user._id.toString(), 'booking_approved', {
            notification,
            booking: {
                _id: booking._id,
                bookingReference: booking.bookingReference,
                status: booking.status,
                approvalStatus: booking.approvalStatus
            }
        });

        res.json({
            success: true,
            message: 'Booking approved successfully',
            data: booking
        });
    } catch (error) {
        return next(new ApiError(500, error.message));
    }
};

// ✅ Reject a booking
export const rejectBooking = async (req, res, next) => {
    try {
        const { bookingId } = req.params;
        const { rejectionReason } = req.body; // Optional reason
        const userId = req.user._id;

        const user = await User.findById(userId);

        // Only company_admin can reject
        if (user.role !== 'company_admin') {
            return next(new ApiError(403, "Only company admins can reject bookings"));
        }

        const booking = await Booking.findOne({
            _id: bookingId,
            company: user.company
        }).populate('user', 'first_name last_name email');

        if (!booking) {
            return next(new ApiError(404, "Booking not found or doesn't belong to your company"));
        }

        if (booking.approvalStatus !== 'pending') {
            return next(new ApiError(400, `Booking is already ${booking.approvalStatus}`));
        }

        // Update booking status
        booking.approvalStatus = 'rejected';
        booking.status = 'cancelled';
        booking.rejectedBy = user._id;
        booking.rejectedAt = new Date();
        booking.rejectionReason = rejectionReason || 'No reason provided';

        await booking.save();

        // 🔔 Create notification for the requester
        const notification = await Notification.create({
            company: user.company,
            recipient: booking.user._id,
            type: 'booking_rejected',
            title: 'Booking Rejected',
            message: `Your booking ${booking.bookingReference} was rejected. Reason: ${booking.rejectionReason}`,
            booking: booking._id,
            metadata: {
                bookingReference: booking.bookingReference,
                bookingType: booking.bookingType,
                finalAmount: booking.finalAmount,
                requesterName: `${booking.user.first_name} ${booking.user.last_name}`
            }
        });

        // 🔥 Emit real-time notification to the requester
        emitToUser(booking.user._id.toString(), 'booking_rejected', {
            notification,
            booking: {
                _id: booking._id,
                bookingReference: booking.bookingReference,
                status: booking.status,
                approvalStatus: booking.approvalStatus,
                rejectionReason: booking.rejectionReason
            }
        });

        res.json({
            success: true,
            message: 'Booking rejected successfully',
            data: booking
        });
    } catch (error) {
        return next(new ApiError(500, error.message));
    }
};

// ✅ Get approval statistics (for dashboard)
export const getApprovalStats = async (req, res, next) => {
    try {
        const userId = req.user._id;
        const user = await User.findById(userId);

        if (user.role !== 'company_admin') {
            return next(new ApiError(403, "Only company admins can view approval statistics"));
        }

        const stats = await Booking.aggregate([
            { $match: { company: user.company } },
            {
                $group: {
                    _id: '$approvalStatus',
                    count: { $sum: 1 },
                    totalAmount: { $sum: '$finalAmount' }
                }
            }
        ]);

        const formattedStats = {
            pending: stats.find(s => s._id === 'pending') || { count: 0, totalAmount: 0 },
            approved: stats.find(s => s._id === 'approved') || { count: 0, totalAmount: 0 },
            rejected: stats.find(s => s._id === 'rejected') || { count: 0, totalAmount: 0 },
            not_required: stats.find(s => s._id === 'not_required') || { count: 0, totalAmount: 0 }
        };

        res.json({
            success: true,
            data: formattedStats
        });
    } catch (error) {
        return next(new ApiError(500, error.message));
    }
};