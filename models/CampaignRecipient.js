import mongoose from "mongoose";

const campaignRecipientSchema = new mongoose.Schema(
  {
    campaignId: { type: String, required: true, index: true },
    companyName: { type: String, required: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    isValidEmail: { type: Boolean, default: true },
    trackingId: { type: String, required: true, unique: true, index: true },
    
    // Status flags
    status: {
      type: String,
      enum: ["Ready", "Sending", "Sent", "Opened", "Replied", "Follow-up Pending", "Follow-up Sent", "Failed"],
      default: "Ready",
    },
    
    // Initial Send tracking
    emailSent: { type: Boolean, default: false },
    sentAt: { type: Date, default: null },
    
    // Open tracking
    opened: { type: Boolean, default: false },
    firstOpenedAt: { type: Date, default: null },
    latestOpenedAt: { type: Date, default: null },
    openCount: { type: Number, default: 0 },
    
    // Reply tracking
    replied: { type: Boolean, default: false },
    repliedAt: { type: Date, default: null },
    replySubject: { type: String, default: "" },
    replyMessage: { type: String, default: "" },
    
    // Follow-up tracking
    followUpStatus: {
      type: String,
      enum: ["Waiting", "Eligible", "Sending", "Sent", "Replied", "Failed"],
      default: "Waiting",
    },
    followUpSent: { type: Boolean, default: false },
    followUpSentAt: { type: Date, default: null },
    
    lastActivityAt: { type: Date, default: Date.now },
    errorMessage: { type: String, default: "" },
  },
  { timestamps: true }
);

// Compound index to quickly check if recipient in campaign already exists
campaignRecipientSchema.index({ email: 1, campaignId: 1 });

export default mongoose.models.CampaignRecipient || mongoose.model("CampaignRecipient", campaignRecipientSchema);
