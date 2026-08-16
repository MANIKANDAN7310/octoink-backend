import Order from '../models/Order.js';
import CustomDesign from '../models/CustomDesign.js';
import { sendEmail } from '../utils/sendEmail.js';
import nodemailer from 'nodemailer';
import fs from 'fs';

const fetchFileBuffer = async (fileUrl, defaultFilename = "attachment.png", mimeTypeHint = null) => {
    try {
        if (!fileUrl) return null;
        console.log(`[NODEMAILER_ATTACHMENT_FETCH] Fetching file from: ${fileUrl}`);
        
        let contentBuffer;
        let contentType = mimeTypeHint || "application/octet-stream";
        
        if (fileUrl.startsWith("http://") || fileUrl.startsWith("https://")) {
            const response = await fetch(fileUrl);
            if (!response.ok) {
                console.error(`[CUSTOM_DESIGN_FETCH_ERROR] File download failed:`, { fileUrl, defaultFilename, status: response.status, statusText: response.statusText });
                throw new Error(`Failed to fetch file: ${response.statusText}`);
            }
            const arrayBuffer = await response.arrayBuffer();
            contentBuffer = Buffer.from(arrayBuffer);
            
            const headerContentType = response.headers.get("content-type");
            if (headerContentType) {
                contentType = headerContentType.split(";")[0].trim();
            }
        } else if (fs.existsSync(fileUrl)) {
            contentBuffer = fs.readFileSync(fileUrl);
        } else {
            console.error(`[CUSTOM_DESIGN_FETCH_ERROR] File URL/path not found:`, { fileUrl, defaultFilename });
            return null;
        }

        return {
            filename: defaultFilename,
            content: contentBuffer,
            contentType: contentType
        };
    } catch (err) {
        console.error(`[CUSTOM_DESIGN_FETCH_ERROR] Exception fetching attachment:`, { fileUrl, defaultFilename, error: err.message });
        return null;
    }
};

