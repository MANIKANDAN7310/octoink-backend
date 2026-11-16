import mongoose from "mongoose";

const collectedLeadSchema = new mongoose.Schema(
  {
    companyName: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    country: {
      type: String,
      required: true,
      trim: true,
    },
    industry: {
      type: String,
      required: true,
      trim: true,
    },
    website: {
      type: String,
      required: true,
      trim: true,
    },
    state: {
      type: String,
      default: "",
      trim: true,
    },
    city: {
      type: String,
      default: "",
      trim: true,
    },
    sourceUrl: {
      type: String,
      default: "",
      trim: true,
    },
    searchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LeadFinderSearch",
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to guarantee uniqueness of email across collected leads
collectedLeadSchema.index({ email: 1 }, { unique: true });
collectedLeadSchema.index({ country: 1, industry: 1 });

export default mongoose.model("CollectedLead", collectedLeadSchema);
