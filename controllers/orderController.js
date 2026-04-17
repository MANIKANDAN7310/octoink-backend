import Order from '../models/Order.js';
import CustomDesign from '../models/CustomDesign.js';

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

export const deleteOrder = async (req, res) => {
    try {
        await CustomDesign.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Order deleted' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
