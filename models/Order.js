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
    totalAmount: { type: Number, required: true }, // Amount in INR
    currency: { type: String, default: "INR" },
    displayAmount: { type: Number }, // Original base amount shown to user (USD)
    displayCurrency: { type: String }, // Base currency (e.g. USD)
    originalCurrency: { type: String }, // User requested currency
    finalCurrency: { type: String }, // Actual currency charged by Razorpay
    exchangeRateUsed: { type: Number, default: 1 }, // Exchange rate used for conversion
    traceId: { type: String, required: true, unique: true },
    razorpayOrderId: { type: String, required: true, unique: true },
    razorpayPaymentId: { type: String },
    razorpaySignature: { type: String },
    status: { type: String, default: "Pending" },
    deliveryProcessed: { type: Boolean, default: false },
    processedWebhooks: [{ type: String }],
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
