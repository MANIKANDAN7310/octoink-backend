import mongoose from "mongoose";

const campaignSchema = new mongoose.Schema(
  {
    campaignId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    senderEmail: { type: String, default: "hello.octoinkstudios@gmail.com" },
    subject: { type: String, required: true },
    body: { type: String, required: true },
    attachments: [
      {
        filename: String,
        path: String,
        originalname: String,
        mimetype: String,
        size: Number,
      },
    ],
    status: {
      type: String,
      enum: ["Draft", "Ready", "Sending", "Paused", "Stopped", "Completed"],
      default: "Ready",
    },
    totalClients: { type: Number, default: 0 },
    validEmailsCount: { type: Number, default: 0 },
    invalidEmailsCount: { type: Number, default: 0 },
    emailsSent: { type: Number, default: 0 },
    openedCount: { type: Number, default: 0 },
    replyCount: { type: Number, default: 0 },
    followUpsSent: { type: Number, default: 0 },
    failedCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.models.Campaign || mongoose.model("Campaign", campaignSchema);
