const express = require("express");
const { google } = require("googleapis");
const { protect } = require("../controllers/adminController");
const router = express.Router();
const Admin = require("../models/adminSchema");

const refreshTokenGenerator = async (req, res, next) => {
  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    console.log("Client ID:", process.env.GOOGLE_CLIENT_ID);
    console.log("Client Secret:", process.env.GOOGLE_CLIENT_SECRET);
    console.log("Redirect URI:", process.env.GOOGLE_REDIRECT_URI);

    const { code } = req.body;
    const { tokens } = await oauth2Client.getToken(code);
    console.log("Tokens:", tokens);

    if (!req.admin) {
      return res
        .status(400)
        .json({ status: "Failed", message: "Admin not found in request" });
    }

    console.log("Admin ID:", req.admin._id);

    await Admin.findByIdAndUpdate(
      req.admin._id,
      {
        googleCalendarTokens: {
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          scope: tokens.scope,
          token_type: tokens.token_type,
          expiry_date: tokens.expiry_date,
        },
      },
      { new: true }
    );

    res.send(tokens.refresh_token);
  } catch (error) {
    console.log(error);
    res.status(500).json({
      status: "Failed",
      message: "Error in Creating Token",
    });
  }
};
router.post("/logout", protect, (req, res) => {
  // Clear any sessions or tokens
  req.logout(); // Assuming you're using a session middleware
  res.status(200).json({ message: "Logged out successfully" });
});
router.post("/create-token", protect, refreshTokenGenerator);
module.exports = router;
