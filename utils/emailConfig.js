const nodemailer = require("nodemailer");
const path = require("path");

// Ensure .env is loaded from server folder (in case app was started without startup.js)
function ensureEnvLoaded() {
  if (!process.env.GMAIL_PASSWORD && !process.env.GMAIL_EMAIL) {
    try {
      require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
    } catch (e) {}
  }
}

// Centralized email configuration. Gmail requires an App Password (not normal password).
const createEmailTransporter = () => {
  ensureEnvLoaded();

  let user = (process.env.GMAIL_EMAIL || "").trim();
  let pass = (process.env.GMAIL_PASSWORD || "").trim();
  // Strip surrounding double or single quotes (some .env parsers include them)
  pass = pass.replace(/^["']|["']$/g, "");
  // Remove spaces (Gmail App Passwords are 16 chars; spaces are for readability only)
  pass = pass.replace(/\s/g, "");

  if (!user || !pass) {
    console.error(
      "GMAIL_EMAIL or GMAIL_PASSWORD is missing or empty in .env. " +
      "Set both in the .env file in the server folder (same folder as startup.js). " +
      "Use a Gmail App Password: https://support.google.com/accounts/answer/185833"
    );
    console.error("GMAIL_EMAIL present:", !!user, "| GMAIL_PASSWORD length:", pass.length);
  }

  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: user || "noreply@triphog.com",
      pass,
    },
    tls: {
      rejectUnauthorized: false, // Allow self-signed certificates
    },
    debug: false, // Disable debug mode in production
    logger: false, // Disable logging in production
  });
};

// Safe email sending function with error handling
const sendEmailSafely = async (transporter, mailOptions) => {
  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Email sent successfully:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Email sending failed:', error.message);
    
    // Log specific error types
    if (error.code === 'EAUTH' || (error.message && error.message.includes('Missing credentials'))) {
      console.error('🔐 Gmail credentials missing or invalid.');
      console.error('   Set GMAIL_EMAIL and GMAIL_PASSWORD in the .env file (server folder).');
      console.error('   Use a Gmail App Password: https://support.google.com/accounts/answer/185833');
    } else if (error.code === 'ECONNECTION') {
      console.error('🌐 Connection failed - check internet connection');
    }
    
    return { success: false, error: error.message };
  }
};

module.exports = { createEmailTransporter, sendEmailSafely };