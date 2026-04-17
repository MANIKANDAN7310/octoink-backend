import express from 'express';
import multer from 'multer';
import { designStorage } from '../config/cloudinary.js';
import { 
    getOrders, 
    createCustomDesign, 
    getCustomDesigns,
    updateOrderStatus,
    deleteOrder
} from '../controllers/orderController.js';

const router = express.Router();
const upload = multer({ storage: designStorage });

router.get('/', getOrders);
router.get('/custom-designs', getCustomDesigns);
router.put('/:id/status', updateOrderStatus);
router.delete('/:id', deleteOrder);
router.post('/custom-design', upload.fields([
    { name: 'file', maxCount: 1 },
    { name: 'refFiles', maxCount: 10 }
]), createCustomDesign);

export default router;
