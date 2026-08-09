import { Resend } from 'resend';
import dotenv from "dotenv";

dotenv.config();

const resend = new Resend(process.env.RESEND_API_KEY);

export const sendEmail = async (options) => {
    const toAddress = options.to || 'octoinkstudios7310@gmail.com';
    console.log(`[CONTACT_EMAIL_START] Attempting to send email via Resend to ${toAddress}`);
    
    try {
        const { data, error } = await resend.emails.send({
            from: process.env.EMAIL_FROM || 'onboarding@resend.dev',
            to: toAddress,
            subject: options.subject,
            text: options.text,
            html: options.html,
            reply_to: options.replyTo,
        });

        if (error) {
            console.error("[CONTACT_EMAIL_ERROR] Resend API returned error:", error);
            return { success: false, error };
        }

        console.log("[CONTACT_EMAIL_SUCCESS] Email sent successfully via Resend. ID:", data.id);
        return { success: true, info: data };
    } catch (error) {
        console.error("[CONTACT_EMAIL_ERROR] Exception in sendEmail:", error);
        return { success: false, error };
    }
};
