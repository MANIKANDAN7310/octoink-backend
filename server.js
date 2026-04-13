import express from "express";
import cors from "cors";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import mongoose from "mongoose";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import dns from "dns";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import Razorpay from "razorpay";
import crypto from "crypto";

// Forcing Google DNS to resolve MongoDB and Gmail hostnames more reliably
dns.setServers(["8.8.8.8", "1.1.1.1"]);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, ".env") });

const app = express();
const PORT = process.env.PORT || 4999;

app.use(cors());
app.use(express.json());
app.use("/uploads/images", cors(), express.static(path.join(__dirname, "uploads/images")));
app.use("/uploads/files", cors(), express.static(path.join(__dirname, "uploads/files"), {
    setHeaders: (res) => {
        res.setHeader('Content-Disposition', 'attachment');
    }
}));

// ── Razorpay Instance ─────────────────────────────────────
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// ── MongoDB ───────────────────────────────────────────────
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log("✅ MongoDB Connected");

        app.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT}`);
        });

    })
    .catch(err => console.log("❌ MongoDB Error:", err));
// ── Product Schema ────────────────────────────────────────
const productSchema = new mongoose.Schema({
    title: { type: String, required: true },
    category: { type: String, required: true },
    price: { type: Number, required: true },
    originalPrice: { type: Number },
    description: { type: String },
    tags: { type: String },
    image: { type: String },
    extraImages: [{ type: String }],
    file: { type: String },
    downloads: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
});
const Product = mongoose.model("Product", productSchema);

// ── Banner Schema ─────────────────────────────────────────
const bannerSchema = new mongoose.Schema({
    imageUrl: { type: String },
    image: { type: String },
    heading: { type: String, required: true },
    subHeading: { type: String },
    description: { type: String },
    button1Text: { type: String },
    button1Link: { type: String },
    button2Text: { type: String },
    button2Link: { type: String },
    order: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
});
const Banner = mongoose.model("Banner", bannerSchema);

// ── CustomDesign Schema ───────────────────────────────────
const customDesignSchema = new mongoose.Schema({
    email: { type: String, required: true },
    fileName: { type: String },
    category: { type: String },
    width: { type: String },
    height: { type: String },
    colors: { type: String },
    requirement: { type: String },
    designFile: { type: String },
    designFileOriginalName: { type: String },
    refFiles: [{ path: String, originalName: String }],
    createdAt: { type: Date, default: Date.now },
});
const CustomDesign = mongoose.model("CustomDesign", customDesignSchema);

// ── Contact Schema (NEW) ──────────────────────────────────
const contactSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true },
    service: { type: String },
    message: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
});
const Contact = mongoose.model("Contact", contactSchema);

// ── User Schema ───────────────────────────────────────────
const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    downloadHistory: [
        {
            productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
            productTitle: String,
            downloadedAt: { type: Date, default: Date.now },
            paymentId: { type: String }, // For uniqueness
        },
    ],
    createdAt: { type: Date, default: Date.now },
});
const User = mongoose.model("User", userSchema);

// ── Order Schema ──────────────────────────────────────────
const orderSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    items: [
        {
            productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
            title: String,
            quantity: { type: Number, default: 1 },
            price: Number,
        },
    ],
    totalAmount: { type: Number, required: true },
    currency: { type: String, default: "INR" },
    razorpayOrderId: { type: String, required: true },
    razorpayPaymentId: { type: String },
    razorpaySignature: { type: String },
    status: { type: String, default: "Pending" },
    orderType: { type: String, default: "Product" },
    clientInfo: {
        name: String,
        email: String,
        phone: String,
        address: String,
        city: String,
        country: String,
        companyName: String,
    },
    customDesignId: { type: mongoose.Schema.Types.ObjectId, ref: "CustomDesign" },
    createdAt: { type: Date, default: Date.now },
});
const Order = mongoose.model("Order", orderSchema);

// ── Download Schema (NEW - for tracking) ──────────────────
const downloadSchema = new mongoose.Schema({
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
    email: { type: String },
    productName: { type: String },
    category: { type: String },
    price: { type: Number },
    downloadsCount: { type: Number, default: 1 },
    date: { type: Date, default: Date.now },
    fileUrl: { type: String },
    productImage: { type: String },
    isCustomOrder: { type: Boolean, default: false },
    paymentId: { type: String }, // For uniqueness logic
});
const Download = mongoose.model("Download", downloadSchema);

// ── Client Schema (NEW - for dashboard tracking) ──────────
const clientSchema = new mongoose.Schema({
    client_name: { type: String },
    company_name: { type: String, default: "N/A" },
    location: { type: String, default: "N/A" },
    email: { type: String, required: true, unique: true },
    createdAt: { type: Date, default: Date.now }
});
const Client = mongoose.model("Client", clientSchema);

// ── Settings Schema (NEW) ─────────────────────────────────
const settingsSchema = new mongoose.Schema({
    isStoreEnabled: { type: Boolean, default: true },
    currency: { type: String, default: "USD ($)" },
    updatedAt: { type: Date, default: Date.now },
});
const Settings = mongoose.model("Settings", settingsSchema);

// ── Middlewares ──────────────────────────────────────────
const verifyToken = (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ success: false, message: "No token" });
    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch {
        res.status(401).json({ success: false, message: "Invalid token" });
    }
};

const checkStoreStatus = async (req, res, next) => {
    try {
        const settings = await Settings.findOne();
        if (settings && settings.isStoreEnabled === false) {
            return res.status(503).json({ success: false, message: "Store is currently unavailable", isStoreDisabled: true });
        }
        next();
    } catch (err) {
        next();
    }
};

// ── Multer Storage ────────────────────────────────────────
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const isImage = file.mimetype.startsWith("image");
        const folder = isImage ? "uploads/images" : "uploads/files";
        fs.mkdirSync(path.join(__dirname, folder), { recursive: true });
        cb(null, path.join(__dirname, folder));
    },
    filename: (req, file, cb) => {
        const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
        cb(null, unique + path.extname(file.originalname));
    },
});
const upload = multer({ storage });

// ── PRODUCT ROUTES ────────────────────────────────────────
app.get("/api/products", async (req, res) => {
    try {
        const products = await Product.find().sort({ createdAt: -1 });
        res.json({ success: true, products });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get("/api/products/:id", async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) return res.status(404).json({ success: false, message: "Not found" });
        res.json({ success: true, product });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post("/api/products",
    upload.fields([
        { name: "image", maxCount: 1 },
        { name: "extraImages", maxCount: 3 },
        { name: "file", maxCount: 1 },
    ]),
    async (req, res) => {
        try {
            const { title, category, price, originalPrice, description, tags } = req.body;
            const imagePath = req.files?.image?.[0] ? "uploads/images/" + req.files.image[0].filename : "";
            const extraImagePaths = (req.files?.extraImages || []).map(f => "uploads/images/" + f.filename);
            const filePath = req.files?.file?.[0] ? "uploads/files/" + req.files.file[0].filename : "";
            const product = new Product({ title, category, price, originalPrice, description, tags, image: imagePath, extraImages: extraImagePaths, file: filePath });
            await product.save();
            res.status(201).json({ success: true, product });
        } catch (err) {
            res.status(500).json({ success: false, message: err.message });
        }
    }
);

app.put("/api/products/:id",
    upload.fields([
        { name: "image", maxCount: 1 },
        { name: "extraImages", maxCount: 3 },
        { name: "file", maxCount: 1 },
    ]),
    async (req, res) => {
        try {
            const updates = { ...req.body };
            if (req.files?.image?.[0]) updates.image = "uploads/images/" + req.files.image[0].filename;
            if (req.files?.extraImages) updates.extraImages = req.files.extraImages.map(f => "uploads/images/" + f.filename);
            if (req.files?.file?.[0]) updates.file = "uploads/files/" + req.files.file[0].filename;
            const product = await Product.findByIdAndUpdate(req.params.id, updates, { new: true });
            if (!product) return res.status(404).json({ success: false, message: "Not found" });
            res.json({ success: true, product });
        } catch (err) {
            res.status(500).json({ success: false, message: err.message });
        }
    }
);

app.delete("/api/products/:id", async (req, res) => {
    try {
        const product = await Product.findByIdAndDelete(req.params.id);
        if (!product) return res.status(404).json({ success: false, message: "Not found" });
        res.json({ success: true, message: "Deleted" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.patch("/api/products/:id/download", async (req, res) => {
    try {
        const { email, paymentId } = req.body;
        const productId = req.params.id;

        // Check if there is already a download record with this paymentId and productId to prevent duplication
        if (paymentId) {
            const existingDownload = await Download.findOne({ productId, paymentId });
            if (existingDownload) {
                return res.json({ success: true, message: "Download already recorded", downloads: 0 }); // We don't increment again
            }
        }

        const product = await Product.findByIdAndUpdate(productId, { $inc: { downloads: 1 } }, { new: true });
        if (!product) return res.status(404).json({ success: false, message: "Product not found" });

        // Record detailed download log
        const downloadRecord = new Download({
            productId: product._id,
            email: email || "Anonymous",
            productName: product.title,
            category: product.category,
            price: product.price,
            fileUrl: product.file,
            productImage: product.image,
            paymentId: paymentId || null,
        });
        await downloadRecord.save();

        const token = req.headers.authorization?.split(" ")[1];
        if (token) {
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);

                // Add to history only if it's not already there with the same paymentId
                const user = await User.findById(decoded.id);
                const alreadyInHistory = user.downloadHistory.some(d =>
                    d.productId.toString() === productId && d.paymentId === paymentId
                );

                if (!alreadyInHistory) {
                    await User.findByIdAndUpdate(decoded.id, {
                        $push: {
                            downloadHistory: {
                                productId: product._id,
                                productTitle: product.title,
                                downloadedAt: new Date(),
                                paymentId: paymentId || null,
                            },
                        },
                    });
                }
            } catch (err) {
                console.log("Token verification failed in download route:", err.message);
            }
        }
        res.json({ success: true, downloads: product.downloads });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Alias for dashboard frontend (POST instead of PATCH) - unified to prevent duplication
app.post("/api/products/download/:id", async (req, res) => {
    // Just reuse the same logic
    const { email, paymentId } = req.body;
    const productId = req.params.id;

    try {
        if (paymentId) {
            const existingDownload = await Download.findOne({ productId, paymentId });
            if (existingDownload) {
                return res.json({ success: true, message: "Already recorded", downloads: 0 });
            }
        }

        const product = await Product.findByIdAndUpdate(productId, { $inc: { downloads: 1 } }, { new: true });
        if (product) {
            const downloadRecord = new Download({
                productId: product._id,
                email: email || "Anonymous",
                productName: product.title,
                category: product.category,
                price: product.price,
                fileUrl: product.file,
                productImage: product.image,
                paymentId: paymentId || null,
            });
            await downloadRecord.save();
        }
        res.json({ success: true, downloads: product?.downloads || 0 });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── AUTH ROUTES ───────────────────────────────────────────
app.post("/api/auth/register", async (req, res) => {
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password) return res.status(400).json({ success: false, message: "All fields required" });
        const existingUser = await User.findOne({ email });
        if (existingUser) return res.status(400).json({ success: false, message: "User already exists" });
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({ name, email, password: hashedPassword });
        await user.save();
        const token = jwt.sign({ id: user._id, email: user.email }, process.env.JWT_SECRET, { expiresIn: "7d" });
        res.status(201).json({ success: true, token, user: { name: user.name, email: user.email } });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post("/api/auth/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ success: false, message: "User not found" });
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ success: false, message: "Invalid credentials" });
        const token = jwt.sign({ id: user._id, email: user.email }, process.env.JWT_SECRET, { expiresIn: "7d" });
        res.json({ success: true, token, user: { name: user.name, email: user.email } });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get("/api/auth/profile", verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select("-password");
        res.json({ success: true, user });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── BANNER ROUTES ─────────────────────────────────────────
app.get("/api/banners", async (req, res) => {
    try {
        let banners = await Banner.find().sort({ order: 1 });
        if (banners.length === 0) {
            const defaultBanners = [
                {
                    imageUrl: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTwhGCCKhNF2OQSeM3i_HEHkcLVvXI4SDG_Ew&s",
                    heading: "Transform Your Brand", subHeading: "Stunning Custom Designs",
                    description: "Expert enamel pins, vector art, and embroidery design.",
                    button1Text: "Start Your Project", button1Link: "#services",
                    button2Text: "View Our Work", button2Link: "#portfolio", order: 1
                },
                {
                    imageUrl: "https://images-cdn.ubuy.co.in/63a34c27da9b6328f52b7822-benbo-9-pieces-cute-enamel-pins-set.jpg",
                    heading: "Premium Enamel Pins", subHeading: "Crafted with Precision",
                    description: "High-quality pins for every occasion.",
                    button1Text: "Order Now", button1Link: "#services",
                    button2Text: "Portfolio", button2Link: "#portfolio", order: 2
                }
            ];
            await Banner.insertMany(defaultBanners);
            banners = await Banner.find().sort({ order: 1 });
        }
        res.json({ success: true, banners });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post("/api/banners",
    upload.fields([{ name: "image", maxCount: 1 }]),
    async (req, res) => {
        try {
            const { mainHeading, subHeading, description, button1Text, button1Link, button2Text, button2Link, order } = req.body;
            if (!mainHeading) return res.status(400).json({ success: false, message: "Heading is required" });
            const imagePath = req.files?.image?.[0] ? "uploads/images/" + req.files.image[0].filename : "";
            const banner = new Banner({
                heading: mainHeading,
                subHeading, description, button1Text, button1Link, button2Text, button2Link,
                image: imagePath,
                order: order ?? 0,
            });
            await banner.save();
            res.status(201).json({ success: true, banner });
        } catch (err) {
            res.status(500).json({ success: false, message: err.message });
        }
    }
);

app.put("/api/banners/reorder", async (req, res) => {
    try {
        const { banners } = req.body;
        const bulkOps = banners.map(b => ({
            updateOne: { filter: { _id: b._id }, update: { $set: { order: b.order } } }
        }));
        await Banner.bulkWrite(bulkOps);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.put("/api/banners/:id",
    upload.fields([{ name: "image", maxCount: 1 }]),
    async (req, res) => {
        try {
            const { mainHeading, subHeading, description, button1Text, button1Link, button2Text, button2Link } = req.body;
            const updates = { heading: mainHeading, subHeading, description, button1Text, button1Link, button2Text, button2Link };
            if (req.files?.image?.[0]) updates.image = "uploads/images/" + req.files.image[0].filename;
            const banner = await Banner.findByIdAndUpdate(req.params.id, updates, { new: true });
            if (!banner) return res.status(404).json({ success: false, message: "Banner not found" });
            res.json({ success: true, banner });
        } catch (err) {
            res.status(500).json({ success: false, message: err.message });
        }
    }
);

app.delete("/api/banners/:id", async (req, res) => {
    try {
        const banner = await Banner.findByIdAndDelete(req.params.id);
        if (!banner) return res.status(404).json({ success: false, message: "Not found" });
        res.json({ success: true, message: "Deleted" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── NODEMAILER ────────────────────────────────────────────
const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com", port: 587, secure: false,
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});

transporter.verify((error) => {
    if (error) console.log("❌ Nodemailer Error:", error);
    else console.log("✅ Nodemailer Ready");
});

// ── CONTACT ROUTES ────────────────────────────────────────

// POST - save to MongoDB + send email
app.post("/api/contact", async (req, res) => {
    const { name, email, service, message } = req.body;
    if (!name || !email || !message)
        return res.status(400).json({ success: false, message: "Name, email, message required." });
    try {
        // Save to MongoDB
        const contact = new Contact({ name, email, service, message });
        await contact.save();

        // Send email
        await transporter.sendMail({
            from: `"Website Contact" <${process.env.EMAIL_USER}>`,
            to: process.env.EMAIL_USER,
            subject: `New Contact Message from ${name}`,
            text: `Name: ${name}\nEmail: ${email}\nService: ${service || "N/A"}\n\nMessage:\n${message}`,
        });
        res.status(200).json({ success: true, message: "Message sent!" });
    } catch (error) {
        console.error("❌ Email Error:", error);
        res.status(500).json({ success: false, message: "Failed to send." });
    }
});

// GET - all contact messages for dashboard
app.get("/api/contact", async (req, res) => {
    try {
        const messages = await Contact.find().sort({ createdAt: -1 });
        res.json({ success: true, messages });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// DELETE - a contact message
app.delete("/api/contact/:id", async (req, res) => {
    try {
        const contact = await Contact.findByIdAndDelete(req.params.id);
        if (!contact) return res.status(404).json({ success: false, message: "Not found" });
        res.json({ success: true, message: "Deleted" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── CUSTOM DESIGN ROUTE ───────────────────────────────────
app.post("/api/custom-design",
    upload.fields([
        { name: "file", maxCount: 1 },
        { name: "refFiles", maxCount: 10 }
    ]),
    async (req, res) => {
        try {
            const { fileName, category, width, height, colors, requirement, email } = req.body;
            if (!email) return res.status(400).json({ success: false, message: "Email is required." });

            const designFileData = req.files?.file?.[0]
                ? { path: "uploads/images/" + req.files.file[0].filename, originalName: req.files.file[0].originalname }
                : null;
            const refFilesData = (req.files?.refFiles || []).map(f => ({
                path: f.mimetype.startsWith("image") ? "uploads/images/" + f.filename : "uploads/files/" + f.filename,
                originalName: f.originalname,
            }));

            const newOrder = new CustomDesign({
                email,
                fileName: fileName || designFileData?.originalName || "N/A",
                category: category || "N/A",
                width: width || "N/A",
                height: height || "N/A",
                colors: colors || "N/A",
                requirement: requirement || "",
                designFile: designFileData?.path || "",
                designFileOriginalName: designFileData?.originalName || "",
                refFiles: refFilesData,
            });
            await newOrder.save();

            // Send email notification immediately (Payment no longer mandatory)
            try {
                let attachments = [];
                if (designFileData) {
                    attachments.push({ filename: designFileData.originalName || "design", path: path.join(__dirname, designFileData.path) });
                }
                if (refFilesData && refFilesData.length > 0) {
                    refFilesData.forEach(ref => {
                        attachments.push({ filename: ref.originalName, path: path.join(__dirname, ref.path) });
                    });
                }

                const htmlBody = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; background: #f4f4f4; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
    <div style="background: linear-gradient(135deg, #7c3aed, #4f46e5); padding: 30px; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 24px;">New Custom Design Order</h1>
      <p style="color: rgba(255,255,255,0.8); margin: 8px 0 0;">Octoink Studio</p>
    </div>
    <div style="padding: 30px;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 12px 16px; font-weight: bold; color: #7c3aed; width: 40%; border-bottom: 1px solid #ede9fe;">From</td>
          <td style="padding: 12px 16px; border-bottom: 1px solid #ede9fe;">${email}</td>
        </tr>
        <tr style="background: #f8f5ff;">
          <td style="padding: 12px 16px; font-weight: bold; color: #7c3aed; border-bottom: 1px solid #ede9fe;">Category</td>
          <td style="padding: 12px 16px; border-bottom: 1px solid #ede9fe;">${category || "N/A"}</td>
        </tr>
        <tr>
          <td style="padding: 12px 16px; font-weight: bold; color: #7c3aed; border-bottom: 1px solid #ede9fe;">File Name</td>
          <td style="padding: 12px 16px; border-bottom: 1px solid #ede9fe;">${fileName || "N/A"}</td>
        </tr>
        <tr style="background: #f8f5ff;">
          <td style="padding: 12px 16px; font-weight: bold; color: #7c3aed; border-bottom: 1px solid #ede9fe;">Size</td>
          <td style="padding: 12px 16px; border-bottom: 1px solid #ede9fe;">${width || "N/A"} × ${height || "N/A"}</td>
        </tr>
        <tr>
          <td style="padding: 12px 16px; font-weight: bold; color: #7c3aed; border-bottom: 1px solid #ede9fe;">Colors</td>
          <td style="padding: 12px 16px; border-bottom: 1px solid #ede9fe;">${colors || "N/A"}</td>
        </tr>
      </table>
      ${requirement ? `<div style="margin-top: 24px; padding: 16px; background: #f8f5ff; border-left: 4px solid #7c3aed; border-radius: 4px;"><p style="font-weight: bold; color: #7c3aed; margin: 0 0 8px;">Requirements:</p><p style="margin: 0; color: #333; line-height: 1.6;">${requirement}</p></div>` : ""}
      ${attachments.length > 0 ? `<div style="margin-top: 24px; padding: 16px; background: #f0fdf4; border-radius: 8px; border: 1px solid #bbf7d0;"><p style="font-weight: bold; color: #16a34a; margin: 0 0 8px;">📎 ${attachments.length} file(s) attached</p>${attachments.map(a => `<p style="margin: 4px 0; color: #555; font-size: 14px;">• ${a.filename}</p>`).join("")}</div>` : ""}
    </div>
    <div style="background: #f8f5ff; padding: 16px; text-align: center;">
      <p style="margin: 0; color: #888; font-size: 12px;">This is an automated notification from Octoink Studio</p>
    </div>
  </div>
</body>
</html>`;

                await transporter.sendMail({
                    from: `"Octoink Orders" <${process.env.EMAIL_USER}>`,
                    to: process.env.EMAIL_USER,
                    subject: `🎨 NEW: ${category || "Custom"} Design from ${email}`,
                    html: htmlBody,
                    attachments,
                });
            } catch (emailErr) {
                console.error("❌ Email sending failed for custom design submission:", emailErr);
                // We still treat the submission as success since it's saved to DB
            }

            res.status(200).json({ success: true, message: "Custom design submitted successfully!", customDesignId: newOrder._id });
        } catch (error) {
            console.error("❌ Custom Design Error:", error);
            res.status(500).json({ success: false, message: "Failed to submit custom design." });
        }
    }
);

