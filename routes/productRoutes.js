import express from 'express';
import multer from 'multer';
import { storage } from '../config/cloudinary.js';
import { 
    getProducts, 
    getProductById, 
    createProduct, 
    updateProduct, 
    deleteProduct 
} from '../controllers/productController.js';

const router = express.Router();
const upload = multer({ storage });

router.get('/', getProducts);
router.get('/:id', getProductById);
router.post('/', upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'extraImages', maxCount: 5 },
    { name: 'file', maxCount: 1 }
]), createProduct);
router.put('/:id', upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'extraImages', maxCount: 5 },
    { name: 'file', maxCount: 1 }
]), updateProduct);
router.delete('/:id', deleteProduct);

export default router;
