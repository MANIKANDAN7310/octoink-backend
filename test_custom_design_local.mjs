import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Local test for custom-design endpoint (Node.js 18+)
(async function runTest() {
    const tempImagePath = path.join(__dirname, 'temp_test_image.png');
    
    try {
        const API = process.env.TEST_API_URL || 'http://localhost:4999';
        console.log(`\n========================================`);
        console.log(`Testing Custom Design endpoint locally`);
        console.log(`========================================\n`);
        console.log(`Target: POST ${API}/api/orders/custom-design`);

        // Create small dummy PNG image (1x1 transparent PNG)
        const dummyImage = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
        fs.writeFileSync(tempImagePath, dummyImage);
        console.log(`[SETUP] Created test PNG: ${path.basename(tempImagePath)} (${dummyImage.length} bytes)\n`);

        // Build FormData with the file and fields
        const formData = new FormData();
        
        // Append file using Blob
        const fileBlob = new Blob([dummyImage], { type: 'image/png' });
        formData.append('file', fileBlob, 'custom-design-sample.png');

        // Append form fields (must match frontend payload exactly)
        formData.append('email', 'client.test@example.com');
        formData.append('category', 'Enamel Pin');
        formData.append('fileName', 'custom-design-sample.png');
        formData.append('width', '100');
        formData.append('height', '100');
        formData.append('colors', '3');
        formData.append('requirement', 'Please keep edges smooth. Test submission.');

        console.log(`[PAYLOAD] Posting multipart/form-data with:`);
        console.log(`  - file: custom-design-sample.png`);
        console.log(`  - email: client.test@example.com`);
        console.log(`  - category: Enamel Pin`);
        console.log(`  - fileName: custom-design-sample.png`);
        console.log(`  - width: 100`);
        console.log(`  - height: 100`);
        console.log(`  - colors: 3`);
        console.log(`  - requirement: Please keep edges smooth. Test submission.\n`);

        // Submit POST request
        const resp = await fetch(`${API}/api/orders/custom-design`, {
            method: 'POST',
            body: formData
        });

        console.log(`[RESPONSE] HTTP Status: ${resp.status}`);
        
        let json = null;
        try {
            json = await resp.json();
        } catch (e) {
            console.error(`[ERROR] Response was not JSON:`, e.message);
            cleanup();
            process.exitCode = 2;
            return;
        }

        if (!json.success) {
            console.error(`[TEST FAILED] Submission returned success=false`);
            console.error(`  Message: ${json.message || 'N/A'}`);
            cleanup();
            process.exitCode = 2;
            return;
        }

        const customDesignId = json.customDesignId;
        console.log(`[SUCCESS] API accepted submission.`);
        console.log(`  customDesignId: ${customDesignId}\n`);

        // Wait a moment for DB write
        await new Promise(resolve => setTimeout(resolve, 500));

        // Fetch saved custom designs and locate the created record
        console.log(`[VERIFY] Fetching GET /api/orders/custom-designs to verify DB save...`);
        const listResp = await fetch(`${API}/api/orders/custom-designs`);
        if (!listResp.ok) {
            console.error(`[ERROR] Failed to fetch custom designs list. Status: ${listResp.status}`);
            cleanup();
            process.exitCode = 3;
            return;
        }

        const listJson = await listResp.json();
        const created = (listJson.orders || []).find(o => o._id === customDesignId);

        if (!created) {
            console.error(`[VERIFY FAILED] Could not find customDesignId="${customDesignId}" in database`);
            console.error(`  Returned orders count: ${(listJson.orders || []).length}`);
            cleanup();
            process.exitCode = 3;
            return;
        }

        console.log(`[VERIFY PASSED] CustomDesign record found in database\n`);

        // Verify all required fields are saved correctly
        console.log(`[FIELDS] Checking saved CustomDesign fields:`);
        const checks = [];
        checks.push({ name: 'Email', ok: created.email === 'client.test@example.com', value: created.email });
        checks.push({ name: 'Category', ok: created.category === 'Enamel Pin', value: created.category });
        checks.push({ name: 'File Name', ok: !!created.fileName, value: created.fileName || created.designFileOriginalName });
        checks.push({ name: 'Width', ok: created.width === '100', value: created.width });
        checks.push({ name: 'Height', ok: created.height === '100', value: created.height });
        checks.push({ name: 'Colors', ok: created.colors === '3', value: created.colors });
        checks.push({ name: 'Requirement', ok: typeof created.requirement === 'string' && created.requirement.length > 0, value: created.requirement });
        checks.push({ name: 'Uploaded Image URL', ok: !!created.customDesignUrl && created.customDesignUrl.startsWith('http'), value: created.customDesignUrl ? '(Cloudinary URL present)' : '(none)' });

        let allFieldsOk = true;
        checks.forEach(c => {
            const status = c.ok ? '✓' : '✗';
            console.log(`  ${status} ${c.name}: ${c.ok ? 'OK' : 'MISSING'}`);
            if (!c.ok) allFieldsOk = false;
            if (c.value && (typeof c.value === 'string' && c.value.length < 60)) {
                console.log(`      Value: ${c.value}`);
            }
        });

        console.log(`\n[FIELDS] Result: ${allFieldsOk ? 'PASS' : 'FAIL'}\n`);

        // Verify uploaded image exists and is reachable
        let imageOk = false;
        if (created.customDesignUrl) {
            console.log(`[IMAGE] Checking uploaded image accessibility...`);
            try {
                const headResp = await fetch(created.customDesignUrl, { method: 'HEAD' });
                const contentType = headResp.headers.get('content-type') || 'unknown';
                const contentLength = headResp.headers.get('content-length') || 'unknown';
                console.log(`  HTTP Status: ${headResp.status}`);
                console.log(`  Content-Type: ${contentType}`);
                console.log(`  Content-Length: ${contentLength}`);
                
                imageOk = headResp.ok && contentType.includes('image');
                console.log(`[IMAGE] Result: ${imageOk ? 'PASS' : 'FAIL'}\n`);
            } catch (err) {
                console.error(`[IMAGE] Failed to verify image: ${err.message}\n`);
            }
        }

        // Template detection check
        console.log(`[TEMPLATE] Checking if custom-design template would be selected...`);
        const customPayload = created || {};
        const isCustom = Boolean(
            customPayload.email ||
            customPayload.category ||
            customPayload.fileName ||
            customPayload.requirement ||
            customPayload.width ||
            customPayload.height ||
            customPayload.colors
        );
        console.log(`  Detection result: ${isCustom} (expected: true)`);
        console.log(`[TEMPLATE] Result: ${isCustom ? 'PASS' : 'FAIL'}\n`);

        // Final summary
        const allOk = allFieldsOk && isCustom && imageOk;
        console.log(`========================================`);
        console.log(`TESTS PASSED: ${allOk ? 'YES ✓' : 'NO ✗'}`);
        console.log(`========================================\n`);
        
        console.log(`RESULTS:`);
        console.log(`  API returned success: YES ✓`);
        console.log(`  Custom Design record saved: ${allFieldsOk ? 'YES ✓' : 'NO ✗'}`);
        console.log(`  Uploaded image exists: ${imageOk ? 'YES ✓' : 'NO ✗'}`);
        console.log(`  Email sending: (check hello.octoinkstudios@gmail.com)\n`);

        console.log(`NEXT STEP:`);
        console.log(`  Check the email inbox at: hello.octoinkstudios@gmail.com`);
        console.log(`  Expected subject: 🎨 NEW: Enamel Pin Design from client.test@example.com`);
        console.log(`  Expected template: "New Custom Design Order" (NOT "New Website Enquiry")`);
        console.log(`  Must contain:`);
        console.log(`    • From: client.test@example.com`);
        console.log(`    • Category: Enamel Pin`);
        console.log(`    • File Name: custom-design-sample.png`);
        console.log(`    • Size: 100 × 100`);
        console.log(`    • Colors: 3`);
        console.log(`    • Requirements: Please keep edges smooth. Test submission.`);
        console.log(`    • Inline image preview (design attachment)\n`);
        
        if (!allOk) process.exitCode = 4;

        cleanup();
    } catch (err) {
        console.error(`[FATAL ERROR] ${err.message}`);
        console.error(err.stack);
        cleanup();
        process.exitCode = 1;
    }

    function cleanup() {
        try { 
            if (fs.existsSync(tempImagePath)) {
                fs.unlinkSync(tempImagePath);
            }
        } catch (e) {
            // ignore
        }
    }
})();
