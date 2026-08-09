import dotenv from "dotenv";

dotenv.config();

export const sendEmail = async ({ name, email, service, message }) => {
    try {
        const url = process.env.GOOGLE_APPS_SCRIPT_URL;
        const secret = process.env.GOOGLE_APPS_SCRIPT_SECRET;
        
        if (!url || !secret) {
            throw new Error("Missing Google Apps Script configuration");
        }

        console.log(`[CONTACT_EMAIL] Attempting via Google Apps Script Web App for:`, email);
        
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                secret,
                name,
                email,
                service,
                message
            })
        });

        const data = await res.json();
        
        if (res.ok && data.success) {
            console.log("[CONTACT_EMAIL_SUCCESS] Email sent via Google Apps Script.");
            return { success: true };
        } else {
            throw new Error(data.error || "Failed to send via Apps Script");
        }
    } catch (error) {
        console.error("[CONTACT_EMAIL_ERROR]", error.message);
        return { success: false, error };
    }
};
