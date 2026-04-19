import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import connectDB from "./config/db.js";

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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, ".env") });

const app = express();
const PORT = process.env.PORT || 4999;

// ═══════════════════════════════════════════════════════
//  CORS — allow Firebase + localhost + all origins
// ═══════════════════════════════════════════════════════
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
        // Allow requests with no origin (mobile apps, curl, etc.)
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        // Allow any origin for now to prevent CORS issues
        return callback(null, true);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
}));

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
    app.listen(PORT, () => {
        console.log(`🚀 Server running on port ${PORT}`);
    });
});

// Monitor MongoDB connection
mongoose.connection.on("disconnected", () => {
    console.warn("⚠️ MongoDB disconnected. Attempting reconnect...");
    setTimeout(() => connectDB(), 5000);
});

mongoose.connection.on("error", (err) => {
    console.error("❌ MongoDB connection error:", err.message);
});

// ═══════════════════════════════════════════════════════
//  Request Logger (helps debug issues in production)
// ═══════════════════════════════════════════════════════
app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
        const duration = Date.now() - start;
        if (res.statusCode >= 400) {
            console.log(`[${res.statusCode}] ${req.method} ${req.originalUrl} - ${duration}ms`);
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
        dbState: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    });
});

// ═══════════════════════════════════════════════════════
//  Keep-Alive Ping (prevents Render free tier sleep)
// ═══════════════════════════════════════════════════════
const SELF_URL = process.env.VITE_API_URL || `http://localhost:${PORT}`;

setInterval(() => {
    if (SELF_URL.includes("onrender.com")) {
        fetch(SELF_URL)
            .then(() => console.log("🏓 Keep-alive ping sent"))
            .catch(() => console.log("⚠️ Keep-alive ping failed (this is okay on startup)"));
    }
}, 14 * 60 * 1000); // Every 14 minutes (Render sleeps after 15)

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
    console.error("🔥 Unhandled error:", err.stack || err.message);
    res.status(500).json({
        success: false,
        message: "Internal server error",
    });
});

// Catch unhandled promise rejections
process.on("unhandledRejection", (reason) => {
    console.error("⚠️ Unhandled Promise Rejection:", reason);
});

// Catch uncaught exceptions
process.on("uncaughtException", (err) => {
    console.error("💥 Uncaught Exception:", err);
    // Don't exit — keep server running
});
