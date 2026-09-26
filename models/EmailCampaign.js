import mongoose from 'mongoose';

const EmailCampaignSchema = new mongoose.Schema({
    name: { type: String, required: true },
    status: { type: String, enum: ['draft','ready','running','paused','completed','stopped'], default: 'draft' },
    senderEmail: { type: String },
    templates: [{
        sequence: Number,
        subject: String,
        bodyHtml: String,
        bodyText: String
    }],
    recipients: [{ type: mongoose.Schema.Types.ObjectId, ref: 'EmailClient' }],
    createdAt: { type: Date, default: Date.now },
    startedAt: Date,
    pausedAt: Date,
    completedAt: Date
});

export default mongoose.model('EmailCampaign', EmailCampaignSchema);
