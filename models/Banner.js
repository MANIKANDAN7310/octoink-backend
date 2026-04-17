import mongoose from 'mongoose';

const bannerSchema = new mongoose.Schema({
    imageUrl: { type: String }, // For backward compatibility or external links
    image: { type: String },    // Cloudinary URL
    heading: { type: String, required: true },
    subHeading: { type: String },
    description: { type: String },
    button1Text: { type: String },
    button1Link: { type: String },
    button2Text: { type: String },
    button2Link: { type: String },
    order: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("Banner", bannerSchema);
