import Product from '../models/Product.js';

export const getProducts = async (req, res) => {
    try {
        const products = await Product.find().sort({ createdAt: -1 });
        res.json({ success: true, products });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

export const getProductById = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) return res.status(404).json({ success: false, message: "Not found" });
        res.json({ success: true, product });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

export const createProduct = async (req, res) => {
    try {
        const { title, category, price, originalPrice, description, tags } = req.body;
        
        // Multer with Cloudinary storage will provide the URL in req.file.path or req.files
        const imagePath = req.files?.image?.[0] ? req.files.image[0].path : "";
        const extraImagePaths = (req.files?.extraImages || []).map(f => f.path);
        
        // Note: For files (like PDFs), you might still want local storage or another Cloudinary folder
        // The user said "Do NOT store images locally". They didn't mention other files.
        // I'll assume all images go to Cloudinary.
        
        const product = new Product({ 
            title, 
            category, 
            price, 
            originalPrice, 
            description, 
            tags, 
            image: imagePath, 
            extraImages: extraImagePaths 
        });
        
        await product.save();
        res.status(201).json({ success: true, product });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

export const updateProduct = async (req, res) => {
    try {
        const updates = { ...req.body };
        if (req.files?.image?.[0]) updates.image = req.files.image[0].path;
        if (req.files?.extraImages) updates.extraImages = req.files.extraImages.map(f => f.path);
        
        const product = await Product.findByIdAndUpdate(req.params.id, updates, { new: true });
        if (!product) return res.status(404).json({ success: false, message: "Not found" });
        res.json({ success: true, product });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

export const deleteProduct = async (req, res) => {
    try {
        const product = await Product.findByIdAndDelete(req.params.id);
        if (!product) return res.status(404).json({ success: false, message: "Not found" });
        res.json({ success: true, message: "Deleted" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
export const getDownloadHistory = async (req, res) => {
    try {
        const User = (await import('../models/User.js')).default;
        const users = await User.find().select('name email downloadHistory');
        
        // Flatten all download history from all users
        const allDownloads = [];
        users.forEach(user => {
            (user.downloadHistory || []).forEach(download => {
                allDownloads.push({
                    _id: download._id,
                    productId: download.productId,
                    productTitle: download.productTitle,
                    userName: user.name,
                    userEmail: user.email,
                    paymentId: download.paymentId,
                    downloadedAt: download.downloadedAt
                });
            });
        });

        // Sort by most recent
        allDownloads.sort((a, b) => new Date(b.downloadedAt) - new Date(a.downloadedAt));

        res.json({ success: true, downloads: allDownloads });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
