import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 5000,
});

export const sendEmail = async (options) => {
    const toAddress = options.to || 'octoinkstudios7310@gmail.com';
    console.log(`[CONTACT_EMAIL_START] Attempting to send email to target address(es):`, toAddress);

    try {
        console.log("[CONTACT_EMAIL] Attempting via Nodemailer SMTP...");
        const mailOptions = {
            from: options.from || `"Octoink Studios" <manikandankarthik7310@gmail.com>`,
            to: toAddress,
            subject: options.subject,
            text: options.text,
            html: options.html,
            replyTo: options.replyTo,
        };

        const info = await transporter.sendMail(mailOptions);
        console.log("[CONTACT_EMAIL_SUCCESS] Email sent via Nodemailer SMTP:", info.response);
        return { success: true, info, provider: 'nodemailer' };
    } catch (error) {
        console.error("[CONTACT_EMAIL_ERROR] Error sending email via Nodemailer SMTP:", error.message);
        return { success: false, error };
    }
};
