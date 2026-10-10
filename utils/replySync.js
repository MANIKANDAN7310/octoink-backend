import imapSimple from "imap-simple";
import { simpleParser } from "mailparser";
import EmailReply from "../models/EmailReply.js";
import CampaignRecipient from "../models/CampaignRecipient.js";
import Campaign from "../models/Campaign.js";
import EmailSendRecord from "../models/EmailSendRecord.js";
import B2BClient from "../models/B2BClient.js";

let isSyncInProgress = false;

/**
 * Connect to Gmail IMAP and scan for incoming replies
 */
export async function syncIncomingReplies() {
  if (isSyncInProgress) {
    console.log("[REPLY_SYNC] Sync already in progress, skipping duplicate invocation.");
    return { success: true, message: "Sync already in progress", newRepliesCount: 0 };
  }

  isSyncInProgress = true;
  let connection = null;

  try {
    const user = process.env.EMAIL_USER || "hello.octoinkstudios@gmail.com";
    const password = process.env.EMAIL_PASS || "oyfekwhejzjozsgc";

    const config = {
      imap: {
        user,
        password,
        host: process.env.IMAP_HOST || "imap.gmail.com",
        port: process.env.IMAP_PORT ? parseInt(process.env.IMAP_PORT, 10) : 993,
        tls: true,
        authTimeout: 12000,
        tlsOptions: { rejectUnauthorized: false },
      },
    };

    console.log(`[REPLY_SYNC] Connecting to IMAP for ${user}...`);
    connection = await imapSimple.connect(config);
    await connection.openBox("INBOX");

    // Fetch messages from inbox (last 100 messages)
    const searchCriteria = ["ALL"];
    const fetchOptions = {
      bodies: ["HEADER", "TEXT", ""],
      struct: true,
      markSeen: false,
    };

    const messages = await connection.search(searchCriteria, fetchOptions);
    console.log(`[REPLY_SYNC] Found ${messages.length} total messages in INBOX.`);

    // Take the most recent 100 messages
    const recentMessages = messages.slice(-100);
    let newRepliesCount = 0;

    for (const item of recentMessages) {
      try {
        const allPart = item.parts.find((part) => part.which === "");
        if (!allPart || !allPart.body) continue;

        const parsed = await simpleParser(allPart.body);
        const senderAddress = parsed.from?.value?.[0]?.address?.toLowerCase().trim();
        const senderName = parsed.from?.value?.[0]?.name || (senderAddress ? senderAddress.split("@")[0] : "Client");
        const subject = parsed.subject || "No Subject";
        const messageId = parsed.messageId || `${item.attributes?.uid || Date.now()}-${senderAddress}`;
        const emailDate = parsed.date ? new Date(parsed.date) : new Date();
        const replyText = (parsed.text || parsed.html?.replace(/<[^>]+>/g, " ") || "").trim();

        if (!senderAddress) continue;

        // Skip our own emails
        if (senderAddress === user.toLowerCase()) continue;

        // Skip typical daemon / bounce / security messages
        if (
          senderAddress.includes("mailer-daemon") ||
          senderAddress.includes("postmaster") ||
          senderAddress.includes("notifications@github.com") ||
          senderAddress.includes("google.com") ||
          senderAddress.includes("noreply") ||
          senderAddress.includes("no-reply")
        ) {
          continue;
        }

        // Deduplication Check 1: Check by messageId
        if (messageId) {
          const existingById = await EmailReply.findOne({ messageId });
          if (existingById) continue;
        }

        // Deduplication Check 2: Check by sender + subject + receivedAt within 5-minute window
        const timeWindowStart = new Date(emailDate.getTime() - 5 * 60 * 1000);
        const timeWindowEnd = new Date(emailDate.getTime() + 5 * 60 * 1000);
        const existingByDetails = await EmailReply.findOne({
          email: senderAddress,
          replySubject: subject,
          receivedAt: { $gte: timeWindowStart, $lte: timeWindowEnd },
        });
        if (existingByDetails) continue;

        // Find associated outreach email / campaign
        // Look up by recipient email across all campaigns (most recently sent first)
        const recipient = await CampaignRecipient.findOne({ email: senderAddress }).sort({ sentAt: -1, createdAt: -1 });

        let campaignId = "CMP-INBOUND";
        let originalCampaignName = "Inbound / Direct Contact";
        let originalSubject = "Octoink Outreach";
        let companyName = senderName;

        if (recipient) {
          campaignId = recipient.campaignId;
          companyName = recipient.companyName || senderName;
          
          const campaign = await Campaign.findOne({ campaignId });
          if (campaign) {
            originalCampaignName = campaign.name || campaignId;
            originalSubject = recipient.subject || campaign.subject || "Octoink Outreach";
          }

          // Update CampaignRecipient
          const wasAlreadyReplied = recipient.replied;
          recipient.replied = true;
          recipient.repliedAt = emailDate;
          recipient.replySubject = subject;
          recipient.replyMessage = replyText.slice(0, 1500);
          recipient.status = "Replied";
          recipient.lastActivityAt = emailDate;
          await recipient.save();

          // Increment campaign reply count if first reply
          if (!wasAlreadyReplied && campaign) {
            await Campaign.updateOne({ campaignId }, { $inc: { replyCount: 1 } });
          }
        } else {
          // Check EmailSendRecord
          const sendRecord = await EmailSendRecord.findOne({ email: senderAddress }).sort({ sentAt: -1 });
          if (sendRecord) {
            campaignId = sendRecord.campaignId;
            originalCampaignName = sendRecord.campaignName || campaignId;
            originalSubject = sendRecord.subject || "Octoink Outreach";
            companyName = sendRecord.companyName || sendRecord.recipientName || senderName;
          }
        }

        // Create durable EmailReply record
        await EmailReply.create({
          campaignId,
          originalCampaignName,
          companyName,
          email: senderAddress,
          originalSubject,
          replySubject: subject,
          replyMessage: replyText.slice(0, 5000),
          receivedAt: emailDate,
          messageId,
          status: "New Reply",
        });

        // Update or create B2B Client record
        let b2bClient = await B2BClient.findOne({ email: senderAddress });
        if (b2bClient) {
          b2bClient.repliesCount = (b2bClient.repliesCount || 0) + 1;
          b2bClient.status = "Replied";
          b2bClient.lastContactDate = emailDate;
          b2bClient.timeline.push({
            event: `Incoming reply received: "${subject}"`,
            type: "replied",
            details: replyText.slice(0, 300),
            timestamp: emailDate,
          });
          await b2bClient.save();
        }

        newRepliesCount++;
        console.log(`[REPLY_SYNC] Successfully recorded incoming reply from: ${senderAddress} for campaign ${campaignId}`);
      } catch (itemErr) {
        console.warn(`[REPLY_SYNC] Error processing message item:`, itemErr.message);
      }
    }

    console.log(`[REPLY_SYNC] Sync complete. Recorded ${newRepliesCount} new incoming replies.`);
    return { success: true, newRepliesCount };
  } catch (err) {
    console.error("[REPLY_SYNC] Error during IMAP sync:", err.message);
    return { success: false, error: err.message, newRepliesCount: 0 };
  } finally {
    if (connection) {
      try {
        connection.end();
      } catch (_) {}
    }
    isSyncInProgress = false;
  }
}
