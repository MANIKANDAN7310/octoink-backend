import express from 'express';
import { createOrder, verifyPayment, webhook } from '../controllers/paymentController.js';
import verifyToken from '../middleware/auth.js';

const router = express.Router();

router.post('/create-order', verifyToken, createOrder);
router.post('/verify', verifyToken, verifyPayment);
router.post('/webhook', webhook);

export default router;
