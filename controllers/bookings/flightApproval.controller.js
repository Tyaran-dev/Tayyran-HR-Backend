import axios from "axios";
import Booking from "../../models/Booking.model.js";
import Company from "../../models/Company.model.js";
import { ApiError } from "../../utils/apiError.js";
import { getAmadeusToken } from "../../utils/amadeus-token.js";

const isCompanyAdmin = (user) => user?.role === "company_admin";
const MAX_APPROVAL_ATTEMPTS = 3;
const presentageCommission = 5,
    presentageVat = 15;

const formatDateOfBirth = (value) => {
    let year;
    let month;
    let day;

    if (typeof value === "string") {
        const match = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:T.*)?$/);
        if (!match) {
            return null;
        }
        [, year, month, day] = match;
    } else if (value instanceof Date && !Number.isNaN(value.getTime())) {
        year = value.getUTCFullYear();
        month = value.getUTCMonth() + 1;
        day = value.getUTCDate();
    } else if (value && typeof value === "object") {
        ({ year, month, day } = value);
    } else {
        return null;
    }

    year = Number(year);
    month = Number(month);
    day = Number(day);
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
        return null;
    }

    const date = new Date(0);
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCFullYear(year, month - 1, day);
    if (
        year < 1 ||
        date.getUTCFullYear() !== year ||
        date.getUTCMonth() + 1 !== month ||
        date.getUTCDate() !== day
    ) {
        return null;
    }

    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

export const getPendingBookings = async (req, res, next) => {
    try {
        if (!isCompanyAdmin(req.user)) {
            return next(new ApiError(403, "Only company admins can view pending bookings"));
        }

        const bookings = await Booking.find({
            company: req.user.company,
            bookingType: "flight" || "hotel",
            $or: [
                { approvalStatus: "pending", status: "pending_approval" },
                {
                    approvalStatus: "approved",
                    status: "failed",
                    $or: [
                        { approvalAttempts: { $lt: MAX_APPROVAL_ATTEMPTS } },
                        { approvalAttempts: { $exists: false } }
                    ]
                }
            ]
        })
            .populate("user", "name email role")
            .sort({ createdAt: -1 })
            .lean();

        return res.status(200).json({ success: true, count: bookings.length, data: bookings });
    } catch (error) {
        return next(error);
    }
};

const resetWalletBalance = async ({
    companyId,
    amount,
    booking,
    admin,
    description
}) => {
    const isRefund = description.startsWith("Refund");

    const balanceChange = isRefund ? amount : -amount;

    const balanceExpression = balanceChange < 0
        ? { $subtract: ["$walletBalance", amount] }
        : { $add: ["$walletBalance", amount] };

    const historyEntry = {
        amount: balanceChange,
        date: new Date(),
        description,
        bookingId: booking._id,
        performedBy: admin._id
    };

    return Company.findOneAndUpdate(
        {
            _id: companyId,
            status: "active",
            ...(balanceChange < 0
                ? { walletBalance: { $gte: amount } }
                : {})
        },
        [
            {
                $set: {
                    walletBalance: balanceExpression,

                    walletHistory: {
                        $concatArrays: [
                            { $ifNull: ["$walletHistory", []] },
                            [
                                {
                                    $mergeObjects: [
                                        { $literal: historyEntry },
                                        {
                                            balanceBefore: "$walletBalance",
                                            balanceAfter: balanceExpression
                                        }
                                    ]
                                }
                            ]
                        ]
                    }
                }
            }
        ],
        {
            returnDocument: "after",
            updatePipeline: true
        }
    );
};

