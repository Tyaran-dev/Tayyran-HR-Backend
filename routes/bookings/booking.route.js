import express from "express";
import {
    getPendingFlightBookings,
    approveFlightBooking,
    rejectFlightBooking
} from "../../controllers/bookings/flightApproval.controller.js";
import { protectedRoute } from "../../middlewares/protectedRoute.js";

const router = express.Router();

// Apply protected route middleware to all booking routes
router.use(protectedRoute);

router.get("/pending", getPendingFlightBookings);
router.put("/:bookingId/approve", approveFlightBooking);
router.put("/:bookingId/reject", rejectFlightBooking);

export default router;
