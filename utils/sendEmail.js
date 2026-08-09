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
    try {
        const mailOptions = {
            from: options.from || `"Octoink Studios" <${process.env.EMAIL_USER}>`,
            to: options.to || process.env.EMAIL_USER,
            subject: options.subject,
            text: options.text,
            html: options.html,
            replyTo: options.replyTo,
        };

        const info = await transporter.sendMail(mailOptions);
        console.log("Email sent successfully:", info.response);
        return { success: true, info };
    } catch (error) {
        console.error("Error sending email:", error);
        return { success: false, error };
    }
};
