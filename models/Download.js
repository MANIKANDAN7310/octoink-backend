import mongoose from 'mongoose';

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
    paymentId: { type: String },
});

export default mongoose.model("Download", downloadSchema);
