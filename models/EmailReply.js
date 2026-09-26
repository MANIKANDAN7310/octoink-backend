import mongoose from "mongoose";

const emailReplySchema = new mongoose.Schema(
  {
    campaignId: { type: String, required: true, index: true },
    companyName: { type: String, required: true },
    email: { type: String, required: true, lowercase: true, index: true },
    originalSubject: { type: String, default: "" },
    replySubject: { type: String, default: "" },
    replyMessage: { type: String, required: true },
    receivedAt: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: ["New Reply", "Contacted", "Qualified", "Follow-up", "Closed"],
      default: "New Reply",
    },
  },
  { timestamps: true }
);

export default mongoose.models.EmailReply || mongoose.model("EmailReply", emailReplySchema);
