import express from 'express';
import multer from 'multer';
import { storage } from '../config/cloudinary.js';
import { 
    getProducts, 
    getProductById, 
    deleteProduct 
} from '../controllers/productController.js';
import Product from '../models/Product.js';

const router = express.Router();
const upload = multer({ 
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit for all files
  },
  fileFilter: (req, file, cb) => {
    console.log(`[Multer Filter] Checking file: ${file.originalname} (${file.mimetype}) for field: ${file.fieldname}`);
    
    // strictly require .zip for 'file' field
    if (file.fieldname === 'file') {
      const isZipExtension = file.originalname.match(/\.zip$/i);
      const isZipMime = file.mimetype === 'application/zip' || 
                        file.mimetype === 'application/x-zip' ||
                        file.mimetype === 'application/x-zip-compressed' ||
                        file.mimetype === 'application/octet-stream' ||
                        file.mimetype === 'multipart/x-zip';
      
      if (!isZipExtension && !isZipMime) {
        console.warn(`[Multer Filter] REJECTED invalid file type for 'file' field: ${file.originalname} (${file.mimetype})`);
        return cb(new Error('Only .zip files are allowed for the digital file download.'));
      }
      console.log(`[Multer Filter] ACCEPTED ZIP file: ${file.originalname}`);
    } else if (file.fieldname === 'image' || file.fieldname === 'extraImages') {
      // Basic image check
      if (!file.mimetype.startsWith('image/')) {
        console.warn(`[Multer Filter] REJECTED non-image file for ${file.fieldname}: ${file.originalname} (${file.mimetype})`);
        return cb(new Error('Only image files are allowed for product thumbnails.'));
      }
      console.log(`[Multer Filter] ACCEPTED image file: ${file.originalname}`);
    }
    cb(null, true);
  }
});

router.get('/', getProducts);
router.get('/:id', getProductById);
// Helper middleware to run Multer and log request details
const handleUpload = (req, res, next) => {
  try {
    upload.fields([
      { name: 'image', maxCount: 1 },
      { name: 'extraImages', maxCount: 5 },
      { name: 'file', maxCount: 1 },
    ])(req, res, (err) => {
      console.log('--- Product Upload Request Start ---');
      if (err) {
        console.error('❌ Multer/Cloudinary Error:', err);
        return res.status(400).json({ 
          success: false, 
          message: err.message || 'Error during file upload',
          error: err 
        });
      }
      console.log('✅ Multer process complete. Files:', req.files ? Object.keys(req.files) : 'none');
      next();
    });
  } catch (criticalErr) {
    console.error('🔥 Critical Upload Middleware Crash:', criticalErr);
    res.status(500).json({ success: false, message: 'Critical error in upload middleware' });
  }
};

// Create Product with detailed logging
router.post('/', handleUpload, async (req, res) => {
  console.log('>>> Entering POST /api/products handler');
  try {
    const { title, description, price, originalPrice, category, tags } = req.body;
    
    console.log('Step 1: Extracting fields from body');
    const imageUrl = req.files?.image?.[0]?.path || '';
    const extraImagesUrls = req.files?.extraImages ? req.files.extraImages.map((f) => f.path) : [];
    const fileUrl = req.files?.file?.[0]?.path || '';

    console.log('Step 2: Resolved Cloudinary URLs:');
    console.log(' - Image:', imageUrl || '(none)');
    console.log(' - Extra Images:', extraImagesUrls.length ? extraImagesUrls : '(none)');
    console.log(' - ZIP file:', fileUrl || '(none)');

    if (!title || !price || !category) {
      console.warn('Validation failed: Missing required fields');
      return res.status(400).json({ 
        success: false, 
        message: 'Title, price, and category are required.' 
      });
    }

    console.log('Step 3: Creating Product document');
    const productData = {
      title,
      description,
      price: Number(price),
      originalPrice: originalPrice ? Number(originalPrice) : undefined,
      category,
      tags,
      image: imageUrl,
      extraImages: extraImagesUrls,
      file: fileUrl,
    };
    
    if (isNaN(productData.price)) {
      console.warn('Validation failed: Price is not a number');
      return res.status(400).json({ success: false, message: 'Price must be a valid number.' });
    }

    const newProduct = new Product(productData);

    console.log('Step 4: Saving to MongoDB');
    await newProduct.save();
    
    console.log('✅ Product saved successfully, ID:', newProduct._id);
    res.status(201).json({ success: true, product: newProduct });
  } catch (error) {
    console.error('❌ Detailed Product Creation Error:', {
      message: error.message,
      code: error.code,
      stack: error.stack,
      cloudinaryError: error.cloudinaryError || 'none'
    });
    
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Server error during product creation',
      error: process.env.NODE_ENV === 'development' ? error : undefined
    });
  }
});

// Update Product with detailed logging
router.put('/:id', handleUpload, async (req, res) => {
  try {
    const updates = { ...req.body };
    if (req.files?.image?.[0]) updates.image = req.files.image[0].path;
    if (req.files?.extraImages) updates.extraImages = req.files.extraImages.map((f) => f.path);
    if (req.files?.file?.[0]) updates.file = req.files.file[0].path;

    console.log('Update payload:', updates);

    const product = await Product.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    console.log('Product updated, ID:', product._id);
    res.json({ success: true, product });
  } catch (error) {
    console.error('Product update error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});
router.delete('/:id', deleteProduct);

export default router;
