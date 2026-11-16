import mongoose from "mongoose";

const leadFinderSearchSchema = new mongoose.Schema(
  {
    country: {
      type: String,
      required: true,
      trim: true,
    },
    industries: [
      {
        type: String,
        required: true,
        trim: true,
      },
    ],
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
    status: {
      type: String,
      enum: ["pending", "running", "completed", "failed"],
      default: "pending",
    },
    progress: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    currentStep: {
      type: String,
      default: "Initializing search...",
    },
    totalDiscovered: {
      type: Number,
      default: 0,
    },
    emailsFound: {
      type: Number,
      default: 0,
    },
    uniqueEmails: {
      type: Number,
      default: 0,
    },
    results: [
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
          default: "",
        },
        industry: {
          type: String,
          default: "",
        },
        website: {
          type: String,
          default: "",
        },
        state: {
          type: String,
          default: "",
        },
        city: {
          type: String,
          default: "",
        },
        sourceUrl: {
          type: String,
          default: "",
        },
        allEmails: [
          {
            type: String,
          },
        ],
        foundAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    logs: [
      {
        message: {
          type: String,
          required: true,
        },
        type: {
          type: String,
          enum: ["info", "success", "warning", "error"],
          default: "info",
        },
        timestamp: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    error: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for query performance
leadFinderSearchSchema.index({ createdAt: -1 });
leadFinderSearchSchema.index({ country: 1, createdAt: -1 });

export default mongoose.model("LeadFinderSearch", leadFinderSearchSchema);
