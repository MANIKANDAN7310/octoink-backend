import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from backend root
dotenv.config({ path: path.join(__dirname, "../.env") });

// Import models
import User from "../models/User.js";
import Order from "../models/Order.js";
import Product from "../models/Product.js";
import Contact from "../models/Contact.js";
import CustomDesign from "../models/CustomDesign.js";
import Download from "../models/Download.js";
import Client from "../models/Client.js";
import Portfolio from "../models/Portfolio.js";
import Banner from "../models/Banner.js";

const resetDatabase = async () => {
    try {
        console.log("Connecting to MongoDB...");
        if (!process.env.MONGO_URI) {
            console.error("No MONGO_URI found in .env");
            process.exit(1);
        }
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected.");

        console.log("Clearing Orders...");
        await Order.deleteMany({});
        
        console.log("Clearing Products...");
        await Product.deleteMany({});
        
        console.log("Clearing Contacts...");
        await Contact.deleteMany({});
        
        console.log("Clearing Custom Designs...");
        await CustomDesign.deleteMany({});
        
        console.log("Clearing Downloads...");
        await Download.deleteMany({});
        
        console.log("Clearing Clients...");
        await Client.deleteMany({});
        
        console.log("Clearing Portfolios...");
        await Portfolio.deleteMany({});
        
        console.log("Clearing Banners...");
        await Banner.deleteMany({});
        
        console.log("Clearing non-admin Users...");
        // Delete all users except where isAdmin is true
        const userDeleteResult = await User.deleteMany({ isAdmin: { $ne: true } });
        console.log(`Deleted ${userDeleteResult.deletedCount} non-admin users.`);

        // Reset download history of admin users
        console.log("Resetting admin user data (download history)...");
        await User.updateMany({ isAdmin: true }, { $set: { downloadHistory: [] } });

        console.log("✅ Database reset complete. The schema remains intact.");
        process.exit(0);
    } catch (err) {
        console.error("Error resetting database:", err);
        process.exit(1);
    }
};

resetDatabase();
