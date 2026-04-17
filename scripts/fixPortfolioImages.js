import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

// Map each portfolio title to its correct public image path
const PORTFOLIO_IMAGE_MAP = [
  { title: "Custom Embroidery",   image: "/portfolio/emb1.jpg" },
  { title: "Custom Pins",         image: "/portfolio/91SPgUm6UEL._AC_UY1100_.jpg", category: "Enamel Pin Collection" },
  { title: "Custom Medals",       image: "/portfolio/die-cast-medals.png" },
  { title: "Custom Coins",        image: "/portfolio/coinimage1.jpg" },
  { title: "Vector Illustration", image: "/portfolio/vector3.jpg" },
  { title: "applique",            image: "/portfolio/applique.jpg" },
  { title: "Soft vs Hard",        image: "/portfolio/soft-vs-hard.jpg" },
  { title: "Vector Art",          image: "/portfolio/vector2.jpg" },
  { title: "Running Medals",      image: "/portfolio/1754917181858.jpg" },
  { title: "Custom Ornamen",      image: "/portfolio/Ornanment2.jpg" },
  { title: "Poster Design",       image: "/portfolio/poster.jpg" },
  { title: " Anime Embroidery",   image: "/portfolio/emb2.jpg" },
];

// For items with duplicate titles, match by category too
const COIN_ITEMS = [
  { title: "Commemorative Coin", category: "Coins Design", images: ["/portfolio/coinimage2.jpg", "/portfolio/coinimage3.jpg"] },
];

const PIN_DUPLICATE = { title: "Custom Pins", category: "Enamel Pin Collection", image: "/portfolio/pin2.jpg" };

async function fix() {
  try {
    console.log("🚀 Fixing portfolio images...");
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Connected to MongoDB");

    const db = mongoose.connection.db;
    const collection = db.collection('portfolios');
    const items = await collection.find({}).toArray();

    console.log(`📸 Found ${items.length} portfolio items`);

    let updatedCount = 0;
    const usedPinDuplicate = false;

    for (const item of items) {
      // Find the matching image from our map
      let newImage = null;

      // Check the main map first
      const match = PORTFOLIO_IMAGE_MAP.find(m => {
        if (m.title === item.title) {
          if (m.category) return m.category === item.category;
          return true;
        }
        return false;
      });

      if (match) {
        newImage = match.image;
        // Remove from map so duplicates get different images
        const idx = PORTFOLIO_IMAGE_MAP.indexOf(match);
        PORTFOLIO_IMAGE_MAP.splice(idx, 1);
      }

      // Handle Commemorative Coin duplicates
      if (!newImage && item.title === "Commemorative Coin") {
        const coinEntry = COIN_ITEMS[0];
        if (coinEntry && coinEntry.images.length > 0) {
          newImage = coinEntry.images.shift();
        }
      }

      // Handle Custom Pins duplicate
      if (!newImage && item.title === "Custom Pins") {
        newImage = PIN_DUPLICATE.image;
      }

      if (newImage) {
        await collection.updateOne(
          { _id: item._id },
          { $set: { image: newImage } }
        );
        console.log(`   ✅ ${item.title} → ${newImage}`);
        updatedCount++;
      } else {
        console.log(`   ⚠️ No image mapping found for: ${item.title}`);
      }
    }

    console.log(`\n🎊 Updated ${updatedCount} / ${items.length} portfolio items!`);
    process.exit(0);
  } catch (err) {
    console.error("❌ Error:", err);
    process.exit(1);
  }
}

fix();
