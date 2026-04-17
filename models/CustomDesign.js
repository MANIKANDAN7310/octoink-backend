import mongoose from 'mongoose';

const customDesignSchema = new mongoose.Schema({
    email: { type: String, required: true },
    fileName: { type: String },
    category: { type: String },
    width: { type: String },
    height: { type: String },
    colors: { type: String },
    requirement: { type: String },
    customDesignUrl: { type: String }, // Cloudinary URL
    designFileOriginalName: { type: String },
    refFiles: [{ path: String, originalName: String }],
    createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("CustomDesign", customDesignSchema);
