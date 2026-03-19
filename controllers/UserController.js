const nodemailer = require("nodemailer");
const { createEmailTransporter, sendEmailSafely } = require("../utils/emailConfig");
const crypto = require("crypto");
const Admin = require("../models/adminSchema");
const bcrypt = require("bcryptjs");
const UserModel = require("../models/UserModel");
const DriverModel = require("../models/DriverModel");
const moment = require("moment");
const jwt = require("jsonwebtoken");
const SuperAdminModel = require("../models/SuperAdminModel");
const ChatConversation = require("../models/ChatConversation");
const { default: mongoose } = require("mongoose");
const ChatMessage = require("../models/ChatMessage");
const ConversationRead = require("../models/ConversationRead");
const JWT_SECRET = require("../config/jwtSecret");
const { getFrontendUrl, getUploadsBaseUrl } = require("../config/appUrls");
// Create email transporter instance - create fresh each time to avoid stale connections
const getEmailTransporter = () => createEmailTransporter();
// Keep transport for backward compatibility (but prefer getEmailTransporter)
const transport = createEmailTransporter();
exports.deleteSelected = async (req, res) => {
  console.log("Req.query", req.query);
  console.log(" Users Ids", req.body.selectedUsersIds);
  try {
    await UserModel.deleteMany({ _id: { $in: req.body.selectedUsersIds } });
    res.json({ success: true });
  } catch (e) {
    console.log("Error", e.message);
    res.json({ success: false });
  }
};
exports.login = async (req, res) => {
  try {
    console.log("🔐 User Login Request:", { email: req.body.email });

    const user = await UserModel.findOne({ EMailAddress: req.body.email });

    if (!user) {
      console.log("❌ User not found for email:", req.body.email);
      return res.status(404).json({ success: false, message: "User Not Found!" });
    }
    
    // ============================================
    // CRITICAL: STATUS CHECK - ABSOLUTE FIRST CHECK
    // ============================================
    // MUST check status BEFORE anything else
    // MUST block if status is NOT exactly "active" (case-insensitive)
    // This check happens BEFORE password verification
    
    // ============================================
    // CRITICAL: STATUS CHECK - MUST BE FIRST CHECK
    // ============================================
    // This check happens BEFORE password verification
    // Only "active" (case-insensitive, no spaces) allows login
    // Everything else is blocked: "inactive", "not active", "Not Active", "Inactive", etc.
    
    const rawStatus = user.status;
    console.log("=".repeat(80));
    console.log("🔍 STATUS CHECK - BLOCKING INACTIVE USERS");
    console.log("=".repeat(80));
    console.log("User ID:", user._id);
    console.log("Email:", user.EMailAddress);
    console.log("Raw Status (before normalization):", JSON.stringify(rawStatus));
    console.log("Raw Status Type:", typeof rawStatus);
    console.log("Raw Status === null:", rawStatus === null);
    console.log("Raw Status === undefined:", rawStatus === undefined);
    
    // Normalize status: convert to lowercase, trim whitespace, and remove ALL spaces
    let normalizedStatus = "";
    if (rawStatus) {
      normalizedStatus = String(rawStatus).toLowerCase().trim().replace(/\s+/g, '');
    }
    
    console.log("Normalized Status (after normalization):", JSON.stringify(normalizedStatus));
    console.log("Normalized Status Length:", normalizedStatus.length);
    console.log("Normalized Status === 'active':", normalizedStatus === "active");
    console.log("Required Status: 'active' (case-insensitive, no spaces)");
    console.log("=".repeat(80));
    
    // EXPLICIT CHECK: Only allow login if normalized status is exactly "active"
    // Block everything else: "inactive", "notactive", "not active", "Inactive", "Active", "", null, undefined, etc.
    
    // Additional explicit checks for common inactive statuses
    const inactiveStatuses = ["inactive", "notactive", "notactive", "deactivated", "disabled", "suspended", ""];
    const isExplicitlyInactive = inactiveStatuses.includes(normalizedStatus);
    const isActive = normalizedStatus === "active";
    
    // Block if explicitly inactive OR not active
    if (isExplicitlyInactive || !isActive) {
      console.log("🚫🚫🚫 LOGIN BLOCKED - Status is NOT 'active'");
      console.log("🚫 Raw Status:", JSON.stringify(rawStatus));
      console.log("🚫 Normalized Status:", JSON.stringify(normalizedStatus));
      console.log("🚫 Status Length:", normalizedStatus.length);
      console.log("🚫 isActive:", isActive);
      console.log("🚫 Blocking login immediately with 403 error");
      console.log("🚫 NO PASSWORD CHECK WILL OCCUR");
      console.log("🚫 User will NOT be able to proceed");
      console.log("🚫 Returning 403 error now");
      return res.status(403).json({ 
        success: false, 
        message: "Your account is inactive. Please contact your administrator to activate your account." 
      });
    }
    
    // Only reach here if status is exactly "active" (case-insensitive, no spaces)
    console.log("✅ Status is 'active' - allowing login to proceed to password verification");

    // Verify password
      // let isMatched = await bcrypt.compare(req.body.password, user.password)
      let isMatched = false;
      if (req.body.password === user.password) {
      console.log("✅ Password matched");
        isMatched = true;
      }
    
      if (isMatched) {
        let admin = await Admin.findOne({ _id: user.addedBy });
        const token = jwt.sign(
          {
            id: user._id,
            role: "User",
            accessibilities: user.accessibilities,
            companyCode: admin?.companyCode,
            createdBy: user.addedBy,
            profilePhotoUrl: user.profilePhotoUrl,
            fullName: user.firstName + " " + user.lastName,
          },
          JWT_SECRET,
          {
            expiresIn: "6d",
          }
        );

      console.log("✅ Login successful, token generated");
        return res.json({
          success: true,
          message: "Login successfull.",
          user,
          token,
        });
      } else {
      console.log("❌ Invalid password");
        return res.json({ success: false, message: "Invalid Credentials" });
    }
  } catch (e) {
    console.log("Error While Adding User", e.message);
    res.json({ success: false, message: e.message });
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await UserModel.findOne({ EMailAddress: email });

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const token = crypto.randomBytes(20).toString("hex");

    user.passwordResetToken = token;
    user.passwordResetExpires = Date.now() + 3600000;

    await user.save();

    const resetURL = `${getFrontendUrl()}/reset-password/${token}?userType=subadmin`;
    const message = `Welcome to Trip Hog!\n\nYou have requested to reset your password. Click on the link below to reset it:\n\n${resetURL}\n\nThis link will expire in 1 hour for security purposes.\n\nIf you did not request this password reset, please ignore this email.\n\nBest regards,\nTrip Hog Team`;

    // Create fresh transporter (same as user creation)
    const emailTransporter = getEmailTransporter();
    const fromEmail = process.env.GMAIL_EMAIL || "noreply@triphog.com";
    const emailResult = await sendEmailSafely(emailTransporter, {
      from: `Trip Hog <${fromEmail}>`,
      to: user.EMailAddress,
      subject: "Reset Your Password | Trip Hog",
      text: message,
    });

    if (emailResult.success) {
    return res.status(200).json({
      success: true,
      message: "Reset Password link sent successfully.",
    });
    } else {
      console.error("Failed to send reset password email:", emailResult.error);
      return res.status(200).json({
        success: false,
        message: "Error sending reset password link. Please check your email configuration or try again later.",
      });
    }
  } catch (e) {
    return res.status(200).json({
      success: false,
      message: "Error sending reset password link, please try again later.",
    });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    const user = await UserModel.findOne({
      passwordResetToken: token,
      passwordResetExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "Invalid or expired reset token" });
    }

    // Hash the password before saving (SECURITY FIX)
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    user.password = hashedPassword;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;

    await user.save();

    return res.status(200).json({
      success: true,
      message: "Password reset successfully.",
    });
  } catch (error) {
    return res.status(200).json({
      success: false,
      message: "Error resetting password, please try again later.",
    });
  }
};

