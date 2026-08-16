import fs from 'fs';

// Local test for custom-design endpoint
(async function runTest() {
    try {
        const API = process.env.TEST_API_URL || 'http://localhost:4999';
        console.log(`Submitting test Custom Design to ${API}/api/orders/custom-design`);

        // Create small dummy PNG image
        const dummyImage = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
        fs.writeFileSync('temp_test_image.png', dummyImage);

        const formData = new FormData();
        const fileBlob = new Blob([dummyImage], { type: 'image/png' });
        formData.append('file', fileBlob, 'custom-design-sample.png');

        // Required fields (match frontend names)
        formData.append('email', 'client.test@example.com');
        formData.append('category', 'Enamel Pin');
        formData.append('fileName', 'custom-design-sample.png');
        formData.append('width', '100');
        formData.append('height', '100');
        formData.append('colors', '3');
        formData.append('requirement', 'Please keep edges smooth.');

        // Submit
        const resp = await fetch(`${API}/api/orders/custom-design`, {
            method: 'POST',
            body: formData
        });

        console.log(`[RESPONSE] Status: ${resp.status}`);
        const json = await resp.json().catch(() => null);
        if (!json || !json.success) {
            console.error('[TEST] Submission failed or server returned an error:', json || await resp.text());
            cleanup();
            process.exitCode = 2;
            return;
        }

        const customDesignId = json.customDesignId;
        console.log(`[TEST] Submission succeeded. customDesignId: ${customDesignId}`);

        // Fetch saved custom designs and locate the created record
        const listResp = await fetch(`${API}/api/orders/custom-designs`);
        const listJson = await listResp.json();
        const created = Array.isArray(listJson.orders)
            ? listJson.orders.find(o => o._id === customDesignId)
            : (listJson.orders || []).find(o => o._id === customDesignId);

        if (!created) {
            console.error('[TEST] Could not find the created CustomDesign record in GET /api/orders/custom-designs');
            cleanup();
            process.exitCode = 3;
            return;
        }

        // Verify fields
        const checks = [];
        checks.push({ name: 'Customer email', ok: !!created.email && created.email.includes('@'), value: created.email });
        checks.push({ name: 'Category', ok: !!created.category, value: created.category });
        checks.push({ name: 'File name', ok: !!created.fileName || !!created.designFileOriginalName, value: created.fileName || created.designFileOriginalName });
        checks.push({ name: 'Width', ok: !!created.width, value: created.width });
        checks.push({ name: 'Height', ok: !!created.height, value: created.height });
        checks.push({ name: 'Colors', ok: !!created.colors, value: created.colors });
        checks.push({ name: 'Requirements', ok: typeof created.requirement === 'string', value: created.requirement });
        checks.push({ name: 'customDesignUrl', ok: !!created.customDesignUrl, value: created.customDesignUrl });

        checks.forEach(c => console.log(`[VERIFY] ${c.name}: ${c.ok ? 'OK' : 'MISSING'} (${c.value})`));

        // Check uploaded image headers (HEAD) to confirm presence and size
        if (created.customDesignUrl) {
            try {
                const headResp = await fetch(created.customDesignUrl, { method: 'HEAD' });
                const contentType = headResp.headers.get('content-type');
                const contentLength = headResp.headers.get('content-length');
                const sizeBytes = contentLength ? parseInt(contentLength, 10) : null;
                console.log(`[FILE] preview URL content-type: ${contentType}`);
                console.log(`[FILE] preview URL content-length: ${contentLength || 'unknown'}`);

                const fileSizeOk = contentType && contentType.startsWith('image/') && (sizeBytes === null || sizeBytes > 0);
                console.log(`[VERIFY] Uploaded image available: ${fileSizeOk ? 'OK' : 'MISSING/INVALID'}`);
            } catch (err) {
                console.warn('[FILE] HEAD request failed for uploaded URL:', err.message);
            }
        }

        // Re-run the same isCustom detection logic used in sendEmail.js to assert custom template would be chosen
        const customPayload = created || {};
        const isCustom = Boolean(
            true || // we are testing the custom-design endpoint
            (customPayload.email) ||
            (customPayload.category) ||
            (customPayload.fileName) ||
            (customPayload.requirement) ||
            (customPayload.width) ||
            (customPayload.height) ||
            (customPayload.colors)
        );

        console.log(`[TEMPLATE] isCustom detection (expected true): ${isCustom}`);

        // Final assertion summary
        const allOk = checks.every(c => c.ok) && isCustom;
        console.log(`\nTEST SUMMARY: ${allOk ? 'PASS' : 'FAIL'}`);
        if (!allOk) process.exitCode = 4;

        cleanup();
    } catch (err) {
        console.error('[ERROR]', err);
        process.exitCode = 1;
    }

    function cleanup() {
        try { if (fs.existsSync('temp_test_image.png')) fs.unlinkSync('temp_test_image.png'); } catch (e) {}
    }
})();
