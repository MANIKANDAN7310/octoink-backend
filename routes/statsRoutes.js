import express from 'express';
import Order from '../models/Order.js';
import User from '../models/User.js';
import CustomDesign from '../models/CustomDesign.js';

const router = express.Router();

import Product from '../models/Product.js';

router.get('/summary', async (req, res) => {
    try {
        const totalClients = await User.countDocuments({ role: { $ne: 'admin' } });
        const totalOrders = await Order.countDocuments({ status: 'Completed' });
        const customDesigns = await CustomDesign.countDocuments();
        
        // Calculate total revenue from completed orders
        const orders = await Order.find({ status: 'Completed' });
        const revenue = orders.reduce((sum, order) => sum + (order.totalAmount || 0), 0);

        // Get total product downloads
        const products = await Product.find();
        const totalDownloads = products.reduce((sum, p) => sum + (p.downloads || 0), 0);

        res.json({
            success: true,
            totalClients,
            totalOrders,
            customDesigns,
            revenue,
            totalDownloads
        });
    } catch (err) {
        console.error('Stats error:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/all-months-detail', async (req, res) => {
    try {
        const year = parseInt(req.query.year) || new Date().getFullYear();
        const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        
        const data = await Promise.all(months.map(async (monthName, index) => {
            const startDate = new Date(year, index, 1);
            const endDate = new Date(year, index + 1, 0, 23, 59, 59);

            const monthOrders = await Order.find({
                status: 'Completed',
                createdAt: { $gte: startDate, $lte: endDate }
            });

            const monthCustom = await CustomDesign.countDocuments({
                createdAt: { $gte: startDate, $lte: endDate }
            });

            const monthRevenue = monthOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
            
            return {
                month: monthName,
                clients: await User.countDocuments({ createdAt: { $gte: startDate, $lte: endDate } }),
                orders: monthOrders.length,
                customOrders: monthCustom,
                revenue: monthRevenue
            };
        }));

        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});


export default router;
