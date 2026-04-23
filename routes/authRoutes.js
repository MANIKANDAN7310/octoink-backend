import express from 'express';
import { register, login, getProfile, updateProfile } from '../controllers/authController.js';
import verifyToken from '../middleware/auth.js';

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.get('/profile', verifyToken, getProfile);
router.put('/profile', verifyToken, updateProfile);

export default router;