// ── PAYMENT ROUTES ────────────────────────────────────────
app.post("/api/payment/create-order", async (req, res) => {
    console.log("POST /api/payment/create-order - Body:", req.body);
    try {
        const { amount, currency, items, clientInfo, orderType, customDesignId } = req.body;

        const options = {
            amount: Math.round(amount * 100), // convert to paisa
            currency: currency || "INR",
            receipt: `receipt_${Date.now()}`,
        };

        const razorpayOrder = await razorpay.orders.create(options);

        // Save order to database as Pending
        const newOrder = new Order({
            items,
            totalAmount: amount,
            currency: options.currency,
            razorpayOrderId: razorpayOrder.id,
            status: "Pending",
            orderType: orderType || "Product",
            clientInfo,
            customDesignId
        });

        const token = req.headers.authorization?.split(" ")[1];
        if (token) {
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                newOrder.userId = decoded.id;
            } catch (err) {
                console.log("Token verification failed in create-order:", err.message);
            }
        }

        await newOrder.save();

        res.json({
            success: true,
            orderId: razorpayOrder.id,
            amount: razorpayOrder.amount,
            currency: razorpayOrder.currency
        });
    } catch (err) {
        console.error("Razorpay Error:", err);
        res.status(500).json({ success: false, message: "Payment initialization failed." });
    }
});

