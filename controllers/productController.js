import Product from '../models/Product.js';
import Order from '../models/Order.js';
import path from 'path';
import fs from 'fs';
import { Readable } from 'stream';
import jwt from 'jsonwebtoken';

export const getProducts = async (req, res) => {
    try {
        // Try to identify admin if token is provided
        let isAdmin = false;
        const token = req.headers.authorization?.split(" ")[1];
        if (token) {
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                isAdmin = decoded.isAdmin;
            } catch (e) {}
        }

        const products = await Product.find().sort({ createdAt: -1 }).select('+file');
        const productsWithFlag = products.map(p => {
            const productObj = p.toObject();
            productObj.hasFile = !!productObj.file;
            
            // Only expose the raw file URL to admins
            if (!isAdmin) {
                delete productObj.file;
            }
            return productObj;
        });
        res.json({ success: true, products: productsWithFlag });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

export const getProductById = async (req, res) => {
    try {
        let isAdmin = false;
        const token = req.headers.authorization?.split(" ")[1];
        if (token) {
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                isAdmin = decoded.isAdmin;
            } catch (e) {}
        }

        const product = await Product.findById(req.params.id).select('+file');
        if (!product) return res.status(404).json({ success: false, message: "Not found" });
        
        const productObj = product.toObject();
        productObj.hasFile = !!productObj.file;
        
        if (!isAdmin) {
            delete productObj.file;
        }

        res.json({ success: true, product: productObj });
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
        const filePath = req.files?.file?.[0] ? req.files.file[0].path : "";
        
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
            extraImages: extraImagePaths,
            file: filePath
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
        if (req.files?.file?.[0]) updates.file = req.files.file[0].path;
        
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

export const downloadProductFile = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        // 1. Check if product exists (explicitly select hidden 'file' field)
        const product = await Product.findById(id).select('+file');
        if (!product) {
            return res.status(404).json({ success: false, message: "Product not found" });
        }

        if (!product.file) {
            return res.status(400).json({ success: false, message: "No digital file associated with this product" });
        }

        // 2. Verify purchase (unless admin)
        if (!req.user.isAdmin) {
            const purchase = await Order.findOne({
                userId,
                status: 'Completed',
                'items.productId': id
            });

            if (!purchase) {
                return res.status(403).json({ 
                    success: false, 
                    message: "Purchase required to download this file. Please buy the product first." 
                });
            }
        }

        // 3. Fetch and stream the file from Cloudinary (or local storage if path is relative)
        const fileUrl = product.file;
        
        console.log(`[Download] Serving file for product: ${product.title} to user: ${userId}`);

        // If it's a remote URL (Cloudinary)
        if (fileUrl.startsWith('http')) {
            const response = await fetch(fileUrl);
            if (!response.ok) throw new Error(`Failed to fetch file from storage: ${response.statusText}`);

            // Get filename from URL or title
            const filename = product.title.replace(/[^a-z0-9]/gi, '_').toLowerCase() + ".zip";
            
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.setHeader('Content-Type', response.headers.get('content-type') || 'application/zip');

            // Pipe the web stream to the Node response
            Readable.fromWeb(response.body).pipe(res);
        } else {
            // Local file (if any)
            const absolutePath = path.resolve(fileUrl);
            if (fs.existsSync(absolutePath)) {
                res.download(absolutePath);
            } else {
                res.status(404).json({ success: false, message: "File not found on server" });
            }
        }

    } catch (err) {
        console.error("Download Error:", err);
        res.status(500).json({ success: false, message: "Error processing download: " + err.message });
    }
};
