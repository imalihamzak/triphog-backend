const nodemailer = require("nodemailer");
const { createEmailTransporter, sendEmailSafely } = require("./utils/emailConfig");

const EMAIL_USER = process.env.GMAIL_EMAIL || "noreply@triphog.com";
const EMAIL_PASS = process.env.GMAIL_PASSWORD || "";

const transporter = createEmailTransporter();

const sendMail = async (options) => {
  const { to, subject, text} = options;

  console.log("EMAIL USER", EMAIL_USER);
  console.log("EMAIL PASS", EMAIL_PASS ? "***HIDDEN***" : "NOT SET");

  // Create HTML content for demo request
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 20px;">
      <div style="background-color: #ffffff; padding: 20px; border-radius: 10px; box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);">
        <h1 style="color: #30325E; text-align: center;">Trip Hog</h1>
        <h2 style="color: #30325E; text-align: center;">New Demo Request</h2>
        
        <div style="font-size: 16px; color: #333333; margin: 20px 0; line-height: 1.6;">
          ${text.split('\n').map(line => `<p>${line.trim()}</p>`).join('')}
        </div>
        
        <div style="text-align: center; margin-top: 30px; font-size: 14px; color: #666666;">
          <p>This is an automated message from the Trip Hog demo request system.</p>
        </div>
      </div>
    </div>
  `;

  const mailOptions = {
    from: `Trip Hog <${EMAIL_USER}>`, // Sender address
    to, // Recipient address
    subject, // Email subject
    text, // Plain text body
    html: htmlContent, // HTML body
  };

  try {
    console.log("Mail is being sent to", to);
    const result = await sendEmailSafely(transporter, mailOptions);
    
    if (result.success) {
      console.log("Email sent successfully");
      return true;
    } else {
      console.error("Email sending failed:", result.error);
      // Don't throw error, just log it and return false
      return false;
    }
  } catch (error) {
    console.error("Error in sendMail function:", error);
    // Don't throw error, just log it and return false
    return false;
  }
};

module.exports = sendMail;