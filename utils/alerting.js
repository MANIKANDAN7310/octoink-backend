import { sendEmail } from "./sendEmail.js";

export const sendAlert = async (type, details) => {
    // Log as critical structured JSON
    console.error(JSON.stringify({
        severity: "ALERT",
        type,
        timestamp: new Date().toISOString(),
        details
    }));

    // Send email to admin
    try {
        const emailBody = `
            <h2>System Alert: ${type}</h2>
            <pre>${JSON.stringify(details, null, 2)}</pre>
            <p>Timestamp: ${new Date().toISOString()}</p>
        `;
        
        await sendEmail({
            subject: `🚨 SYSTEM ALERT: ${type}`,
            html: emailBody
        });
    } catch (e) {
        console.error(JSON.stringify({ type: "alert_email_failed", error: e.message }));
    }
};
