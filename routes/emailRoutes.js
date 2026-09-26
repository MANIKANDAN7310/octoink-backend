import express from 'express';
import multer from 'multer';
const memoryStorage = multer.memoryStorage();
import { getStatus, uploadRecipients, createCampaign, listCampaigns, getCampaign, startCampaign, stopCampaign, resumeCampaign, getRecipients, getFollowups, startFollowup, listReplies } from '../controllers/emailController.js';

const router = express.Router();
const upload = multer({ storage: memoryStorage });

router.get('/status', getStatus);
router.post('/upload-recipients', upload.single('file'), uploadRecipients);
router.post('/campaign', createCampaign);
router.get('/campaigns', listCampaigns);
router.get('/campaign/:id', getCampaign);
router.post('/campaign/:id/start', startCampaign);
router.post('/campaign/:id/stop', stopCampaign);
router.post('/campaign/:id/resume', resumeCampaign);
router.get('/recipients', getRecipients);
router.get('/followups', getFollowups);
router.post('/followups/:campaignId/start', startFollowup);
router.get('/replies', listReplies);

export default router;
