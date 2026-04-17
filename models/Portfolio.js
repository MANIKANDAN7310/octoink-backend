import mongoose from 'mongoose';

const portfolioSchema = new mongoose.Schema({
    title: { type: String, required: true },
    category: { type: String, required: true },
    image: { type: String, required: true }, // Cloudinary URL
    createdAt: { type: Date, default: Date.now }
});

export default mongoose.model("Portfolio", portfolioSchema);
