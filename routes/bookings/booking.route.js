import express from "express";
import {
    createBooking,
    getBookings,
    getBookingById
} from "../../controllers/bookings/booking.controller.js";
import {
    getPendingBookings,
    approveBooking,
    rejectBooking,
    getApprovalStats
} from "../../controllers/bookings/booking.approval.controller.js";
import { protectedRoute } from "../../middlewares/protectedRoute.js";

const router = express.Router();

// Apply protected route middleware to all booking routes
router.use(protectedRoute);

router.post("/", createBooking);
router.get("/", getBookings);
router.get("/pending", getPendingBookings);
router.get("/approval-stats", getApprovalStats);
router.get("/:bookingId", getBookingById);
router.put("/:bookingId/approve", approveBooking);
router.put("/:bookingId/reject", rejectBooking);

export default router;
