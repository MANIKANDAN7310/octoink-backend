import mongoose from "mongoose";

const emailOpenSchema = new mongoose.Schema(
  {
    trackingId: { type: String, required: true, index: true },
    campaignId: { type: String, required: true },
    recipientEmail: { type: String, required: true, lowercase: true },
    openedAt: { type: Date, default: Date.now },
    ipAddress: { type: String },
    userAgent: { type: String },
  },
  { timestamps: true }
);

export default mongoose.models.EmailOpen || mongoose.model("EmailOpen", emailOpenSchema);