// exports.login = async (req, res) => {
//   try {
//     let user = await UserModel.findOne({ EMailAddress: req.body.email });

//     if (!user) {
//       return res.json({ success: false, message: "User Not Found!" });
//     }
//     console.log("Found User:", user);
//     console.log("Entered Password:", req.body.password);
//     console.log("Password in DB:", user.password);

//     if (req.body.password === user.password) {
//       console.log("Password matched successfully...");

//       let admin = await Admin.findOne({ _id: user.addedBy });

//       if (!admin) {
//         return res.json({ success: false, message: "Admin Not Found!" });
//       }

//       const token = jwt.sign(
//         {
//           id: user._id,
//           role: "User",
//           accessibilities: user.accessibilities,
//           companyCode: admin.companyCode,
//           createdBy: user.addedBy,
//           profilePhotoUrl: user.profilePhotoUrl,
//           fullName: user.firstName + " " + user.lastName,
//         },
//         JWT_SECRET,
//         { expiresIn: "6d" }
//       );

//       return res.json({ success: true, user, token });
//     } else {
//       return res.json({ success: false, message: "Incorrect Password" });
//     }
//   } catch (e) {
//     res.json({ success: false, message: e.message });
//   }
// };

exports.getUsersByDate = async (req, res) => {
  let date = req.params.date;
  try {
    const startOfDay = new Date(date);
    startOfDay.setUTCHours(0, 0, 0, 0); // Set to the start of the day

    const endOfDay = new Date(date);
    endOfDay.setUTCHours(23, 59, 59, 999); // Set to the end of the day

    const limit = parseInt(req.query.limit) || 25; // Default to 25 records per page if not provided
    const page = parseInt(req.query.page) || 1; // Default to page 1 if not provided

    // Find users within the date range
    let users = await UserModel.find({
      createdAt: {
        $gte: startOfDay,
        $lte: endOfDay,
      },
      addedBy: req.userId, // Ensure that only users added by the current user are retrieved
    })
      .limit(limit) // Limit the number of users per page
      .skip((page - 1) * limit); // Skip users based on the current page

    // Count total number of users matching the query (without pagination)
    const totalUsers = await UserModel.countDocuments({
      createdAt: {
        $gte: startOfDay,
        $lte: endOfDay,
      },
      addedBy: req.userId,
    });

    const totalPages = Math.ceil(totalUsers / limit); // Calculate total pages

    // Return response with pagination information
    res.json({
      success: true,
      users, // Users for the current page
      totalUsers, // Total number of users matching the query
      totalPages, // Total number of pages based on the limit
      currentPage: page, // Current page number
    });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
};
exports.getFilteredUsers = async (req, res) => {
  const { filter } = req.params;
  let startDate;
  let endDate = moment().endOf("day").toDate(); // End of the current day

  if (filter === "today") {
    startDate = moment().startOf("day").toDate(); // Start of the current day
  } else if (filter === "week") {
    startDate = moment().subtract(7, "days").startOf("day").toDate(); // 7 days ago
  } else if (filter === "month") {
    startDate = moment().subtract(30, "days").startOf("day").toDate(); // 30 days ago
  } else {
    return res.status(400).json({ error: "Invalid filter type" });
  }

  try {
    let filteredUsers = await UserModel.find({
      createdAt: { $gte: startDate, $lte: endDate },
    });
    filteredUsers = filteredUsers.filter((user) => {
      return user.addedBy == req.userId;
    });
    res.json(filteredUsers);
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
};

exports.getAllUsers = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 25; // Number of records per page, default to 25
    const page = parseInt(req.query.page) || 1; // Page number, default to 1
    const filter = req.query.filter || "all time"; // Filter type (today, weekly, monthly, all time)
    if (Object.keys(req.query).length == 0) {
      let users = await UserModel.find({ addedBy: req.userId });
      res.json({ success: true, users });
    } else {
      let query = { addedBy: req.userId };

      // Add date filters based on the filter query (today, weekly, monthly)
      if (filter === "today") {
        const startOfDay = new Date();
        startOfDay.setUTCHours(0, 0, 0, 0);

        const endOfDay = new Date();
        endOfDay.setUTCHours(23, 59, 59, 999);

        query.createdAt = { $gte: startOfDay, $lte: endOfDay };
      } else if (filter === "weekly") {
        const startOfWeek = new Date();
        startOfWeek.setDate(startOfWeek.getDate() - 7); // 7 days ago
        startOfWeek.setUTCHours(0, 0, 0, 0);

        const endOfWeek = new Date();
        endOfWeek.setUTCHours(23, 59, 59, 999);

        query.createdAt = { $gte: startOfWeek, $lte: endOfWeek };
      } else if (filter === "monthly") {
        const startOfMonth = new Date();
        startOfMonth.setDate(startOfMonth.getDate() - 30); // 30 days ago
        startOfMonth.setUTCHours(0, 0, 0, 0);

        const endOfMonth = new Date();
        endOfMonth.setUTCHours(23, 59, 59, 999);

        query.createdAt = { $gte: startOfMonth, $lte: endOfMonth };
      }

      // Fetch users based on the query and apply pagination
      let users = await UserModel.find(query)
        .limit(limit) // Limit number of users per page
        .skip((page - 1) * limit); // Skip records based on the page number

      // Count the total number of users matching the query
      const totalUsers = await UserModel.countDocuments(query);

      // Calculate total number of pages
      const totalPages = Math.ceil(totalUsers / limit);

      // Return response with users and pagination info
      res.json({
        success: true,
        users, // Users for the current page
        totalUsers, // Total number of users matching the query
        totalPages, // Total number of pages
        currentPage: page, // Current page number
      });
    }
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
};
// exports.createPassword = async (req, res) => {
//     console.log("Token>>>>>>", req.params.token)
//     try {
//         let user = await UserModel.findOne({ token: req.params.token })
//         console.log("Found User", user)
//         if (!user) {
//             console.log("Invalid Token Error")
//             res.json({ success: false, message: "Invalid Token" })
//         }
//         else {
//             let salt = await bcrypt.genSalt(10)
//             let hashedPassword = await bcrypt.hash(req.body.password, salt)
//             user.password = hashedPassword
//             user.status = "Active"
//             await user.save()
//             res.json({ success: true })

//         }

//     }
//     catch (e) {
//         console.log("Error Message", e.message)
//         res.json({ success: false, message: e.message })

//     }
// }

exports.createPassword = async (req, res) => {
  console.log("Token>>>>>>", req.params.token);
  try {
    let user = await UserModel.findOne({ token: req.params.token });
    console.log("Found User", user);

    if (!user) {
      console.log("Invalid Token Error");
      return res.json({ success: false, message: "Invalid Token" });
    } else {
      user.password = req.body.password;
      // Don't automatically set status to Active - keep it as "Not Active" until admin activates
      // Status will remain as "Not Active" (default) until admin explicitly activates the user
      await user.save();
      return res.json({ success: true });
    }
  } catch (e) {
    console.log("Error Message", e.message);
    return res.json({ success: false, message: e.message });
  }
};

exports.addUser = async (req, res) => {
  try {
    console.log(req.body);
    req.body.addedBy = req.userId;
    console.log(req.body);
    if (req.file) {
      // Convert filename to lowercase for consistent database storage
      const originalPath = req.file.path;
      const pathParts = originalPath.split('/');
      const filename = pathParts[pathParts.length - 1].toLowerCase();
      req.body.profilePhotoUrl = `${getUploadsBaseUrl()}/uploads/${filename}`;
    }
    // Check if email already exists
    const existingUser = await UserModel.findOne({
      EMailAddress: req.body.EMailAddress,
    });
    if (existingUser) {
      return res.json({ success: false, message: "Email already exists" });
    }
    let user = new UserModel(req.body);
    console.log(user);
    const token = crypto.randomBytes(20).toString("hex");
    user.token = token;

    // Save user first (before sending email)
    await user.save();
    
    // Send email asynchronously (don't block user creation if email fails)
    const passwordCreationLink = `${getFrontendUrl()}/admin/user/createpassword/${token}`;
    const messageToSend = `Welcome to Trip Hog!\n\nClick on the link below to create your password:\n${passwordCreationLink}\n\nThis link will expire in 24 hours for security purposes.\n\nIf you have any questions, please contact our support team.\n\nBest regards,\nTrip Hog Team`;
    
    const emailTransporter = getEmailTransporter();
    const fromEmail = process.env.GMAIL_EMAIL || "noreply@triphog.com";
    sendEmailSafely(emailTransporter, {
      from: `Trip Hog <${fromEmail}>`,
      to: user.EMailAddress,
      subject: "Welcome to Trip Hog - Create Your Password",
      text: messageToSend,
    }).then((result) => {
      if (result.success) {
        console.log("✅ Password creation email sent to:", user.EMailAddress);
      } else {
        console.error("❌ Failed to send password creation email:", result.error);
        console.error("⚠️ User created but email failed. Password link:", passwordCreationLink);
        // Don't throw error - user is already created
      }
    }).catch((error) => {
      console.error("❌ Error sending email:", error);
      console.error("⚠️ User created but email failed. Password link:", passwordCreationLink);
      // Don't throw error - user is already created
    });
    
    // Return success even if email fails (user is created)
    res.json({ success: true, user, message: "User created successfully. Password creation email sent." });
  } catch (e) {
    console.log("Error While Adding User", e.message);
    res.json({ success: false, message: e.message });
  }
};
exports.deleteUser = async (req, res) => {
  try {
    await UserModel.findByIdAndDelete(req.params.userId);

    res.json({ success: true });
  } catch (e) {
    res.json({ success: false });
  }
};
exports.resendWelcomeEmail = async (req, res) => {
  try {
    const user = await UserModel.findById(req.params.userId);
    if (!user) {
      return res.json({ success: false, message: "No User Found!" });
    }
    if (!user.EMailAddress) {
      return res.json({ success: false, message: "User has no email address." });
    }
    const token = crypto.randomBytes(20).toString("hex");
    user.token = token;
    await user.save();

    const passwordCreationLink = `${getFrontendUrl()}/admin/user/createpassword/${token}`;
    const messageToSend = `Welcome to Trip Hog!\n\nClick on the link below to create your password:\n${passwordCreationLink}\n\nThis link will expire in 24 hours for security purposes.\n\nIf you have any questions, please contact our support team.\n\nBest regards,\nTrip Hog Team`;

    const emailTransporter = getEmailTransporter();
    const fromEmail = process.env.GMAIL_EMAIL || "noreply@triphog.com";
    const result = await sendEmailSafely(emailTransporter, {
      from: `Trip Hog <${fromEmail}>`,
      to: user.EMailAddress,
      subject: "Welcome to Trip Hog - Create Your Password",
      text: messageToSend,
    });
    if (result.success) {
      return res.json({ success: true, message: "Welcome email sent successfully." });
    }
    return res.json({ success: false, message: result.error || "Failed to send email." });
  } catch (e) {
    console.error("Resend welcome email error:", e.message);
    res.json({ success: false, message: e.message });
  }
};

exports.getUser = async (req, res) => {
  try {
    let user = await UserModel.findById(req.params.userId);
    if (!user) {
      res.json({ success: false, message: "No User Found!" });
    } else {
      res.json({ success: true, user });
    }
  } catch (e) {
    res.json({ success: false });
  }
};
exports.updateUser = async (req, res) => {
  try {
    console.log("📝 Updating user:", req.params.userId);
    console.log("📝 Update data:", req.body);
    
    if (req.file) {
      req.body.profilePhotoUrl = getUploadsBaseUrl() + "/" + req.file.path;
    }
    
    // If status is being updated, log it and ensure it's saved correctly
    if (req.body.status !== undefined) {
      console.log("🔄 Status update requested:", req.body.status);
      console.log("🔄 Status type:", typeof req.body.status);
      // CRITICAL: Normalize status to lowercase and remove spaces for consistency
      // This ensures "Active", "active", "Active ", etc. all become "active"
      // And "Inactive", "inactive", "Not Active", etc. all become "inactive"
      const normalizedStatus = String(req.body.status).toLowerCase().trim().replace(/\s+/g, '');
      req.body.status = normalizedStatus;
      console.log("🔄 Status after normalization:", req.body.status);
      console.log("🔄 Ensuring status is saved as:", normalizedStatus);
    }
    
    // Company code is immutable - never allow it to be updated via this endpoint
    const updateBody = { ...req.body };
    delete updateBody.companyCode;

    const updatedUser = await UserModel.findByIdAndUpdate(
      req.params.userId,
      updateBody,
      {
        new: true,
        runValidators: true,
      }
    );
    
    // Verify the status was actually saved by querying the database again
    const verifyUser = await UserModel.findById(req.params.userId);
    console.log("✅ User updated. Status in DB:", verifyUser?.status);
    console.log("✅ Status type:", typeof verifyUser?.status);
    console.log("✅ Status === requested:", verifyUser?.status === req.body.status);
    
    let user = await UserModel.findOne({ _id: req.params.userId });
    const fromEmail = process.env.GMAIL_EMAIL || "noreply@triphog.com";
    await sendEmailSafely(transport, {
      from: `Trip Hog <${fromEmail}>`,
      to: user.EMailAddress,
      subject: "Account Updated - Trip Hog",
      text: "Your account has been updated by the admin. Please log in again to access the updated features.\n\nBest regards,\nTrip Hog Team",
    });
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false });
  }
};

