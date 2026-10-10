import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";

import {
  checkConnection,
  parseClientFile,
  createCampaign,
  startCampaign,
  stopCampaign,
  trackOpenPixel,
  getCampaigns,
  getCampaignById,
  getFollowUps,
  startFollowUp,
  stopFollowUp,
  getReplies,
  updateReplyStatus,
  createReply,
  getB2BClients,
  getB2BClientById,
  updateB2BClientStatus,
  checkDuplicateRecipients,
  triggerSyncReplies,
  getAnalytics,
  testSend,
} from "../controllers/emailTrackController.js";

const router = express.Router();

// Configure Multer for Memory Storage (Excel/CSV upload)
const uploadMemory = multer({ storage: multer.memoryStorage() });

// Configure Multer for Disk Storage (Email attachments)
const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + "-" + file.originalname);
  },
});

const uploadDisk = multer({ storage: diskStorage });

// 1. Connection check
router.get("/connection", checkConnection);

// 1b. Test send diagnostic
router.post("/test-send", testSend);

// 2. Client parse & duplicate check
router.post("/import-clients", uploadMemory.single("file"), parseClientFile);
router.post("/check-duplicates", checkDuplicateRecipients);

// 3. Campaigns
router.get("/campaigns", getCampaigns);
router.get("/campaigns/:id", getCampaignById);
router.post("/campaigns", uploadDisk.array("attachments", 10), createCampaign);
router.post("/campaigns/:id/start", startCampaign);
router.post("/campaigns/:id/stop", stopCampaign);

// 4. Open Pixel Tracking
router.get("/open", trackOpenPixel);

// 5. Follow-ups
router.get("/follow-up", getFollowUps);
router.post("/follow-up/start", startFollowUp);
router.post("/follow-up/stop", stopFollowUp);

// 6. Replies & Leads
router.get("/replies", getReplies);
router.post("/replies/sync", triggerSyncReplies);
router.post("/replies", createReply);
router.patch("/replies/:id/status", updateReplyStatus);

// 7. B2B Clients
router.get("/b2b-clients", getB2BClients);
router.get("/b2b-clients/:id", getB2BClientById);
router.patch("/b2b-clients/:id/status", updateB2BClientStatus);

// 8. Analytics
router.get("/analytics", getAnalytics);

export default router;
