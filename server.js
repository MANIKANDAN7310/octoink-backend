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
app.use(timeout("60s")); // Increased to 60s for uploads
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
import { getClients, deleteClient, getClientById, deleteAllClients } from "./controllers/authController.js";
import { getPurchases, deletePurchasesAll } from "./controllers/orderController.js";
import { getDownloadHistory } from "./controllers/productController.js";

app.get("/api/clients", getClients);
app.delete("/api/clients/delete-all", deleteAllClients);
app.get("/api/clients/:id([0-9a-fA-F]{24})", getClientById);
app.delete("/api/clients/:id([0-9a-fA-F]{24})", deleteClient);
app.get("/api/purchases", getPurchases);
app.delete("/api/purchases/delete-all", deletePurchasesAll);
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

app.put("/api/banners/reorder", async (req, res) => {
    try {
        const { banners } = req.body;
        if (!banners || !Array.isArray(banners)) {
            return res.status(400).json({ success: false, message: "Invalid banners data" });
        }

        const bulkOps = banners.map((b, index) => ({
            updateOne: {
                filter: { _id: b._id },
                update: { $set: { order: b.order ?? index } }
            }
        }));

        await Banner.bulkWrite(bulkOps);
        res.json({ success: true, message: "Order updated" });
    } catch (err) {
        console.error("Reorder error:", err.message);
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
        const { name, email, service, message } = req.body;

        if (!email || !email.includes("@")) {
            console.warn(`[CONTACT_REJECTED] Rejected contact request due to missing/invalid email.`);
            return res.status(400).json({ success: false, message: "Valid email address is required." });
        }

        const contact = new Contact(req.body);
        await contact.save();

        console.log(`[CONTACT_REQUEST_START] Received contact from: ${name} (${email})`);
        // Send email notification
        console.log(`[BEFORE_SEND_EMAIL] Attempting to send email for: ${email}`);
        const contactHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; background: #f4f4f4; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
    <div style="background: linear-gradient(135deg, #7c3aed, #4f46e5); padding: 30px; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 24px;">New Website Enquiry</h1>
      <p style="color: rgba(255,255,255,0.8); margin: 8px 0 0;">Octoink Studios</p>
    </div>
    <div style="padding: 30px;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 12px 16px; font-weight: bold; color: #7c3aed; width: 40%; border-bottom: 1px solid #ede9fe;">Name</td>
          <td style="padding: 12px 16px; border-bottom: 1px solid #ede9fe;">${name || 'N/A'}</td>
        </tr>
        <tr style="background: #f8f5ff;">
          <td style="padding: 12px 16px; font-weight: bold; color: #7c3aed; border-bottom: 1px solid #ede9fe;">Email</td>
          <td style="padding: 12px 16px; border-bottom: 1px solid #ede9fe;">${email}</td>
        </tr>
        <tr>
          <td style="padding: 12px 16px; font-weight: bold; color: #7c3aed; border-bottom: 1px solid #ede9fe;">Service Interested In</td>
          <td style="padding: 12px 16px; border-bottom: 1px solid #ede9fe;">${service || "N/A"}</td>
        </tr>
      </table>
      ${message ? `<div style="margin-top: 24px; padding: 16px; background: #f8f5ff; border-left: 4px solid #7c3aed; border-radius: 4px;"><p style="font-weight: bold; color: #7c3aed; margin: 0 0 8px;">Message:</p><p style="margin: 0; color: #333; line-height: 1.6;">${message.replace(/\n/g, '<br/>')}</p></div>` : ""}
    </div>
    <div style="background: #f8f5ff; padding: 16px; text-align: center;">
      <p style="margin: 0; color: #888; font-size: 12px;">This is an automated notification from Octoink Studios</p>
    </div>
  </div>
</body>
</html>`;

        const emailResult = await sendEmail({
            name,
            email,
            service,
            message,
            replyTo: email,
            subject: `📩 New Contact Enquiry from ${name || email}`,
            text: `Name: ${name || 'N/A'}\nEmail: ${email}\nService: ${service || 'N/A'}\nMessage: ${message || 'N/A'}`,
            html: contactHtml
        });
        
        console.log(`[AFTER_SEND_EMAIL] Email result success: ${emailResult.success}`);

        if (!emailResult.success) {
            const errorMsg = emailResult.error ? emailResult.error.message : 'Unknown error';
            console.error(`[EMAIL_ERROR] Email notification could not be delivered, but contact was saved in DB. Error:`, errorMsg);
            return res.status(500).json({ success: false, message: 'Contact saved but unable to send email notification.', debug_error: errorMsg });
        }

        console.log(`[CONTACT_REQUEST_END] Successfully processed contact for: ${name}`);
        res.status(201).json({ success: true, contact, message: 'Message sent successfully!' });
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
app.get("/api/version", (req, res) => {
    res.json({ version: "v2-purple-template", commit: "ca305da" });
});

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
