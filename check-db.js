import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

async function checkData() {
    try {
        await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
        const Order = mongoose.model('Order', new mongoose.Schema({}, { strict: false }));
        const Product = mongoose.model('Product', new mongoose.Schema({}, { strict: false }));
        const CustomDesign = mongoose.model('CustomDesign', new mongoose.Schema({}, { strict: false }));

        const usersCount = await User.countDocuments();
        const ordersCount = await Order.countDocuments();
        const productsCount = await Product.countDocuments();
        const designsCount = await CustomDesign.countDocuments();

        console.log(`Users: ${usersCount}`);
        console.log(`Orders: ${ordersCount}`);
        console.log(`Products: ${productsCount}`);
        console.log(`CustomDesigns: ${designsCount}`);

        if (ordersCount > 0) {
            const sampleOrder = await Order.findOne();
            console.log('Sample Order:', JSON.stringify(sampleOrder, null, 2));
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkData();
