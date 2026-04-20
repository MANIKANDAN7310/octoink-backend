import Order from '../models/Order.js';
import CustomDesign from '../models/CustomDesign.js';
import { sendEmail } from '../utils/sendEmail.js';

export const getOrders = async (req, res) => {
    try {
        const orders = await Order.find()
            .populate('userId', 'name email')
            .populate('items.productId')
            .populate('customDesignId')
            .sort({ createdAt: -1 });
        res.json({ success: true, orders });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

export const createCustomDesign = async (req, res) => {
    try {
        const { fileName, category, width, height, colors, requirement, email } = req.body;
        
        const customDesignUrl = req.files?.file?.[0] ? req.files.file[0].path : "";
        const refFiles = (req.files?.refFiles || []).map(f => ({
            path: f.path,
            originalName: f.originalname
        }));

        const newDesign = new CustomDesign({
            email,
            fileName: fileName || (req.files?.file?.[0]?.originalname) || "N/A",
            category: category || "N/A",
            width: width || "N/A",
            height: height || "N/A",
            colors: colors || "N/A",
            requirement: requirement || "",
            customDesignUrl,
            designFileOriginalName: req.files?.file?.[0]?.originalname || "",
            refFiles,
        });

        await newDesign.save();

        // Send email notification for custom design
        await sendEmail({
            subject: `New Custom Design Order from ${email}`,
            text: `You have received a new custom design order.\n\nEmail: ${email}\nCategory: ${category || 'N/A'}\nDimensions: ${width || 'N/A'}x${height || 'N/A'}\nColors: ${colors || 'N/A'}\nRequirement: ${requirement || 'None'}`,
            html: `<p>You have received a new custom design order.</p>
                   <ul>
                       <li><strong>Email:</strong> ${email}</li>
                       <li><strong>Category:</strong> ${category || 'N/A'}</li>
                       <li><strong>Dimensions:</strong> ${width || 'N/A'}x${height || 'N/A'}</li>
                       <li><strong>Colors:</strong> ${colors || 'N/A'}</li>
                   </ul>
                   <p><strong>Requirement:</strong></p>
                   <p>${requirement || 'None'}</p>`,
            replyTo: email
        });

        res.status(201).json({ success: true, customDesignId: newDesign._id });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

export const getCustomDesigns = async (req, res) => {
    try {
        const designs = await CustomDesign.find().sort({ createdAt: -1 });
        res.json({ success: true, orders: designs });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

export const updateOrderStatus = async (req, res) => {
    try {
        const { status } = req.body;
        const order = await CustomDesign.findByIdAndUpdate(req.params.id, { status }, { new: true });
        res.json({ success: true, order });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

export const getPurchases = async (req, res) => {
    try {
        const orders = await Order.find()
            .populate('userId', 'name email')
            .populate('items.productId')
            .sort({ createdAt: -1 });

        // Map to format expected by dashboard
        const mappedPurchases = orders.map(order => ({
            _id: order._id,
            id: order._id, // Dashboard uses p.id in some places
            productName: order.items[0]?.title || "Digital Product",
            clientName: order.clientInfo?.name || order.userId?.name || "Unknown",
            clientEmail: order.clientInfo?.email || order.userId?.email || "N/A",
            amount: order.totalAmount || 0,
            paymentId: order.razorpayPaymentId || "N/A",
            downloadedAt: order.createdAt,
            status: order.status
        }));

        res.json({ success: true, purchases: mappedPurchases });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};


export const deleteOrder = async (req, res) => {
    try {
        const id = req.params.id;
        // Try deleting from CustomDesign first
        let deleted = await CustomDesign.findByIdAndDelete(id);
        
        // If not found in CustomDesign, try Order
        if (!deleted) {
            deleted = await Order.findByIdAndDelete(id);
        }

        if (!deleted) {
            return res.status(404).json({ success: false, message: 'Record not found' });
        }

        res.json({ success: true, message: 'Record deleted successfully' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

