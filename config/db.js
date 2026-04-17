import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI, {
            serverSelectionTimeoutMS: 10000,   // Timeout after 10s instead of default 30s
            socketTimeoutMS: 45000,             // Close sockets after 45s of inactivity
            maxPoolSize: 10,                     // Maintain up to 10 socket connections
        });
        console.log("✅ MongoDB Connected");
    } catch (err) {
        console.error("❌ MongoDB Error:", err.message);
        // Retry after 5 seconds instead of crashing
        console.log("🔄 Retrying connection in 5 seconds...");
        setTimeout(connectDB, 5000);
    }
};

export default connectDB;
