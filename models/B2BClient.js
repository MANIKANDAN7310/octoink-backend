import mongoose from "mongoose";

const timelineEventSchema = new mongoose.Schema(
  {
    event: { type: String, required: true },
    type: { type: String, enum: ["sent", "opened", "replied", "followup_sent", "followup_opened", "status_change"], required: true },
    details: { type: String, default: "" },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false }
);

const b2bClientSchema = new mongoose.Schema(
  {
    companyName: { type: String, required: true },
    email: { type: String, required: true, lowercase: true, unique: true, index: true },
    campaignId: { type: String, default: "" },
    firstContactDate: { type: Date, default: Date.now },
    lastContactDate: { type: Date, default: Date.now },
    emailsReceivedCount: { type: Number, default: 0 },
    repliesCount: { type: Number, default: 0 },
    openedCount: { type: Number, default: 0 },
    followUpCount: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["Contacted", "Opened", "Replied", "Interested", "Follow-up", "Converted", "Not Interested"],
      default: "Contacted",
    },
    timeline: [timelineEventSchema],
  },
  { timestamps: true }
);

export default mongoose.models.B2BClient || mongoose.model("B2BClient", b2bClientSchema);
