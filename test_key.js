import { Resend } from 'resend';

const resend = new Resend('69f06a2c2161492c1ac675bdda72ba06');

async function testKey() {
    try {
        const { data, error } = await resend.emails.send({
            from: 'onboarding@resend.dev',
            to: 'hello.octoinkstudios@gmail.com',
            subject: 'Test Key',
            html: '<p>Test</p>'
        });
        if (error) {
            console.error("Error:", error);
        } else {
            console.log("Success:", data);
        }
    } catch (err) {
        console.error("Exception:", err);
    }
}
testKey();
