import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import timeout from "connect-timeout";
import connectDB from "./config/db.js";
import logger from "./utils/logger.js";
import fs from "fs";

// Routes
import authRoutes from "./routes/authRoutes.js";
import productRoutes from "./routes/productRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import portfolioRoutes from "./routes/portfolioRoutes.js";
import statsRoutes from "./routes/statsRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";

// Models for inline routes (banners, settings, contact)
import Banner from "./models/Banner.js";
import Settings from "./models/Settings.js";
import Contact from "./models/Contact.js";
import { sendEmail } from "./utils/sendEmail.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, ".env") });

// ═══════════════════════════════════════════════════════
//  Environment Validation
// ═══════════════════════════════════════════════════════
const requiredEnv = ["JWT_SECRET", "MONGO_URI"];
requiredEnv.forEach((key) => {
    if (!process.env[key]) {
        console.error(`❌ CRITICAL: ${key} is missing from environment variables`);
        process.exit(1);
    }
});

const app = express();
const PORT = process.env.PORT || 4999;

// ═══════════════════════════════════════════════════════
//  Security & Middlewares
// ═══════════════════════════════════════════════════════
app.use(helmet());

const allowedOrigins = [
    "https://octoinkstudios-2b582.web.app",
    "https://octoinkstudios-2b582.firebaseapp.com",
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:4173",
    "http://localhost:3000",
];

app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        return callback(null, true);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
}));

// Rate Limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200, // limit each IP to 200 requests per windowMs
    message: { success: false, message: "Too many requests, try again later" },
    standardHeaders: true,
    legacyHeaders: false,
});
app.use("/api/", limiter);

// Request Timeout
app.use(timeout("15s"));
app.use((req, res, next) => {
    if (!req.timedout) next();
});

// Handle preflight requests
app.options("*", cors());

// Middleware
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Static files (serve local uploads if they exist)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ═══════════════════════════════════════════════════════
//  MongoDB Connection with Reconnection Logic
// ═══════════════════════════════════════════════════════
connectDB().then(() => {
    const server = app.listen(PORT, () => {
        console.log(`🚀 Server running on port ${PORT}`);
    });
    server.timeout = 300000; // 5 minutes for large uploads
});

// Monitor MongoDB connection
mongoose.connection.on("disconnected", () => {
    console.warn("⚠️ MongoDB disconnected. Attempting reconnect...");
    setTimeout(() => connectDB(), 5000);
});

mongoose.connection.on("error", (err) => {
    console.error("❌ MongoDB connection error:", err.message);
});

// Request Logger (using Winston)
app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
        const duration = Date.now() - start;
        if (res.statusCode >= 400) {
            logger.warn(`${req.method} ${req.originalUrl} - [${res.statusCode}] ${duration}ms`);
        } else {
            logger.info(`${req.method} ${req.originalUrl} - [${res.statusCode}] ${duration}ms`);
        }
    });
    next();
});

// ═══════════════════════════════════════════════════════
//  Routes Integration
// ═══════════════════════════════════════════════════════
app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/portfolio", portfolioRoutes);
app.use("/api/stats", statsRoutes);
app.use("/api/payment", paymentRoutes);

// ─── Dashboard Specific Routes ────────────────────────
import { getClients, deleteClient, getClientById } from "./controllers/authController.js";
import { getPurchases } from "./controllers/orderController.js";
import { getDownloadHistory } from "./controllers/productController.js";

app.get("/api/clients", getClients);
app.get("/api/clients/:id", getClientById);
app.delete("/api/clients/:id", deleteClient);
app.get("/api/purchases", getPurchases);
app.get("/api/downloads/history", getDownloadHistory);


import multer from "multer";
import { portfolioStorage } from "./config/cloudinary.js";
const uploadBanner = multer({ storage: portfolioStorage });

// ─── Banner Routes (inline) ───────────────────────────
app.get("/api/banners", async (req, res) => {
    try {
        const banners = await Banner.find().sort({ order: 1 });
        res.json({ success: true, banners });
    } catch (err) {
        console.error("Banner fetch error:", err.message);
        res.status(500).json({ success: true, banners: [] });
    }
});

