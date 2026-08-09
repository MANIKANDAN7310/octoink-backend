import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: 'dghzu6wlx',
  api_key: '332843736632742',
  api_secret: 'H8x-qTsT3H2xyyRhNNCFWyRVXuU',
});

const filesToUpload = [
  '../public/portfolio/Embbefore.jpg',
  '../public/portfolio/Embafter.jpg',
  '../public/portfolio/vector_before.png',
  '../public/portfolio/vector_after.png',
  '../public/portfolio/pin_before.png',
  '../public/portfolio/pin_after.png'
];

async function uploadFiles() {
  for (const file of filesToUpload) {
    try {
      const res = await cloudinary.uploader.upload(file, { folder: 'octoink_portfolio' });
      console.log(`[SUCCESS] ${file} -> ${res.secure_url}`);
    } catch (err) {
      console.error(`[ERROR] ${file} ->`, err.message);
    }
  }
}

uploadFiles();
