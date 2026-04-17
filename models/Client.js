import mongoose from 'mongoose';

const clientSchema = new mongoose.Schema({
    client_name: { type: String },
    company_name: { type: String, default: "N/A" },
    location: { type: String, default: "N/A" },
    email: { type: String, required: true, unique: true },
    createdAt: { type: Date, default: Date.now }
});

export default mongoose.model("Client", clientSchema);