app.post("/api/banners", uploadBanner.single("image"), async (req, res) => {
    try {
        const payload = { ...req.body };
        if (req.file) payload.image = req.file.path;

        const banner = new Banner(payload);
        await banner.save();
        res.status(201).json({ success: true, banner });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.put("/api/banners/:id", uploadBanner.single("image"), async (req, res) => {
    try {
        const payload = { ...req.body };
        if (req.file) payload.image = req.file.path;

        const banner = await Banner.findByIdAndUpdate(req.params.id, payload, { new: true });
        res.json({ success: true, banner });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.delete("/api/banners/:id", async (req, res) => {
    try {
        await Banner.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: "Deleted" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── Settings Routes (inline) ─────────────────────────
app.get("/api/settings", async (req, res) => {
    try {
        let settings = await Settings.findOne();
        if (!settings) {
            settings = await Settings.create({ isStoreEnabled: true });
        }
        res.json({ success: true, settings });
    } catch (err) {
        console.error("Settings fetch error:", err.message);
        // Return defaults instead of error to prevent Store from breaking
        res.json({ success: true, settings: { isStoreEnabled: true, currency: "USD ($)" } });
    }
});

app.put("/api/settings", async (req, res) => {
    try {
        let settings = await Settings.findOne();
        if (!settings) {
            settings = new Settings(req.body);
        } else {
            Object.assign(settings, req.body);
            settings.updatedAt = new Date();
        }
        await settings.save();
        res.json({ success: true, settings });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── Contact Routes (inline) ──────────────────────────
app.get("/api/contact", async (req, res) => {
    try {
        const contacts = await Contact.find().sort({ createdAt: -1 });
        res.json({ success: true, contacts });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post("/api/contact", async (req, res) => {
    try {
        const contact = new Contact(req.body);
        await contact.save();

        // Send email notification
        const { name, email, service, message } = req.body;
        await sendEmail({
            subject: `New Contact Form Submission from ${name}`,
            text: `You have received a new message from the contact form.\n\nName: ${name}\nEmail: ${email}\nService: ${service || 'N/A'}\nMessage: ${message}`,
            html: `<p>You have received a new message from the contact form.</p>
                   <ul>
                       <li><strong>Name:</strong> ${name}</li>
                       <li><strong>Email:</strong> ${email}</li>
                       <li><strong>Service:</strong> ${service || 'N/A'}</li>
                   </ul>
                   <p><strong>Message:</strong></p>
                   <p>${message}</p>`,
            replyTo: email
        });

        res.status(201).json({ success: true, contact });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.delete("/api/contact/:id", async (req, res) => {
    try {
        await Contact.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: "Deleted" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ═══════════════════════════════════════════════════════
//  Health Check & Keep-Alive
// ═══════════════════════════════════════════════════════
app.get("/", (req, res) => {
    res.json({
        status: "running",
        message: "Octoink API is running...",
        dbState: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
        timestamp: new Date().toISOString(),
    });
});

app.get("/api/health", (req, res) => {
    res.json({
        success: true,
        status: "OK",
        uptime: process.uptime(),
        dbState: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
        timestamp: new Date().toISOString()
    });
});

// ═══════════════════════════════════════════════════════
//  Keep-Alive Ping (prevents Render free tier sleep) & Cron Jobs
// ═══════════════════════════════════════════════════════
const SELF_URL = process.env.VITE_API_URL || `http://localhost:${PORT}`;

setInterval(() => {
    if (SELF_URL.includes("onrender.com")) {
        fetch(SELF_URL)
            .then(() => console.log("🏓 Keep-alive ping sent"))
            .catch(() => console.log("⚠️ Keep-alive ping failed (this is okay on startup)"));
    }
}, 14 * 60 * 1000); // Every 14 minutes (Render sleeps after 15)

// Reconciliation Cron Job
import { reconcilePendingPayments } from './jobs/reconciliation.js';
setInterval(() => {
    reconcilePendingPayments().catch(err => console.error(JSON.stringify({ type: "cron_reconcile_error", error: err.message })));
}, 60 * 60 * 1000); // Run once every hour

// Run once 5 minutes after startup
setTimeout(() => {
    reconcilePendingPayments().catch(err => console.error(JSON.stringify({ type: "startup_reconcile_error", error: err.message })));
}, 5 * 60 * 1000);

// ═══════════════════════════════════════════════════════
//  Global Error Handlers
// ═══════════════════════════════════════════════════════

// 404 handler — catches requests to undefined routes
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: `Route not found: ${req.method} ${req.originalUrl}`,
    });
});

// Global error handler
app.use((err, req, res, next) => {
    if (req.timedout) {
        logger.error("Request Timeout:", { url: req.originalUrl });
        return res.status(503).json({ success: false, message: "Request timed out" });
    }
    
    logger.error("Unhandled error:", { 
        message: err.message, 
        stack: err.stack,
        url: req.originalUrl,
        method: req.method
    });
    
    res.status(500).json({
        success: false,
        message: process.env.NODE_ENV === 'production' ? "Internal server error" : err.message,
    });
});

// Catch unhandled promise rejections
process.on("unhandledRejection", (reason) => {
    logger.error("Unhandled Promise Rejection:", { reason });
});

// Catch uncaught exceptions
process.on("uncaughtException", (err) => {
    logger.error("Uncaught Exception:", { message: err.message, stack: err.stack });
});

// ═══════════════════════════════════════════════════════
//  Graceful Shutdown
// ═══════════════════════════════════════════════════════
import redis from "./utils/redis.js";

const gracefulShutdown = async (signal) => {
    logger.info(`🛰️ ${signal} received. Starting graceful shutdown...`);
    
    try {
        await mongoose.connection.close();
        logger.info("📁 MongoDB connection closed.");
        
        if (redis && typeof redis.quit === 'function') {
            await redis.quit();
            logger.info("⚡ Redis connection closed.");
        }
        
        logger.info("👋 Shutdown complete. Goodbye!");
        process.exit(0);
    } catch (err) {
        logger.error("❌ Error during shutdown:", { message: err.message });
        process.exit(1);
    }
};

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
