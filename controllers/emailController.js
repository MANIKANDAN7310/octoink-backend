import EmailCampaign from '../models/EmailCampaign.js';
import EmailClient from '../models/EmailClient.js';
import SentEmail from '../models/SentEmail.js';
import { parseSpreadsheetBuffer } from '../utils/spreadsheet.js';
import validator from 'validator';
import { enqueueEmailSend } from '../jobs/emailSender.js';
import { checkSmtpConnection } from '../utils/smtp.js';

export const getStatus = async (req, res) => {
    try {
        const smtpUser = process.env.SMTP_USER || process.env.EMAIL_USER || null;
        const smtpCheck = await checkSmtpConnection();
        const status = smtpCheck.ok ? 'Connected' : 'Not Connected';
        res.json({ success: true, sendingFrom: smtpUser ? smtpUser : 'Not Configured', status, provider: 'Gmail / SMTP', details: smtpCheck.ok ? undefined : smtpCheck.reason });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
};

export const uploadRecipients = async (req, res) => {
    try {
        if (!req.file || !req.file.buffer) return res.status(400).json({ success: false, message: 'No file uploaded' });
        const parsed = await parseSpreadsheetBuffer(req.file.buffer);

        const rows = parsed.rows || [];
        const stats = { total: rows.length, valid: 0, invalid: 0, duplicates: 0 };

        const toInsert = [];
        const seen = new Set();

        for (const r of rows) {
            const email = (r.email || r.Email || r.EMAIL || r['Email'] || '').trim();
            if (!email || !validator.isEmail(email)) {
                stats.invalid++;
                continue;
            }
            const lower = email.toLowerCase();
            if (seen.has(lower)) { stats.duplicates++; continue; }
            seen.add(lower);
            stats.valid++;
            toInsert.push({ name: r.name || r.Name || '', email: lower, company: r.company || r.Company || '', website: r.website || r.Website || '' });
        }

        // Upsert clients avoiding duplicates
        const inserted = [];
        for (const c of toInsert) {
            const existing = await EmailClient.findOne({ email: c.email });
            if (existing) { inserted.push(existing); continue; }
            const created = await EmailClient.create(c);
            inserted.push(created);
        }

        res.json({ success: true, stats: { total: stats.total, valid: stats.valid, invalid: stats.invalid, duplicates: stats.duplicates }, insertedCount: inserted.length, inserted });
    } catch (err) {
        console.error('uploadRecipients error', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
};

export const createCampaign = async (req, res) => {
    try {
        const { name, template } = req.body;
        if (!name) return res.status(400).json({ success: false, message: 'Name required' });
        const campaign = new EmailCampaign({ name, status: 'draft', templates: template ? [template] : [] });
        await campaign.save();
        res.json({ success: true, campaign });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

export const listCampaigns = async (req, res) => {
    const campaigns = await EmailCampaign.find().sort({ createdAt: -1 });
    res.json({ success: true, campaigns });
};

export const getCampaign = async (req, res) => {
    const campaign = await EmailCampaign.findById(req.params.id).populate('recipients');
    if (!campaign) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, campaign });
};

export const startCampaign = async (req, res) => {
    try {
        const campaign = await EmailCampaign.findById(req.params.id).populate('recipients');
        if (!campaign) return res.status(404).json({ success: false, message: 'Not found' });
        if (campaign.status === 'running') return res.status(400).json({ success: false, message: 'Campaign already running' });
        if (!campaign.templates || !campaign.templates.length) return res.status(400).json({ success: false, message: 'No templates in campaign' });

        campaign.status = 'running';
        campaign.startedAt = new Date();
        await campaign.save();

        // enqueue initial sends for sequence 1
        const seqTemplate = campaign.templates.find(t => t.sequence === 1) || campaign.templates[0];
        for (const rec of campaign.recipients) {
            // Avoid duplicates: check SentEmail
            const existing = await SentEmail.findOne({ campaignId: campaign._id, recipientEmail: rec.email, sequence: 1 });
            if (existing) continue;
            await SentEmail.create({ campaignId: campaign._id, clientId: rec._id, recipientEmail: rec.email, sequence: 1, status: 'queued' });
        }

        // Kick off background job to process queue
        enqueueEmailSend(campaign._id);

        res.json({ success: true, message: 'Campaign started', campaign });
    } catch (err) {
        console.error('startCampaign err', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
};

export const stopCampaign = async (req, res) => {
    try {
        const campaign = await EmailCampaign.findById(req.params.id);
        if (!campaign) return res.status(404).json({ success: false, message: 'Not found' });
        campaign.status = 'paused';
        campaign.pausedAt = new Date();
        await campaign.save();
        res.json({ success: true, message: 'Campaign paused', campaign });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

export const resumeCampaign = async (req, res) => {
    try {
        const campaign = await EmailCampaign.findById(req.params.id);
        if (!campaign) return res.status(404).json({ success: false, message: 'Not found' });
        campaign.status = 'running';
        campaign.pausedAt = null;
        await campaign.save();
        enqueueEmailSend(campaign._id);
        res.json({ success: true, message: 'Campaign resumed', campaign });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

export const getRecipients = async (req, res) => {
    const clients = await EmailClient.find().sort({ createdAt: -1 });
    res.json({ success: true, clients });
};

export const getFollowups = async (req, res) => {
    // list recipients who had sequence 1 sent but not replied
    const campaignId = req.query.campaignId;
    const sent = await SentEmail.find({ campaignId, sequence: 1, replied: false, status: 'sent' }).populate('clientId');
    res.json({ success: true, followups: sent });
};

export const startFollowup = async (req, res) => {
    try {
        const campaignId = req.params.campaignId;
        const campaign = await EmailCampaign.findById(campaignId).populate('recipients');
        if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });
        const seq2 = campaign.templates.find(t => t.sequence === 2);
        if (!seq2) return res.status(400).json({ success: false, message: 'No follow-up template configured' });

        // queue followups for eligible recipients
        const eligible = await SentEmail.find({ campaignId, sequence: 1, replied: false, status: 'sent' });
        for (const e of eligible) {
            // avoid duplicates
            const existing = await SentEmail.findOne({ campaignId, recipientEmail: e.recipientEmail, sequence: 2 });
            if (existing) continue;
            await SentEmail.create({ campaignId, clientId: e.clientId, recipientEmail: e.recipientEmail, sequence: 2, status: 'queued' });
        }

        // process follow-up queue
        enqueueEmailSend(campaignId);

        res.json({ success: true, message: 'Followups queued' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

export const listReplies = async (req, res) => {
    // simple: list SentEmails with replied = true
    const replied = await SentEmail.find({ replied: true }).populate('clientId');
    res.json({ success: true, replied });
};
