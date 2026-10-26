import axios from "axios";
import Booking from "../../models/Booking.model.js";
import Company from "../../models/Company.model.js";
import { ApiError } from "../../utils/apiError.js";
import { getAmadeusToken } from "../../utils/amadeus-token.js";

const isCompanyAdmin = (user) => user?.role === "company_admin";

export const getPendingFlightBookings = async (req, res, next) => {
    try {
        if (!isCompanyAdmin(req.user)) {
            return next(new ApiError(403, "Only company admins can view pending bookings"));
        }

        const bookings = await Booking.find({
            company: req.user.company,
            bookingType: "flight",
            approvalStatus: "pending",
            status: "pending_approval"
        })
            .populate("user", "name email role")
            .sort({ createdAt: -1 })
            .lean();

        return res.status(200).json({ success: true, count: bookings.length, data: bookings });
    } catch (error) {
        return next(error);
    }
};

const changeWalletBalance = async ({ companyId, amount, booking, admin, description }) => {
    const balanceChange = description.startsWith("Refund") ? amount : -amount;
    const balanceExpression = balanceChange < 0
        ? { $subtract: ["$walletBalance", amount] }
        : { $add: ["$walletBalance", amount] };
    const historyEntry = {
        amount: balanceChange,
        balanceBefore: "$walletBalance",
        balanceAfter: balanceExpression,
        date: new Date(),
        description,
        bookingId: booking._id,
        performedBy: admin._id
    };

    return Company.findOneAndUpdate(
        {
            _id: companyId,
            status: "active",
            ...(balanceChange < 0 ? { walletBalance: { $gte: amount } } : {})
        },
        [{
            $set: {
                walletBalance: balanceExpression,
                walletHistory: {
                    $concatArrays: [
                        { $ifNull: ["$walletHistory", []] },
                        [historyEntry]
                    ]
                }
            }
        }],
        { new: true }
    );
};

