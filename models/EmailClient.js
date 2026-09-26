import mongoose from 'mongoose';

const EmailClientSchema = new mongoose.Schema({
    name: String,
    email: { type: String, required: true, index: true },
    company: String,
    website: String,
    createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('EmailClient', EmailClientSchema);