app.post("/api/payment/verify", async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

        const sign = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSign = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(sign.toString())
            .digest("hex");

        if (razorpay_signature === expectedSign) {
            // Update order status in DB
            const order = await Order.findOneAndUpdate(
                { razorpayOrderId: razorpay_order_id },
                {
                    status: "Paid",
                    razorpayPaymentId: razorpay_payment_id,
                    razorpaySignature: razorpay_signature,
                },
                { new: true }
            );

            // Upsert Client for tracking (from Dashboard logic)
            if (order && order.clientInfo && order.clientInfo.email) {
                const email = order.clientInfo.email.toLowerCase();
                await Client.findOneAndUpdate(
                    { email },
                    {
                        $set: {
                            client_name: order.clientInfo.name || email.split('@')[0],
                            company_name: order.clientInfo.companyName,
                            location: order.clientInfo.country || order.clientInfo.city || "N/A",
                        }
                    },
                    { upsert: true, new: true }
                );
            }

            const populatedOrder = await Order.findById(order._id).populate('items.productId').populate('customDesignId');

            // If it's a custom design, send email notification after payment success
            if (populatedOrder.orderType === "Custom" && populatedOrder.customDesignId) {
                const cd = populatedOrder.customDesignId;
                let attachments = [];
                if (cd.designFile) {
                    attachments.push({ filename: cd.designFileOriginalName || "design", path: path.join(__dirname, cd.designFile) });
                }
                if (cd.refFiles && cd.refFiles.length > 0) {
                    cd.refFiles.forEach(ref => {
                        attachments.push({ filename: ref.originalName, path: path.join(__dirname, ref.path) });
                    });
                }

                const htmlBody = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; background: #f4f4f4; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
    <div style="background: linear-gradient(135deg, #7c3aed, #4f46e5); padding: 30px; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 24px;">New Custom Design Order (Paid)</h1>
      <p style="color: rgba(255,255,255,0.8); margin: 8px 0 0;">Octoink Studio</p>
    </div>
    <div style="padding: 30px;">
      <table style="width: 100%; border-collapse: collapse;">
         <tr style="background: #f8f5ff;">
          <td style="padding: 12px 16px; font-weight: bold; color: #7c3aed; width: 40%; border-bottom: 1px solid #ede9fe;">Payment ID</td>
          <td style="padding: 12px 16px; border-bottom: 1px solid #ede9fe;">${razorpay_payment_id}</td>
        </tr>
        <tr>
          <td style="padding: 12px 16px; font-weight: bold; color: #7c3aed; width: 40%; border-bottom: 1px solid #ede9fe;">From</td>
          <td style="padding: 12px 16px; border-bottom: 1px solid #ede9fe;">${cd.email}</td>
        </tr>
        <tr style="background: #f8f5ff;">
          <td style="padding: 12px 16px; font-weight: bold; color: #7c3aed; border-bottom: 1px solid #ede9fe;">Category</td>
          <td style="padding: 12px 16px; border-bottom: 1px solid #ede9fe;">${cd.category || "N/A"}</td>
        </tr>
        <tr>
          <td style="padding: 12px 16px; font-weight: bold; color: #7c3aed; border-bottom: 1px solid #ede9fe;">File Name</td>
          <td style="padding: 12px 16px; border-bottom: 1px solid #ede9fe;">${cd.fileName || "N/A"}</td>
        </tr>
        <tr style="background: #f8f5ff;">
          <td style="padding: 12px 16px; font-weight: bold; color: #7c3aed; border-bottom: 1px solid #ede9fe;">Size</td>
          <td style="padding: 12px 16px; border-bottom: 1px solid #ede9fe;">${cd.width || "N/A"} × ${cd.height || "N/A"}</td>
        </tr>
        <tr>
          <td style="padding: 12px 16px; font-weight: bold; color: #7c3aed; border-bottom: 1px solid #ede9fe;">Colors</td>
          <td style="padding: 12px 16px; border-bottom: 1px solid #ede9fe;">${cd.colors || "N/A"}</td>
        </tr>
        <tr style="background: #f8f5ff;">
          <td style="padding: 12px 16px; font-weight: bold; color: #7c3aed; border-bottom: 1px solid #ede9fe;">Paid Amount</td>
          <td style="padding: 12px 16px; border-bottom: 1px solid #ede9fe;">₹${order.totalAmount}</td>
        </tr>
      </table>
      ${cd.requirement ? `<div style="margin-top: 24px; padding: 16px; background: #f8f5ff; border-left: 4px solid #7c3aed; border-radius: 4px;"><p style="font-weight: bold; color: #7c3aed; margin: 0 0 8px;">Requirements:</p><p style="margin: 0; color: #333; line-height: 1.6;">${cd.requirement}</p></div>` : ""}
      ${attachments.length > 0 ? `<div style="margin-top: 24px; padding: 16px; background: #f0fdf4; border-radius: 8px; border: 1px solid #bbf7d0;"><p style="font-weight: bold; color: #16a34a; margin: 0 0 8px;">📎 ${attachments.length} file(s) attached</p>${attachments.map(a => `<p style="margin: 4px 0; color: #555; font-size: 14px;">• ${a.filename}</p>`).join("")}</div>` : ""}
    </div>
    <div style="background: #f8f5ff; padding: 16px; text-align: center;">
      <p style="margin: 0; color: #888; font-size: 12px;">This is an automated notification from Octoink Studio</p>
    </div>
  </div>
</body>
</html>`;

                await transporter.sendMail({
                    from: `"Octoink Orders" <${process.env.EMAIL_USER}>`,
                    to: process.env.EMAIL_USER,
                    subject: `💰 PAID: ${cd.category || "Custom"} Order from ${cd.email}`,
                    html: htmlBody,
                    attachments,
                });
            }

            res.json({ success: true, message: "Payment verified successfully", order: populatedOrder });
        } else {
            res.status(400).json({ success: false, message: "Invalid payment signature" });
        }
    } catch (err) {
        console.error("Verification Error:", err);
        res.status(500).json({ success: false, message: "Payment verification failed." });
    }
});

app.get("/api/custom-design", async (req, res) => {
    try {
        const orders = await CustomDesign.find().sort({ createdAt: -1 });
        res.json({ success: true, orders });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.delete("/api/custom-design/:id", async (req, res) => {
    try {
        const order = await CustomDesign.findByIdAndDelete(req.params.id);
        if (!order) return res.status(404).json({ success: false, message: "Not found" });
        res.json({ success: true, message: "Deleted" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get("/api/purchases", async (req, res) => {
    try {
        const paidOrders = await Order.find({ status: "Paid" }).sort({ createdAt: -1 });
        const enrichedPurchases = paidOrders.map(o => ({
            id: o._id,
            productName: o.items.map(i => i.title).join(", "),
            clientName: o.clientInfo?.name || "Unknown",
            clientEmail: o.clientInfo?.email || "N/A",
            amount: o.totalAmount,
            paymentId: o.razorpayPaymentId,
            downloadedAt: o.createdAt
        }));
        res.json({ success: true, purchases: enrichedPurchases });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.delete("/api/purchases/delete-all", async (req, res) => {
    try {
        await Order.deleteMany({ status: "Paid" });
        res.json({ success: true, message: "All purchase data deleted successfully" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── DASHBOARD & ANALYTICS ROUTES (PORTED) ─────────────────

// GET - All detailed downloads with optional month/year filter
app.get("/api/downloads", async (req, res) => {
    try {
        const { month, year } = req.query;
        let query = {};
        if (month && year) {
            const startDate = new Date(year, month - 1, 1);
            const endDate = new Date(year, month, 0, 23, 59, 59);
            query.date = { $gte: startDate, $lte: endDate };
        }
        const downloads = await Download.find(query).sort({ date: -1 });
        res.json({ success: true, downloads });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET - Enriched download history with client info
app.get("/api/downloads/history", async (req, res) => {
    try {
        const downloads = await Download.find().sort({ date: -1 });
        const clients = await Client.find();

        const enrichedDownloads = downloads.map(d => {
            let clientName = d.email ? d.email.split('@')[0] : "Anonymous";
            let companyName = "N/A";

            if (d.email && d.email !== "Anonymous") {
                const client = clients.find(c => c.email.toLowerCase() === d.email.toLowerCase());
                if (client) {
                    clientName = client.client_name;
                    companyName = client.company_name;
                }
            }

            return {
                ...d.toObject(),
                clientName,
                companyName
            };
        });

        res.json({ success: true, downloads: enrichedDownloads });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET - Product specific analytics
app.get("/api/products/analytics/:id", async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) return res.status(404).json({ success: false, message: "Product not found" });

        const downloads = await Download.find({ productId: req.params.id });
        const paidOrders = await Order.find({
            "items.productId": req.params.id,
            status: "Paid"
        });

        const usersMap = new Map();

        // Process guest/regular downloads
        downloads.forEach(d => {
            const email = (d.email || "Anonymous").toLowerCase();
            const existing = usersMap.get(email);
            if (existing) {
                existing.count += 1;
                if (new Date(d.date) > new Date(existing.lastDownload)) {
                    existing.lastDownload = d.date;
                }
            } else {
                usersMap.set(email, {
                    email: d.email || "Anonymous",
                    count: 1,
                    lastDownload: d.date
                });
            }
        });

        // Process paid purchases
        paidOrders.forEach(o => {
            const email = (o.clientInfo?.email || "Anonymous").toLowerCase();
            const existing = usersMap.get(email);
            if (existing) {
                existing.count += 1;
                if (new Date(o.createdAt) > new Date(existing.lastDownload)) {
                    existing.lastDownload = o.createdAt;
                }
            } else {
                usersMap.set(email, {
                    email: o.clientInfo?.email || "Anonymous",
                    count: 1,
                    lastDownload: o.createdAt
                });
            }
        });

        const combinedUsers = Array.from(usersMap.values());
        const totalDownloads = combinedUsers.reduce((s, u) => s + u.count, 0);

        res.json({
            success: true,
            product,
            totalDownloads: Math.max(product.downloads || 0, totalDownloads),
            users: combinedUsers
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// PING - Version Check
app.get("/api/ping", (req, res) => {
    res.json({ success: true, version: "1.0.1", timestamp: new Date() });
});

app.delete("/api/clients/delete-all", async (req, res) => {
    try {
        await Client.deleteMany({});
        await CustomDesign.deleteMany({});
        await Download.deleteMany({});
        await Contact.deleteMany({});
        await Order.deleteMany({});
        res.json({ success: true, message: "All client-related records deleted successfully" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET - All clients with stats (Unified logic)
app.get("/api/clients", async (req, res) => {
    try {
        const clients = await Client.find();
        const paidOrders = await Order.find({ status: "Paid" });
        const downloads = await Download.find();
        const customDesigns = await CustomDesign.find();
        const contacts = await Contact.find();

        const unifiedClients = new Map();

        // 1. Process explicit clients
        clients.forEach(c => {
            unifiedClients.set(c.email.toLowerCase(), {
                _id: c._id,
                client_name: c.client_name,
                company_name: c.company_name,
                location: c.location,
                email: c.email.toLowerCase(),
                createdAt: c.createdAt,
                source: 'direct'
            });
        });

        // 2. Process Custom Designs
        customDesigns.forEach(d => {
            if (!d.email) return;
            const email = d.email.toLowerCase();
            if (!unifiedClients.has(email)) {
                unifiedClients.set(email, {
                    _id: "cl_cd_" + d._id,
                    client_name: email.split('@')[0],
                    company_name: "Custom Design Client",
                    location: "N/A",
                    email: email,
                    createdAt: d.createdAt,
                    source: 'custom_design'
                });
            }
        });

        // 3. Process Downloads
        downloads.forEach(d => {
            if (!d.email || d.email === 'Anonymous') return;
            const email = d.email.toLowerCase();
            if (!unifiedClients.has(email)) {
                unifiedClients.set(email, {
                    _id: "cl_dl_" + d._id,
                    client_name: email.split('@')[0],
                    company_name: "Web Downloader",
                    location: "N/A",
                    email: email,
                    createdAt: d.date,
                    source: 'download'
                });
            }
        });

        // 4. Process Contacts
        contacts.forEach(c => {
            if (!c.email) return;
            const email = c.email.toLowerCase();
            if (!unifiedClients.has(email)) {
                unifiedClients.set(email, {
                    _id: "cl_con_" + c._id,
                    client_name: c.name || email.split('@')[0],
                    company_name: "Inquiry Contact",
                    location: "N/A",
                    email: email,
                    createdAt: c.createdAt,
                    source: 'contact'
                });
            }
        });

        let clientsWithStats = Array.from(unifiedClients.values()).map(client => {
            const email = client.email.toLowerCase();

            const clientPurchases = paidOrders.filter(o => o.clientInfo?.email?.toLowerCase() === email);
            const totalRevenue = clientPurchases.reduce((sum, o) => sum + (o.totalAmount || 0), 0);

            // Get unique products purchased by this client
            const purchasedItems = new Set();
            clientPurchases.forEach(o => {
                o.items.forEach(item => {
                    if (item.productId) purchasedItems.add(item.productId.toString());
                    if (item.title) purchasedItems.add(item.title.toLowerCase().trim());
                });
            });

            // Count downloads that weren't part of a purchase
            const uniqueDownloads = downloads.filter(d => {
                if (d.email?.toLowerCase() !== email) return false;
                const isById = d.productId && purchasedItems.has(d.productId.toString());
                const isByName = d.productName && purchasedItems.has(d.productName.toLowerCase().trim());
                return !isById && !isByName;
            }).length;

            const totalDownloads = clientPurchases.length + uniqueDownloads;

            const allDates = [
                ...clientPurchases.map(o => o.createdAt),
                ...downloads.filter(d => d.email?.toLowerCase() === email).map(d => d.date),
                ...customDesigns.filter(d => d.email?.toLowerCase() === email).map(d => d.createdAt)
            ].sort((a, b) => new Date(b) - new Date(a));

            const lastActivity = allDates[0] || client.createdAt;

            return {
                ...client,
                totalRevenue,
                totalDownloads,
                lastPurchase: lastActivity
            };
        });

        // Filter: ONLY include clients who have interacton
        clientsWithStats = clientsWithStats.filter(c => c.totalDownloads > 0 || c.totalRevenue > 0 || c.source === 'custom_design' || c.source === 'contact');

        res.json({ success: true, clients: clientsWithStats.sort((a, b) => new Date(b.lastPurchase) - new Date(a.lastPurchase)) });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET - Single client details
app.get("/api/clients/:id", async (req, res) => {
    try {
        const id = req.params.id;
        let email = null;
        let clientProfile = null;

        if (mongoose.Types.ObjectId.isValid(id)) {
            clientProfile = await Client.findById(id);
            if (clientProfile) email = clientProfile.email.toLowerCase();
        }

        if (!clientProfile) {
            // Try to find by temporary ID patterns or directly by searching other models
            // This is a simplified version of the manual aggregation
            const allClients = await Client.find();
            const allOrders = await Order.find({ status: "Paid" });
            const allDownloads = await Download.find();
            const allDesigns = await CustomDesign.find();

            // Find email from various sources if ID is a proxy
            if (id.startsWith("cl_cd_")) {
                const d = await CustomDesign.findById(id.replace("cl_cd_", ""));
                if (d) email = d.email.toLowerCase();
            } else if (id.startsWith("cl_dl_")) {
                const d = await Download.findById(id.replace("cl_dl_", ""));
                if (d) email = d.email.toLowerCase();
            } else if (id.startsWith("cl_con_")) {
                const c = await Contact.findById(id.replace("cl_con_", ""));
                if (c) email = c.email.toLowerCase();
            }

            if (email) {
                // Find first activity for Joined Date
                const firstOrder = await Order.findOne({ "clientInfo.email": new RegExp(`^${email}$`, "i") }).sort({ createdAt: 1 });
                const firstDownload = await Download.findOne({ email: new RegExp(`^${email}$`, "i") }).sort({ date: 1 });

                // Also look for most recent info for Company/Location if client record is missing
                const latestOrder = await Order.findOne({ "clientInfo.email": new RegExp(`^${email}$`, "i") }).sort({ createdAt: -1 });
                const latestDesign = await CustomDesign.findOne({ email: new RegExp(`^${email}$`, "i") }).sort({ createdAt: -1 });

                let joinedDate = new Date();
                if (firstOrder && firstDownload) {
                    joinedDate = new Date(Math.min(firstOrder.createdAt, firstDownload.date));
                } else if (firstOrder) {
                    joinedDate = firstOrder.createdAt;
                } else if (firstDownload) {
                    joinedDate = firstDownload.date;
                }

                clientProfile = {
                    email,
                    client_name: email.split('@')[0],
                    company_name: latestOrder?.clientInfo?.company || latestDesign?.category || "Individual",
                    location: latestOrder?.clientInfo?.location || "N/A",
                    createdAt: joinedDate
                };
            }
        }

        if (!email) return res.status(404).json({ success: false, message: "Client not found" });

        const history = [];
        const purchasedProductIds = new Set();
        const purchasedProductNames = new Set();

        const myOrders = await Order.find({ "clientInfo.email": new RegExp(`^${email}$`, "i"), status: "Paid" });
        myOrders.forEach(o => {
            o.items.forEach(item => {
                if (item.productId) purchasedProductIds.add(item.productId.toString());
                if (item.title) purchasedProductNames.add(item.title.toLowerCase().trim());
            });
            history.push({
                type: 'Purchase',
                name: o.items.map(i => i.title).join(", "),
                date: o.createdAt,
                info: `Order: ${o.razorpayOrderId}`,
                amount: o.totalAmount
            });
        });

        const myDownloads = await Download.find({ email: new RegExp(`^${email}$`, "i") });
        myDownloads.forEach(d => {
            // ONLY add as "Download" if it hasn't been "Purchased" by ID OR Name
            const isByProductId = d.productId && purchasedProductIds.has(d.productId.toString());
            const isByProductName = d.productName && purchasedProductNames.has(d.productName.toLowerCase().trim());

            const isAlreadyPurchased = isByProductId || isByProductName;

            if (!isAlreadyPurchased) {
                history.push({
                    type: 'Download',
                    name: d.productName,
                    date: d.date,
                    info: 'Website Download',
                    amount: d.price || 0
                });
            }
        });

        const myDesigns = await CustomDesign.find({ email: new RegExp(`^${email}$`, "i") });
        myDesigns.forEach(d => {
            history.push({
                type: 'Custom Order',
                name: d.fileName || d.category,
                date: d.createdAt,
                info: `Req: ${d.requirement?.substring(0, 30)}`,
                amount: d.budget || d.amount || 0
            });
        });

        // ── FINAL DEDUPLICATION ───────────────────────────
        // Some products might appear as both Purchase and Download.
        // We prioritize Purchase > Custom Order > Download.
        const uniqueHistoryMap = new Map();

        // Sort by priority first so later overwrites only happen if higher priority or newer?
        history.forEach(item => {
            const nameKey = item.name.toLowerCase().trim();
            const existing = uniqueHistoryMap.get(nameKey);

            if (!existing) {
                uniqueHistoryMap.set(nameKey, item);
            } else {
                // Priority Logic: Purchase (1) > Custom Order (2) > Download (3)
                const getPriority = (type) => {
                    if (type === 'Purchase') return 1;
                    if (type === 'Custom Order') return 2;
                    return 3;
                };

                const currentPriority = getPriority(item.type);
                const existingPriority = getPriority(existing.type);

                if (currentPriority < existingPriority) {
                    uniqueHistoryMap.set(nameKey, item);
                } else if (currentPriority === existingPriority) {
                    if (new Date(item.date) > new Date(existing.date)) {
                        uniqueHistoryMap.set(nameKey, item);
                    }
                }
            }
        });

        const finalHistory = Array.from(uniqueHistoryMap.values());

        res.json({
            success: true,
            client: {
                ... (clientProfile._doc || clientProfile),
                purchases: finalHistory.sort((a, b) => new Date(b.date) - new Date(a.date))
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST - Record payment success (Direct entry from frontend if needed)
app.post("/api/payments/success", async (req, res) => {
    try {
        const { clientName, companyName, location, email, productId, productName, fileUrl, paymentId, amount } = req.body;

        if (!email) return res.status(400).json({ success: false, message: "Email required" });

        // Upsert Client
        let client = await Client.findOne({ email: email.toLowerCase() });
        if (!client) {
            client = new Client({
                client_name: clientName || email.split('@')[0],
                company_name: companyName,
                location,
                email: email.toLowerCase()
            });
            await client.save();
        }

        // We already have /api/payment/verify for Razorpay. 
        // This route is kept for compatibility with dashboard frontend if it calls it directly.
        // For now, just return success or create a manual Order record.
        res.json({ success: true, message: "Payment tracked" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET - Dashboard Stats
app.get("/api/stats/totals", async (req, res) => {
    try {
        const productCount = await Product.countDocuments();
        const products = await Product.find();
        const totalDownloadsCount = products.reduce((sum, p) => sum + (p.downloads || 0), 0);

        const customOrdersCount = await CustomDesign.countDocuments();

        const paidOrders = await Order.find({ status: "Paid" });
        const totalRevenue = paidOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);

        // Unique clients
        const emails = new Set();
        const allDownloads = await Download.find();
        const allCustomDesigns = await CustomDesign.find();

        allDownloads.forEach(d => { if (d.email && d.email !== 'Anonymous') emails.add(d.email.toLowerCase()); });
        paidOrders.forEach(o => { if (o.clientInfo?.email) emails.add(o.clientInfo.email.toLowerCase()); });
        allCustomDesigns.forEach(d => { if (d.email) emails.add(d.email.toLowerCase()); });

        res.json({
            success: true,
            totalDownloads: totalDownloadsCount,
            customOrdersCount,
            totalClients: emails.size,
            totalRevenue
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get("/api/total-downloads", async (req, res) => {
    try {
        const products = await Product.find();
        const totalDownloads = products.reduce((sum, p) => sum + (p.downloads || 0), 0);
        res.json({ totalDownloads });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── SETTINGS & MONTHLY ANALYTICS ──────────────────────────

// GET - System Settings
app.get("/api/settings", async (req, res) => {
    try {
        let settings = await Settings.findOne();
        if (!settings) {
            settings = new Settings({ isStoreEnabled: true });
            await settings.save();
        }
        res.json({ success: true, settings });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// PUT - Update System Settings
app.put("/api/settings", async (req, res) => {
    try {
        const { isStoreEnabled, currency } = req.body;
        let settings = await Settings.findOne();
        if (!settings) {
            settings = new Settings({ isStoreEnabled, currency });
        } else {
            if (isStoreEnabled !== undefined) settings.isStoreEnabled = isStoreEnabled;
            if (currency !== undefined) settings.currency = currency;
            settings.updatedAt = Date.now();
        }
        await settings.save();
        res.json({ success: true, settings });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET - Detailed Monthly Stats
// GET - Current month summary for Dashboard Snapshot
app.get("/api/stats/summary", async (req, res) => {
    try {
        const now = new Date();
        const y = now.getFullYear();
        const m = now.getMonth(); // 0-indexed

        const start = new Date(y, m, 1);
        const end = new Date(y, m + 1, 0, 23, 59, 59);

        console.log(`[STATS] Fetching summary for ${y}-${m + 1} (${start.toISOString()} to ${end.toISOString()})`);

        const [orders, designs, downloads] = await Promise.all([
            Order.find({ status: "Paid", createdAt: { $gte: start, $lte: end } }),
            CustomDesign.find({ createdAt: { $gte: start, $lte: end } }),
            Download.find({ date: { $gte: start, $lte: end } })
        ]);

        const revenue = orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);

        const emails = new Set();
        orders.forEach(o => o.clientInfo?.email && emails.add(o.clientInfo.email.toLowerCase()));
        designs.forEach(d => d.email && emails.add(d.email.toLowerCase()));
        downloads.forEach(d => d.email && d.email !== 'Anonymous' && emails.add(d.email.toLowerCase()));

        res.json({
            success: true,
            totalClients: emails.size,
            totalOrders: orders.length,
            customDesigns: designs.length,
            revenue
        });
    } catch (err) {
        console.error("[STATS] Summary Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET - All months detail for a specific year
app.get("/api/stats/all-months-detail", async (req, res) => {
    try {
        const yr = parseInt(req.query.year) || new Date().getFullYear();
        console.log(`[DEBUG] /api/stats/all-months-detail for YEAR: ${yr}`);

        const start = new Date(yr, 0, 1);
        const end = new Date(yr, 11, 31, 23, 59, 59);

        const [allOrders, allDesigns, allDownloads] = await Promise.all([
            Order.find({ status: "Paid", createdAt: { $gte: start, $lte: end } }),
            CustomDesign.find({ createdAt: { $gte: start, $lte: end } }),
            Download.find({ date: { $gte: start, $lte: end } })
        ]);

        console.log(`[DEBUG] DB Found: ${allOrders.length} Orders, ${allDesigns.length} Designs, ${allDownloads.length} Downloads`);

        const monthNames = [
            "January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December"
        ];

        const data = monthNames.map((name, i) => {
            const mOrders = allOrders.filter(o => new Date(o.createdAt).getMonth() === i);
            const mDesigns = allDesigns.filter(d => new Date(d.createdAt).getMonth() === i);
            const mDownloads = allDownloads.filter(d => new Date(d.date).getMonth() === i);

            const revenue = mOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
            const emails = new Set();
            mOrders.forEach(o => o.clientInfo?.email && emails.add(o.clientInfo.email.toLowerCase()));
            mDesigns.forEach(d => d.email && emails.add(d.email.toLowerCase()));
            mDownloads.forEach(d => d.email && d.email !== 'Anonymous' && emails.add(d.email.toLowerCase()));

            const clientList = Array.from(emails).map(email => {
                const order = mOrders.find(o => o.clientInfo?.email?.toLowerCase() === email);
                const design = mDesigns.find(d => d.email?.toLowerCase() === email);
                const download = mDownloads.find(d => d.email?.toLowerCase() === email);
                return {
                    email,
                    name: order?.clientInfo?.name || design?.email?.split('@')[0] || download?.email?.split('@')[0] || "Client",
                    type: order ? "Customer" : design ? "Inquiry" : "Viewer",
                    id: order?._id || design?._id || download?._id
                };
            });

            return {
                month: name,
                monthIndex: i + 1,
                totalClients: emails.size,
                totalOrders: mOrders.length,
                customDesigns: mDesigns.length,
                revenue,
                clientList
            };
        });

        console.log(`[DEBUG] Aggregation success for year ${yr}. Returning 12 months.`);
        res.json({ success: true, year: yr, data });
    } catch (err) {
        console.error("[DEBUG] /api/stats/all-months-detail ERROR:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// DELETE - Entire month data
app.delete("/api/stats/month/:year/:month", async (req, res) => {
    try {
        const { year, month } = req.params;
        const m = parseInt(month);
        const y = parseInt(year);

        const startDate = new Date(y, m - 1, 1);
        const endDate = new Date(y, m, 0, 23, 59, 59);

        const range = { $gte: startDate, $lte: endDate };

        await Promise.all([
            Order.deleteMany({ createdAt: range }),
            CustomDesign.deleteMany({ createdAt: range }),
            Download.deleteMany({ date: range })
        ]);

        res.json({ success: true, message: `Data for ${month}/${year} deleted successfully` });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// DELETE - Individual entry (Order, CustomDesign, or Download)
app.delete("/api/stats/entry/:type/:id", async (req, res) => {
    try {
        const { type, id } = req.params;
        let result;

        if (type === "Customer") {
            result = await Order.findByIdAndDelete(id);
        } else if (type === "Inquiry") {
            result = await CustomDesign.findByIdAndDelete(id);
        } else if (type === "Viewer") {
            result = await Download.findByIdAndDelete(id);
        }

        if (!result) return res.status(404).json({ success: false, message: "Entry not found" });
        res.json({ success: true, message: "Entry deleted successfully" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── START ─────────────────────────────────────────────────
// 404 catch-all — returns JSON instead of HTML
app.use((req, res) => {
    res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.url}` });
});

// Global error handler — returns JSON instead of HTML
app.use((err, req, res, next) => {
    console.error("Unhandled Error:", err);
    res.status(500).json({ success: false, message: "Internal server error", error: err.message });
});