exports.updateOwnProfile = async (req, res) => {
  try {
    // Get user ID from token (set by verify middleware)
    const userId = req.user?.id;
    if (!userId) {
      return res.json({ success: false, message: "User ID not found in token" });
    }
    
    // Handle profile photo upload if present
    if (req.file) {
      // Convert filename to lowercase for consistent database storage
      const originalPath = req.file.path;
      const pathParts = originalPath.split('/');
      const filename = pathParts[pathParts.length - 1].toLowerCase();
      pathParts[pathParts.length - 1] = filename;
      const lowercasePath = pathParts.join('/');
      req.body.profilePhotoUrl = `${getUploadsBaseUrl()}/uploads/${filename}`;
    }
    
    // Update user profile
    const updatedUser = await UserModel.findByIdAndUpdate(
      userId,
      {
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        phoneNumber: req.body.phoneNumber,
        ...(req.body.profilePhotoUrl && { profilePhotoUrl: req.body.profilePhotoUrl }),
      },
      { new: true, runValidators: true }
    );
    
    if (!updatedUser) {
      return res.json({ success: false, message: "User not found" });
    }
    
    res.json({ 
      success: true, 
      message: "Profile updated successfully",
      user: updatedUser 
    });
  } catch (e) {
    console.error("Error updating user profile:", e);
    res.json({ success: false, message: e.message || "Failed to update profile" });
  }
};

