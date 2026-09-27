// Test actual email send via production backend
const BACKEND = 'https://octoink-backend.onrender.com';

console.log('Testing production backend email send...\n');

// 1. Check connection endpoint
console.log('1. Testing /api/email-track/connection...');
try {
  const r = await fetch(`${BACKEND}/api/email-track/connection`);
  const d = await r.json();
  console.log('   Status:', r.status);
  console.log('   Connected:', d.connected);
  console.log('   Message:', d.message);
  console.log('   Full response:', JSON.stringify(d));
} catch(e) {
  console.log('   ERROR:', e.message);
}

// 2. Test actual send via test-send endpoint
console.log('\n2. Testing /api/email-track/test-send...');
try {
  const r = await fetch(`${BACKEND}/api/email-track/test-send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: 'manikandankarthik7310@gmail.com' })
  });
  const d = await r.json();
  console.log('   Status:', r.status);
  console.log('   Response:', JSON.stringify(d, null, 2));
} catch(e) {
  console.log('   ERROR:', e.message);
}

console.log('\nDone.');
