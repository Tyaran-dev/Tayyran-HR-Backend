import express from "express";
import {
    getPendingBookings,
    approveBooking,
    rejectBooking
} from "../../controllers/bookings/flightApproval.controller.js";
import { protectedRoute } from "../../middlewares/protectedRoute.js";

const router = express.Router();

// Apply protected route middleware to all booking routes
router.use(protectedRoute);

router.get("/pending", getPendingBookings);
router.put("/:bookingId/approve", approveBooking);
router.put("/:bookingId/reject", rejectBooking);

export default router;
