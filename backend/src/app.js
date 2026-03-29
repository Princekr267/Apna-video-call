// Load environment variables FIRST (before any other imports that use them)
import 'dotenv/config';

import express from "express";
import {createServer} from "node:http";
import {Server} from "socket.io";
import mongoose from "mongoose";
import cors from "cors";

import {connectToSocket} from "./controllers/socketManager.js";

import userRoutes from "./routes/users.routes.js";

import passport from "./config/passport.js";


const app = express();
const server = createServer(app);
const io = connectToSocket(server);

app.set("port", (process.env.PORT || 3000));

// CORS configuration - allow multiple origins for dev and production
const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:3000',
    'https://conferenceworld.onrender.com',
    process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (mobile apps, curl, Postman, etc.)
        if (!origin) return callback(null, true);

        if (allowedOrigins.includes(origin)) {
            callback(null, origin);
        } else {
            // Log for debugging
            console.log('CORS blocked origin:', origin);
            callback(null, origin); // Allow anyway for now
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({limit: "40kb"}));
app.use(express.urlencoded({limit: "40kb", extended: true}));

// Initialize passport BEFORE routes
app.use(passport.initialize());

app.use("/api/v1/users", userRoutes);

app.get("/home", (req, res) => {
    return res.json({"Page" : "home"});
});

// Health check endpoint
app.get("/health", (req, res) => {
    return res.json({
        status: "ok",
        timestamp: new Date().toISOString(),
        cors: {
            allowedOrigins: allowedOrigins
        }
    });
});

const start = async () => {
    try {
        const connectionDB = await mongoose.connect(process.env.MONGODB_URI, {
            serverSelectionTimeoutMS: 5000 // 5 second timeout
        });
        console.log(`MongoDB is connected to ${connectionDB.connection.host}`);

        server.listen(app.get("port"), () => {
            console.log("Server is listening on port:", app.get("port"));
        });
    } catch (error) {
        console.error("MongoDB connection failed:", error.message);
        console.log("Please ensure MongoDB is running locally or update MONGODB_URI in .env to use cloud MongoDB");
        process.exit(1);
    }
};
start();