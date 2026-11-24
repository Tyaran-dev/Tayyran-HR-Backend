import axios from 'axios';
import { ApiError } from './apiError.js';

export const getAmadeusToken = async () => {
    try {
        const clientId = process.env.AMADEUS_TEST_API_KEY,
            clientSecret = process.env.AMADEUS_TEST_API_SECRET,
            baseUrl = process.env.AMADEUS_TEST_URL;


        if (!clientId || !clientSecret) {
            throw new Error("Amadeus Client ID or Secret is not set in environment variables.");
        };

        const payload = new URLSearchParams();
        payload.append("grant_type", "client_credentials");
        payload.append("client_id", clientId);
        payload.append("client_secret", clientSecret);

        const response = await axios.post(
            `${baseUrl}/v1/security/oauth2/token`,
            payload,
            {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
            }
        )

        const { access_token, expires_in } = response.data;

        console.log("Access token retrieved:", access_token);
        console.log(`Token expires in ${expires_in} seconds.`);

        return access_token;
    } catch (error) {
        const errorMessage = error.response?.data || error.message;
        console.error("Error retrieving Amadeus token:", errorMessage);
        return next(new ApiError(500, errorMessage));
    }
}