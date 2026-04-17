import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { v2 as cloudinary } from 'cloudinary';
import Portfolio from '../models/Portfolio.js';
import Banner from '../models/Banner.js';
import Product from '../models/Product.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const INITIAL_PORTFOLIO = [
  { category: "Embroidery Design", image: "./src/assets/emb1.jpg", title: "Custom Embroidery" },
  { category: "Enamel Pin Collection", image: "./src/assets/91SPgUm6UEL._AC_UY1100_.jpg", title: "Custom Pins" },
  { category: "Medals Design", image: "./src/assets/die-cast-medals.png", title: "Custom Medals" },
  { category: "Coins Design", image: "./src/assets/coinimage1.jpg", title: "Custom Coins" },
  { category: "Vector Art and Poster", image: "./src/assets/vector3.jpg", title: "Vector Illustration" },
  { category: "Embroidery Design", image: "./src/assets/applique.jpg", title: "applique" },
  { category: "Enamel Pin Collection", image: "./src/assets/pin2.jpg", title: "Custom Pins" },
  { category: "Enamel Pin Collection", image: "./src/assets/soft-vs-hard.jpg", title: "Soft vs Hard" },
  { category: "Vector Art and Poster", image: "./src/assets/vector2.jpg", title: "Vector Art" },
  { category: "Medals Design", image: "./src/assets/1754917181858.jpg", title: "Running Medals" },
  { category: "Medals Design", image: "./src/assets/Ornanment2.jpg", title: "Custom Ornamen" },
  { category: "Coins Design", image: "./src/assets/coinimage2.jpg", title: "Commemorative Coin" },
  { category: "Coins Design", image: "./src/assets/coinimage3.jpg", title: "Commemorative Coin" },
  { category: "Embroidery Design", image: "./src/assets/emb2.jpg", title: " Anime Embroidery" },
  { category: "Vector Art and Poster", image: "./src/assets/poster.jpg", title: "Poster Design" },
];

dotenv.config({ path: path.join(__dirname, '../.env') });

cloudinary.config({
  cloud_name: 'octoink',
  api_key: '332843736632742',
  api_secret: 'H8x-qTsT3H2xyyRhNNCFWyRVXuU',
});

const DEFAULT_PLACEHOLDER = 'https://placehold.co/1200x800?text=Octoink+Image';

const mongoUri = process.env.MONGO_URI;

async function migrate() {
  try {
    console.log("🚀 Starting migration to Cloudinary...");
    await mongoose.connect(mongoUri);
    console.log("✅ Connected to MongoDB");

    // 0. Seed Portfolio if empty
    const count = await Portfolio.countDocuments();
    if (count === 0) {
      console.log("🌱 Seeding initial portfolio items...");
      await Portfolio.insertMany(INITIAL_PORTFOLIO);
    }

    // 1. Migrate Portfolio
    const portfolioItems = await Portfolio.find();
    console.log(`📸 Found ${portfolioItems.length} portfolio items`);
    for (const item of portfolioItems) {
      if (item.image && !item.image.startsWith('http')) {
        const localPath = resolvePath(item.image);
        const url = await uploadToCloudinary(localPath, 'octoink_portfolio');
        item.image = url;
        await item.save();
        console.log(`✅ Migrated Portfolio: ${item.title}`);
      }
    }

    // 2. Migrate Banners
    const banners = await Banner.find();
    console.log(`🚩 Found ${banners.length} banners`);
    for (const banner of banners) {
      if (banner.image && !banner.image.startsWith('http')) {
        const localPath = resolvePath(banner.image);
        const url = await uploadToCloudinary(localPath, 'octoink_banners');
        banner.image = url;
        await banner.save();
        console.log(`✅ Migrated Banner: ${banner.heading}`);
      }
    }

    // 3. Migrate Products
    const products = await Product.find();
    console.log(`📦 Found ${products.length} products`);
    for (const product of products) {
        let updated = false;
        if (product.image && !product.image.startsWith('http')) {
            const localPath = resolvePath(product.image);
            product.image = await uploadToCloudinary(localPath, 'octoink_products');
            updated = true;
        }
        if (product.extraImages && product.extraImages.length > 0) {
            const newExtras = [];
            for (const img of product.extraImages) {
                if (img && !img.startsWith('http')) {
                    const localPath = resolvePath(img);
                    const url = await uploadToCloudinary(localPath, 'octoink_products');
                    newExtras.push(url);
                    updated = true;
                } else {
                    newExtras.push(img);
                }
            }
            product.extraImages = newExtras;
        }
        if (updated) {
            await product.save();
            console.log(`✅ Migrated Product: ${product.title}`);
        }
    }

    console.log("🎊 Migration complete!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exit(1);
  }
}

function resolvePath(relativePath) {
    // Handle various path formats
    let cleanPath = relativePath.replace(/\\/g, '/');
    if (cleanPath.startsWith('./')) cleanPath = cleanPath.substring(2);
    if (cleanPath.startsWith('/')) cleanPath = cleanPath.substring(1);
    
    // Check in backend/uploads first
    const backendPath = path.join(__dirname, '..', cleanPath);
    if (fs.existsSync(backendPath)) return backendPath;

    // Check in src/assets (frontend)
    // relativePath might be "./src/assets/..."
    const frontendPath = path.join(__dirname, '../../', cleanPath);
    if (fs.existsSync(frontendPath)) return frontendPath;

    // Handle just uploads/images/...
    const uploadsPath = path.join(__dirname, '../uploads', cleanPath.replace('uploads/', ''));
    if (fs.existsSync(uploadsPath)) return uploadsPath;

    return null;
}

async function uploadToCloudinary(filePath, folder) {
  if (!filePath || !fs.existsSync(filePath)) {
    console.warn(`⚠️ File not found: ${filePath}, using placeholder`);
    return DEFAULT_PLACEHOLDER;
  }

  try {
    const result = await cloudinary.uploader.upload(filePath, { folder });
    return result.secure_url;
  } catch (err) {
    console.error(`❌ Cloudinary upload failed for ${filePath}:`, err.message);
    return DEFAULT_PLACEHOLDER;
  }
}

migrate();
