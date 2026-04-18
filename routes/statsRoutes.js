import express from 'express';
import Order from '../models/Order.js';
import User from '../models/User.js';
import CustomDesign from '../models/CustomDesign.js';

const router = express.Router();

router.get('/summary', async (req, res) => {
    try {
        const totalClients = await User.countDocuments({ role: { $ne: 'admin' } });
        const totalOrders = await CustomDesign.countDocuments();
        const customDesigns = await CustomDesign.countDocuments({ status: 'pending' });
        
        // Mock revenue or calculate from orders if you have a price field
        const revenue = 0; 

        res.json({
            success: true,
            totalClients,
            totalOrders,
            customDesigns,
            revenue
        });
    } catch (err) {
        console.error('Stats error:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

export default router;
