import nodemailer from "nodemailer";
import xlsx from "xlsx";
import crypto from "crypto";
import fs from "fs";
import Campaign from "../models/Campaign.js";
import CampaignRecipient from "../models/CampaignRecipient.js";
import EmailSendRecord from "../models/EmailSendRecord.js";
import EmailOpen from "../models/EmailOpen.js";
import EmailReply from "../models/EmailReply.js";
import B2BClient from "../models/B2BClient.js";
import EmailTemplate from "../models/EmailTemplate.js";
import { syncIncomingReplies } from "../utils/replySync.js";

// Global in-memory state for active queue loops (keyed by campaignId)
const activeSendQueues = new Map();
const activeFollowUpQueues = new Map();

const getSenderCredentials = () => {
  let user = process.env.EMAIL_USER || process.env.EMAIL_FROM || process.env.SMTP_USER || "hello.octoinkstudios@gmail.com";
  if (!user || user.toLowerCase().includes("octoinkstudios7310")) {
    user = "hello.octoinkstudios@gmail.com";
  }
  const pass = process.env.EMAIL_PASS || process.env.SMTP_PASS || "oyfekwhejzjozsgc";
  return { user, pass };
};

const createSmtpTransporter = () => {
  const { user, pass } = getSenderCredentials();
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 465;
  const secure = process.env.SMTP_SECURE !== undefined ? process.env.SMTP_SECURE === 'true' : (port === 465);

  return {
    transporter: nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000,
    }),
    user
  };
};

async function verifyTransporterConnection() {
  const { transporter, user } = createSmtpTransporter();

  // 1. Try direct SMTP verification with a 6-second timeout
  try {
    const verifyPromise = transporter.verify();
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("SMTP connection timeout")), 6000)
    );
    await Promise.race([verifyPromise, timeoutPromise]);
    console.log(`[SMTP_VERIFY_SUCCESS] Connection verified for authenticated account: ${user}`);
    return { ok: true, user, method: "Gmail SMTP Direct" };
  } catch (smtpErr) {
    console.warn(`[SMTP_VERIFY_WARNING] Direct SMTP check failed/timed out for ${user}: ${smtpErr.message}`);

    // 2. Fallback check: Google Apps Script HTTPS Relay (for Render / cloud hosts with blocked outbound SMTP)
    const url = process.env.GOOGLE_APPS_SCRIPT_URL;
    const secret = process.env.GOOGLE_APPS_SCRIPT_SECRET;
    if (url && secret) {
      try {
        console.log(`[SMTP_VERIFY_RELAY] Verifying Google Apps Script HTTPS relay for ${user}...`);
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ secret, type: "ping" }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok || data.success !== false) {
          console.log(`[SMTP_VERIFY_RELAY_SUCCESS] Google Apps Script relay active for ${user}`);
          return { ok: true, user, method: "Google Apps Script HTTPS Relay" };
        }
      } catch (gasErr) {
        console.warn(`[SMTP_VERIFY_RELAY_FAIL] Google Apps Script ping failed: ${gasErr.message}`);
      }
    }

    return { ok: false, user, error: smtpErr.message || "Connection failed" };
  }
}

