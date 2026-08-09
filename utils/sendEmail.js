import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const ADMIN_EMAIL = process.env.NOTIFICATION_EMAIL || process.env.EMAIL_USER || "manikandankarthik7310@gmail.com";

const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 5000,
});

export const sendEmail = async (options) => {
    const toAddress = options.to || ADMIN_EMAIL || 'octoinkstudios7310@gmail.com';
    console.log(`[CONTACT_EMAIL_START] Attempting to send email to target address(es):`, toAddress);

    // 1. Try Resend HTTP API (HTTPS port 443 - works on Render & cloud hosting without firewall blocks)
    if (RESEND_API_KEY) {
        try {
            console.log("[CONTACT_EMAIL] Attempting via Resend HTTP API...");
            const recipients = Array.isArray(toAddress) ? toAddress : [toAddress];
            
            const payload = {
                from: 'Octoink Studios <onboarding@resend.dev>',
                to: recipients,
                subject: options.subject,
                text: options.text,
                html: options.html,
            };
            if (options.replyTo) {
                payload.reply_to = options.replyTo;
            }

            const res = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${RESEND_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload)
            });

            const resData = await res.json();

            if (res.ok && resData.id) {
                console.log("[CONTACT_EMAIL_SUCCESS] Email sent via Resend API:", resData.id);
                return { success: true, info: resData, provider: 'resend' };
            } else {
                console.warn("[CONTACT_EMAIL_WARN] Resend API response:", resData);
                // If Resend free account restriction (testing mode only allowed to owner email) occurs:
                if (resData.name === 'validation_error' && resData.message?.includes('testing emails')) {
                    console.log("[CONTACT_EMAIL] Retrying Resend directly to account owner:", ADMIN_EMAIL);
                    const retryRes = await fetch('https://api.resend.com/emails', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${RESEND_API_KEY}`,
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            ...payload,
                            to: [ADMIN_EMAIL]
                        })
                    });
                    const retryData = await retryRes.json();
                    if (retryRes.ok && retryData.id) {
                        console.log("[CONTACT_EMAIL_SUCCESS] Email sent via Resend API (owner):", retryData.id);
                        return { success: true, info: retryData, provider: 'resend' };
                    }
                }
            }
        } catch (resendErr) {
            console.error("[CONTACT_EMAIL_ERROR] Resend API error:", resendErr.message);
        }
    }

    // 2. Fallback to Nodemailer SMTP
    try {
        console.log("[CONTACT_EMAIL] Attempting via Nodemailer SMTP...");
        const mailOptions = {
            from: options.from || `"Octoink Studios" <${process.env.EMAIL_USER}>`,
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

