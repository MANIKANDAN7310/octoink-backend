import Portfolio from '../models/Portfolio.js';

export const getPortfolio = async (req, res) => {
    try {
        const items = await Portfolio.find().sort({ createdAt: -1 });
        res.json({ success: true, items });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

export const createPortfolioItem = async (req, res) => {
    try {
        const { title, category } = req.body;
        const image = req.file ? req.file.path : "";
        if (!image) return res.status(400).json({ success: false, message: "Image is required" });

        const item = new Portfolio({ title, category, image });
        await item.save();
        res.status(201).json({ success: true, item });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

export const deletePortfolioItem = async (req, res) => {
    try {
        await Portfolio.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: "Deleted" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
