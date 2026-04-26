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
    console.error(
      "GMAIL_EMAIL present:",
      !!user,
      "| GMAIL_PASSWORD length:",
      pass.length
    );
  }

  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: user || "noreply@triphog.com",
      pass,
    },
    tls: {
      rejectUnauthorized: false,
    },
    debug: false,
    logger: false,
  });
};

const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const isUrlLine = (line = "") => /^https?:\/\/\S+$/i.test(String(line).trim());

const inferActionLabel = (subject = "", text = "") => {
  const combined = `${subject} ${text}`.toLowerCase();
  if (combined.includes("reset")) return "Reset Password";
  if (combined.includes("create") && combined.includes("password")) {
    return "Create Password";
  }
  if (combined.includes("approve")) return "Open Account";
  return "Open Link";
};

const buildEmailParagraphs = (text = "") => {
  const normalized = String(text || "").replace(/\r\n/g, "\n");
  const rawLines = normalized.split("\n");
  const paragraphs = [];
  let current = [];
  let actionUrl = null;

  for (const rawLine of rawLines) {
    const line = rawLine.trim();
    if (!line) {
      if (current.length) {
        paragraphs.push(current.join(" "));
        current = [];
      }
      continue;
    }

    if (isUrlLine(line) && !actionUrl) {
      if (current.length) {
        paragraphs.push(current.join(" "));
        current = [];
      }
      actionUrl = line;
      continue;
    }

    current.push(line);
  }

  if (current.length) paragraphs.push(current.join(" "));
  return { paragraphs, actionUrl };
};

const buildBrandedEmailHtml = ({ subject = "Trip Hog", text = "" }) => {
  const { paragraphs, actionUrl } = buildEmailParagraphs(text);
  const actionLabel = inferActionLabel(subject, text);
  const bodyHtml = paragraphs
    .map(
      (paragraph) =>
        `<p style="margin:0 0 16px;color:#334155;font-size:16px;line-height:1.7;">${escapeHtml(
          paragraph
        )}</p>`
    )
    .join("");

  const actionHtml = actionUrl
    ? `
      <div style="margin:28px 0 24px;text-align:center;">
        <a href="${escapeHtml(
          actionUrl
        )}" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;padding:14px 26px;border-radius:10px;font-size:15px;font-weight:600;">
          ${escapeHtml(actionLabel)}
        </a>
      </div>
      <p style="margin:0 0 16px;color:#475569;font-size:14px;line-height:1.6;text-align:center;">
        If the button does not work, <a href="${escapeHtml(
          actionUrl
        )}" style="color:#1d4ed8;text-decoration:none;font-weight:600;">click here</a>.
      </p>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
      ${escapeHtml(subject)}
    </div>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f1f5f9;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:640px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 10px 30px rgba(15,23,42,0.08);">
            <tr>
              <td style="background:linear-gradient(135deg,#0f172a 0%,#1d4ed8 100%);padding:28px 32px;text-align:center;">
                <div style="color:#bfdbfe;font-size:12px;letter-spacing:2px;text-transform:uppercase;font-weight:700;">Trip Hog</div>
                <h1 style="margin:12px 0 0;color:#ffffff;font-size:28px;line-height:1.2;font-weight:700;">${escapeHtml(
                  subject
                )}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:36px 32px 12px;">
                ${bodyHtml}
                ${actionHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 32px;">
                <div style="border-top:1px solid #e2e8f0;padding-top:20px;color:#64748b;font-size:13px;line-height:1.7;text-align:center;">
                  <p style="margin:0 0 8px;">If you have any questions, please contact the Trip Hog support team.</p>
                  <p style="margin:0;">&copy; 2026 Trip Hog. All rights reserved.</p>
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
};

// Safe email sending function with error handling
const sendEmailSafely = async (transporter, mailOptions) => {
  try {
    const finalMailOptions = { ...mailOptions };
    if (!finalMailOptions.html && finalMailOptions.text) {
      finalMailOptions.html = buildBrandedEmailHtml({
        subject: finalMailOptions.subject,
        text: finalMailOptions.text,
      });
    }

    const info = await transporter.sendMail(finalMailOptions);
    console.log("Email sent successfully:", info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("Email sending failed:", error.message);

    if (
      error.code === "EAUTH" ||
      (error.message && error.message.includes("Missing credentials"))
    ) {
      console.error("Gmail credentials missing or invalid.");
      console.error(
        "   Set GMAIL_EMAIL and GMAIL_PASSWORD in the .env file (server folder)."
      );
      console.error(
        "   Use a Gmail App Password: https://support.google.com/accounts/answer/185833"
      );
    } else if (error.code === "ECONNECTION") {
      console.error("Connection failed - check internet connection");
    }

    return { success: false, error: error.message };
  }
};

module.exports = { createEmailTransporter, sendEmailSafely, buildBrandedEmailHtml };
