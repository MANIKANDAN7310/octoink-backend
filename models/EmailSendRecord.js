import mongoose from "mongoose";

const emailSendRecordSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    recipientEmail: { type: String, lowercase: true, trim: true, index: true },
    campaignId: { type: String, required: true, index: true },
    campaignName: { type: String, default: "" },
    recipientName: { type: String, default: "" },
    companyName: { type: String, default: "" },
    subject: { type: String, default: "" },
    type: { type: String, enum: ["initial", "followup"], default: "initial" },
    status: { type: String, enum: ["success", "failed"], required: true, index: true },
    trackingId: { type: String, index: true },
    messageId: { type: String, default: "", index: true },
    sentAt: { type: Date, default: Date.now },
    openedAt: { type: Date, default: null },
    repliedAt: { type: Date, default: null },
    followUpSent: { type: Boolean, default: false },
    followUpSentAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Compound index to guarantee zero duplicate sends at DB level
emailSendRecordSchema.index({ email: 1, campaignId: 1, type: 1, status: 1 });
emailSendRecordSchema.index({ email: 1, status: 1 });

export default mongoose.models.EmailSendRecord || mongoose.model("EmailSendRecord", emailSendRecordSchema);
