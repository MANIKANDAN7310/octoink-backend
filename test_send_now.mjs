import nodemailer from 'nodemailer';

const t = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: 'hello.octoinkstudios@gmail.com', pass: 'oyfekwhejzjozsgc' },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 10000
});

console.log('Verifying SMTP...');
try {
  await new Promise((resolve, reject) => t.verify((err, ok) => err ? reject(err) : resolve(ok)));
  console.log('SMTP Verify: OK');
} catch(e) {
  console.log('SMTP Verify ERROR:', e.message, e.code);
}

console.log('Sending test email...');
try {
  const info = await t.sendMail({
    from: '"Octoink Studios" <hello.octoinkstudios@gmail.com>',
    to: 'dioxm1555@gmail.com',
    subject: 'Test Email from EmailTrack',
    html: '<p>This is a test email. If you see this, email sending works!</p>'
  });
  console.log('SUCCESS:', info.messageId);
} catch(e) {
  console.log('SEND ERROR:', e.message);
  console.log('Code:', e.code);
  console.log('Response:', e.response);
  console.log('ResponseCode:', e.responseCode);
}
