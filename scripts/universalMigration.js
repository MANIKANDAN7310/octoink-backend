import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { v2 as cloudinary } from 'cloudinary';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure we load the right .env
dotenv.config({ path: path.join(__dirname, '../.env') });

const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || 'octoink';
const API_KEY = process.env.CLOUDINARY_API_KEY || '332843736632742';
const API_SECRET = process.env.CLOUDINARY_API_SECRET || 'H8x-qTsT3H2xyyRhNNCFWyRVXuU';

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

cloudinary.config({
  cloud_name: CLOUD_NAME,
  api_key: API_KEY,
  api_secret: API_SECRET,
});

async function migrateAll() {
    try {
        console.log("🚀 Starting Universal Migration to Cloudinary...");
        console.log(`📡 Cloud Name: ${CLOUD_NAME}`);
        
        await mongoose.connect(process.env.MONGO_URI);
        const db = mongoose.connection.db;
        const collections = await db.listCollections().toArray();
        
        for (const colInfo of collections) {
            const name = colInfo.name;
            if (['system.indexes', 'users'].includes(name)) continue;
            
            console.log(`\n📚 Checking collection: ${name}`);
            const collection = db.collection(name);
            const documents = await collection.find({}).toArray();
            
            for (const doc of documents) {
                let updated = false;
                const newDoc = { ...doc };
                
                // Fields that usually hold image paths
                const imageFields = ['image', 'imageUrl', 'displayImage', 'bannerImage', 'designFile', 'customDesignUrl'];
                
                for (const field of imageFields) {
                    // Check if it's a local path OR a previous placeholder we want to fix
                    const isPlaceHolder = doc[field] && doc[field].includes('placehold.co');
                    if (doc[field] && typeof doc[field] === 'string' && (!doc[field].startsWith('http') || isPlaceHolder)) {
                        console.log(`   🔍 Found path to migrate in ${name}.${field}: ${doc[field]}`);
                        
                        // If it's a placeholder, try to find the "Original" local path if stored, 
                        // or guess it from title + assets folder for seeding items
                        let localPathToUpload = resolvePath(doc[field]);
                        
                        if (isPlaceHolder && name === 'portfolios') {
                            // Specialized logic to recover original paths for seeded portfolio items
                            const originalSeeded = INITIAL_PORTFOLIO.find(p => p.title === doc.title);
                            if (originalSeeded) localPathToUpload = resolvePath(originalSeeded.image);
                        }

                        const cloudinaryUrl = await uploadFile(localPathToUpload, `migrated_${name}`);
                        if (cloudinaryUrl) {
                            newDoc[field] = cloudinaryUrl;
                            updated = true;
                        }
                    }
                }
                
                // Handle arrays (extraImages, etc.)
                if (Array.isArray(doc.extraImages)) {
                    const newExtras = [];
                    let extrasUpdated = false;
                    for (const img of doc.extraImages) {
                        if (img && typeof img === 'string' && !img.startsWith('http')) {
                            const localPath = resolvePath(img);
                            const url = await uploadFile(localPath, `migrated_${name}`);
                            if (url) {
                                newExtras.push(url);
                                extrasUpdated = true;
                            } else {
                                newExtras.push(img);
                            }
                        } else {
                            newExtras.push(img);
                        }
                    }
                    if (extrasUpdated) {
                        newDoc.extraImages = newExtras;
                        updated = true;
                    }
                }
                
                if (updated) {
                    await collection.updateOne({ _id: doc._id }, { $set: newDoc });
                    console.log(`   ✅ Updated record: ${doc._id}`);
                }
            }
        }
        
        console.log("\n🎊 Universal Migration Complete!");
        process.exit(0);
    } catch (err) {
        console.error("❌ Migration failed:", err);
        process.exit(1);
    }
}

function resolvePath(p) {
    if (!p) return null;
    let cp = p.replace(/\\/g, '/');
    if (cp.startsWith('./')) cp = cp.substring(2);
    if (cp.startsWith('/')) cp = cp.substring(1);
    
    const possiblePaths = [
        path.join(__dirname, '..', cp),
        path.join(__dirname, '..', 'uploads', cp.replace('uploads/', '')),
        path.join(__dirname, '../../', cp),
        path.join(__dirname, '../../vite-project/', cp),
        path.join('d:/My drive/octoink/octoink/vite-project', cp),
        path.join('d:/My drive/octoink/octoink/vite-project/src', cp.replace('src/', '')),
        path.join('d:/My drive/octoink/octoink/vite-project/backend/uploads', cp.replace('uploads/', ''))
    ];
    
    for (const pp of possiblePaths) {
        if (fs.existsSync(pp) && !fs.lstatSync(pp).isDirectory()) return pp;
    }
    
    return null;
}

async function uploadFile(filePath, folder) {
    if (!filePath) {
        console.log("      ⚠️ Path could not be resolved.");
        return null;
    }
    
    try {
        console.log(`      📤 Uploading: ${path.basename(filePath)}...`);
        const result = await cloudinary.uploader.upload(filePath, { 
            folder,
            resource_type: "auto"
        });
        console.log(`      💎 Success: ${result.secure_url}`);
        return result.secure_url;
    } catch (err) {
        console.error(`      ❌ Upload Error for ${path.basename(filePath)}: ${err.message}`);
        if (err.message.includes('cloud_name')) {
            console.error("      🛑 CRITICAL: Your Cloudinary Cloud Name appears to be incorrect.");
        }
        return null;
    }
}

migrateAll();
