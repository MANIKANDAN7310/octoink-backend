import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const smtpUser = "manikandankarthik7310@gmail.com";
const smtpPass = "kqycxjtlcpdylvfq";
const recipientEmail = "hello.octoinkstudios@gmail.com";

async function sendAttachmentTest() {
    console.log(`\n--- Sending Custom Design Email with Image Attachment ---`);
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: smtpUser,
            pass: smtpPass
        }
    });

    // Create a dummy PNG image buffer (1x1 transparent PNG)
    const samplePngBuffer = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        "base64"
    );

    const attachments = [
        {
            filename: "custom-design-sample.png",
            content: samplePngBuffer,
            contentType: "image/png"
        }
    ];

    const customerEmail = "client555@gmail.com";
    const category = "Enamel Pin";
    const fileName = "custom-design-sample.png";
    const width = "100";
    const height = "100";
    const colors = "22";
    const requirement = "Please make sure the edges are polished silver metal.";

    const htmlBody = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; background: #f4f4f4; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
    <div style="background: linear-gradient(135deg, #7c3aed, #4f46e5); padding: 30px; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 24px;">New Custom Design Order</h1>
      <p style="color: rgba(255,255,255,0.8); margin: 8px 0 0;">Octoink Studios</p>
    </div>
    <div style="padding: 30px;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 12px 16px; font-weight: bold; color: #7c3aed; width: 40%; border-bottom: 1px solid #ede9fe;">From</td>
          <td style="padding: 12px 16px; border-bottom: 1px solid #ede9fe;">${customerEmail}</td>
        </tr>
        <tr style="background: #f8f5ff;">
          <td style="padding: 12px 16px; font-weight: bold; color: #7c3aed; border-bottom: 1px solid #ede9fe;">Category</td>
          <td style="padding: 12px 16px; border-bottom: 1px solid #ede9fe;">${category}</td>
        </tr>
        <tr>
          <td style="padding: 12px 16px; font-weight: bold; color: #7c3aed; border-bottom: 1px solid #ede9fe;">File Name</td>
          <td style="padding: 12px 16px; border-bottom: 1px solid #ede9fe;">${fileName}</td>
        </tr>
        <tr style="background: #f8f5ff;">
          <td style="padding: 12px 16px; font-weight: bold; color: #7c3aed; border-bottom: 1px solid #ede9fe;">Size</td>
          <td style="padding: 12px 16px; border-bottom: 1px solid #ede9fe;">${width} × ${height}</td>
        </tr>
        <tr>
          <td style="padding: 12px 16px; font-weight: bold; color: #7c3aed; border-bottom: 1px solid #ede9fe;">Colors</td>
          <td style="padding: 12px 16px; border-bottom: 1px solid #ede9fe;">${colors}</td>
        </tr>
      </table>
      <div style="margin-top: 24px; padding: 16px; background: #f8f5ff; border-left: 4px solid #7c3aed; border-radius: 4px;">
        <p style="font-weight: bold; color: #7c3aed; margin: 0 0 8px;">Requirements:</p>
        <p style="margin: 0; color: #333; line-height: 1.6;">${requirement}</p>
      </div>
      <div style="margin-top: 24px; padding: 16px; background: #f0fdf4; border-radius: 8px; border: 1px solid #bbf7d0;">
        <p style="font-weight: bold; color: #16a34a; margin: 0 0 8px;">📎 ${attachments.length} file(s) attached</p>
        ${attachments.map(a => `<p style="margin: 4px 0; color: #555; font-size: 14px;">• ${a.filename}</p>`).join("")}
      </div>
    </div>
    <div style="background: #f8f5ff; padding: 16px; text-align: center;">
      <p style="margin: 0; color: #888; font-size: 12px;">This is an automated notification from Octoink Studios</p>
    </div>
  </div>
</body>
</html>`;

    try {
        const info = await transporter.sendMail({
            from: `"Octoink Studios" <octoinkstudios7310@gmail.com>`,
            to: recipientEmail,
            replyTo: customerEmail,
            subject: `🎨 NEW: ${category} Design from ${customerEmail}`,
            text: `NEW CUSTOM DESIGN ORDER\nFrom: ${customerEmail}\nCategory: ${category}\nFile: ${fileName}\nSize: ${width} x ${height}\nColors: ${colors}\nRequirements: ${requirement}`,
            html: htmlBody,
            attachments
        });
        console.log(`✅ SUCCESS! Custom Design Email with Attachment sent. MessageId: ${info.messageId}`);
    } catch (err) {
        console.error(`❌ FAILED: ${err.message}`);
    }
}

sendAttachmentTest();
