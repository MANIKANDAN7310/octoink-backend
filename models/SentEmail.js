import mongoose from 'mongoose';

const SentEmailSchema = new mongoose.Schema({
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'EmailCampaign' },
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'EmailClient' },
    recipientEmail: String,
    messageId: String,
    sequence: Number,
    sentAt: Date,
    status: { type: String, enum: ['queued','sent','failed'], default: 'queued' },
    opened: { type: Boolean, default: false },
    clicked: { type: Boolean, default: false },
    replied: { type: Boolean, default: false },
    error: String
});

export default mongoose.model('SentEmail', SentEmailSchema);
