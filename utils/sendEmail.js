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
    socketTimeout: 10000,
});

export const sendEmail = async (options) => {
    const toAddress = 'octoinkstudios7310@gmail.com';
    console.log(`[CONTACT_EMAIL_START] Attempting to send email via Nodemailer to ${toAddress}`);

    try {
        const mailOptions = {
            from: options.from || `"Octoink Studios" <${process.env.EMAIL_USER}>`,
            to: toAddress,
            subject: options.subject,
            text: options.text,
            html: options.html,
            replyTo: options.replyTo,
        };

        const info = await transporter.sendMail(mailOptions);
        console.log("[CONTACT_EMAIL_SUCCESS] Email sent successfully:", info.response);
        return { success: true, info };
    } catch (error) {
        console.error("[CONTACT_EMAIL_ERROR] Error sending email:", error);
        return { success: false, error };
    }
};
