import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import http from "http";
import cookieParser from "cookie-parser";
import connectMongoDB from "./db/connectMongoDB.js";
import { ApiError } from "./utils/apiError.js";
import { initSocket } from "./socket/socket.js";

// Routes
import flightRoutes from "./routes/flights/flights.route.js";
import authRoutes from "./routes/auth/auth.route.js";
import companyRoutes from "./routes/company/company.route.js";
import bookingRoutes from "./routes/bookings/booking.route.js";
import employeeRoutes from "./routes/employees/employee.route.js";
import userRoutes from "./routes/users/user.route.js";

dotenv.config();
const app = express();
const server = http.createServer(app);

// Initialize Socket.io
initSocket(server);

const allowedOrigins = [
  'http://localhost:4025',  // development
  //   'xxxxxxx'     // production
];

app.use(cors({
  origin: function (origin, callback) {
    // allow requests with no origin like mobile apps or curl
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  credentials: true,  // <-- allow cookies
}));
const PORT = process.env.PORT || 3000;

app.use(cookieParser());
app.use(express.json());

// Routes configuration
app.use("/flights", flightRoutes);
app.use("/auth", authRoutes);
app.use("/companies", companyRoutes);
app.use("/bookings", bookingRoutes);
app.use("/employees", employeeRoutes);
app.use("/users", userRoutes);

// Error-handling middleware
app.use((err, req, res, next) => {
  console.error("🔥 ERROR:", err);

  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      status: err.status,
      message: err.message,
    });
  }

  // Unexpected error (not ApiError)
  return res.status(500).json({
    status: "error",
    message: err.message || "Something went wrong on the server",
  });
});

server.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  connectMongoDB();
});


