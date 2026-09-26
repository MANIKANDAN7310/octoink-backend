import nodemailer from 'nodemailer';

export const checkSmtpConnection = async () => {
    const SMTP_USER = process.env.SMTP_USER || process.env.EMAIL_USER;
    const SMTP_PASS = process.env.SMTP_PASS || process.env.EMAIL_PASS;
    if (!SMTP_USER || !SMTP_PASS) return { ok: false, reason: 'missing_credentials' };

    try {
        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 465,
            secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : true,
            auth: { user: SMTP_USER, pass: SMTP_PASS }
        });

        const verified = await transporter.verify();
        return { ok: !!verified, reason: verified ? 'verified' : 'verify_failed' };
    } catch (err) {
        return { ok: false, reason: err.message };
    }
};
