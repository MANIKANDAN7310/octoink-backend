import dotenv from "dotenv";

dotenv.config();

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"'`]/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '`': '&#96;'
}[char]));

const buildCustomDesignHtml = ({
    email,
    category,
    fileName,
    width,
    height,
    colors,
    requirement,
    attachmentNames = []
}) => {
    const rows = [
        { label: 'From', value: email },
        { label: 'Category', value: category || 'N/A' },
        { label: 'File Name', value: fileName || 'N/A' },
        { label: 'Size', value: `${width || 'N/A'} × ${height || 'N/A'}` },
        { label: 'Colors', value: colors || 'N/A' }
    ];

    const attachmentMarkup = attachmentNames.length
        ? `<div style="margin-top: 20px; padding: 16px 18px; background: #dcfce7; border: 1px solid #86efac; border-radius: 8px; color: #166534; font-size: 14px;">
            <div style="display: inline-flex; align-items: center; gap: 8px; font-weight: 700; margin-bottom: 8px;">
              <span>📎</span>
              <span>${attachmentNames.length} file(s) attached</span>
            </div>
            ${attachmentNames.map(fileName => `<div style="margin-top: 4px; color: #166534; font-size: 13px;">• ${escapeHtml(fileName)}</div>`).join('')}
          </div>`
        : '';

    const requirementMarkup = requirement
        ? `<div style="margin-top: 18px; padding: 18px 16px; background: #f3e8ff; border-left: 4px solid #8b5cf6; border-radius: 8px;">
            <p style="margin: 0 0 8px; font-weight: 700; color: #7c3aed; font-size: 15px;">Requirements:</p>
            <p style="margin: 0; color: #374151; line-height: 1.6; font-size: 14px;">${escapeHtml(requirement).replace(/\n/g, '<br/>')}</p>
          </div>`
        : '';

    return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  </head>
  <body style="margin: 0; font-family: Arial, sans-serif; background: #f2f4f7; padding: 24px; color: #111827;">
    <div style="max-width: 620px; margin: 0 auto; background: #ffffff; border-radius: 14px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.08);">
      <div style="background: linear-gradient(135deg, #7c3aed, #5b21b6); padding: 26px 30px; text-align: center;">
        <h1 style="margin: 0; color: #ffffff; font-size: 30px; line-height: 1.2; font-weight: 700;">New Custom Design Order</h1>
        <p style="margin: 8px 0 0; color: rgba(255,255,255,0.92); font-size: 16px;">Octoink Studios</p>
      </div>

      <div style="padding: 0 20px 20px;">
        <div style="background: #f8f5ff; border: 1px solid #e9d5ff; border-radius: 10px; overflow: hidden;">
          ${rows.map((row, index) => `
            <div style="display: table; width: 100%; border-bottom: ${index === rows.length - 1 ? 'none' : '1px solid #e9d5ff'}; background: ${index % 2 === 0 ? '#ffffff' : '#f8f5ff'};">
              <div style="display: table-cell; width: 30%; padding: 16px 18px; font-weight: 700; color: #4b5563; text-align: left; font-size: 14px;">${escapeHtml(row.label)}</div>
              <div style="display: table-cell; padding: 16px 18px; color: #111827; text-align: left; font-size: 14px;">${escapeHtml(row.value)}</div>
            </div>
          `).join('')}
        </div>

        ${requirementMarkup}
        ${attachmentMarkup}
      </div>
    </div>
  </body>
</html>`;
};

export const sendEmail = async ({
    type,
    isCustomDesignOrder,
    customDesign,
    name,
    email,
    service,
    message,
    subject,
    html,
    text,
    replyTo,
    attachments,
    ...rest
}) => {
    try {
        const url = process.env.GOOGLE_APPS_SCRIPT_URL;
        const secret = process.env.GOOGLE_APPS_SCRIPT_SECRET;
        
        if (!url || !secret) {
            console.error("Missing Google Apps Script URL or Secret. Emails cannot be sent.");
            return { success: false, error: "Missing email configuration" };
        }

        const customerEmail = replyTo || email || (customDesign && customDesign.email);

        if (!customerEmail || !customerEmail.includes('@') || customerEmail === 'hello.octoinkstudios@gmail.com') {
            console.warn(`[SEND_EMAIL_SKIPPED] Refusing to send email without valid customer email. Given: ${customerEmail}`);
            return { success: false, error: "Missing valid customer email address." };
        }

        const customPayload = customDesign || {};
        const isCustom = Boolean(isCustomDesignOrder || type === 'custom-design' || customPayload.email || customPayload.category || customPayload.fileName || customPayload.requirement || customPayload.width || customPayload.height || customPayload.colors);

        let resolvedHtml = html;
        let resolvedText = text;

        if (isCustom && !html) {
            const attachmentNames = attachments
                ? attachments.map(att => att.filename || att.originalname || 'attachment').filter(Boolean)
                : [];

            resolvedHtml = buildCustomDesignHtml({
                email: customerEmail,
                category: customPayload.category || customPayload.type || 'N/A',
                fileName: customPayload.fileName || customPayload.designFileOriginalName || 'N/A',
                width: customPayload.width || 'N/A',
                height: customPayload.height || 'N/A',
                colors: customPayload.colors || 'N/A',
                requirement: customPayload.requirement || customPayload.message || '',
                attachmentNames
            });
            resolvedText = `NEW CUSTOM DESIGN ORDER\nFrom: ${customerEmail}\nCategory: ${customPayload.category || 'N/A'}\nFile Name: ${customPayload.fileName || customPayload.designFileOriginalName || 'N/A'}\nSize: ${customPayload.width || 'N/A'} × ${customPayload.height || 'N/A'}\nColors: ${customPayload.colors || 'N/A'}\nRequirements: ${customPayload.requirement || customPayload.message || 'None'}`;
        }

        const defaultSubject = subject || (isCustom ? `🎨 NEW: Custom Design Order from ${customerEmail}` : `📩 New Website Enquiry from ${customerEmail}`);

        // Prepare Base64 attachments for Google Apps Script
        const gasAttachments = [];
        if (attachments && attachments.length > 0) {
            for (const att of attachments) {
                if (att.content) {
                    gasAttachments.push({
                        filename: att.filename || 'attachment',
                        mimeType: att.contentType || 'application/octet-stream',
                        data: att.content.toString('base64')
                    });
                }
            }
        }

        const payload = {
            secret,
            type: isCustom ? 'custom-design' : 'contact',
            isCustomDesignOrder: isCustom,
            name,
            email: customerEmail,
            service,
            message,
            subject: defaultSubject,
            html: resolvedHtml,
            text: resolvedText,
            replyTo: customerEmail,
            attachments: gasAttachments,
            ...rest
        };

        console.log(`[EMAIL_RELAY] Dispatching email to Google Apps Script (HTTPS)...`);
        
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const responseData = await res.json();
        
        if (responseData.success) {
            console.log(`[EMAIL_RELAY_SUCCESS] Google Apps Script processed email successfully.`);
            return { success: true };
        } else {
            console.error(`[EMAIL_RELAY_ERROR] Google Apps Script returned error:`, responseData.error);
            return { success: false, error: responseData.error };
        }
    } catch (error) {
        console.error("[EMAIL_RELAY_CRITICAL_ERROR]", error.message);
        return { success: false, error };
    }
};