// ─── Dispatch Email Helper ──────────────────────────────────────────────────
// Sends outbound campaign/outreach emails directly via authenticated Gmail SMTP.
// Falls back to Google Apps Script HTTPS Relay if outbound SMTP ports are blocked by cloud provider (Render).
async function dispatchEmail({ to, subject, html, text, attachments = [] }) {
  const { transporter, user: senderEmail } = createSmtpTransporter();

  if (!to || !to.includes("@")) {
    throw new Error(`Invalid recipient email address: "${to}"`);
  }

  const serverUrl = process.env.VITE_API_URL || process.env.SERVER_URL || "";
  let finalHtml = html || "";
  if (!serverUrl || !serverUrl.startsWith("https://")) {
    finalHtml = finalHtml.replace(/<img[^>]*src=["']http:\/\/(localhost|127\.0\.0\.1)[^"']*["'][^>]*>/gi, "");
  }

  const cleanText = text || finalHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const messageIdHeader = `<${crypto.randomUUID()}@octoinkstudios.com>`;

  // 1. Try Direct SMTP First
  try {
    const mailAttachments = [];
    if (attachments && Array.isArray(attachments)) {
      for (const att of attachments) {
        if (att.path && fs.existsSync(att.path)) {
          mailAttachments.push({
            filename: att.originalname || att.filename || path.basename(att.path),
            path: att.path,
            contentType: att.mimetype || att.contentType,
          });
        } else if (att.content || att.buffer) {
          mailAttachments.push({
            filename: att.filename || att.originalname || "attachment",
            content: att.content || att.buffer,
            contentType: att.contentType || att.mimetype,
          });
        }
      }
    }

    const mailOptions = {
      from: `"Octoink Studios" <${senderEmail}>`,
      to: to.trim(),
      subject: subject || "Notification from Octoink Studios",
      text: cleanText,
      html: finalHtml,
      headers: {
        "Date": new Date().toUTCString(),
        "Message-ID": messageIdHeader,
        "X-Mailer": "Octoink-EmailTrack/1.0"
      }
    };

    if (mailAttachments.length > 0) {
      mailOptions.attachments = mailAttachments;
    }

    console.log(`[DISPATCH_SMTP_ATTEMPT] Sender: ${senderEmail} | Recipient: ${to} | Subject: "${subject}"`);

    // Use a 10s timeout for direct send
    const sendPromise = transporter.sendMail(mailOptions);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("SMTP send operation timed out")), 10000)
    );

    const info = await Promise.race([sendPromise, timeoutPromise]);

    const accepted = info.accepted || [];
    const rejected = info.rejected || [];
    const response = info.response || "";
    const messageId = info.messageId || messageIdHeader;
    const envelope = info.envelope || { from: senderEmail, to: [to] };

    console.log(`[DISPATCH_SMTP_RESPONSE] Recipient: ${to} | MessageId: ${messageId} | Response: ${response}`);

    const isAccepted = Array.isArray(accepted) && accepted.some(addr => addr.toLowerCase() === to.toLowerCase());
    const isRejected = Array.isArray(rejected) && rejected.some(addr => addr.toLowerCase() === to.toLowerCase());

    if (isRejected) {
      throw new Error(`SMTP server rejected recipient ${to}`);
    }

    return {
      success: true,
      messageId,
      smtpResponse: response,
      accepted,
      rejected,
      envelope,
      sender: senderEmail,
      recipient: to,
      method: "Gmail SMTP Direct"
    };
  } catch (smtpError) {
    console.warn(`[DISPATCH_SMTP_FAIL] Direct SMTP send failed for ${to}: ${smtpError.message}`);

    // 2. Fallback to Google Apps Script HTTPS Relay if configured (e.g. Render outbound port blocked)
    const url = process.env.GOOGLE_APPS_SCRIPT_URL;
    const secret = process.env.GOOGLE_APPS_SCRIPT_SECRET;

    if (url && secret) {
      try {
        console.log(`[DISPATCH_RELAY] Dispatching email to ${to} via Google Apps Script HTTPS Relay...`);

        const gasAttachments = [];
        for (const att of attachments) {
          if (att.path && fs.existsSync(att.path)) {
            const content = fs.readFileSync(att.path);
            gasAttachments.push({
              filename: att.originalname || att.filename || "attachment",
              mimeType: att.mimetype || "application/octet-stream",
              data: content.toString("base64"),
            });
          } else if (att.content || att.buffer) {
            const buf = Buffer.isBuffer(att.content || att.buffer)
              ? (att.content || att.buffer)
              : Buffer.from(att.content || att.buffer);
            gasAttachments.push({
              filename: att.filename || att.originalname || "attachment",
              mimeType: att.contentType || att.mimetype || "application/octet-stream",
              data: buf.toString("base64"),
            });
          }
        }

        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            secret,
            type: "campaign",
            to: to.trim(),
            recipient: to.trim(),
            sender: senderEmail,
            name: "Octoink Studios",
            subject,
            html: finalHtml,
            text: cleanText,
            attachments: gasAttachments,
          }),
        });

        const data = await res.json().catch(() => ({}));
        if (data.success) {
          console.log(`[DISPATCH_RELAY_SUCCESS] Email sent to ${to} via Google Apps Script Relay`);
          return {
            success: true,
            messageId: data.messageId || messageIdHeader,
            smtpResponse: "250 Relayed via Google Apps Script HTTPS",
            accepted: [to],
            rejected: [],
            envelope: { from: senderEmail, to: [to] },
            sender: senderEmail,
            recipient: to,
            method: "Google Apps Script Relay"
          };
        }
        throw new Error(data.error || "Google Apps Script relay failed");
      } catch (gasError) {
        console.error(`[DISPATCH_RELAY_ERROR] Relay failed for ${to}: ${gasError.message}`);
        throw new Error(`Email dispatch failed via SMTP and Relay: ${smtpError.message} | ${gasError.message}`);
      }
    }

    throw smtpError;
  }
}

// 1. Connection Status Check
export const checkConnection = async (req, res) => {
  const { ok, user, error } = await verifyTransporterConnection();
  return res.json({
    success: true,
    connected: ok,
    status: ok ? "connected" : "disconnected",
    email: user,
    senderEmail: user,
    error: ok ? null : (error || "SMTP authentication failed"),
    message: ok
      ? `Connected & verified Gmail SMTP (${user})`
      : `Gmail SMTP disconnected (${user}): ${error || "Authentication failed"}`,
  });
};