export const approveBooking = async (req, res, next) => {
    try {
        const admin = req.user;
        if (!isCompanyAdmin(admin)) {
            return next(new ApiError(403, "Only company admins can approve bookings"));
        }

        const booking = await Booking.findOne({
            _id: req.params.bookingId,
            company: admin.company,
            bookingType: "flight" || "hotel"
        });
        if (!booking) {
            return next(new ApiError(404, "Booking not found for your company"));
        }
        if (booking.approvalProcessing) {
            return next(new ApiError(409, "This booking is already being processed"));
        }
        const isPendingApproval = booking.approvalStatus === "pending" && booking.status === "pending_approval";
        const isRetryableFailure = booking.approvalStatus === "approved" && booking.status === "failed";
        if (isRetryableFailure && (booking.approvalAttempts || 0) >= MAX_APPROVAL_ATTEMPTS) {
            return next(new ApiError(409, `Booking has reached the maximum of ${MAX_APPROVAL_ATTEMPTS} approval attempts`));
        }
        if (!isPendingApproval && !isRetryableFailure) {
            return next(new ApiError(409, "Booking is not pending approval or eligible for retry"));
        }


        const company = await Company.findOne({ _id: booking.company, status: "active" });
        if (!company) {
            return next(new ApiError(403, "Your company is not active"));
        }

        if (booking.bookingType === "flight") {
            const { flightOffer, travelers, ticketingAgreement } = booking.bookingPayload || {};
            if (!flightOffer || !Array.isArray(travelers) || travelers.length === 0) {
                return next(new ApiError(400, "Booking is missing its flight offer or traveler details"));
            }
            const providerTravelers = travelers.map((traveler, index) => {
                const dateOfBirth = formatDateOfBirth(
                    traveler?.dateOfBirth ?? traveler?.personalInfo?.dateOfBirth
                );
                if (!dateOfBirth) {
                    throw new ApiError(
                        400,
                        `Traveler ${index + 1} has an invalid date of birth; expected YYYY-MM-DD`
                    );
                }
                return { ...traveler, dateOfBirth };
            });

            const token = await getAmadeusToken();
            const baseUrl = process.env.AMADEUS_TEST_URL;
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

            console.log("Flight pricing Done 1:");



            const pricedOffer = pricingResponse.data?.data?.flightOffers?.[0];
            const amount = Number(pricedOffer?.price?.grandTotal ?? pricedOffer?.price?.total);
            // add price after commision here
            const commissionAmount = amount * presentageCommission / 100;
            const priceWithCommission = amount + commissionAmount;
            const finalPrice = priceWithCommission + (commissionAmount * presentageVat / 100);



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
                    $or: [
                        { approvalStatus: "pending", status: "pending_approval" },
                        {
                            approvalStatus: "approved",
                            status: "failed",
                            $or: [
                                { approvalAttempts: { $lt: MAX_APPROVAL_ATTEMPTS } },
                                { approvalAttempts: { $exists: false } }
                            ]
                        }
                    ],
                    approvalProcessing: { $ne: true }
                },
                {
                    $set: {
                        approvalProcessing: true
                    }
                },
                { new: true }
            );
            if (!claimedBooking) {
                return next(new ApiError(409, "This booking has already been processed"));
            }

            const debit = await resetWalletBalance({
                companyId: company._id,
                amount: finalPrice,
                booking: claimedBooking,
                admin,
                description: `Flight booking ${booking.bookingReference}`
            });
            if (!debit) {
                claimedBooking.approvalProcessing = false;
                await claimedBooking.save();
                return next(new ApiError(402, "Insufficient company wallet balance; booking was not processed"));
            }

            claimedBooking.approvalStatus = "approved";
            claimedBooking.status = "pending_payment";
            claimedBooking.approvedBy = admin._id;
            claimedBooking.approvedAt = new Date();
            claimedBooking.finalAmount = finalPrice;
            claimedBooking.approvalAttempts = (claimedBooking.approvalAttempts || 0) + 1;
            claimedBooking.approvalProcessing = false;
            await claimedBooking.save();

            try {
                const payload = {
                    data: {
                        type: "flight-order",
                        flightOffers: [pricedOffer],
                        travelers: providerTravelers,
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

                console.log("Flight order Done 2:", orderResponse.data);
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


                console.log("Flight order updated with commission Done 3:", orderId);

                const issuanceResponse = await axios.post(
                    `${baseUrl}/v1/booking/flight-orders/${orderId}/issuance`,
                    {},
                    { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
                );

                console.log("Flight ticket issuance Done 4:", issuanceResponse.data);

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
                    await resetWalletBalance({
                        companyId: company._id,
                        amount: finalPrice,
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
                return next(new ApiError(
                    500,
                    `Ticket issuance failed; wallet refund was attempted. Approval attempt ${claimedBooking.approvalAttempts} of ${MAX_APPROVAL_ATTEMPTS}.`
                ));
            }
        } else if (booking.bookingType === "hotel") {
            console.log("Hotel booking approval is not implemented yet");
            return next(new ApiError(501, "Hotel booking approval is not implemented yet"));
        }

    } catch (error) {
        if (error.name === "CastError") {
            return next(new ApiError(400, "Invalid booking ID"));
        }
        return next(error);
    }
};

export const rejectBooking = async (req, res, next) => {
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
                bookingType: "flight" || "hotel",
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
            return next(new ApiError(404, "Pending booking not found for your company"));
        }

        return res.status(200).json({
            success: true,
            message: "booking rejected; no wallet charge was made",
            data: booking
        });
    } catch (error) {
        if (error.name === "CastError") {
            return next(new ApiError(400, "Invalid booking ID"));
        }
        return next(error);
    }
};