export const approveFlightBooking = async (req, res, next) => {
    try {
        const admin = req.user;
        if (!isCompanyAdmin(admin)) {
            return next(new ApiError(403, "Only company admins can approve bookings"));
        }

        const booking = await Booking.findOne({
            _id: req.params.bookingId,
            company: admin.company,
            bookingType: "flight"
        });
        if (!booking) {
            return next(new ApiError(404, "Flight booking not found for your company"));
        }
        if (booking.approvalStatus !== "pending" || booking.status !== "pending_approval") {
            return next(new ApiError(409, "This booking has already been processed"));
        }

        const company = await Company.findOne({ _id: booking.company, status: "active" });
        if (!company) {
            return next(new ApiError(403, "Your company is not active"));
        }

        const { flightOffer, travelers, ticketingAgreement } = booking.bookingPayload || {};
        if (!flightOffer || !Array.isArray(travelers) || travelers.length === 0) {
            return next(new ApiError(400, "Booking is missing its flight offer or traveler details"));
        }

        const token = await getAmadeusToken();
        const baseUrl = process.env.AMADEUS_BASE_URL;
        const pricingResponse = await axios.post(
            `${baseUrl}/v1/shopping/flight-offers/pricing`,
            {
                data: {
                    type: "flight-offers-pricing",
                    flightOffers: [flightOffer]
                }
            },
            { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
        );

        const pricedOffer = pricingResponse.data?.data?.flightOffers?.[0];
        const amount = Number(pricedOffer?.price?.grandTotal ?? pricedOffer?.price?.total);
        const currency = pricedOffer?.price?.currency;
        if (!pricedOffer || !Number.isFinite(amount) || amount <= 0 || !currency) {
            return next(new ApiError(502, "Flight provider returned an invalid price"));
        }
        if (currency !== booking.currency) {
            return next(new ApiError(400, `Wallet bookings require ${booking.currency} fares`));
        }

        const claimedBooking = await Booking.findOneAndUpdate(
            {
                _id: booking._id,
                company: admin.company,
                approvalStatus: "pending",
                status: "pending_approval"
            },
            {
                $set: {
                    approvalStatus: "approved",
                    status: "pending_payment",
                    approvedBy: admin._id,
                    approvedAt: new Date(),
                    finalAmount: amount
                }
            },
            { new: true }
        );
        if (!claimedBooking) {
            return next(new ApiError(409, "This booking has already been processed"));
        }

        const debit = await changeWalletBalance({
            companyId: company._id,
            amount,
            booking: claimedBooking,
            admin,
            description: `Flight booking ${booking.bookingReference}`
        });
        if (!debit) {
            await Booking.updateOne(
                { _id: claimedBooking._id, status: "pending_payment", approvedBy: admin._id },
                { $set: { approvalStatus: "pending", status: "pending_approval", approvedBy: null, approvedAt: null } }
            );
            return next(new ApiError(402, "Insufficient company wallet balance; booking remains pending"));
        }

        try {
            const payload = {
                data: {
                    type: "flight-order",
                    flightOffers: [pricedOffer],
                    travelers,
                    formOfPayments: [{
                        creditCard: {
                            brand: "EASYPAY",
                            number: process.env.EASYPAY_CARD_NUMBER,
                            expiryDate: process.env.EASYPAY_CARD_EXPIRY,
                            flightOfferIds: [pricedOffer.id]
                        }
                    }],
                    ...(ticketingAgreement && Object.keys(ticketingAgreement).length > 0 ? { ticketingAgreement } : {})
                }
            };

            const orderResponse = await axios.post(
                `${baseUrl}/v1/booking/flight-orders`,
                payload,
                { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
            );
            const orderData = orderResponse.data;
            const orderId = orderData?.data?.id;
            if (!orderId) {
                throw new Error("Flight provider did not return an order ID");
            }

            await axios.patch(
                `${baseUrl}/v1/booking/flight-orders/${orderId}`,
                {
                    data: {
                        type: "flight-order",
                        commissions: [{ controls: ["MANUAL"], values: [{ commissionType: "NEW", percentage: 0 }] }]
                    }
                },
                { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
            );

            const issuanceResponse = await axios.post(
                `${baseUrl}/v1/booking/flight-orders/${orderId}/issuance`,
                {},
                { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
            );

            claimedBooking.status = "confirmed";
            claimedBooking.orderData = issuanceResponse.data;
            await claimedBooking.save();

            return res.status(200).json({
                success: true,
                message: "Booking approved, wallet charged, and ticket issued",
                data: {
                    booking: claimedBooking,
                    walletBalance: debit.walletBalance,
                    order: issuanceResponse.data
                }
            });
        } catch (providerError) {
            try {
                await changeWalletBalance({
                    companyId: company._id,
                    amount,
                    booking: claimedBooking,
                    admin,
                    description: `Refund for failed flight booking ${booking.bookingReference}`
                });
            } catch (refundError) {
                console.error("Failed to refund wallet after ticketing failure:", refundError);
            }

            claimedBooking.status = "failed";
            await claimedBooking.save().catch((saveError) => {
                console.error("Failed to persist flight booking failure:", saveError);
            });

            console.error("Flight ticketing failed after booking approval:", providerError.response?.data || providerError.message);
            return next(new ApiError(502, "Ticket issuance failed; the booking was marked failed and wallet refund was attempted"));
        }
    } catch (error) {
        if (error.name === "CastError") {
            return next(new ApiError(400, "Invalid booking ID"));
        }
        return next(error);
    }
};

export const rejectFlightBooking = async (req, res, next) => {
    try {
        const admin = req.user;
        if (!isCompanyAdmin(admin)) {
            return next(new ApiError(403, "Only company admins can reject bookings"));
        }

        const reason = typeof req.body?.rejectionReason === "string"
            ? req.body.rejectionReason.trim()
            : "No reason provided";
        const booking = await Booking.findOneAndUpdate(
            {
                _id: req.params.bookingId,
                company: admin.company,
                bookingType: "flight",
                approvalStatus: "pending",
                status: "pending_approval"
            },
            {
                $set: {
                    approvalStatus: "rejected",
                    status: "cancelled",
                    rejectionReason: reason || "No reason provided",
                    rejectedBy: admin._id,
                    rejectedAt: new Date()
                }
            },
            { new: true }
        );
        if (!booking) {
            return next(new ApiError(404, "Pending flight booking not found for your company"));
        }

        return res.status(200).json({
            success: true,
            message: "Flight booking rejected; no wallet charge was made",
            data: booking
        });
    } catch (error) {
        if (error.name === "CastError") {
            return next(new ApiError(400, "Invalid booking ID"));
        }
        return next(error);
    }
};