// 1b. Test Send — diagnostic endpoint to verify actual email delivery
export const testSend = async (req, res) => {
  const to = req.body?.to || req.query?.to || "manikandaninkwrk@gmail.com";
  const { user: senderEmail } = getSenderCredentials();

  console.log(`[TEST_SEND_DIAGNOSTIC] Initiating test send from ${senderEmail} to ${to}`);

  try {
    const result = await dispatchEmail({
      to,
      subject: `[Diagnostic Test] Email Track Delivery Verification`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 24px; color: #111827; background-color: #f9fafb; border-radius: 8px;">
          <h2 style="color: #7c3aed; margin-top: 0;">Octoink Studios - Diagnostic Email Delivery Test</h2>
          <p>This test email verifies that Gmail SMTP delivery is operating properly.</p>
          <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 16px 0;"/>
          <p><b>From (Sender):</b> ${senderEmail}</p>
          <p><b>To (Recipient):</b> ${to}</p>
          <p><b>Timestamp:</b> ${new Date().toISOString()}</p>
        </div>
      `,
      text: `Octoink Studios Diagnostic Email Test\nSender: ${senderEmail}\nRecipient: ${to}\nTimestamp: ${new Date().toISOString()}`,
    });

    return res.json({
      success: true,
      message: `Test email sent and accepted by SMTP server for ${to}`,
      sender: result.sender,
      recipient: result.recipient,
      messageId: result.messageId,
      smtpResponse: result.smtpResponse,
      accepted: result.accepted,
      rejected: result.rejected,
      envelope: result.envelope,
    });
  } catch (err) {
    console.error(`[TEST_SEND_ERROR] Test send failed to ${to}:`, err.message);
    return res.status(500).json({
      success: false,
      message: "Test email sending failed",
      error: err.message,
      sender: senderEmail,
      recipient: to,
    });
  }
};

// 1c. Duplicate Email Check across ALL campaigns
export const checkDuplicateRecipients = async (req, res) => {
  try {
    const { emails } = req.body;
    if (!emails || !Array.isArray(emails)) {
      return res.status(400).json({ success: false, message: "Emails array is required" });
    }

    const normalizedEmails = emails
      .map((e) => (typeof e === "string" ? e.trim().toLowerCase() : ""))
      .filter(Boolean);

    if (normalizedEmails.length === 0) {
      return res.json({
        success: true,
        results: {},
        alreadySentEmails: [],
        alreadySentCount: 0,
        readyCount: 0,
      });
    }

    // 1. Query successful sends across ALL campaigns in EmailSendRecord
    const sentRecords = await EmailSendRecord.find({
      email: { $in: normalizedEmails },
      status: "success",
    }).lean();

    // 2. Query sent recipients across ALL campaigns in CampaignRecipient
    const sentRecipients = await CampaignRecipient.find({
      email: { $in: normalizedEmails },
      emailSent: true,
    }).lean();

    const resultMap = {};
    const alreadySentSet = new Set();

    sentRecords.forEach((rec) => {
      const em = rec.email.toLowerCase().trim();
      alreadySentSet.add(em);
      resultMap[em] = {
        alreadySent: true,
        campaignId: rec.campaignId || "",
        campaignName: rec.campaignName || "",
        sentAt: rec.sentAt,
      };
    });

    sentRecipients.forEach((rec) => {
      const em = rec.email.toLowerCase().trim();
      alreadySentSet.add(em);
      if (!resultMap[em]) {
        resultMap[em] = {
          alreadySent: true,
          campaignId: rec.campaignId || "",
          campaignName: rec.campaignName || "",
          sentAt: rec.sentAt,
        };
      }
    });

    normalizedEmails.forEach((em) => {
      if (!resultMap[em]) {
        resultMap[em] = { alreadySent: false };
      }
    });

    const alreadySentEmails = Array.from(alreadySentSet);

    return res.json({
      success: true,
      results: resultMap,
      alreadySentEmails,
      alreadySentCount: alreadySentEmails.length,
      readyCount: normalizedEmails.length - alreadySentEmails.length,
    });
  } catch (err) {
    console.error("Duplicate check error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// 2. Parse Excel/CSV Client File
export const parseClientFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }

    let buffer;
    if (req.file.buffer) {
      buffer = req.file.buffer;
    } else if (req.file.path) {
      buffer = fs.readFileSync(req.file.path);
    } else {
      return res.status(400).json({ success: false, message: "Could not read uploaded file" });
    }

    const workbook = xlsx.read(buffer, { type: "buffer" });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const rows = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: "" });

    if (!rows || rows.length === 0) {
      return res.status(400).json({ success: false, message: "Uploaded file is empty" });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const clients = [];
    let validCount = 0;
    let invalidCount = 0;

    // Detect if Row 0 is a Header row or Data row
    let startRowIndex = 0;
    const row0 = rows[0] || [];
    const isRow0Header = row0.some((cell) => {
      const str = String(cell).trim().toLowerCase();
      return (
        (str.includes("company") || str.includes("email") || str.includes("mail") || str.includes("name") || str.includes("org")) &&
        !emailRegex.test(str)
      );
    });

    if (isRow0Header) {
      startRowIndex = 1;
    }

    for (let i = startRowIndex; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;

      let companyName = "";
      let email = "";

      row.forEach((cell) => {
        const val = String(cell).trim();
        if (!val) return;

        if (emailRegex.test(val)) {
          if (!email) email = val;
        } else {
          if (!companyName) companyName = val;
        }
      });

      if (!email && !companyName) continue;
      if (!companyName) companyName = email ? email.split("@")[0] : `Client #${i + 1}`;

      const normalizedEmail = email.trim().toLowerCase();
      const isValid = emailRegex.test(normalizedEmail);
      if (isValid) validCount++;
      else invalidCount++;

      clients.push({
        companyName,
        email: normalizedEmail,
        isValidEmail: isValid,
      });
    }

    // Check all previous successful outreach sends across ALL campaigns
    const normalizedParsedEmails = clients.map((c) => c.email).filter(Boolean);
    const previousSends = await EmailSendRecord.find({
      email: { $in: normalizedParsedEmails },
      status: "success",
    }).lean();

    const previousRecipients = await CampaignRecipient.find({
      email: { $in: normalizedParsedEmails },
      emailSent: true,
    }).lean();

    const alreadyContactedMap = {};
    previousSends.forEach((s) => {
      const em = s.email.toLowerCase().trim();
      alreadyContactedMap[em] = { campaignId: s.campaignId, campaignName: s.campaignName || s.campaignId };
    });
    previousRecipients.forEach((r) => {
      const em = r.email.toLowerCase().trim();
      if (!alreadyContactedMap[em]) {
        alreadyContactedMap[em] = { campaignId: r.campaignId, campaignName: r.campaignName || r.campaignId };
      }
    });

    let alreadySentCount = 0;
    let readyToSendCount = 0;

    clients.forEach((c) => {
      const em = c.email.toLowerCase().trim();
      if (alreadyContactedMap[em]) {
        c.alreadySent = true;
        c.isDuplicate = true;
        c.status = "Already Sent";
        c.duplicateReason = `Already contacted in ${alreadyContactedMap[em]?.campaignId || "previous outreach"}`;
        alreadySentCount++;
      } else if (c.isValidEmail) {
        c.alreadySent = false;
        c.isDuplicate = false;
        c.status = "Ready";
        readyToSendCount++;
      } else {
        c.alreadySent = false;
        c.isDuplicate = false;
        c.status = "Failed";
      }
    });

    return res.json({
      success: true,
      totalClients: clients.length,
      validEmails: validCount,
      invalidEmails: invalidCount,
      alreadySentCount,
      readyToSendCount,
      clients,
    });
  } catch (err) {
    console.error("File parse error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// 3. Create New Campaign
export const createCampaign = async (req, res) => {
  try {
    const { name, subject, body, clients } = req.body;
    let parsedClients = [];
    if (typeof clients === "string") {
      parsedClients = JSON.parse(clients);
    } else if (Array.isArray(clients)) {
      parsedClients = clients;
    }

    if (!subject || !body) {
      return res.status(400).json({ success: false, message: "Subject and Body are required" });
    }

    // Attachments processed via multer if uploaded
    const attachments = [];
    if (req.files && req.files.length > 0) {
      req.files.forEach((file) => {
        attachments.push({
          filename: file.filename || file.originalname,
          path: file.path,
          originalname: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
        });
      });
    }

    // Generate Campaign ID
    const count = await Campaign.countDocuments();
    const campaignId = `CMP-${String(count + 1).padStart(3, "0")}`;
    const campaignName = name || `Campaign #${String(count + 1).padStart(3, "0")}`;

    // Normalize all emails
    const normalizedClientEmails = parsedClients.map((c) => (c.email ? String(c.email).trim().toLowerCase() : "")).filter(Boolean);

    // Check ALL previous successful outreach sends across ALL campaigns
    const previousSends = await EmailSendRecord.find({
      email: { $in: normalizedClientEmails },
      status: "success",
    }).lean();

    const previousRecipients = await CampaignRecipient.find({
      email: { $in: normalizedClientEmails },
      emailSent: true,
    }).lean();

    const alreadyContactedMap = {};
    previousSends.forEach((s) => {
      const em = s.email.toLowerCase().trim();
      alreadyContactedMap[em] = s.campaignId;
    });
    previousRecipients.forEach((r) => {
      const em = r.email.toLowerCase().trim();
      if (!alreadyContactedMap[em]) {
        alreadyContactedMap[em] = r.campaignId;
      }
    });

    const validClients = parsedClients.filter((c) => c.isValidEmail);

    const campaign = new Campaign({
      campaignId,
      name: campaignName,
      senderEmail: "hello.octoinkstudios@gmail.com",
      subject,
      body,
      attachments,
      status: "Ready",
      totalClients: parsedClients.length,
      validEmailsCount: validClients.length,
      invalidEmailsCount: parsedClients.length - validClients.length,
    });

    await campaign.save();

    // Create Recipient Documents with Duplicate Protection & Status flags
    const recipientDocs = parsedClients.map((c) => {
      const normalizedEmail = (c.email || "").trim().toLowerCase();
      const isAlreadySent = Boolean(
        alreadyContactedMap[normalizedEmail] || c.alreadySent || c.status === "Already Sent"
      );

      return {
        campaignId,
        campaignName,
        subject,
        companyName: c.companyName || "Client",
        email: normalizedEmail,
        isValidEmail: Boolean(c.isValidEmail),
        trackingId: crypto.randomUUID(),
        isDuplicate: isAlreadySent,
        duplicateReason: isAlreadySent
          ? `Already contacted in previous campaign (${alreadyContactedMap[normalizedEmail] || "Outreach"})`
          : "",
        status: !c.isValidEmail ? "Failed" : isAlreadySent ? "Already Sent" : "Ready",
        errorMessage: !c.isValidEmail
          ? "Invalid email address format"
          : isAlreadySent
          ? "Skipped: Already contacted in previous campaign"
          : "",
        emailSent: false,
      };
    });

    if (recipientDocs.length > 0) {
      await CampaignRecipient.insertMany(recipientDocs);
    }

    return res.status(201).json({
      success: true,
      message: "Campaign created successfully",
      campaign,
    });
  } catch (err) {
    console.error("Create campaign error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// 4. Start Campaign Sending Process
export const startCampaign = async (req, res) => {
  try {
    const { id } = req.params;
    const campaign = await Campaign.findOne({ campaignId: id });
    if (!campaign) {
      return res.status(404).json({ success: false, message: "Campaign not found" });
    }

    // Update status to Sending
    campaign.status = "Sending";
    await campaign.save();

    activeSendQueues.set(id, true);

    // Run async send queue in background without blocking API response
    processSendQueue(id);

    return res.json({
      success: true,
      message: "Campaign sending started",
      campaign,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// 5. Stop Campaign Sending Process
export const stopCampaign = async (req, res) => {
  try {
    const { id } = req.params;
    activeSendQueues.set(id, false);

    const campaign = await Campaign.findOne({ campaignId: id });
    if (campaign) {
      campaign.status = "Stopped";
      await campaign.save();
    }

    return res.json({
      success: true,
      message: "Campaign sending stopped safely",
      campaign,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Background Queue Processor for Initial Campaign Sending
async function processSendQueue(campaignId) {
  try {
    const campaign = await Campaign.findOne({ campaignId });
    if (!campaign) return;

    const serverUrl = process.env.VITE_API_URL || "http://localhost:4999";

    // Fetch all recipients that are ready to send (strictly excluding duplicates/already sent)
    const recipients = await CampaignRecipient.find({
      campaignId,
      isValidEmail: true,
      emailSent: false,
      status: { $nin: ["Already Sent", "Skipped", "Failed"] },
      isDuplicate: { $ne: true },
    });

    console.log(`📤 Campaign ${campaignId}: Processing ${recipients.length} eligible recipients...`);

    for (const recipient of recipients) {
      // Check if queue was stopped/paused by user
      if (activeSendQueues.get(campaignId) === false) {
        console.log(`⏸️ Campaign ${campaignId} sending stopped by user.`);
        break;
      }

      const normalizedEmail = (recipient.email || "").trim().toLowerCase();

      // Requirement 4 & 6: Global Duplicate Email Protection across ALL previous campaigns
      const existingSend = await EmailSendRecord.findOne({
        email: normalizedEmail,
        status: "success",
        campaignId: { $ne: campaignId },
      });

      const existingRecipient = await CampaignRecipient.findOne({
        email: normalizedEmail,
        emailSent: true,
        campaignId: { $ne: campaignId },
      });

      if (existingSend || existingRecipient || recipient.status === "Already Sent" || recipient.isDuplicate) {
        console.log(`🛡️ Skipping already contacted recipient ${recipient.email} (contacted previously in ${existingSend?.campaignId || existingRecipient?.campaignId || "outreach"})`);
        recipient.status = "Already Sent";
        recipient.isDuplicate = true;
        recipient.duplicateReason = `Already contacted in ${existingSend?.campaignId || existingRecipient?.campaignId || "previous campaign"}`;
        recipient.emailSent = false;
        await recipient.save();
        continue;
      }

      // Construct personalized email body & subject
      const clientName = recipient.companyName || recipient.email.split('@')[0];
      let personalizedBody = campaign.body
        .replace(/\{companyName\}/gi, clientName)
        .replace(/\{company\}/gi, clientName)
        .replace(/\{clientName\}/gi, clientName)
        .replace(/\{name\}/gi, clientName)
        .replace(/\{email\}/gi, recipient.email);

      let personalizedSubject = campaign.subject
        .replace(/\{companyName\}/gi, clientName)
        .replace(/\{company\}/gi, clientName)
        .replace(/\{clientName\}/gi, clientName)
        .replace(/\{name\}/gi, clientName)
        .replace(/\{email\}/gi, recipient.email);

      const trackingPixelHtml = (serverUrl && serverUrl.startsWith("https://"))
        ? `<img src="${serverUrl}/api/email-track/open?trackingId=${recipient.trackingId}" width="1" height="1" style="display:none;" alt="" />`
        : "";
      const fullHtml = `<div>${personalizedBody}</div>${trackingPixelHtml ? `<br/>${trackingPixelHtml}` : ""}`;

      // Retry logic: try up to 3 times with increasing delay
      let sendSuccess = false;
      let lastError = null;
      let sendResult = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          sendResult = await dispatchEmail({
            to: recipient.email,
            subject: personalizedSubject,
            html: fullHtml,
            attachments: campaign.attachments,
          });
          sendSuccess = true;
          break;
        } catch (attemptErr) {
          lastError = attemptErr;
          console.warn(`⚠️ Attempt ${attempt}/3 failed for ${recipient.email}: ${attemptErr.message}`);
          if (attempt < 3) {
            await new Promise((r) => setTimeout(r, attempt * 2000));
          }
        }
      }

      if (sendSuccess) {
        // Record durable outbound send record with full metadata
        await EmailSendRecord.findOneAndUpdate(
          { email: normalizedEmail, campaignId, type: "initial" },
          {
            email: normalizedEmail,
            recipientEmail: normalizedEmail,
            recipientName: recipient.companyName,
            companyName: recipient.companyName,
            campaignId,
            campaignName: campaign.name,
            subject: personalizedSubject,
            messageId: sendResult.messageId || "",
            type: "initial",
            status: "success",
            trackingId: recipient.trackingId,
            sentAt: new Date(),
          },
          { upsert: true, new: true }
        );

        recipient.emailSent = true;
        recipient.status = "Sent";
        recipient.sentAt = new Date();
        recipient.messageId = sendResult.messageId || "";
        recipient.lastActivityAt = new Date();
        await recipient.save();

        console.log(`✅ Email sent to ${recipient.email}`);

        // Increment campaign emailsSent counter
        await Campaign.updateOne({ campaignId }, { $inc: { emailsSent: 1 } });

        // Create or Update B2B Client Record
        let b2bClient = await B2BClient.findOne({ email: recipient.email });
        if (!b2bClient) {
          b2bClient = new B2BClient({
            companyName: recipient.companyName,
            email: recipient.email,
            campaignId,
            status: "Contacted",
            emailsReceivedCount: 1,
            timeline: [
              {
                event: `First campaign email sent: "${campaign.subject}"`,
                type: "sent",
                timestamp: new Date(),
              },
            ],
          });
        } else {
          b2bClient.emailsReceivedCount += 1;
          b2bClient.lastContactDate = new Date();
          b2bClient.timeline.push({
            event: `Email sent: "${campaign.subject}"`,
            type: "sent",
            timestamp: new Date(),
          });
        }
        await b2bClient.save();
      } else {
        console.error(`❌ All 3 attempts failed for ${recipient.email}:`, lastError?.message);
        recipient.status = "Failed";
        recipient.errorMessage = lastError?.message || "Send failed after 3 attempts";
        await recipient.save();

        await Campaign.updateOne({ campaignId }, { $inc: { failedCount: 1 } });
      }

      // Safe delay between sends (1.5s to stay within Gmail rate limits)
      await new Promise((res) => setTimeout(res, 1500));
    }


    // Check remaining unsent count
    const remaining = await CampaignRecipient.countDocuments({
      campaignId,
      isValidEmail: true,
      emailSent: false,
    });

    if (remaining === 0) {
      await Campaign.updateOne({ campaignId }, { status: "Completed" });
      activeSendQueues.delete(campaignId);
      console.log(`🎉 Campaign ${campaignId} completed successfully.`);
    }
  } catch (err) {
    console.error("Process send queue error:", err.message, err.stack);
  }
}

// 6. Open Tracking Pixel Handler
export const trackOpenPixel = async (req, res) => {
  try {
    const { trackingId } = req.query;

    if (trackingId) {
      const recipient = await CampaignRecipient.findOne({ trackingId });
      if (recipient) {
        const now = new Date();
        const isFirstOpen = !recipient.opened;

        recipient.opened = true;
        recipient.openCount += 1;
        if (isFirstOpen) recipient.firstOpenedAt = now;
        recipient.latestOpenedAt = now;
        if (recipient.status === "Sent" || recipient.status === "Ready") {
          recipient.status = "Opened";
        }
        recipient.lastActivityAt = now;
        await recipient.save();

        // Log EmailOpen event
        await EmailOpen.create({
          trackingId,
          campaignId: recipient.campaignId,
          recipientEmail: recipient.email,
          openedAt: now,
          ipAddress: req.ip,
          userAgent: req.get("User-Agent"),
        });

        // Update Campaign stats if first open
        if (isFirstOpen) {
          await Campaign.updateOne({ campaignId: recipient.campaignId }, { $inc: { openedCount: 1 } });
        }

        // Update B2B Client timeline & status
        const b2b = await B2BClient.findOne({ email: recipient.email });
        if (b2b) {
          b2b.openedCount += 1;
          if (b2b.status === "Contacted") b2b.status = "Opened";
          b2b.timeline.push({
            event: "Email opened 👁",
            type: "opened",
            details: `Total opens: ${recipient.openCount}`,
            timestamp: now,
          });
          await b2b.save();
        }
      }
    }

    // Return 1x1 transparent GIF Buffer
    const transparentGif = Buffer.from(
      "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
      "base64"
    );
    res.writeHead(200, {
      "Content-Type": "image/gif",
      "Content-Length": transparentGif.length,
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
    });
    return res.end(transparentGif);
  } catch (err) {
    console.error("Tracking pixel error:", err);
    // Still return transparent GIF so client image load doesn't crash visually
    const transparentGif = Buffer.from(
      "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
      "base64"
    );
    res.writeHead(200, { "Content-Type": "image/gif" });
    return res.end(transparentGif);
  }
};

// 7. Get All Campaigns & Details (calculated dynamically from actual recipient records)
export const getCampaigns = async (req, res) => {
  try {
    const campaigns = await Campaign.find().sort({ createdAt: -1 }).lean();

    // Requirement 7: The statistics shown on the campaign history page must be calculated from actual recipient records
    const enrichedCampaigns = await Promise.all(
      campaigns.map(async (cmp) => {
        const recs = await CampaignRecipient.find({ campaignId: cmp.campaignId }).lean();
        const totalClients = recs.length;
        const emailsSent = recs.filter((r) => r.emailSent).length;
        const openedCount = recs.filter((r) => r.opened).length;
        const replyCount = recs.filter((r) => r.replied).length;
        const followUpsSent = recs.filter((r) => r.followUpSent).length;
        const failedCount = recs.filter((r) => r.status === "Failed").length;
        const skippedCount = recs.filter((r) => r.status === "Already Sent" || r.isDuplicate).length;

        return {
          ...cmp,
          totalClients,
          emailsSent,
          openedCount,
          replyCount,
          followUpsSent,
          failedCount,
          skippedCount,
        };
      })
    );

    return res.json({ success: true, campaigns: enrichedCampaigns });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const getCampaignById = async (req, res) => {
  try {
    const { id } = req.params;
    const campaign = await Campaign.findOne({ campaignId: id }).lean();
    if (!campaign) {
      return res.status(404).json({ success: false, message: "Campaign not found" });
    }

    const recipients = await CampaignRecipient.find({ campaignId: id }).sort({ createdAt: 1 }).lean();

    // Calculate accurate stats from actual recipient records
    const totalClients = recipients.length;
    const emailsSent = recipients.filter((r) => r.emailSent).length;
    const openedCount = recipients.filter((r) => r.opened).length;
    const replyCount = recipients.filter((r) => r.replied).length;
    const followUpsSent = recipients.filter((r) => r.followUpSent).length;
    const failedCount = recipients.filter((r) => r.status === "Failed").length;
    const skippedCount = recipients.filter((r) => r.status === "Already Sent" || r.isDuplicate).length;

    const accurateCampaign = {
      ...campaign,
      totalClients,
      emailsSent,
      openedCount,
      replyCount,
      followUpsSent,
      failedCount,
      skippedCount,
    };

    return res.json({
      success: true,
      campaign: accurateCampaign,
      recipients,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// 8. Follow-up Operations
export const getFollowUps = async (req, res) => {
  try {
    // Recipients eligible for follow-up: original email sent, not replied, follow-up not sent yet
    const recipients = await CampaignRecipient.find({
      emailSent: true,
    }).sort({ sentAt: -1 });

    const totalEligible = recipients.filter((r) => !r.replied && !r.followUpSent).length;
    const totalSent = recipients.filter((r) => r.followUpSent).length;
    const totalReplied = recipients.filter((r) => r.replied).length;
    const totalNotOpened = recipients.filter((r) => !r.opened).length;
    const totalFailed = recipients.filter((r) => r.status === "Failed" || r.followUpStatus === "Failed").length;

    return res.json({
      success: true,
      summary: {
        totalEligible,
        followUpsSent: totalSent,
        repliesReceived: totalReplied,
        notOpened: totalNotOpened,
        failed: totalFailed,
        totalRecipients: recipients.length,
      },
      recipients,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const startFollowUp = async (req, res) => {
  try {
    const { subject, body } = req.body;

    // Find recipients eligible for follow-up
    const eligibleRecipients = await CampaignRecipient.find({
      emailSent: true,
      replied: false,
      followUpSent: false,
    });

    if (eligibleRecipients.length === 0) {
      return res.json({
        success: true,
        message: "No clients are currently eligible for follow-up",
        eligibleCount: 0,
      });
    }

    const followUpId = "GLOBAL_FOLLOW_UP";
    activeFollowUpQueues.set(followUpId, true);

    processFollowUpQueue(eligibleRecipients, subject, body);

    return res.json({
      success: true,
      message: `Started sending follow-ups to ${eligibleRecipients.length} eligible clients`,
      eligibleCount: eligibleRecipients.length,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const stopFollowUp = async (req, res) => {
  try {
    activeFollowUpQueues.set("GLOBAL_FOLLOW_UP", false);
    return res.json({
      success: true,
      message: "Follow-up sending stopped safely",
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

async function processFollowUpQueue(recipients, customSubject, customBody) {
  try {
    for (const recipient of recipients) {
      if (activeFollowUpQueues.get("GLOBAL_FOLLOW_UP") === false) {
        console.log("⏸️ Follow-up queue stopped by user.");
        break;
      }

      // Double check reply status from DB in case client replied recently
      const latestRecipient = await CampaignRecipient.findById(recipient._id);
      if (latestRecipient.replied || latestRecipient.followUpSent) {
        continue;
      }

      // Check duplicate protection for followups
      const existingSend = await EmailSendRecord.findOne({
        email: recipient.email,
        campaignId: recipient.campaignId,
        type: "followup",
        status: "success",
      });

      if (existingSend) {
        recipient.followUpSent = true;
        recipient.followUpStatus = "Sent";
        await recipient.save();
        continue;
      }

      const clientName = recipient.companyName || recipient.email.split('@')[0];
      const rawSubject = customSubject || `Follow-up regarding Octoink Studios`;
      const rawBody = customBody || `<p>Hi {companyName},</p><p>I wanted to quickly follow up on my previous email. Let us know if you have any questions or would like to schedule a call!</p><p>Best regards,<br/>Octoink Studios</p>`;

      const personalizedSubject = rawSubject
        .replace(/\{companyName\}/gi, clientName)
        .replace(/\{company\}/gi, clientName)
        .replace(/\{clientName\}/gi, clientName)
        .replace(/\{name\}/gi, clientName)
        .replace(/\{email\}/gi, recipient.email);

      const personalizedBody = rawBody
        .replace(/\{companyName\}/gi, clientName)
        .replace(/\{company\}/gi, clientName)
        .replace(/\{clientName\}/gi, clientName)
        .replace(/\{name\}/gi, clientName)
        .replace(/\{email\}/gi, recipient.email);

      try {
        await dispatchEmail({
          to: recipient.email,
          subject: personalizedSubject,
          html: personalizedBody,
        });

        await EmailSendRecord.create({
          email: recipient.email,
          campaignId: recipient.campaignId,
          type: "followup",
          status: "success",
        });

        recipient.followUpSent = true;
        recipient.followUpStatus = "Sent";
        recipient.followUpSentAt = new Date();
        recipient.status = "Follow-up Sent";
        recipient.lastActivityAt = new Date();
        await recipient.save();

        await Campaign.updateOne({ campaignId: recipient.campaignId }, { $inc: { followUpsSent: 1 } });

        // B2B client timeline update
        const b2b = await B2BClient.findOne({ email: recipient.email });
        if (b2b) {
          b2b.followUpCount += 1;
          b2b.status = "Follow-up";
          b2b.timeline.push({
            event: "Follow-up sent ✓",
            type: "followup_sent",
            timestamp: new Date(),
          });
          await b2b.save();
        }
      } catch (err) {
        recipient.followUpStatus = "Failed";
        await recipient.save();
      }

      await new Promise((r) => setTimeout(r, 800));
    }
  } catch (err) {
    console.error("Process follow-up queue error:", err);
  }
}

// 9. Replies & Leads Management
export const getReplies = async (req, res) => {
  try {
    // Run background sync from Gmail IMAP without blocking immediate response
    syncIncomingReplies().catch((syncErr) =>
      console.warn("[REPLY_SYNC_BACKGROUND_WARNING]", syncErr.message)
    );

    const rawReplies = await EmailReply.find().sort({ receivedAt: -1, createdAt: -1 });
    const replies = rawReplies.map((r) => {
      const doc = r.toObject ? r.toObject() : r;
      const email = doc.email || doc.sender || "";
      return {
        ...doc,
        email,
        companyName: doc.companyName || doc.clientName || (email ? email.split("@")[0] : "Client"),
        originalCampaignName: doc.originalCampaignName || doc.campaignId || "Outreach Campaign",
        originalSubject: doc.originalSubject || "Octoink Outreach",
        replySubject: doc.replySubject || doc.subject || "Re: Inquiry",
        replyMessage: doc.replyMessage || doc.body || "",
      };
    });

    return res.json({ success: true, replies });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const triggerSyncReplies = async (req, res) => {
  try {
    const syncResult = await syncIncomingReplies();
    const rawReplies = await EmailReply.find().sort({ receivedAt: -1, createdAt: -1 });
    const replies = rawReplies.map((r) => {
      const doc = r.toObject ? r.toObject() : r;
      const email = doc.email || doc.sender || "";
      return {
        ...doc,
        email,
        companyName: doc.companyName || doc.clientName || (email ? email.split("@")[0] : "Client"),
        originalCampaignName: doc.originalCampaignName || doc.campaignId || "Outreach Campaign",
        originalSubject: doc.originalSubject || "Octoink Outreach",
        replySubject: doc.replySubject || doc.subject || "Re: Inquiry",
        replyMessage: doc.replyMessage || doc.body || "",
      };
    });

    return res.json({ success: true, ...syncResult, replies });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const updateReplyStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const reply = await EmailReply.findByIdAndUpdate(id, { status }, { new: true });
    if (!reply) return res.status(404).json({ success: false, message: "Reply not found" });

    return res.json({ success: true, reply });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Create a manual or simulated reply for testing / incoming emails
export const createReply = async (req, res) => {
  try {
    const { email, replySubject, replyMessage, campaignId } = req.body;

    const recipient = await CampaignRecipient.findOne({ email });
    const companyName = recipient ? recipient.companyName : email.split("@")[0];
    const targetCampaignId = campaignId || (recipient ? recipient.campaignId : "CMP-001");

    const reply = new EmailReply({
      campaignId: targetCampaignId,
      companyName,
      email,
      originalSubject: recipient ? recipient.subject : "Campaign Email",
      replySubject: replySubject || "Re: Inquiry",
      replyMessage,
      receivedAt: new Date(),
      status: "New Reply",
    });

    await reply.save();

    if (recipient) {
      recipient.replied = true;
      recipient.repliedAt = new Date();
      recipient.replySubject = replySubject;
      recipient.replyMessage = replyMessage;
      recipient.status = "Replied";
      recipient.lastActivityAt = new Date();
      await recipient.save();

      await Campaign.updateOne({ campaignId: targetCampaignId }, { $inc: { replyCount: 1 } });
    }

    let b2b = await B2BClient.findOne({ email });
    if (b2b) {
      b2b.repliesCount += 1;
      b2b.status = "Replied";
      b2b.timeline.push({
        event: `Reply received: "${replySubject}"`,
        type: "replied",
        details: replyMessage,
        timestamp: new Date(),
      });
      await b2b.save();
    }

    return res.status(201).json({ success: true, reply });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// 10. B2B Clients Controller
export const getB2BClients = async (req, res) => {
  try {
    const clients = await B2BClient.find().sort({ lastContactDate: -1 });
    return res.json({ success: true, clients });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const getB2BClientById = async (req, res) => {
  try {
    const { id } = req.params;
    const client = await B2BClient.findById(id);
    if (!client) return res.status(404).json({ success: false, message: "B2B Client not found" });

    return res.json({ success: true, client });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const updateB2BClientStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const client = await B2BClient.findById(id);
    if (!client) return res.status(404).json({ success: false, message: "B2B Client not found" });

    client.status = status;
    client.timeline.push({
      event: `Status updated to ${status}`,
      type: "status_change",
      timestamp: new Date(),
    });

    await client.save();
    return res.json({ success: true, client });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// 11. Analytics Controller
export const getAnalytics = async (req, res) => {
  try {
    const { dateRange, startDate, endDate, month, year } = req.query;

    let dateFilter = {};
    const now = new Date();

    if (dateRange === "today") {
      const startOfDay = new Date(now.setHours(0, 0, 0, 0));
      dateFilter = { createdAt: { $gte: startOfDay } };
    } else if (dateRange === "yesterday") {
      const yesterdayStart = new Date(now);
      yesterdayStart.setDate(yesterdayStart.getDate() - 1);
      yesterdayStart.setHours(0, 0, 0, 0);

      const yesterdayEnd = new Date(yesterdayStart);
      yesterdayEnd.setHours(23, 59, 59, 999);

      dateFilter = { createdAt: { $gte: yesterdayStart, $lte: yesterdayEnd } };
    } else if (dateRange === "last7") {
      const last7Days = new Date();
      last7Days.setDate(last7Days.getDate() - 7);
      dateFilter = { createdAt: { $gte: last7Days } };
    } else if (dateRange === "last30") {
      const last30Days = new Date();
      last30Days.setDate(last30Days.getDate() - 30);
      dateFilter = { createdAt: { $gte: last30Days } };
    } else if (dateRange === "custom" && startDate && endDate) {
      dateFilter = { createdAt: { $gte: new Date(startDate), $lte: new Date(endDate) } };
    } else if (month && year) {
      const m = parseInt(month) - 1;
      const y = parseInt(year);
      const startOfMonth = new Date(y, m, 1);
      const endOfMonth = new Date(y, m + 1, 0, 23, 59, 59, 999);
      dateFilter = { createdAt: { $gte: startOfMonth, $lte: endOfMonth } };
    }

    const campaigns = await Campaign.find(dateFilter);
    const recipients = await CampaignRecipient.find(dateFilter);
    const replies = await EmailReply.find(dateFilter);

    let totalSent = 0;
    let totalOpened = 0;
    let totalReplies = replies.length;
    let totalFollowUps = 0;
    let totalFailed = 0;

    recipients.forEach((r) => {
      if (r.emailSent) totalSent++;
      if (r.opened) totalOpened++;
      if (r.followUpSent) totalFollowUps++;
      if (r.status === "Failed") totalFailed++;
    });

    const notOpened = Math.max(0, totalSent - totalOpened);
    const openRate = totalSent > 0 ? ((totalOpened / totalSent) * 100).toFixed(1) : "0.0";
    const replyRate = totalSent > 0 ? ((totalReplies / totalSent) * 100).toFixed(1) : "0.0";

    // Daily breakdown for timeline charts
    const dailyMap = new Map();
    recipients.forEach((r) => {
      const dateStr = new Date(r.createdAt).toISOString().split("T")[0];
      if (!dailyMap.has(dateStr)) {
        dailyMap.set(dateStr, { date: dateStr, sent: 0, opened: 0, replies: 0, followUps: 0 });
      }
      const entry = dailyMap.get(dateStr);
      if (r.emailSent) entry.sent += 1;
      if (r.opened) entry.opened += 1;
      if (r.replied) entry.replies += 1;
      if (r.followUpSent) entry.followUps += 1;
    });

    const chartData = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    return res.json({
      success: true,
      summary: {
        totalSent,
        opened: totalOpened,
        notOpened,
        replies: totalReplies,
        followUpsSent: totalFollowUps,
        failed: totalFailed,
        openRate: Number(openRate),
        replyRate: Number(replyRate),
      },
      chartData,
      campaigns,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
