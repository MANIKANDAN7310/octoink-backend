import imapSimple from "imap-simple";
import { simpleParser } from "mailparser";
import mongoose from "mongoose";
import EmailReply from "../models/EmailReply.js";
import CampaignRecipient from "../models/CampaignRecipient.js";
import Campaign from "../models/Campaign.js";
import EmailSendRecord from "../models/EmailSendRecord.js";
import B2BClient from "../models/B2BClient.js";

let isSyncInProgress = false;

const getImapCredentials = () => {
  let user = process.env.EMAIL_USER || process.env.EMAIL_FROM || process.env.SMTP_USER || "hello.octoinkstudios@gmail.com";
  // If user is set to an old internal address or does not contain hello.octoinkstudios, use official outreach account
  if (!user || user.toLowerCase().includes("octoinkstudios7310") || !user.includes("hello.octoinkstudios")) {
    user = "hello.octoinkstudios@gmail.com";
  }
  const password = process.env.EMAIL_PASS || process.env.SMTP_PASS || "oyfekwhejzjozsgc";
  return { user, password };
};

/**
 * Connect to Gmail IMAP and scan for incoming client replies
 */
export async function syncIncomingReplies() {
  if (isSyncInProgress) {
    console.log("[REPLY_SYNC] Sync already in progress, skipping duplicate invocation.");
    return { success: true, message: "Sync already in progress", newRepliesCount: 0 };
  }

  isSyncInProgress = true;
  let connection = null;

  try {
    const { user, password } = getImapCredentials();
    const host = process.env.IMAP_HOST || "imap.gmail.com";
    const port = process.env.IMAP_PORT ? parseInt(process.env.IMAP_PORT, 10) : 993;

    console.log(`[REPLY_SYNC] Connecting to Gmail IMAP as ${user}...`);

    try {
      connection = await imapSimple.connect({
        imap: {
          user,
          password,
          host,
          port,
          tls: true,
          authTimeout: 15000,
          tlsOptions: { rejectUnauthorized: false },
        },
      });
    } catch (primaryErr) {
      if (password !== "oyfekwhejzjozsgc" || user !== "hello.octoinkstudios@gmail.com") {
        console.warn(`[REPLY_SYNC] Primary IMAP connection failed: ${primaryErr.message}. Retrying with verified credentials for hello.octoinkstudios@gmail.com...`);
        connection = await imapSimple.connect({
          imap: {
            user: "hello.octoinkstudios@gmail.com",
            password: "oyfekwhejzjozsgc",
            host,
            port,
            tls: true,
            authTimeout: 15000,
            tlsOptions: { rejectUnauthorized: false },
          },
        });
      } else {
        throw primaryErr;
      }
    }

    await connection.openBox("INBOX");

    // Fetch UIDs of all messages in INBOX
    const uids = await new Promise((resolve, reject) => {
      connection.imap.search(["ALL"], (err, results) => {
        if (err) return reject(err);
        resolve(results || []);
      });
    });

    console.log(`[REPLY_SYNC] Found ${uids.length} total messages in INBOX.`);

    if (!uids.length) {
      return { success: true, newRepliesCount: 0 };
    }

    // Target the most recent 60 messages to ensure ultra-fast processing
    const targetUids = uids.slice(-60);

    const messages = await new Promise((resolve, reject) => {
      const fetch = connection.imap.fetch(targetUids, {
        bodies: ["HEADER", ""],
        struct: true,
        markSeen: false,
      });

      const msgs = [];
      fetch.on("message", (msg, seqNo) => {
        let rawBody = "";
        let attributes = null;

        msg.on("body", (stream) => {
          stream.on("data", (chunk) => {
            rawBody += chunk.toString("utf8");
          });
        });

        msg.once("attributes", (attrs) => {
          attributes = attrs;
        });

        msg.once("end", () => {
          msgs.push({ rawBody, attributes, seqNo });
        });
      });

      fetch.once("error", reject);
      fetch.once("end", () => resolve(msgs));
    });

    let newRepliesCount = 0;

    for (const item of messages) {
      try {
        if (!item.rawBody) continue;

        const parsed = await simpleParser(item.rawBody);
        const senderAddress = parsed.from?.value?.[0]?.address?.toLowerCase().trim();
        const senderName = parsed.from?.value?.[0]?.name || (senderAddress ? senderAddress.split("@")[0] : "Client");
        const subject = parsed.subject || "No Subject";
        const messageId = parsed.messageId || `${item.attributes?.uid || Date.now()}-${senderAddress}`;
        const emailDate = parsed.date ? new Date(parsed.date) : new Date();
        const replyText = (parsed.text || parsed.html?.replace(/<[^>]+>/g, " ") || "").trim();

        if (!senderAddress) continue;

        // Skip our own outbound emails
        if (
          senderAddress === "hello.octoinkstudios@gmail.com" ||
          senderAddress === user.toLowerCase()
        ) {
          continue;
        }

        // Skip automated notifications & system messages
        if (
          senderAddress.includes("mailer-daemon") ||
          senderAddress.includes("postmaster") ||
          senderAddress.includes("notifications@github.com") ||
          senderAddress.includes("google.com") ||
          senderAddress.includes("accounts.google") ||
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

        // Deduplication Check 2: Check by sender + subject + receivedAt within 15-minute window
        const timeWindowStart = new Date(emailDate.getTime() - 15 * 60 * 1000);
        const timeWindowEnd = new Date(emailDate.getTime() + 15 * 60 * 1000);
        const existingByDetails = await EmailReply.findOne({
          $or: [{ email: senderAddress }, { sender: senderAddress }],
          $or: [{ replySubject: subject }, { subject: subject }],
          receivedAt: { $gte: timeWindowStart, $lte: timeWindowEnd },
        });
        if (existingByDetails) continue;

        // Look up recipient across campaigns (case-insensitive)
        const recipient = await CampaignRecipient.findOne({
          email: { $regex: new RegExp(`^${senderAddress}$`, "i") },
        }).sort({ sentAt: -1, createdAt: -1 });

        let campaignId = "CMP-INBOUND";
        let originalCampaignName = "Inbound / Direct Contact";
        let originalSubject = "Octoink Outreach";
        let companyName = senderName;

        if (recipient) {
          campaignId = recipient.campaignId || campaignId;
          companyName = recipient.companyName || recipient.clientName || senderName;

          let campaign = await Campaign.findOne({ campaignId });
          if (!campaign && mongoose.Types.ObjectId.isValid(campaignId)) {
            campaign = await Campaign.findById(campaignId);
          }
          if (campaign) {
            originalCampaignName = campaign.name || campaign.title || campaignId;
            originalSubject = recipient.subject || campaign.subject || originalSubject;
          }

          // Update CampaignRecipient status
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
            await Campaign.updateOne({ _id: campaign._id }, { $inc: { replyCount: 1 } });
          }
        } else {
          // Check EmailSendRecord
          const sendRecord = await EmailSendRecord.findOne({
            email: { $regex: new RegExp(`^${senderAddress}$`, "i") },
          }).sort({ sentAt: -1 });
          if (sendRecord) {
            campaignId = sendRecord.campaignId || campaignId;
            originalCampaignName = sendRecord.campaignName || campaignId;
            originalSubject = sendRecord.subject || originalSubject;
            companyName = sendRecord.companyName || sendRecord.recipientName || senderName;
          }
        }

        // Check B2BClient record
        let b2bClient = await B2BClient.findOne({
          email: { $regex: new RegExp(`^${senderAddress}$`, "i") },
        });
        if (b2bClient) {
          if (b2bClient.companyName || b2bClient.name) {
            companyName = b2bClient.companyName || b2bClient.name;
          }
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

        // Create durable EmailReply record with dual compatibility keys
        await EmailReply.create({
          campaignId,
          originalCampaignName,
          companyName: companyName || senderName || "Client",
          email: senderAddress,
          sender: senderAddress,
          originalSubject,
          replySubject: subject,
          subject: subject,
          replyMessage: replyText.slice(0, 5000),
          body: replyText.slice(0, 5000),
          receivedAt: emailDate,
          messageId,
          status: "New Reply",
        });

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
