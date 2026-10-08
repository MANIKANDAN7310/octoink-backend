import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

const EMAIL_USER = process.env.EMAIL_USER || "hello.octoinkstudios@gmail.com";
const EMAIL_PASS = process.env.EMAIL_PASS || "oyfekwhejzjozsgc";
const TEST_RECIPIENT = "manikandaninkwrk@gmail.com";

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS
  }
});

async function run() {
  try {
    const serverUrl = "http://localhost:4999";
    const trackingId = "test-uuid-12345";
    const personalizedBody = "<p>Hi Manikandan,</p><p>This is a test campaign message from Email Track dashboard.</p><p>Best regards,<br/>Octoink Studios</p>";
    const trackingPixelHtml = `<img src="${serverUrl}/api/email-track/open?trackingId=${trackingId}" width="1" height="1" style="display:none;" alt="" />`;
    const fullHtml = `<div>${personalizedBody}</div><br/>${trackingPixelHtml}`;

    console.log("Sending email WITH localhost tracking pixel & Reply-To...");

    const info = await transporter.sendMail({
      from: `"Octoink Studios" <${EMAIL_USER}>`,
      to: TEST_RECIPIENT,
      replyTo: EMAIL_USER, // Self-referential Reply-To
      subject: `[Localhost Pixel Test] Campaign Email Test ${Date.now()}`,
      html: fullHtml,
      text: "Hi Manikandan, This is a test campaign message from Email Track dashboard."
    });

    console.log("Response:", info.response);
    console.log("MessageId:", info.messageId);
  } catch (err) {
    console.error("Error:", err);
  }
}

run();