export const getOrders = async (req, res) => {
    try {
        const orders = await Order.find()
            .populate('userId', 'name email')
            .populate('items.productId')
            .populate('customDesignId')
            .sort({ createdAt: -1 });
        res.json({ success: true, orders });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

export const createCustomDesign = async (req, res) => {
    console.log(`[CUSTOM_DESIGN_CONTROLLER_ACTIVE] production createCustomDesign reached`);
    console.log(`[CUSTOM_DESIGN_REQUEST_RECEIVED] Custom Design form submitted from frontend`);
    try {
        const { fileName, category, width, height, colors, requirement, email } = req.body;
        if (!email || !email.includes("@")) {
            console.warn(`[CUSTOM_DESIGN_REJECTED] Rejected custom design submission due to missing/invalid customer email.`);
            return res.status(400).json({ success: false, message: "Valid customer email address is required." });
        }
        console.log(`[CUSTOM_DESIGN_EMAIL_START] Customer: ${email}, Category: ${category || 'N/A'}, File: ${fileName || 'N/A'}`);
        
        const mainFileObj = req.files?.file?.[0];
        const customDesignUrl = mainFileObj ? mainFileObj.path : "";
        const mainFileOriginalName = mainFileObj?.originalname || fileName || "custom-design.png";
        const mainFileMimeType = mainFileObj?.mimetype || "image/png";

        const refFiles = (req.files?.refFiles || []).map(f => ({
            path: f.path,
            originalName: f.originalname,
            mimeType: f.mimetype
        }));

        const newDesign = new CustomDesign({
            email,
            fileName: fileName || mainFileOriginalName || "N/A",
            category: category || "N/A",
            width: width || "N/A",
            height: height || "N/A",
            colors: colors || "N/A",
            requirement: requirement || "",
            customDesignUrl,
            designFileOriginalName: mainFileOriginalName,
            refFiles: refFiles.map(r => ({ path: r.path, originalName: r.originalName })),
        });

        await newDesign.save();

        console.log("[CUSTOM_DESIGN_SAVED_DB]", newDesign._id);

        // Download attachments for Nodemailer
        const attachments = [];
        const previewImageCid = 'custom-design-preview';

        if (customDesignUrl) {
            const mainAtt = await fetchFileBuffer(customDesignUrl, mainFileOriginalName, mainFileMimeType);
            if (mainAtt) {
                attachments.push({
                    ...mainAtt,
                    cid: previewImageCid,
                    contentDisposition: 'inline'
                });
            }
        }

        if (refFiles && refFiles.length > 0) {
            for (let i = 0; i < refFiles.length; i++) {
                const rf = refFiles[i];
                const refAtt = await fetchFileBuffer(rf.path, rf.originalName || `ref-file-${i + 1}`, rf.mimeType);
                if (refAtt) {
                    attachments.push({
                        ...refAtt,
                        contentDisposition: 'attachment'
                    });
                }
            }
        }

        const htmlBody = buildCustomDesignEmailHtml({
            email,
            category,
            fileName: fileName || mainFileOriginalName,
            width,
            height,
            colors,
            requirement,
            previewImageCid: attachments.some(att => att.cid === previewImageCid) ? previewImageCid : null,
            attachedFiles: attachments.filter(att => att.cid !== previewImageCid).length
                ? attachments.filter(att => att.cid !== previewImageCid).map(att => ({ filename: att.filename }))
                : [{ filename: mainFileOriginalName }]
        });

        console.log(`[CUSTOM_DESIGN_EMAIL_FUNCTION] Calling sendEmail (HTTPS relay)`);

        const emailResult = await sendEmail({
            type: 'custom-design',
            isCustomDesignOrder: true,
            email,
            category,
            fileName: fileName || mainFileOriginalName,
            width,
            height,
            colors,
            requirement,
            attachments
        });

        if (emailResult.success) {
            console.log(`[CUSTOM_DESIGN_EMAIL_SUCCESS] Custom Design email successfully queued via HTTP relay.`);
        } else {
            console.error(`[CUSTOM_DESIGN_EMAIL_ERROR] Email relay failed:`, emailResult.error);
        }

        res.status(201).json({ success: true, customDesignId: newDesign._id });
    } catch (err) {
        console.error(`[NODEMAILER_CUSTOM_DESIGN_ERROR] Exception in createCustomDesign:`, err);
        res.status(500).json({ success: false, message: err.message });
    }
};

export const getCustomDesigns = async (req, res) => {
    try {
        const designs = await CustomDesign.find().sort({ createdAt: -1 });
        res.json({ success: true, orders: designs });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

export const updateOrderStatus = async (req, res) => {
    try {
        const { status } = req.body;
        const order = await CustomDesign.findByIdAndUpdate(req.params.id, { status }, { new: true });
        res.json({ success: true, order });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

export const getPurchases = async (req, res) => {
    try {
        const orders = await Order.find()
            .populate('userId', 'name email')
            .populate('items.productId')
            .sort({ createdAt: -1 });

        const mappedPurchases = orders.map(order => ({
            _id: order._id,
            id: order._id,
            productName: order.items[0]?.title || "Digital Product",
            clientName: order.clientInfo?.name || order.userId?.name || "Unknown",
            clientEmail: order.clientInfo?.email || order.userId?.email || "N/A",
            amount: order.totalAmount || 0,
            paymentId: order.razorpayPaymentId || "N/A",
            downloadedAt: order.createdAt,
            status: order.status
        }));

        res.json({ success: true, purchases: mappedPurchases });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

export const deleteOrder = async (req, res) => {
    try {
        const id = req.params.id;
        let deleted = await CustomDesign.findByIdAndDelete(id);
        if (!deleted) {
            deleted = await Order.findByIdAndDelete(id);
        }

        if (!deleted) {
            return res.status(404).json({ success: false, message: 'Record not found' });
        }

        res.json({ success: true, message: 'Record deleted successfully' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

export const deletePurchasesAll = async (req, res) => {
    try {
        const result = await Order.deleteMany({});
        res.json({
            success: true,
            message: 'All purchases deleted successfully',
            deletedCount: result.deletedCount || 0
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"'`]/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '`': '&#96;'
}[char]));

const buildCustomDesignEmailHtml = ({
    email,
    category,
    fileName,
    width,
    height,
    colors,
    requirement,
    previewImageCid,
    attachedFiles
}) => {
    const rows = [
        { label: 'From', value: email },
        { label: 'Category', value: category || 'N/A' },
        { label: 'File Name', value: fileName || 'N/A' },
        { label: 'Size', value: `${width || 'N/A'} × ${height || 'N/A'}` },
        { label: 'Colors', value: colors || 'N/A' }
    ];

    const requirementMarkup = requirement
        ? `<div style="margin-top: 18px; padding: 18px 16px; background: #f3e8ff; border-left: 4px solid #8b5cf6; border-radius: 8px;">
            <p style="margin: 0 0 8px; font-weight: 700; color: #7c3aed; font-size: 15px;">Requirements:</p>
            <p style="margin: 0; color: #374151; line-height: 1.6; font-size: 14px;">${escapeHtml(requirement).replace(/\n/g, '<br/>')}</p>
          </div>`
        : '';

    const attachmentMarkup = attachedFiles && attachedFiles.length
        ? `<div style="margin-top: 20px; padding: 16px 18px; background: #dcfce7; border: 1px solid #86efac; border-radius: 8px; color: #166534; font-size: 14px;">
            <div style="display: inline-flex; align-items: center; gap: 8px; font-weight: 700; margin-bottom: 8px;">
              <span>📎</span>
              <span>${attachedFiles.length} file(s) attached</span>
            </div>
            ${attachedFiles.map(file => `<div style="margin-top: 4px; color: #166534; font-size: 13px;">• ${escapeHtml(file.filename || file.originalname || 'attachment')}</div>`).join('')}
          </div>`
        : '';

    const previewMarkup = previewImageCid
        ? `<div style="padding: 0 24px 18px;">
            <div style="display: flex; justify-content: center; align-items: center; width: 100%; min-height: 180px; border-radius: 14px; overflow: hidden; background: #f8fafc; border: 1px solid #e5e7eb;">
              <img src="cid:${previewImageCid}" alt="Custom design preview" style="display:block; max-width: 100%; max-height: 240px; object-fit: contain;" />
            </div>
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

      ${previewMarkup}

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
