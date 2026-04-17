import express from 'express';
import multer from 'multer';
import { portfolioStorage } from '../config/cloudinary.js';
import { getPortfolio, createPortfolioItem, deletePortfolioItem } from '../controllers/portfolioController.js';

const router = express.Router();
const upload = multer({ storage: portfolioStorage });

router.get('/', getPortfolio);
router.post('/', upload.single('image'), createPortfolioItem);
router.delete('/:id', deletePortfolioItem);

export default router;