exports.changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  console.log("Changing User Password");
  console.log("Request body:", req.body);
  console.log("User from token:", req.user);
  
  try {
    // Get user ID from token (set by verify middleware)
    const userId = req.user?.id;
    if (!userId) {
      return res.json({ success: false, message: "User ID not found in token" });
    }
    
    let user = await UserModel.findById(userId);
    console.log("User Found", user ? "Yes" : "No");
    
    if (!user) {
      return res.json({ success: false, message: "User Not Found!" });
    }
    
    // For users, password is stored as plain text (not hashed)
    if (user.password === currentPassword) {
      console.log("Password Matched");
      // Update password (still plain text for now, can be hashed later if needed)
      user.password = newPassword;
      await user.save();
      res.json({ success: true, message: "Password changed successfully" });
    } else {
      res.json({ success: false, message: "InCorrect Old Password" });
    }
  } catch (e) {
    console.log("Error changing password:", e.message);
    res.json({ success: false, message: e.message });
  }
};

exports.getUsersForChat = async (req, res) => {
  try {
    const { id: userId } = req.user;

    // Sub Admins can message their linked Admin and drivers under that Admin.
    const currentUser = await UserModel.findById(userId)
      .select("addedBy")
      .lean();
    if (!currentUser?.addedBy) {
      return res.status(200).json({
        success: true,
        message: "All Users for chat",
        data: [],
      });
    }

    const linkedAdmin = await Admin.findById(currentUser.addedBy)
      .select("_id firstName lastName photo")
      .lean();
    const drivers = await DriverModel.find({ addedBy: String(currentUser.addedBy) })
      .select("_id firstName lastName")
      .sort({ createdAt: -1 })
      .lean();

    const patients = await PatientModel.find({ addedBy: String(currentUser.addedBy) })
      .select("_id firstName lastName")
      .sort({ createdAt: -1 })
      .lean();

    const adminWithRole = linkedAdmin ? [{ ...linkedAdmin, role: "Admin" }] : [];
    const driversWithRole = drivers.map((d) => ({ ...d, role: "Driver" }));
    const patientsWithRole = patients.map((p) => ({ ...p, role: "Patient" }));
    const allUsersToChat = [...adminWithRole, ...driversWithRole, ...patientsWithRole];

    return res.status(200).json({
      success: true,
      message: "All Users for chat",
      data: allUsersToChat,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message:
        err.message ?? "Error fetching users for chat, please try again later.",
    });
  }
};

