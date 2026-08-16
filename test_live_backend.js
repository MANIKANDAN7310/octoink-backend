async function testLiveCustomDesignEndpoint() {
    console.log("Sending live test request to Render backend...");
    const formData = new FormData();
    formData.append('email', 'livecustomer777@gmail.com');
    formData.append('category', 'Enamel Pin');
    formData.append('fileName', 'live-test-design.png');
    formData.append('width', '150');
    formData.append('height', '150');
    formData.append('colors', '18');
    formData.append('requirement', 'Live website submission verification test.');
    
    // Attach dummy file
    const dummyBlob = new Blob(["test image content"], { type: 'image/png' });
    formData.append('file', dummyBlob, 'live-test-design.png');

    try {
        const response = await fetch('https://octoink-backend.onrender.com/api/orders/custom-design', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();
        console.log("Render Response Status:", response.status);
        console.log("Render Response Data:", data);
    } catch (err) {
        console.error("Live test error:", err);
    }
}

testLiveCustomDesignEndpoint();
