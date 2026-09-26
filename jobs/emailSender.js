import SentEmail from '../models/SentEmail.js';
import EmailCampaign from '../models/EmailCampaign.js';
import EmailClient from '../models/EmailClient.js';
import { sendEmail } from '../utils/sendEmail.js';

// Simple in-process queue processor. Checks campaign status before each send.
export const enqueueEmailSend = async (campaignId) => {
    // process queued items in small batches
    setImmediate(() => processQueue(campaignId));
};

const processQueue = async (campaignId) => {
    const BATCH = 5;
    while (true) {
        const campaign = await EmailCampaign.findById(campaignId);
        if (!campaign) break;
        if (campaign.status !== 'running') break; // stop if paused/stopped

        const queued = await SentEmail.find({ campaignId, status: 'queued' }).limit(BATCH);
        if (!queued || queued.length === 0) {
            // mark campaign complete if no more queued
            const remaining = await SentEmail.countDocuments({ campaignId, status: 'queued' });
            if (remaining === 0) {
                campaign.status = 'completed';
                campaign.completedAt = new Date();
                await campaign.save();
            }
            break;
        }

        for (const item of queued) {
            // re-check campaign status
            const fresh = await EmailCampaign.findById(campaignId);
            if (!fresh || fresh.status !== 'running') return;

            try {
                // fetch client data for personalization
                const client = await EmailClient.findById(item.clientId);
                const template = (await EmailCampaign.findById(campaignId)).templates.find(t => t.sequence === item.sequence) || (await EmailCampaign.findById(campaignId)).templates[0];

                const sendResult = await sendEmail({
                    email: client.email,
                    name: client.name,
                    subject: template.subject,
                    html: template.bodyHtml,
                    text: template.bodyText
                });

                item.sentAt = new Date();
                item.status = sendResult.success ? 'sent' : 'failed';
                item.messageId = sendResult.messageId || null;
                if (!sendResult.success) item.error = sendResult.error ? JSON.stringify(sendResult.error) : 'unknown';
                await item.save();
            } catch (err) {
                console.error('processQueue item send error', err.message);
                item.status = 'failed';
                item.error = err.message;
                await item.save();
            }

            // small delay between sends to avoid bursting
            await new Promise(r => setTimeout(r, 200));
        }
    }
};
