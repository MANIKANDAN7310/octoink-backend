/**
 * Google Apps Script Web App for Octoink Studios Email Relay
 * 
 * ⚠️ CRITICAL DEPLOYMENT INSTRUCTIONS:
 * MUST BE DEPLOYED UNDER GMAIL ACCOUNT: hello.octoinkstudios@gmail.com
 * (This ensures all outreach emails are sent directly FROM hello.octoinkstudios@gmail.com)
 * 
 * Deployment settings in script.google.com:
 * 1. Open https://script.google.com signed in as: hello.octoinkstudios@gmail.com
 * 2. Paste this entire code into the Code.gs editor
 * 3. Click "Deploy" -> "Manage deployments" (or "New deployment")
 * 4. Select type: "Web app"
 * 5. Configuration:
 *    - Description: "Octoink Studios Email Relay"
 *    - Execute as: "Me (hello.octoinkstudios@gmail.com)"
 *    - Who has access: "Anyone"
 * 6. Click "Deploy" (or "New Version" -> "Deploy" if updating)
 * 7. Copy the Web App URL (starts with https://script.google.com/macros/s/...)
 * 8. Set that URL in your Render environment variable: GOOGLE_APPS_SCRIPT_URL
 */

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({ 
        success: false, 
        error: "Missing POST body data" 
      })).setMimeType(ContentService.MimeType.JSON);
    }

    const data = JSON.parse(e.postData.contents);
    
    // Shared secret for security validation
    const EXPECTED_SECRET = "octoink_apps_script_secret_2025";

    if (!data.secret || data.secret !== EXPECTED_SECRET) {
      return ContentService.createTextOutput(JSON.stringify({ 
        success: false, 
        error: "Unauthorized: Invalid secret" 
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // Determine if this is an OUTBOUND CAMPAIGN / OUTREACH EMAIL to a client
    const isOutboundCampaign = Boolean(
      data.type === "campaign" ||
      data.type === "email-track" ||
      data.type === "followup" ||
      (data.to && 
       data.to.toLowerCase() !== "hello.octoinkstudios@gmail.com" && 
       !data.isCustomDesignOrder && 
       data.type !== "custom-design" && 
       data.type !== "contact")
    );

    let recipient = "";
    let replyToAddress = "";
    let senderName = "Octoink Studios";
    let subject = data.subject || "Octoink Studios";
    let bodyText = data.text || "";
    let bodyHtml = data.html || "";

    if (isOutboundCampaign) {
      // ═══════════════════════════════════════════════════════════════════════════
      // 1. OUTBOUND CAMPAIGN EMAIL (Sent TO the Client on your list)
      // ═══════════════════════════════════════════════════════════════════════════
      recipient = data.to || data.recipient;
      if (!recipient || !recipient.includes("@")) {
        return ContentService.createTextOutput(JSON.stringify({
          success: false,
          error: "Recipient email is missing or invalid for campaign email"
        })).setMimeType(ContentService.MimeType.JSON);
      }

      // When the client hits "Reply", replies MUST go to hello.octoinkstudios@gmail.com
      replyToAddress = "hello.octoinkstudios@gmail.com";
      senderName = "Octoink Studios";

      if (!bodyText && bodyHtml) {
        bodyText = bodyHtml.replace(/<[^>]+>/g, " ").trim();
      }

      Logger.log("Outbound campaign email targeted to client: " + recipient);
    } else {
      // ═══════════════════════════════════════════════════════════════════════════
      // 2. INBOUND WEBSITE CONTACT OR CUSTOM DESIGN ORDER
      // ═══════════════════════════════════════════════════════════════════════════
      // Inbound notifications are delivered TO Octoink Studios
      recipient = "hello.octoinkstudios@gmail.com";

      const isCustomDesign = (data.type === "custom-design") || data.isCustomDesignOrder || Boolean(data.customDesign) || (data.subject && data.subject.toLowerCase().includes("custom design"));
      const customerEmail = data.replyTo || data.email || (data.customDesign && data.customDesign.email) || "hello.octoinkstudios@gmail.com";
      replyToAddress = customerEmail;
      senderName = data.name || (isCustomDesign ? "Custom Design Customer" : "Website Customer");
      subject = data.subject || (isCustomDesign ? "New Custom Design Order - Octoink Studios" : "New Website Enquiry - Octoink Studios");

      if (isCustomDesign && !bodyHtml) {
        const cd = data.customDesign || data;
        const categoryStr = cd.category || data.category || "N/A";
        const fileNameStr = cd.fileName || data.fileName || "N/A";
        const widthStr = cd.width || data.width;
        const heightStr = cd.height || data.height;
        const sizeStr = cd.size || (widthStr && heightStr ? widthStr + " × " + heightStr : (widthStr || heightStr || "N/A"));
        const colorsStr = cd.colors || data.colors || "N/A";
        const requirementStr = cd.requirement || cd.message || data.requirement || data.message || "None";

        bodyText = "NEW CUSTOM DESIGN ORDER\n\n" +
          "Customer Email: " + customerEmail + "\n" +
          "Category: " + categoryStr + "\n" +
          "File Name: " + fileNameStr + "\n" +
          "Size: " + sizeStr + "\n" +
          "Colors: " + colorsStr + "\n\n" +
          "Requirements:\n" + requirementStr;

        bodyHtml = '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">' +
          '<div style="background: linear-gradient(135deg, #7c3aed, #4f46e5); padding: 30px; text-align: center; color: white;">' +
          '<h1 style="margin:0; font-size: 24px;">New Custom Design Order</h1>' +
          '<p style="margin:8px 0 0; font-size:14px; opacity:0.8;">Octoink Studios</p>' +
          '</div>' +
          '<div style="padding: 30px;">' +
          '<table style="width:100%; border-collapse:collapse; font-size:14px;">' +
          '<tr><td style="padding:12px 16px; font-weight:bold; color:#7c3aed; width:40%; border-bottom:1px solid #ede9fe;">From</td><td style="padding:12px 16px; border-bottom:1px solid #ede9fe;">' + customerEmail + '</td></tr>' +
          '<tr style="background:#f8f5ff;"><td style="padding:12px 16px; font-weight:bold; color:#7c3aed; border-bottom:1px solid #ede9fe;">Category</td><td style="padding:12px 16px; border-bottom:1px solid #ede9fe;">' + categoryStr + '</td></tr>' +
          '<tr><td style="padding:12px 16px; font-weight:bold; color:#7c3aed; border-bottom:1px solid #ede9fe;">File Name</td><td style="padding:12px 16px; border-bottom:1px solid #ede9fe;">' + fileNameStr + '</td></tr>' +
          '<tr style="background:#f8f5ff;"><td style="padding:12px 16px; font-weight:bold; color:#7c3aed; border-bottom:1px solid #ede9fe;">Size</td><td style="padding:12px 16px; border-bottom:1px solid #ede9fe;">' + sizeStr + '</td></tr>' +
          '<tr><td style="padding:12px 16px; font-weight:bold; color:#7c3aed; border-bottom:1px solid #ede9fe;">Colors</td><td style="padding:12px 16px; border-bottom:1px solid #ede9fe;">' + colorsStr + '</td></tr>' +
          '</table>' +
          '<div style="margin-top:24px; padding:16px; background:#f8f5ff; border-left:4px solid #7c3aed; border-radius:4px;">' +
          '<p style="font-weight:bold; color:#7c3aed; margin:0 0 8px;">Requirements:</p>' +
          '<p style="margin:0; color:#333; line-height:1.6;">' + requirementStr.replace(/\n/g, '<br/>') + '</p>' +
          '</div>' +
          '</div>' +
          '</div>';
      } else if (!bodyHtml) {
        bodyText = "NEW WEBSITE ENQUIRY\n\n" +
          "Name: " + senderName + "\n" +
          "Email: " + customerEmail + "\n" +
          "Service: " + (data.service || "N/A") + "\n\n" +
          "Message:\n" + (data.message || "");

        bodyHtml = '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">' +
          '<div style="background: linear-gradient(135deg, #7c3aed, #4f46e5); padding: 30px; text-align: center; color: white;">' +
          '<h1 style="margin:0; font-size: 24px;">New Website Enquiry</h1>' +
          '<p style="margin:8px 0 0; font-size:14px; opacity:0.8;">Octoink Studios</p>' +
          '</div>' +
          '<div style="padding: 30px;">' +
          '<table style="width:100%; border-collapse:collapse; font-size:14px;">' +
          '<tr><td style="padding:12px 16px; font-weight:bold; color:#7c3aed; width:40%; border-bottom:1px solid #ede9fe;">Name</td><td style="padding:12px 16px; border-bottom:1px solid #ede9fe;">' + senderName + '</td></tr>' +
          '<tr style="background:#f8f5ff;"><td style="padding:12px 16px; font-weight:bold; color:#7c3aed; border-bottom:1px solid #ede9fe;">Email</td><td style="padding:12px 16px; border-bottom:1px solid #ede9fe;">' + customerEmail + '</td></tr>' +
          '<tr><td style="padding:12px 16px; font-weight:bold; color:#7c3aed; border-bottom:1px solid #ede9fe;">Service Interested In</td><td style="padding:12px 16px; border-bottom:1px solid #ede9fe;">' + (data.service || "N/A") + '</td></tr>' +
          '</table>' +
          (data.message ? '<div style="margin-top:24px; padding:16px; background:#f8f5ff; border-left:4px solid #7c3aed; border-radius:4px;"><p style="font-weight:bold; color:#7c3aed; margin:0 0 8px;">Message:</p><p style="margin:0; color:#333; line-height:1.6;">' + data.message.replace(/\n/g, '<br/>') + '</p></div>' : '') +
          '</div>' +
          '</div>';
      }
    }

    // Decode attachments from Base64 if present
    const blobs = [];
    const fileNames = [];
    if (data.attachments && Array.isArray(data.attachments)) {
      data.attachments.forEach(function(att) {
        if (att && att.data) {
          try {
            const bytes = Utilities.base64Decode(att.data);
            const fileName = att.filename || "attachment.png";
            const mimeType = att.mimeType || "application/octet-stream";
            const blob = Utilities.newBlob(bytes, mimeType, fileName);
            blobs.push(blob);
            fileNames.push(fileName);
          } catch(attErr) {
            Logger.log("Failed to process attachment: " + attErr.toString());
          }
        }
      });
    }

    const mailOptions = {
      htmlBody: bodyHtml,
      replyTo: replyToAddress,
      name: senderName
    };

    if (blobs.length > 0) {
      mailOptions.attachments = blobs;
    }

    // Send email via GmailApp
    GmailApp.sendEmail(recipient, subject, bodyText || "Please view the HTML version of this email.", mailOptions);

    Logger.log("Email successfully sent to: " + recipient + " with " + blobs.length + " attachment(s)");

    return ContentService.createTextOutput(JSON.stringify({ 
      success: true, 
      message: "Email dispatched successfully to " + recipient,
      recipient: recipient,
      replyTo: replyToAddress
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    Logger.log("Email send error: " + err.toString());
    return ContentService.createTextOutput(JSON.stringify({ 
      success: false, 
      error: err.toString() 
    })).setMimeType(ContentService.MimeType.JSON);
  }
}
