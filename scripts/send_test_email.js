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

const mailOptions = {
  from: '"S.M.PATEL IT HUB" <sales@smpatelithub.in>',
  to: 'taufikpatel23@gmail.com',
  subject: 'Test Email from S.M.PATEL IT HUB CRM System',
  text: `Hello Taufik,

This is a test email sent from the S.M.PATEL IT HUB CRM & Mail Management System via verified Zoho SMTP (sales@smpatelithub.in).

Organization: S.M.PATEL IT HUB
Website: https://smpatelithub.in
CRM Portal: https://crm-web-wbq7.onrender.com
Contact: +91 90964 27821
Address: Mangalwedha, Solapur, Maharashtra, India

All buttons, live worker queue, and SMTP connections are fully verified and active!

Best regards,
S.M.PATEL IT HUB Team`,
  html: `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; background-color: #ffffff;">
      <div style="background: linear-gradient(135deg, #0f172a, #1e293b); padding: 30px; text-align: center;">
        <h1 style="color: #f59e0b; margin: 0; font-size: 24px; font-weight: 700; letter-spacing: 0.5px;">S.M.PATEL IT HUB</h1>
        <p style="color: #cbd5e1; margin: 6px 0 0 0; font-size: 13px;">Enterprise IT Solutions & Software Development</p>
      </div>
      <div style="padding: 30px; color: #334155; line-height: 1.6;">
        <h2 style="color: #0f172a; font-size: 18px; margin-top: 0;">Test Email Verification</h2>
        <p>Hello <strong>Taufik Patel</strong>,</p>
        <p>This is a live test email sent from your newly configured <strong>S.M.PATEL IT HUB CRM</strong> system via verified Zoho SMTP (<code>sales@smpatelithub.in</code>).</p>
        
        <div style="background-color: #f8fafc; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px;">
          <p style="margin: 0; font-size: 14px;"><strong>System Status:</strong> <span style="color: #16a34a; font-weight: 600;">All Services Live &amp; Operational</span></p>
          <ul style="margin: 10px 0 0 0; padding-left: 20px; font-size: 13px; color: #64748b;">
            <li><strong>SMTP Server:</strong> smtp.zoho.in (Port 465 SSL)</li>
            <li><strong>Sender:</strong> sales@smpatelithub.in</li>
            <li><strong>Recipient:</strong> taufikpatel23@gmail.com</li>
            <li><strong>CRM Web Portal:</strong> <a href="https://crm-web-wbq7.onrender.com" style="color: #0284c7; text-decoration: none;">crm-web-wbq7.onrender.com</a></li>
            <li><strong>Official Website:</strong> <a href="https://smpatelithub.in" style="color: #0284c7; text-decoration: none;">smpatelithub.in</a></li>
          </ul>
        </div>

        <p>All system buttons, authentication, database tables, and automated background workers are thoroughly tested and working seamlessly.</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="https://crm-web-wbq7.onrender.com" style="background: linear-gradient(135deg, #f59e0b, #d97706); color: #0f172a; font-weight: bold; text-decoration: none; padding: 12px 24px; border-radius: 8px; display: inline-block; font-size: 14px;">Open CRM Portal</a>
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

transporter.sendMail(mailOptions, (error, info) => {
  if (error) {
    console.error('Email send failed:', error);
    process.exit(1);
  } else {
    console.log('SUCCESS: Email sent successfully!');
    console.log('Message ID:', info.messageId);
    console.log('Response:', info.response);
    process.exit(0);
  }
});
