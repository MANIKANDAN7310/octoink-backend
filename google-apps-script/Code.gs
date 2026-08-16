/**
 * Google Apps Script Web App for Octoink Studios Email Relay
 * 
 * MUST BE DEPLOYED UNDER GMAIL ACCOUNT: octoinkstudios7310@gmail.com
 * 
 * Deployment settings:
 * - Execute as: Me (octoinkstudios7310@gmail.com)
 * - Who has access: Anyone
 */

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    
    // Shared secret for security validation
    const EXPECTED_SECRET = "octoink_apps_script_secret_2025";

    if (!data.secret || data.secret !== EXPECTED_SECRET) {
      return ContentService.createTextOutput(JSON.stringify({ 
        success: false, 
        error: "Unauthorized: Invalid secret" 
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // Reject empty/dummy payloads that have no customer info
    if (!data.html && !data.customDesign && !data.email && !data.replyTo && !data.name && !data.message) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: "Ignored empty/dummy request"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // Target recipient email (GLOBAL DESTINATION)
    const recipient = "hello.octoinkstudios@gmail.com";
    
    const isCustomDesign = (data.type === "custom-design") || data.isCustomDesignOrder || Boolean(data.customDesign) || (data.subject && data.subject.toLowerCase().includes("custom design"));

    Logger.log("customDesign received: " + isCustomDesign);

    // Customer email for Reply-To
    const customerEmail = data.replyTo || data.email || (data.customDesign && data.customDesign.email) || "hello.octoinkstudios@gmail.com";
    const senderName = data.name || (isCustomDesign ? "Custom Design Customer" : "Website Customer");
    const defaultSubject = isCustomDesign ? "New Custom Design Order - Octoink Studios" : "New Website Enquiry - Octoink Studios";
    const subject = data.subject || defaultSubject;

    let bodyText = data.text;
    let bodyHtml = data.html;

    if (isCustomDesign) {
      if (!bodyHtml) {
        const cd = data.customDesign || data;
        const categoryStr = cd.category || data.category || "N/A";
        const fileNameStr = cd.fileName || data.fileName || "N/A";
        const widthStr = cd.width || data.width;
        const heightStr = cd.height || data.height;
        const sizeStr = cd.size || (widthStr && heightStr ? widthStr + " × " + heightStr : (widthStr || heightStr || "N/A"));
        const colorsStr = cd.colors || data.colors || "N/A";
        const requirementStr = cd.requirement || cd.message || data.requirement || data.message || "None";
        const fileUrlStr = cd.fileUrl || cd.customDesignUrl || data.customDesignUrl || "";

        bodyText = "NEW CUSTOM DESIGN ORDER\n\n" +
          "Customer Email: " + customerEmail + "\n" +
          "Category: " + categoryStr + "\n" +
          "File Name: " + fileNameStr + "\n" +
          "Size: " + sizeStr + "\n" +
          "Colors: " + colorsStr + "\n\n" +
          "Requirements:\n" + requirementStr;

        bodyHtml = '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">' +
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
      }
    } else {
      if (!bodyHtml) {
        bodyText = "NEW WEBSITE ENQUIRY\n\n" +
          "Name: " + senderName + "\n" +
          "Email: " + customerEmail + "\n" +
          "Service: " + (data.service || "N/A") + "\n\n" +
          "Message:\n" + (data.message || "");

        bodyHtml = '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">' +
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
            const fileName = att.filename || "design-attachment.png";
            const mimeType = att.mimeType || "image/png";
            const blob = Utilities.newBlob(bytes, mimeType, fileName);
            blobs.push(blob);
            fileNames.push(fileName);
          } catch(attErr) {
            Logger.log("Failed to process attachment: " + attErr.toString());
          }
        }
      });
    }

    Logger.log("attachment count: " + blobs.length);
    Logger.log("attachment filenames: " + fileNames.join(", "));

    const mailOptions = {
      htmlBody: bodyHtml,
      replyTo: customerEmail,
      name: "Octoink Studios"
    };

    if (blobs.length > 0) {
      mailOptions.attachments = blobs;
    }

    // Send email via GmailApp (sent FROM octoinkstudios7310@gmail.com)
    GmailApp.sendEmail(recipient, subject, bodyText || "Please view the HTML version of this email.", mailOptions);

    Logger.log("email send success for recipient: " + recipient);

    return ContentService.createTextOutput(JSON.stringify({ 
      success: true, 
      message: "Email dispatched to " + recipient + " with " + blobs.length + " attachment(s)." 
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    Logger.log("email send failure: " + err.toString());
    return ContentService.createTextOutput(JSON.stringify({ 
      success: false, 
      error: err.toString() 
    })).setMimeType(ContentService.MimeType.JSON);
  }
}