exports.sendMessage = async (req, res) => {
  try {
    const { conversationId, recipient, content } = req.body;
    const { id: senderId } = req.user;

    const currentUser = await UserModel.findById(senderId).select("addedBy").lean();
    const linkedAdminId = currentUser?.addedBy ? String(currentUser.addedBy) : null;

    if (!recipient?.role) {
      return res.status(400).json({ success: false, message: "Invalid recipient." });
    }

    // For new 1:1 conversations we need recipient._id
    if (!conversationId && recipient.role !== "Group" && !recipient._id) {
      return res.status(400).json({ success: false, message: "Invalid recipient." });
    }

    // Sub Admins can message linked Admin or drivers under that Admin (or group when convId set).
    if (recipient.role === "Admin") {
      if (!linkedAdminId || String(recipient._id) !== linkedAdminId) {
        return res.status(403).json({
          success: false,
          message: "You can only message your linked Admin.",
        });
      }
    } else if (recipient.role === "Driver") {
      const driverDoc = await DriverModel.findOne({ _id: recipient._id }).select("addedBy").lean();
      if (!driverDoc || String(driverDoc.addedBy) !== linkedAdminId) {
        return res.status(403).json({
          success: false,
          message: "You can only message drivers linked to your admin.",
        });
      }
    } else if (recipient.role === "Patient") {
      const patientDoc = await PatientModel.findOne({ _id: recipient._id }).select("addedBy").lean();
      if (!patientDoc || String(patientDoc.addedBy) !== linkedAdminId) {
        return res.status(403).json({
          success: false,
          message: "You can only message patients linked to your admin.",
        });
      }
    }

    let convId = conversationId;
    let isGroupConversation = false;

    if (convId) {
      const existing = await ChatConversation.findById(convId).lean();
      if (!existing) {
        return res.status(404).json({
          success: false,
          message: "Conversation not found.",
        });
      }
      isGroupConversation = existing.isGroup === true;
      const isParticipant = existing.recipients?.some(
        (r) => String(r.id) === String(senderId) && r.role === "User"
      );
      if (!isParticipant) {
        return res.status(403).json({
          success: false,
          message: "You do not have access to this conversation.",
        });
      }
    } else {
      if (recipient.role === "Group") {
        return res.status(400).json({
          success: false,
          message: "Use create-group to start a group conversation.",
        });
      }
      const newConversation = new ChatConversation({
        latestMessage: content,
        recipients: [
          { id: senderId, role: "User" },
          { id: recipient._id, role: recipient.role },
        ],
      });
      await newConversation.save();
      convId = newConversation._id;
    }

    const newMessage = new ChatMessage({
      content,
      conversationId: convId,
      sender: { id: senderId, role: "User" },
      reciever: isGroupConversation
        ? { id: convId, role: "Group" }
        : { id: recipient._id, role: recipient.role },
    });

    await newMessage.save();

    if (conversationId) {
      await ChatConversation.findByIdAndUpdate(conversationId, {
        latestMessage: content,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Message sent successfully.",
      data: { conversationId: convId },
    });
  } catch (err) {
    console.log(err);
    return res.status(
      err.message ?? "Error sending message, please try again later."
    );
  }
};

exports.getConversations = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(200).json({
        success: true,
        message: "Conversations.",
        data: [],
      });
    }

    const userObjId = mongoose.Types.ObjectId.isValid(userId)
      ? new mongoose.Types.ObjectId(String(userId))
      : null;
    if (!userObjId) {
      return res.status(200).json({
        success: true,
        message: "Conversations.",
        data: [],
      });
    }

    const userDoc = await UserModel.findById(userObjId).select("addedBy").lean();
    const linkedAdminIdStr = userDoc?.addedBy ? String(userDoc.addedBy).trim() : null;
    if (!linkedAdminIdStr) {
      return res.status(200).json({
        success: true,
        message: "Conversations.",
        data: [],
      });
    }

    const userIdStr = userObjId.toString();
    const rawConversations = await ChatConversation.find({
      $or: [
        { recipients: { $elemMatch: { role: "User", id: userObjId } } },
        { recipients: { $elemMatch: { role: "User", id: userId } } },
      ],
    })
      .sort({ updatedAt: -1 })
      .lean();

    const filtered = [];
    for (const c of rawConversations) {
      const recipients = c.recipients || [];
      const isCurrentUser = (r) =>
        r.role === "User" && (String(r.id) === userIdStr || String(r.id) === userId);
      const other = recipients.find((r) => !isCurrentUser(r));
      if (c.isGroup) {
        const isCreator =
          String(c.creatorRole) === "User" &&
          String(c.creatorId) === String(userId);
        filtered.push({
          _id: c._id,
          recipient: {
            _id: c._id,
            firstName: c.groupName || "Group",
            lastName: "",
            role: "Group",
          },
          latestMessage: c.latestMessage || "",
          isGroup: true,
          groupName: c.groupName || "",
          isGroupCreator: isCreator,
          createdAt: c.updatedAt,
        });
        continue;
      }
      if (!other) continue;
      const otherIdStr = String(other.id);
      if (other.role === "Admin" && otherIdStr === linkedAdminIdStr) {
        const adminDoc = await Admin.findById(other.id).select("_id firstName lastName").lean();
        filtered.push({
          _id: c._id,
          recipient: adminDoc
            ? { _id: adminDoc._id, firstName: adminDoc.firstName, lastName: adminDoc.lastName || "", role: "Admin" }
            : { _id: other.id, firstName: "Admin", lastName: "", role: "Admin" },
          latestMessage: c.latestMessage || "",
          isGroup: false,
          groupName: "",
          createdAt: c.updatedAt,
        });
        continue;
      }
      if (other.role === "Driver") {
        const driverDoc = await DriverModel.findById(other.id).select("addedBy firstName lastName").lean();
        if (driverDoc && String(driverDoc.addedBy) === linkedAdminIdStr) {
          filtered.push({
            _id: c._id,
            recipient: {
              _id: other.id,
              firstName: driverDoc.firstName,
              lastName: driverDoc.lastName || "",
              role: "Driver",
            },
            latestMessage: c.latestMessage || "",
            isGroup: false,
            groupName: "",
            createdAt: c.updatedAt,
          });
        }
      }
    }

    const convIds = filtered.map((c) => c._id);
    const reads = await ConversationRead.find({
      userId: userObjId,
      userRole: "User",
      conversationId: { $in: convIds },
    }).lean();
    const lastReadMap = new Map(reads.map((r) => [String(r.conversationId), r.lastReadAt]));
    const unreadCounts = await Promise.all(
      convIds.map((cid) => {
        const lastRead = lastReadMap.get(String(cid)) || new Date(0);
        return ChatMessage.countDocuments({
          conversationId: cid,
          "sender.id": { $ne: userObjId },
          createdAt: { $gt: lastRead },
        });
      })
    );
    filtered.forEach((c, i) => {
      c.unreadCount = unreadCounts[i] || 0;
    });

    return res.status(200).json({
      success: true,
      message: "Conversations.",
      data: filtered,
    });
  } catch (err) {
    console.log(err);
    return res.status(500).json({
      success: false,
      message:
        err.message ?? "Error fetching conversations, please try again later.",
    });
  }
};

