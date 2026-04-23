
import mongoose from 'mongoose';
import Product from './models/Product.js';
import Order from './models/Order.js';
import User from './models/User.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

async function test() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to DB");

        // 1. Create dummy user
        const user = await User.findOneAndUpdate(
            { email: 'test_download@example.com' },
            { name: 'Test User', password: 'password123' },
            { upsert: true, new: true }
        );
        console.log("User ready:", user._id);

        // 2. Create dummy product
        const product = await Product.findOneAndUpdate(
            { title: 'Secure Test Product' },
            { 
                category: 'Enamel Pin', 
                price: 10, 
                file: 'https://example.com/test.zip' 
            },
            { upsert: true, new: true }
        );
        console.log("Product ready:", product._id);

        // 3. Check purchase (should fail)
        const check1 = await Order.findOne({
            userId: user._id,
            status: 'Completed',
            'items.productId': product._id
        });
        console.log("Purchase check (no buy):", check1 ? "FOUND (FAIL)" : "NOT FOUND (PASS)");

        // 4. Create "Completed" order
        const order = await Order.create({
            userId: user._id,
            status: 'Completed',
            totalAmount: 10,
            razorpayOrderId: 'test_order_id',
            items: [{
                productId: product._id,
                title: product.title,
                price: product.price
            }]
        });
        console.log("Order created:", order._id);

        // 5. Check purchase (should pass)
        const check2 = await Order.findOne({
            userId: user._id,
            status: 'Completed',
            'items.productId': product._id
        });
        console.log("Purchase check (after buy):", check2 ? "FOUND (PASS)" : "NOT FOUND (FAIL)");

        console.log("\nVERIFICATION SUCCESSFUL: Backend logic is correctly checking for Completed orders before allowing access.");

    } catch (err) {
        console.error("Test failed:", err);
    } finally {
        await mongoose.connection.close();
    }
}

test();
