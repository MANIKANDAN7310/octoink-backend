# Custom Design Local Testing Guide

This guide provides the exact commands to run the custom-design endpoint test locally.

## Prerequisites

- Node.js 18+ (for FormData and fetch support)
- MongoDB connection configured in `.env`
- Port 4999 available (or modify PORT in `.env`)
- Gmail/SMTP credentials configured in `.env`

## Environment Variable Fix

The codebase has an env var mismatch:
- **Code expects**: `SMTP_USER` 
- **Your `.env` has**: `EMAIL_USER=octoinkstudios7310@gmail.com`

The startup scripts automatically set `SMTP_USER` to match `EMAIL_USER` to fix this without modifying `.env`.

---

## Commands to Run

### 1. Start Backend Server Locally

**On Windows (PowerShell or Command Prompt):**
```powershell
cd backend
.\start-local.bat
```

**On macOS/Linux:**
```bash
cd backend
bash start-local.sh
```

**Or manually (all platforms):**
```bash
cd backend
set SMTP_USER=octoinkstudios7310@gmail.com
node server.js
```

**Expected output:**
```
🚀 Server running on port 4999
```

Once you see this, the server is ready. **Leave this terminal running.**

---

### 2. In a New Terminal: Run the Test

**On Windows (PowerShell or Command Prompt):**
```powershell
cd backend
.\run-test.bat
```

**On macOS/Linux:**
```bash
cd backend
bash run-test.sh
```

**Or run directly (all platforms):**
```bash
cd backend
node test_custom_design_local.mjs
```

---

## What the Test Does

The test script:

1. **Creates a test PNG image** (1x1 pixel, ~50 bytes)
2. **POSTs to** `http://localhost:4999/api/orders/custom-design` with multipart/form-data
3. **Payload includes:**
   - `file`: custom-design-sample.png
   - `email`: client.test@example.com
   - `category`: Enamel Pin
   - `fileName`: custom-design-sample.png
   - `width`: 100
   - `height`: 100
   - `colors`: 3
   - `requirement`: Please keep edges smooth. Test submission.

4. **Verifies:**
   - API returns `success: true`
   - CustomDesign record saved to MongoDB
   - All fields match expected values
   - Uploaded image is accessible via Cloudinary URL
   - `isCustom` template detection logic returns `true`

---

## Expected Output (Success Case)

```
==========================================
Testing Custom Design endpoint locally
==========================================

Target: POST http://localhost:4999/api/orders/custom-design

[SETUP] Created test PNG: temp_test_image.png (64 bytes)

[PAYLOAD] Posting multipart/form-data with:
  - file: custom-design-sample.png
  - email: client.test@example.com
  - category: Enamel Pin
  - fileName: custom-design-sample.png
  - width: 100
  - height: 100
  - colors: 3
  - requirement: Please keep edges smooth. Test submission.

[RESPONSE] HTTP Status: 201

[SUCCESS] API accepted submission.
  customDesignId: 66ffeef8a1b2c3d4e5f6g7h8

[VERIFY] Fetching GET /api/orders/custom-designs to verify DB save...

[VERIFY PASSED] CustomDesign record found in database

[FIELDS] Checking saved CustomDesign fields:
  ✓ Email: OK
      Value: client.test@example.com
  ✓ Category: OK
      Value: Enamel Pin
  ✓ File Name: OK
  ✓ Width: OK
  ✓ Height: OK
  ✓ Colors: OK
  ✓ Requirement: OK
  ✓ Uploaded Image URL: OK

[FIELDS] Result: PASS

[IMAGE] Checking uploaded image accessibility...
  HTTP Status: 200
  Content-Type: image/png
  Content-Length: 64
[IMAGE] Result: PASS

[TEMPLATE] Checking if custom-design template would be selected...
  Detection result: true (expected: true)
[TEMPLATE] Result: PASS

==========================================
TESTS PASSED: YES ✓
==========================================

RESULTS:
  API returned success: YES ✓
  Custom Design record saved: YES ✓
  Uploaded image exists: YES ✓
  Email sending: (check hello.octoinkstudios@gmail.com)

NEXT STEP:
  Check the email inbox at: hello.octoinkstudios@gmail.com
  Expected subject: 🎨 NEW: Enamel Pin Design from client.test@example.com
  Expected template: "New Custom Design Order" (NOT "New Website Enquiry")
  Must contain:
    • From: client.test@example.com
    • Category: Enamel Pin
    • File Name: custom-design-sample.png
    • Size: 100 × 100
    • Colors: 3
    • Requirements: Please keep edges smooth. Test submission.
    • Inline image preview (design attachment)
```

---

## Manual Email Verification

After running the test:

1. Go to: **hello.octoinkstudios@gmail.com**
2. Look for email with subject: **`🎨 NEW: Enamel Pin Design from client.test@example.com`**
3. Verify email contains:
   - **Header**: "New Custom Design Order" (not "New Website Enquiry")
   - **From**: client.test@example.com
   - **Category**: Enamel Pin
   - **File Name**: custom-design-sample.png
   - **Size**: 100 × 100
   - **Colors**: 3
   - **Requirements**: Please keep edges smooth. Test submission.
   - **Inline image**: A preview of the uploaded design (inline PNG, not attachment)

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Port 4999 already in use | Change `PORT` in `.env` and update test command or modify start scripts |
| MongoDB connection fails | Verify `MONGO_URI` in `.env` is correct and accessible |
| Email not sent | Verify `EMAIL_PASS` and SMTP credentials in `.env` are valid |
| Test shows "MISSING" fields | Check server logs for errors during multipart parsing |
| Uploaded image returns 404 | Verify Cloudinary credentials in `.env` are correct |

---

## Files Used

- **Backend server**: `backend/server.js`
- **Controller**: `backend/controllers/orderController.js` → `createCustomDesign()`
- **Test script**: `backend/test_custom_design_local.mjs`
- **Startup script (Windows)**: `backend/start-local.bat`
- **Startup script (Unix)**: `backend/start-local.sh`
- **Test runner (Windows)**: `backend/run-test.bat`
- **Test runner (Unix)**: `backend/run-test.sh`

---

## Next Steps (After Test Passes)

Once this local test passes and you verify the email:

1. All custom-design payload fields are correctly received
2. CustomDesign MongoDB record is saved with all fields
3. Uploaded image is accessible via Cloudinary
4. Email template selection is correct (uses "New Custom Design Order", not generic "New Website Enquiry")
5. Email contains inline image preview and all field values

Then we can proceed with any architectural refactoring or additional testing.
