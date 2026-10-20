const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'smtp.zoho.in',
  port: 465,
  secure: true,
  auth: {
    user: 'sales@smpatelithub.in',
    pass: 'yWykPLfCab35'
  }
});

const recipients = [
  'taufikpatel23@gmail.com',
  'taufikpatel26@gmail.com'
];

async function sendTestEmails() {
  console.log('Sending emails to:', recipients.join(', '));
  
  for (const to of recipients) {
    const mailOptions = {
      from: '"S.M.PATEL IT HUB" <sales@smpatelithub.in>',
      to: to,
      subject: 'Official Verification Email from S.M.PATEL IT HUB CRM System',
      text: `Hello,

This is an official verification email sent from S.M.PATEL IT HUB CRM & Mail Management System via verified Zoho SMTP (sales@smpatelithub.in).

Recipient: ${to}
Organization: S.M.PATEL IT HUB
Official Website: https://smpatelithub.in
Live CRM Portal: https://crm-web-wbq7.onrender.com
Contact Phone: +91 90964 27821
Headquarters: Mangalwedha, Solapur, Maharashtra, India

All system buttons, authentication, database tables, and real-time email queues are fully operational and verified.

Best regards,
S.M.PATEL IT HUB Team`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; background-color: #ffffff; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
          <div style="background: linear-gradient(135deg, #0f172a, #1e293b); padding: 30px; text-align: center;">
            <h1 style="color: #f59e0b; margin: 0; font-size: 24px; font-weight: 700; letter-spacing: 0.5px;">S.M.PATEL IT HUB</h1>
            <p style="color: #cbd5e1; margin: 6px 0 0 0; font-size: 13px;">Enterprise IT Solutions &amp; Software Development Company</p>
          </div>
          <div style="padding: 30px; color: #334155; line-height: 1.6;">
            <h2 style="color: #0f172a; font-size: 18px; margin-top: 0;">Live System Verification &bull; All Functionalities Tested</h2>
            <p>Hello <strong>Taufik Patel</strong>,</p>
            <p>This verification email confirms that the <strong>S.M.PATEL IT HUB CRM &amp; Mail System</strong> is fully configured and connected to your official Zoho SMTP server (<code>sales@smpatelithub.in</code>).</p>
            
            <div style="background-color: #f8fafc; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px;">
              <p style="margin: 0; font-size: 14px;"><strong>System Status:</strong> <span style="color: #16a34a; font-weight: 600;">Active &amp; Operational</span></p>
              <ul style="margin: 10px 0 0 0; padding-left: 20px; font-size: 13px; color: #64748b;">
                <li><strong>SMTP Server:</strong> smtp.zoho.in (Port 465 SSL)</li>
                <li><strong>Sender:</strong> sales@smpatelithub.in</li>
                <li><strong>Recipient:</strong> ${to}</li>
                <li><strong>Live Web App:</strong> <a href="https://crm-web-wbq7.onrender.com" style="color: #0284c7; text-decoration: none;">crm-web-wbq7.onrender.com</a></li>
                <li><strong>Official Website:</strong> <a href="https://smpatelithub.in" style="color: #0284c7; text-decoration: none;">smpatelithub.in</a></li>
              </ul>
            </div>

            <p>All UI components, navigation buttons, database tables, and real-time email queues have been tested on a real browser environment.</p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="https://crm-web-wbq7.onrender.com" style="background: linear-gradient(135deg, #f59e0b, #d97706); color: #0f172a; font-weight: bold; text-decoration: none; padding: 12px 24px; border-radius: 8px; display: inline-block; font-size: 14px;">Open S.M.PATEL IT HUB CRM</a>
            </div>

            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 25px 0;" />
            <p style="font-size: 12px; color: #94a3b8; margin: 0; text-align: center;">
              S.M.PATEL IT HUB &bull; Mangalwedha, Solapur, Maharashtra - 413305, India<br />
              Phone: +91 90964 27821 &bull; Email: sales@smpatelithub.in
            </p>
          </div>
        </div>
      `
    };

    try {
      const info = await transporter.sendMail(mailOptions);
      console.log(`[SUCCESS] Email sent to ${to}:`, info.messageId, info.response);
    } catch (err) {
      console.error(`[ERROR] Failed sending email to ${to}:`, err.message);
    }
  }
}

sendTestEmails();
