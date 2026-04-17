import mongoose from 'mongoose';

const productSchema = new mongoose.Schema({
    title: { type: String, required: true },
    category: { type: String, required: true },
    price: { type: Number, required: true },
    originalPrice: { type: Number },
    description: { type: String },
    tags: { type: String },
    image: { type: String }, // Cloudinary URL
    extraImages: [{ type: String }],
    file: { type: String },
    downloads: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("Product", productSchema);
