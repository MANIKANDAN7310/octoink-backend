import User from '../models/User.js';
import Client from '../models/Client.js';
import CustomDesign from '../models/CustomDesign.js';
import Download from '../models/Download.js';
import Order from '../models/Order.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import redis from '../utils/redis.js';

// Helper to generate tokens
export const generateTokens = (user) => {
    const accessToken = jwt.sign(
        { id: user._id, email: user.email, isAdmin: user.isAdmin },
        process.env.JWT_SECRET,
        { expiresIn: "15m" } // Short-lived access token
    );

    const refreshToken = jwt.sign(
        { id: user._id },
        process.env.JWT_SECRET,
        { expiresIn: "7d" } // Long-lived refresh token
    );

    return { accessToken, refreshToken };
};

export const register = async (req, res) => {
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password) return res.status(400).json({ success: false, message: "All fields required" });
        const existingUser = await User.findOne({ email });
        if (existingUser) return res.status(400).json({ success: false, message: "User already exists" });
        
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({ name, email, password: hashedPassword });
        await user.save();
        
        const { accessToken, refreshToken } = generateTokens(user);
        
        res.status(201).json({ 
            success: true, 
            token: accessToken,
            refreshToken,
            user: { name: user.name, email: user.email, isAdmin: user.isAdmin } 
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

export const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ success: false, message: "User not found" });
        
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ success: false, message: "Invalid credentials" });
        
        const { accessToken, refreshToken } = generateTokens(user);
        
        res.json({ 
            success: true, 
            token: accessToken, 
            refreshToken,
            user: { name: user.name, email: user.email, isAdmin: user.isAdmin } 
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

export const refreshAccessToken = async (req, res) => {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(401).json({ success: false, message: "Refresh token required" });

    try {
        const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id);
        if (!user) return res.status(401).json({ success: false, message: "User not found" });

        const { accessToken, refreshToken: newRefreshToken } = generateTokens(user);
        
        res.json({ 
            success: true, 
            token: accessToken, 
            refreshToken: newRefreshToken 
        });
    } catch (err) {
        res.status(401).json({ success: false, message: "Invalid refresh token" });
    }
};

export const getClients = async (req, res) => {
    try {
        // 1. Get emails/IDs of users with active engagement
        const [orderEmails, designEmails, clientEmails, orderUserIds] = await Promise.all([
            Order.distinct("clientInfo.email"),
            CustomDesign.distinct("email"),
            Client.distinct("email"),
            Order.distinct("userId")
        ]);

        const activeEmails = [...new Set([...orderEmails, ...designEmails, ...clientEmails])].filter(Boolean);
        const activeUserIds = orderUserIds.filter(Boolean);

        // 2. Find users who match engagement criteria
        const users = await User.find({
            $or: [
                { email: { $in: activeEmails } },
                { _id: { $in: activeUserIds } },
                { downloadHistory: { $exists: true, $not: { $size: 0 } } }
            ],
            isAdmin: { $ne: true } // Usually exclude admins from client list
        }).select("-password").sort({ createdAt: -1 });

        const mappedClients = users.map(user => ({
            _id: user._id,
            client_name: user.name,
            email: user.email,
            company_name: "Individual", // Could be enhanced if User model had company
            location: "N/A",
            totalDownloads: user.downloadHistory?.length || 0,
            createdAt: user.createdAt
        }));

        res.json({ success: true, clients: mappedClients });
    } catch (err) {
        console.error("getClients error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

export const getClientById = async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select("-password");
        if (!user) return res.status(404).json({ success: false, message: "Client not found" });
        
        const mappedClient = {
            _id: user._id,
            client_name: user.name,
            email: user.email,
            company_name: "Individual",
            location: "N/A",
            createdAt: user.createdAt,
            purchases: (user.downloadHistory || []).map(d => ({
                id: d._id,
                productName: d.productTitle,
                amount: 0,
                paymentId: d.paymentId,
                downloadedAt: d.downloadedAt
            }))
        };
        
        res.json({ success: true, client: mappedClient });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

export const deleteClient = async (req, res) => {
    try {
        const { id } = req.params;
        if (id === 'delete-all') {
            return res.status(400).json({ success: false, message: 'Invalid ID' });
        }

        await User.findByIdAndDelete(id);
        res.json({ success: true, message: 'Client deleted successfully' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

export const deleteAllClients = async (req, res) => {
    try {
        // As requested: Delete all client records properly
        await Client.deleteMany({});
        
        // Also clearing related data to maintain system integrity as per previous requirements
        await User.deleteMany({ isAdmin: { $ne: true } });
        await CustomDesign.deleteMany({});
        await Download.deleteMany({});
        await Order.deleteMany({});
        
        res.status(200).json({ 
            success: true, 
            message: 'All clients deleted successfully' 
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

export const getProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        const cached = await redis.get(`profile:${userId}`);
        if (cached) {
            return res.json({ 
                success: true, 
                user: JSON.parse(cached),
                fromCache: true 
            });
        }

        const user = await User.findById(userId).select("-password");
        if (!user) return res.status(404).json({ success: false, message: "User not found" });
        
        await redis.set(`profile:${userId}`, JSON.stringify(user), "EX", 60);
        res.json({ success: true, user });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

export const updateProfile = async (req, res) => {
    try {
        const { name, email, currency } = req.body;
        const updates = {};
        if (name) updates.name = name;
        if (email) updates.email = email;
        if (currency) updates.currency = currency;

        const user = await User.findByIdAndUpdate(
            req.user.id,
            { $set: updates },
            { new: true }
        ).select("-password");

        if (!user) return res.status(404).json({ success: false, message: "User not found" });
        
        await redis.del(`profile:${req.user.id}`);
        res.json({ success: true, user });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};


