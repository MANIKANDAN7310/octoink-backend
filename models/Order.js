import mongoose from 'mongoose';

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
    orderType: { type: String, default: "Product" }, // 'Product' or 'Custom'
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

export default mongoose.model("Order", orderSchema);
