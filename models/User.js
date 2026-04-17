import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    downloadHistory: [
        {
            productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
            productTitle: String,
            downloadedAt: { type: Date, default: Date.now },
            paymentId: { type: String },
        },
    ],
    createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("User", userSchema);
