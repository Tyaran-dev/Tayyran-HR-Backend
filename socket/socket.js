import { Server } from "socket.io";

let io;

export const initSocket = (server) => {
    io = new Server(server, {
        cors: {
            origin: "*", // allow all in development, CORS policy is separately controlled at app level
            methods: ["GET", "POST"]
        }
    });

    io.on("connection", (socket) => {
        console.log(`🔌 Client connected: ${socket.id}`);

        socket.on("join", ({ userId, companyId }) => {
            if (userId) {
                socket.join(`user_${userId}`);
                console.log(`User ${userId} joined room user_${userId}`);
            }
            if (companyId) {
                socket.join(`company_${companyId}`);
                console.log(`User joined company room company_${companyId}`);
            }
        });

        socket.on("disconnect", () => {
            console.log(`🔌 Client disconnected: ${socket.id}`);
        });
    });

    return io;
};

export const emitToUser = (userId, event, data) => {
    if (io) {
        io.to(`user_${userId}`).emit(event, data);
        console.log(`⚡ Emitted '${event}' to user_${userId}`);
    } else {
        console.warn("⚠️ Socket.io not initialized");
    }
};

export const emitToCompanyAdmins = (companyId, event, data) => {
    if (io) {
        // Emit to the whole company room. The client-side (frontend) will filter/handle roles
        // or we can structure specifically for company admin if needed.
        io.to(`company_${companyId}`).emit(event, data);
        console.log(`⚡ Emitted '${event}' to company_${companyId}`);
    } else {
        console.warn("⚠️ Socket.io not initialized");
    }
};
