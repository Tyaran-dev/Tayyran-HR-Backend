import express from "express";
const router = express.Router();
import { getAmadeusToken } from "../../utils/amadeus-token.js";
import { getAirPort } from "../../controllers/flights/airports.controller.js";
import { flightOffers, flightPricing, flightBooking, getFlightOrder } from "../../controllers/flights/flights.controller.js";
import { protectedRoute } from "../../middlewares/protectedRoute.js";

router.get("/getairport", getAirPort);
router.get("/getFlightOrder", getFlightOrder);
router.post("/flight-search", flightOffers);
router.post("/flight-pricing", flightPricing);
router.post("/flight-booking", protectedRoute, flightBooking);

router.post("/token", getAmadeusToken);


export default router;
