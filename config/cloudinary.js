import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dghzu6wlx',
  api_key: process.env.CLOUDINARY_API_KEY || '332843736632742',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'H8x-qTsT3H2xyyRhNNCFWyRVXuU',
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    try {
      const filename = file.originalname || 'unknown';
      const mimetype = file.mimetype || '';
      const fieldname = file.fieldname || '';

      // Determine if it's a zip file based on fieldname, extension, or mimetype
      const isZip = fieldname === 'file' || 
                    filename.toLowerCase().endsWith('.zip') ||
                    mimetype === 'application/zip' ||
                    mimetype === 'application/x-zip-compressed' ||
                    mimetype === 'application/octet-stream';
      
      console.log(`[Cloudinary Storage] Processing: ${filename}, field: ${fieldname}, isZip: ${isZip}`);
      
      if (isZip) {
        const publicId = `${Date.now()}-${filename.replace(/\.[^/.]+$/, "")}`;
        return {
          folder: 'octoink_products/zips',
          resource_type: 'raw',
          public_id: publicId,
          // Do NOT specify format or transformation for raw files
        };
      }
      
      return {
        folder: 'octoink_products',
        resource_type: 'auto',
      };
    } catch (err) {
      console.error("[Cloudinary Storage Error]", err);
      // Fallback to auto
      return {
        folder: 'octoink_products_error',
        resource_type: 'auto',
      };
    }
  },
});

const designStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'octoink_designs',
    resource_type: 'auto',
  },
});

const portfolioStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'octoink_portfolio',
    resource_type: 'auto',
  },
});

export { cloudinary, storage, designStorage, portfolioStorage };
