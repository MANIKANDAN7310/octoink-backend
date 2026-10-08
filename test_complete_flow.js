import dotenv from "dotenv";
import { testSend, checkConnection } from "./controllers/emailTrackController.js";

dotenv.config();

console.log("=================================================");
console.log("   RUNNING EMAIL TRACK COMPLETE FLOW VERIFICATION ");
console.log("=================================================");

// Mock express req/res
const mockRes = () => {
  const res = {};
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data) => {
    res.jsonData = data;
    return res;
  };
  return res;
};

async function runVerification() {
  // Step 1: Check SMTP Connection
  console.log("\n--- Step 1: Verifying SMTP Connection ---");
  const connRes = mockRes();
  await checkConnection({}, connRes);
  console.log("Connection Check Response:", JSON.stringify(connRes.jsonData, null, 2));

  if (!connRes.jsonData?.connected) {
    console.error("❌ Connection verification failed! Stopping test.");
    process.exit(1);
  }

  // Step 2: Test Email Dispatch to Real Recipient
  const recipient = "manikandaninkwrk@gmail.com";
  console.log(`\n--- Step 2: Sending Test Email to ${recipient} ---`);
  const req = {
    body: { to: recipient }
  };
  const sendRes = mockRes();
  await testSend(req, sendRes);

  console.log("\n--- Step 3: Verifying Response Details ---");
  console.log("HTTP Status Code:", sendRes.statusCode || 200);
  console.log("Full JSON Response:", JSON.stringify(sendRes.jsonData, null, 2));

  const data = sendRes.jsonData;
  if (data && data.success) {
    console.log("\n=================================================");
    console.log("✅ ALL VERIFICATION CHECKS PASSED!");
    console.log(`- SMTP Auth Succeeded: TRUE`);
    console.log(`- Correct Sender Used: ${data.sender}`);
    console.log(`- Correct Recipient Used: ${data.recipient}`);
    console.log(`- SMTP Response: ${data.smtpResponse}`);
    console.log(`- Generated Message ID: ${data.messageId}`);
    console.log(`- Accepted Recipients: ${JSON.stringify(data.accepted)}`);
    console.log(`- Rejected Recipients: ${JSON.stringify(data.rejected)}`);
    console.log("=================================================");
  } else {
    console.error("\n❌ EMAIL DISPATCH VERIFICATION FAILED:", data?.error || data?.message);
    process.exit(1);
  }
}

runVerification();