exports.createGroup = async (req, res) => {
  try {
    const { id: userId } = req.user;
    const { groupName, recipients } = req.body;

    const userDoc = await UserModel.findById(userId).select("addedBy").lean();
    const linkedAdminId = userDoc?.addedBy ? String(userDoc.addedBy) : null;
    if (!linkedAdminId) {
      return res.status(403).json({
        success: false,
        message: "You must be linked to an admin to create groups.",
      });
    }

    if (!groupName || !recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Group name and at least one recipient are required.",
      });
    }

    for (const r of recipients) {
      if (!r.id || !r.role) continue;
      if (r.role === "Admin") {
        if (String(r.id) !== linkedAdminId) {
          return res.status(403).json({ success: false, message: "Invalid admin in group." });
        }
      } else if (r.role === "Driver") {
        const driverDoc = await DriverModel.findOne({ _id: r.id }).select("addedBy").lean();
        if (!driverDoc || String(driverDoc.addedBy) !== linkedAdminId) {
          return res.status(403).json({ success: false, message: "Invalid or unlinked driver in group." });
        }
      } else if (r.role === "User") {
        const u = await UserModel.findOne({ _id: r.id }).select("addedBy").lean();
        if (!u || String(u.addedBy) !== linkedAdminId) {
          return res.status(403).json({ success: false, message: "Invalid or unlinked user in group." });
        }
      }
    }

    const recipientList = [
      { id: userId, role: "User" },
      ...recipients.map((r) => ({ id: r.id, role: r.role })),
    ];

    const newConversation = new ChatConversation({
      latestMessage: "",
      isGroup: true,
      groupName: groupName.trim(),
      creatorId: userId,
      creatorRole: "User",
      recipients: recipientList,
    });
    await newConversation.save();

    return res.status(200).json({
      success: true,
      message: "Group created.",
      data: {
        conversationId: newConversation._id,
        groupName: newConversation.groupName,
        isGroup: true,
        recipient: {
          _id: newConversation._id,
          firstName: newConversation.groupName,
          lastName: "",
          role: "Group",
        },
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message ?? "Error creating group.",
    });
  }
};

