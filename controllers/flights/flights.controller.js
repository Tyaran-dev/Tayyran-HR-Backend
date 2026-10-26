import { ApiError } from "../../utils/apiError.js";
import axios from "axios";
import { getAmadeusToken } from "../../utils/amadeus-token.js";
import Airport from "../../models/airport.model.js";
import Airline from "../../models/Airline.model.js";
import { whiteListAirLines } from "../../data/whiteListAirLines.js";
import Booking from "../../models/Booking.model.js";
import Company from "../../models/Company.model.js";
import crypto from "crypto";

// helpers
import { formatDuration, formatTime, getBagInfo, generateTravllers, filterWhiteList, buildFormatedResponse } from "../../utils/helpers.js";

const presentageCommission = 5,
    presentageVat = 15;

export const flightOffers = async (req, res, next) => {
    try {
        const lang = req.get("lng") || "en"; // Default to English if no language header
        const {
            destinations,
            adults,
            children,
            infants,
            cabinClass,
            flightType,
            directFlight,
        } = req.body;
        const baseUrl = process.env.AMADEUS_BASE_URL;

        // Validate and prepare request to Amadeus API
        const token = await getAmadeusToken();

        console.log("Amadeus Token:", token); // Log the token for debugging
        const travelers = generateTravllers(adults, children, infants);

        if (infants > adults) {
            throw new ApiError(400, "Each infant must be accompanied by an adult");
        }

        // call amadeus api and get flight offers 
        const response = await axios.post(
            `${baseUrl}/v2/shopping/flight-offers`,
            {
                currencyCode: "SAR",
                originDestinations: destinations.map((dest, index) => ({
                    id: (index + 1).toString(),
                    originLocationCode: dest.from,
                    destinationLocationCode: dest.to,
                    departureDateTimeRange: {
                        date: dest.date,
                        time: "00:00:00",
                    },
                })),
                travelers,
                sources: ["GDS"],
                searchCriteria: {
                    maxFlightOffers: 250,
                    flightFilters: {
                        cabinRestrictions: [
                            {
                                cabin: cabinClass?.toUpperCase() || "ECONOMY",
                                coverage: "MOST_SEGMENTS",
                                originDestinationIds: destinations.map((_, i) =>
                                    (i + 1).toString()
                                ),
                            },
                        ],
                        carrierRestrictions: {
                            excludedCarrierCodes: ["ZZ"],
                        },
                        connectionRestrictions: {
                            maxNumberOfConnections: directFlight ? 0 : 3,
                        },
                    },
                },
            },
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
            }
        );

        // filter flight offers based on our wite list air lines 
        const whiteListedFlights = filterWhiteList(response);

        // Check if Amadeus returned data
        if (!whiteListedFlights || whiteListedFlights.length === 0) {
            return res.status(200).json({
                success: true,
                data: [],
                filters: {
                    carriers: [],
                    aircraft: {},
                    currencies: {},
                    locations: {},
                },
            });
        };


        const { formattedResponse, airlineMap } = await buildFormatedResponse(response, whiteListedFlights, flightType, lang, adults, children, infants, cabinClass);


        res.status(200).json({
            success: true,
            data: formattedResponse,
            filters: {
                carriers: airlineMap || {},
                aircraft: response.data.dictionaries?.aircraft || {},
                currencies: response.data.dictionaries?.currencies || {},
                locations: response.data.dictionaries?.locations || {},
            },
            presentageCommission, // <-- your markup percentage
            presentageVat,
        });


    } catch (error) {
        const errorMessage = error.response?.data || error.message;
        console.error("Amadeus API Error:", errorMessage);
        return next(new ApiError(500, errorMessage));

    }
}

