import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'octoink',
  api_key: process.env.CLOUDINARY_API_KEY || '332843736632742',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'H8x-qTsT3H2xyyRhNNCFWyRVXuU',
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'octoink_products',
    allowed_formats: ['jpg', 'png', 'jpeg', 'webp', 'zip', 'pdf', 'svg'],
    resource_type: 'auto',
  },
});

const designStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'octoink_designs',
    allowed_formats: ['jpg', 'png', 'jpeg', 'webp'],
  },
});

const portfolioStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'octoink_portfolio',
    allowed_formats: ['jpg', 'png', 'jpeg', 'webp'],
  },
});

export { cloudinary, storage, designStorage, portfolioStorage };