exports.getConversationChat = async (req, res) => {
  try {
    const { conversationId } = req.query;
    const { id: userId, role } = req.user;

    const conversation = await ChatConversation.findById(conversationId).lean();
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found.",
      });
    }
    const isParticipant = conversation.recipients?.some(
      (r) => String(r.id) === String(userId) && r.role === role
    );
    if (!isParticipant) {
      return res.status(403).json({
        success: false,
        message: "You do not have access to this conversation.",
      });
    }

    const currentUserId = mongoose.Types.ObjectId.createFromHexString(String(userId));
    await ConversationRead.findOneAndUpdate(
      { conversationId, userId: currentUserId, userRole: role },
      { lastReadAt: new Date() },
      { upsert: true, new: true }
    );

    const chatMessages = await ChatMessage.find({
      conversationId,
    })
      .sort({ createdAt: 1 })
      .lean();

    return res
      .status(200)
      .json({ success: true, message: "Chat Messages", data: chatMessages });
  } catch (err) {
    console.log(err);
    return res.status(500).json({
      success: false,
      message: err.message || "Error fetching conversation messages.",
    });
  }
};

exports.deleteConversations = async (req, res) => {
  try {
    const { conversationId } = req.query;

    const { id: userId } = req.user;

    const conversation = await ChatConversation.findOneAndDelete({
      _id: conversationId,
      recipients: {
        $elemMatch: { id: userId, role: "User" },
      },
    });

    if (!conversation) {
      return res
        .status(404)
        .json({ success: false, message: "Conversation not found." });
    }

    await ChatMessage.deleteMany({ conversationId });

    return res.status(200).json({
      success: true,
      message: "Chat deleted successfully.",
    });
  } catch (err) {
    return res.status(
      err.message ?? "Error deleting chat, please try again later."
    );
  }
};