export const flightPricing = async (req, res, next) => {
    try {
        const token = await getAmadeusToken();
        const flightOffer = req.body;
        const baseUrl = process.env.AMADEUS_BASE_URL;


        if (!flightOffer) return next(new ApiError(500, "flightOffer is required"));

        // Correct request body format
        const requestBody = {
            data: {
                type: "flight-offers-pricing",
                flightOffers: [flightOffer.originalResponse], // Use the originalResponse and wrap it in array
            },
        };

        const response = await axios.post(
            `${baseUrl}/v1/shopping/flight-offers/pricing`,
            requestBody, // Send requestBody directly, not wrapped in another object
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
            }
        );
        res.status(200).json({
            success: true,
            ...response.data,
            presentageCommission, // <-- your markup percentage
            presentageVat,
        });


    } catch (error) {
        const errorMessage = error.response?.data || error.message;
        console.error("Amadeus Pricing API Error:", errorMessage);
        return next(new ApiError(500, errorMessage));
    }
}

export const flightBooking = async (req, res, next) => {
    try {
        const { flightOffer, travelers, ticketingAgreement } = req.body;
        const companyUser = req.user;
        if (!companyUser || companyUser.role !== "company_hr") {
            return next(new ApiError(403, "Only company HR users can submit flight bookings for approval"));
        }
        if (!flightOffer || !Array.isArray(travelers) || travelers.length === 0) {
            return next(new ApiError(400, "A flight offer and at least one traveler are required"));
        }

        const selectedOffer = flightOffer.originalResponse || flightOffer;
        const quotedAmount = Number(selectedOffer.price?.grandTotal ?? selectedOffer.price?.total);
        const commissionAmount = quotedAmount * presentageCommission / 100;
        const priceWithCommission = quotedAmount + commissionAmount;
        const finalPrice = priceWithCommission + (commissionAmount * presentageVat / 100);
        if (!selectedOffer.id || !Number.isFinite(finalPrice) || finalPrice <= 0) {
            return next(new ApiError(400, "The flight offer is missing a valid ID or price"));
        }

        const bookingTravelers = travelers.map((traveler) => ({
            firstName: traveler.name?.firstName ?? traveler.firstName,
            lastName: traveler.name?.lastName ?? traveler.lastName,
            email: traveler.contact?.emailAddress ?? traveler.email,
            passportNumber: traveler.documents?.find((document) => document.documentType === "PASSPORT")?.number
        }));
        if (bookingTravelers.some((traveler) => !traveler.firstName || !traveler.lastName)) {
            return next(new ApiError(400, "Every traveler must include a first and last name"));
        }

        const company = await Company.findOne({ _id: companyUser.company, status: "active" });
        if (!company) {
            return next(new ApiError(403, "Your company is not active"));
        }

        const booking = await Booking.create({
            user: companyUser._id,
            company: company._id,
            bookingType: "flight",
            travelers: bookingTravelers,
            bookingPayload: {
                flightOffer: selectedOffer,
                travelers,
                ticketingAgreement: ticketingAgreement || null
            },
            bookingReference: `TYR-HR-${crypto.randomBytes(3).toString("hex").toUpperCase()}`,
            approvalStatus: "pending",
            status: "pending_approval",
            finalAmount: finalPrice,
            currency: selectedOffer.price.currency || "SAR"
        });

        return res.status(201).json({
            success: true,
            message: "Flight booking submitted for company admin approval",
            data: booking
        });

    } catch (error) {
        const errorMessage = error.response?.data || error.message;
        console.error("Create Booking Error:", errorMessage);
        return next(new ApiError(500, errorMessage));
    }
}

export const getFlightOrder = async (req, res, next) => {
    try {
        const token = await getAmadeusToken();
        const flightId = req.query.flightId;
        const baseUrl = process.env.AMADEUS_BASE_URL;

        if (!flightId) return next(new ApiError(400, "Missing flight id in request body"));

        const apiUrl = `${baseUrl}/v1/booking/flight-orders/${flightId}`;

        const response = await axios.get(apiUrl, {
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
        });
        res.status(201).json({
            message: "Flight Order Data",
            flightOrderData: response.data,
        });
    } catch (error) {
        console.error("Amadeus API Error:", error.response?.data || error.message);
        next(
            new ApiError(
                error.response?.status || 500,
                error.response?.data?.errors?.[0]?.detail || "Error get flight order"
            )
        );
    }
}