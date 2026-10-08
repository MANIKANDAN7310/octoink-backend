import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

const EMAIL_USER = process.env.EMAIL_USER || "hello.octoinkstudios@gmail.com";
const EMAIL_PASS = process.env.EMAIL_PASS || "oyfekwhejzjozsgc";
const TEST_RECIPIENT = "manikandaninkwrk@gmail.com";

console.log(`Testing SMTP send from ${EMAIL_USER} to ${TEST_RECIPIENT}...`);

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
    const verified = await transporter.verify();
    console.log("Transporter verify result:", verified);

    const info = await transporter.sendMail({
      from: `"Octoink Studios" <${EMAIL_USER}>`,
      to: TEST_RECIPIENT,
      subject: `[Diagnostic Test] Email Delivery Verification ${Date.now()}`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>Diagnostic Delivery Test</h2>
          <p>This is a test email sent from <b>${EMAIL_USER}</b> to <b>${TEST_RECIPIENT}</b>.</p>
          <p>Timestamp: ${new Date().toISOString()}</p>
        </div>
      `,
      text: `Diagnostic Delivery Test sent from ${EMAIL_USER} to ${TEST_RECIPIENT} at ${new Date().toISOString()}`
    });

    console.log("SMTP Response Details:");
    console.log(" - messageId:", info.messageId);
    console.log(" - response:", info.response);
    console.log(" - accepted:", info.accepted);
    console.log(" - rejected:", info.rejected);
    console.log(" - envelope:", info.envelope);
  } catch (err) {
    console.error("SMTP Error:", err);
  }
}

run();
