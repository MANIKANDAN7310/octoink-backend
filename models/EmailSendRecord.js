import mongoose from "mongoose";

const emailSendRecordSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    campaignId: { type: String, required: true },
    type: { type: String, enum: ["initial", "followup"], default: "initial" },
    status: { type: String, enum: ["success", "failed"], required: true },
    trackingId: { type: String },
    sentAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Compound unique index to guarantee zero duplicate sends at DB level
emailSendRecordSchema.index({ email: 1, campaignId: 1, type: 1, status: 1 });

export default mongoose.models.EmailSendRecord || mongoose.model("EmailSendRecord", emailSendRecordSchema);
