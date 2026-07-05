import express from 'express';
import Order from '../models/Order.js';
import User from '../models/User.js';
import CustomDesign from '../models/CustomDesign.js';
import Product from '../models/Product.js';
import { getExchangeRate } from '../utils/currencyUtils.js';

const router = express.Router();

// Exchange rate endpoint for frontend currency display conversion
router.get('/exchange-rate', async (req, res) => {
    try {
        let rate = await getExchangeRate();
        rate = rate && rate > 0 ? rate : 83; // Final safety fallback
        
        // Optimize with caching headers (1 hour)
        res.set('Cache-Control', 'public, max-age=3600');
        res.set('ETag', `"${rate}"`);
        
        res.json({ success: true, rate, base: 'USD', target: 'INR' });
    } catch (err) {
        // Return fallback instead of crashing
        res.json({ success: true, rate: 83, base: 'USD', target: 'INR', fallback: true });
    }
});

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
            }).populate('userId', 'name email');

            const monthCustom = await CustomDesign.find({
                createdAt: { $gte: startDate, $lte: endDate }
            });

            const monthUsers = await User.find({
                role: { $ne: 'admin' },
                createdAt: { $gte: startDate, $lte: endDate }
            });

            const monthRevenue = monthOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
            
            const clientList = [];

            // Add registered clients
            monthUsers.forEach(u => {
                clientList.push({
                    id: u._id,
                    name: u.name || 'Anonymous User',
                    email: u.email,
                    type: 'Client'
                });
            });

            // Add store purchases
            monthOrders.forEach(o => {
                clientList.push({
                    id: o._id,
                    name: o.clientInfo?.name || o.userId?.name || 'Store Customer',
                    email: o.clientInfo?.email || o.userId?.email || 'N/A',
                    type: 'Customer'
                });
            });

            // Add custom design inquiries
            monthCustom.forEach(d => {
                clientList.push({
                    id: d._id,
                    name: d.fileName ? `Custom: ${d.fileName}` : 'Custom Design Inquiry',
                    email: d.email || 'N/A',
                    type: 'Inquiry'
                });
            });

            return {
                month: monthName,
                monthIndex: index + 1,
                clients: monthUsers.length,
                orders: monthOrders.length,
                customOrders: monthCustom.length,
                revenue: monthRevenue,
                clientList
            };
        }));

        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Delete all stats/data for a specific month
router.delete('/month/:year/:monthIndex', async (req, res) => {
    try {
        const year = parseInt(req.params.year);
        const monthIndex = parseInt(req.params.monthIndex) - 1; // 1-based to 0-based

        const startDate = new Date(year, monthIndex, 1);
        const endDate = new Date(year, monthIndex + 1, 0, 23, 59, 59);

        // Delete Orders, CustomDesigns, and Non-Admin Users created in this range
        await Order.deleteMany({ createdAt: { $gte: startDate, $lte: endDate } });
        await CustomDesign.deleteMany({ createdAt: { $gte: startDate, $lte: endDate } });
        await User.deleteMany({ 
            role: { $ne: 'admin' }, 
            isAdmin: { $ne: true },
            createdAt: { $gte: startDate, $lte: endDate } 
        });

        res.json({ success: true, message: `Successfully deleted all data for month ${monthIndex + 1}/${year}` });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Delete individual stats activity entry
router.delete('/entry/:type/:id', async (req, res) => {
    try {
        const { type, id } = req.params;
        let deleted = null;

        if (type === 'Customer') {
            deleted = await Order.findByIdAndDelete(id);
        } else if (type === 'Inquiry') {
            deleted = await CustomDesign.findByIdAndDelete(id);
        } else if (type === 'Client') {
            deleted = await User.findByIdAndDelete(id);
        } else {
            return res.status(400).json({ success: false, message: 'Invalid entry type' });
        }

        if (!deleted) {
            return res.status(404).json({ success: false, message: 'Entry not found' });
        }

        res.json({ success: true, message: 'Entry deleted successfully' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

export default router;
