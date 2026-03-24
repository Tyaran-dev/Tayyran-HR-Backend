import { ApiError } from "../../utils/apiError.js";
import axios from "axios";
import { getAmadeusToken } from "../../utils/amadeus-token.js";
import Airport from "../../models/airport.model.js";
import Airline from "../../models/Airline.model.js";
import { whiteListAirLines } from "../../data/whiteListAirLines.js";

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
        const baseUrl = process.env.AMADEUS_TEST_URL;

        // Validate and prepare request to Amadeus API
        const token = await getAmadeusToken();
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
        const token = await getAmadeusToken();
        const { flightOffer, travelers, ticketingAgreement } = req.body;
        const baseUrl = process.env.AMADEUS_BASE_URL;
        const cardNumber = process.env.EASYPAY_CARD_NUMBER;
        const cardExpiry = process.env.EASYPAY_CARD_EXPIRY;


        if (!flightOffer || !travelers) {
            return next(new ApiError(400, "Missing flightOffer or travelers"));
        }

        // Build payload
        const payload = {
            data: {
                type: "flight-order",
                flightOffers: [flightOffer],
                travelers,
                formOfPayments: [
                    {
                        creditCard: {
                            brand: "EASYPAY",
                            number: cardNumber,
                            expiryDate: cardExpiry,
                            flightOfferIds: [flightOffer.id],
                        },
                    },
                ],
                ...(ticketingAgreement &&
                    Object.keys(ticketingAgreement).length > 0 && {
                    ticketingAgreement,
                }),
            },
        };

        console.log(flightOffer, "flightOffer from controller 2");
        console.log(payload, "payload 3");

        // 1️⃣ Create flight order
        const response = await axios.post(
            `${baseUrl}/v1/booking/flight-orders`,
            payload,
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
            }
        );

        let orderData = response.data; // mutable
        const flightOrderId = orderData.data.id;

        console.log(orderData.data, "after create order");

        console.log("create order from controlller 4");


        // 2️⃣ Apply FM commission
        const commissionPayload = {
            data: {
                type: "flight-order",
                commissions: [
                    {
                        controls: ["MANUAL"],
                        values: [
                            {
                                commissionType: "NEW",
                                percentage: 0.0, // FM0
                            },
                        ],
                    },
                ],
            },
        };

        await axios.patch(
            `${baseUrl}/v1/booking/flight-orders/${flightOrderId}`,
            commissionPayload,
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
            }
        );

        console.log("fm added 5");

        // 3️⃣ Issue ticket
        const issuanceRes = await axios.post(
            `${baseUrl}/v1/booking/flight-orders/${flightOrderId}/issuance`,
            {}, // no payload needed for issuance
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
            }
        );

        console.log("issuance done 6");
        
        // 4️⃣ Return issuance response (contains ticket info)
        return res.status(201).json({
            message:
                "Flight order created, commission applied, and ticket issued successfully",
            order: issuanceRes.data,
        });


    } catch (error) {
        const errorMessage = error.response?.data || error.message;
        console.error("Amadeus API Error:", errorMessage);
        next(
            new ApiError(
                error.response?.status || 500,
                errorMessage || "Error booking flights"
            )
        );
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