import mongoose from "mongoose";

const emailReplySchema = new mongoose.Schema(
  {
    campaignId: { type: String, required: true, index: true },
    originalCampaignName: { type: String, default: "" },
    companyName: { type: String, required: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    originalSubject: { type: String, default: "" },
    replySubject: { type: String, default: "" },
    replyMessage: { type: String, default: "" },
    sender: { type: String, default: "" },
    subject: { type: String, default: "" },
    body: { type: String, default: "" },
    receivedAt: { type: Date, default: Date.now },
    messageId: { type: String, default: "", index: true },
    status: {
      type: String,
      enum: ["New Reply", "Contacted", "Qualified", "Follow-up", "Closed"],
      default: "New Reply",
    },
  },
  { timestamps: true }
);

emailReplySchema.index({ email: 1, receivedAt: 1 });

export default mongoose.models.EmailReply || mongoose.model("EmailReply", emailReplySchema);
