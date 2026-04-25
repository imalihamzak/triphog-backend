const { findById } = require("../models/adminSchema");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const JWT_SECRET = require("../config/jwtSecret");
const fs = require("fs");
const path = require("path");

const AdminModel = require(`${__dirname}/../models/adminSchema`);
const PaymentModel = require(`${__dirname}/../models/paymentSchema`);
const SuperAdminModel = require("../models/SuperAdminModel");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const { createEmailTransporter, sendEmailSafely } = require("../utils/emailConfig");
const ChatConversation = require("../models/ChatConversation");
const ChatMessage = require("../models/ChatMessage");
const ConversationRead = require("../models/ConversationRead");
const { default: mongoose } = require("mongoose");
const UserModel = require("../models/UserModel");
const { getFrontendUrl, getApiUrl, getUploadsBaseUrl } = require("../config/appUrls");

// Email transport configuration
const transport = createEmailTransporter();
exports.addDoc = async (req, res) => {
  console.log("Adding Doc For admin");
  try {
    let superAdmin = await SuperAdminModel.findOne({ _id: req.userId });
    const filename =
      req.file.filename ||
      req.file.originalname ||
      String(req.file.path || "").split(/[\\/]/).pop();
    let docUrl = `${getUploadsBaseUrl()}/uploads/${encodeURIComponent(filename)}`;
    if (superAdmin) {
      let _docs = superAdmin.docs;
      _docs = _docs.concat({
        url: docUrl,
        title: req.file.originalname,
        Id: Math.random().toString(),
      });
      console.log("Docs", _docs);
      await SuperAdminModel.findByIdAndUpdate(
        req.userId,
        { docs: _docs },
        { new: true, runValidators: true }
      );
      res.json({ success: true });
    } else {
      res.json({ success: false, message: "Super Admin Not Found" });
    }
  } catch (e) {
    console.log("Error Msg", e.message);
    res.json({ success: false, message: e.message });
  }
};
exports.deleteDoc = async (req, res) => {
  try {
    let superAdmin = await SuperAdminModel.findOne({ _id: req.userId });
    if (superAdmin) {
      let _docs = superAdmin.docs;
      _docs = _docs.filter((doc) => {
        return doc.Id != req.params.docId;
      });
      await SuperAdminModel.findByIdAndUpdate(
        req.userId,
        { docs: _docs },
        { new: true, runValidators: true }
      );
      res.json({ success: true });
    } else {
      res.json({ success: false, message: "Super Admin Not Found" });
    }
  } catch (e) {
    console.log("Error Msg", e.message);
    res.json({ success: false, message: e.message });
  }
};
exports.getDocs = async (req, res) => {
  try {
    let superAdmin = await SuperAdminModel.findOne({ _id: req.userId });
    if (superAdmin) {
      let docs = superAdmin.docs;
      res.json({ success: true, docs });
    } else {
      res.json({ success: false, message: "Super Admin Not Found" });
    }
  } catch (e) {
    console.log("Error Msg", e.message);
    res.json({ success: false, message: e.message });
  }
};
exports.getSuperAdmin = async (req, res) => {
  try {
    let superAdmin = await SuperAdminModel.findOne({ _id: req.superAdmin.id });
    res.json({ success: true, superAdmin });
  } catch (e) {
    res.json({ success: false });
  }
};
exports.changePassword = async (req, res) => {
  const { currentPassword, email, newPassword } = req.body;

  try {
    let superAdmin = await SuperAdminModel.findOne({ EMailAddress: email });
    if (!superAdmin) {
      res.json({ success: false, message: "Not Found!" });
    } else {
      let isMatched = await bcrypt.compare(
        currentPassword,
        superAdmin.password
      );
      if (isMatched) {
        let salt = await bcrypt.genSalt(10);
        let hashedPassword = await bcrypt.hash(newPassword, salt);
        superAdmin.password = hashedPassword;
        await superAdmin.save();
        res.json({ success: true });
      } else {
        res.json({ success: false, message: "InCorrect Old Password" });
      }
    }
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
};
exports.getAdminStatistics = async (req, res) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Find admins created in the last 30 days
    const recentAdmins = await AdminModel.find({
      createdAt: { $gte: thirtyDaysAgo },
    });

    // Filter by status
    const paidAdmins = recentAdmins.filter(
      (admin) => admin.status === "Success" || admin.status === "paid"
    );
    const pendingAdmins = recentAdmins.filter((admin) => {
      let createdAt = admin.createdAt;
      let today = new Date();
      console.log("CreatedAT", createdAt);
      console.log("Today' Date", today);
      const differenceInTime = today.getTime() - createdAt.getTime();
      const differenceInDays = differenceInTime / (1000 * 3600 * 24);
      if (differenceInDays <= 7 && admin.status != "Paid") {
        console.log("Pending Admin Found");
        return true;
      } else {
        return false;
      }
    });
    const failedAdmins = recentAdmins.filter((admin) => {
      let createdAt = admin.createdAt;
      let today = new Date();
      console.log("CreatedAT", createdAt);
      console.log("Today' Date", today);
      const differenceInTime = today.getTime() - createdAt.getTime();
      const differenceInDays = differenceInTime / (1000 * 3600 * 24);
      if (differenceInDays > 7 && admin.status != "Paid") {
        console.log("Failed Admin Found");
        return true;
      } else {
        return false;
      }
    });

    // Calculate percentages
    const totalAdmins = recentAdmins.length;
    const paidPercentage = (paidAdmins.length / totalAdmins) * 100;
    const pendingPercentage = (pendingAdmins.length / totalAdmins) * 100;
    const failedPercentage = (failedAdmins.length / totalAdmins) * 100;

    // Calculate total and received payments
    const totalPayment = totalAdmins * 30; // Assuming $30 per admin
    const receivedPayment = paidAdmins.length * 30;

    // Get the number of new admins by month
    const newAdminsByMonth = await AdminModel.aggregate([
      { $match: { createdAt: { $gte: thirtyDaysAgo } } },
      {
        $group: {
          _id: { $month: "$createdAt" },
          count: { $sum: 1 },
        },
      },
    ]);

    // Return statistics
    res.json({
      totalAdmins,
      paidAdminsCount: paidAdmins.length,
      pendingAdminsCount: pendingAdmins.length,
      failedAdminsCount: failedAdmins.length,
      paidPercentage,
      pendingPercentage,
      failedPercentage,
      totalPayment,
      receivedPayment,
      newAdminsByMonth,
    });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
};

// Admin Signup Controller
exports.superAdminForgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    const superAdmin = await SuperAdminModel.findOne({
      EMailAddress: email,
    });

    if (!superAdmin) {
      return res
        .status(404)
        .json({ success: false, message: "Super Admin Not Found" });
    }

    const token = crypto.randomBytes(20).toString("hex");
    superAdmin.passwordResetToken = token;
    superAdmin.passwordResetExpires = Date.now() + 3600000; // 1 hour expiry
    await superAdmin.save();

    const resetURL = `${getFrontendUrl()}/superadmin/reset-password/${token}`;
    const message = `Welcome to Trip Hog!\n\nYou have requested to reset your password. Click on the link below to reset it:\n\n${resetURL}\n\nThis link will expire in 1 hour for security purposes.\n\nIf you did not request this password reset, please ignore this email.\n\nBest regards,\nTrip Hog Team`;

    const fromEmail = process.env.GMAIL_EMAIL || "noreply@triphog.com";
    await sendEmailSafely(transport, {
      from: `Trip Hog <${fromEmail}>`,
      to: superAdmin.EMailAddress,
      subject: "Reset Your Password | Trip Hog",
      text: message,
    });

    return res.status(200).json({
      success: true,
      message: "Reset Password link sent successfully.",
    });
  } catch (e) {
    return res.status(200).json({
      success: false,
      message: "Error sending reset password link, please try again later.",
    });
  }
};
exports.superAdminResetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    const superAdmin = await SuperAdminModel.findOne({
      passwordResetToken: token,
      passwordResetExpires: { $gt: Date.now() }, // Check expiry
    });

    if (!superAdmin) {
      return res
        .status(404)
        .json({ success: false, message: "Invalid or expired reset token" });
    }

    superAdmin.passwordResetToken = undefined;
    superAdmin.passwordResetExpires = undefined;
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    superAdmin.password = hashedPassword;
    await superAdmin.save();

    return res.status(200).json({
      success: true,
      message: "Password reset successfully.",
    });
  } catch (e) {
    return res.status(200).json({
      success: false,
      message: "Error resetting password, please try again later.",
    });
  }
};
exports.createSuperAdmin = async (req, res) => {
  try {
    let salt = await bcrypt.genSalt(10);
    let hashedPassword = await bcrypt.hash(req.body.password, salt);

    req.body.password = hashedPassword;
    let superAdmin = new SuperAdminModel(req.body);
    await superAdmin.save();
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
};
exports.superAdminLogin = async (req, res) => {
  try {
    const { EMailAddress, passWord } = req.body;

    const superAdmin = await SuperAdminModel.findOne({
      EMailAddress,
    });

    if (!superAdmin) {
      return res.json({ success: false, message: "Super Admin Not Found!" });
    }

    const isMatched = await bcrypt.compare(passWord, superAdmin.password);

    if (!isMatched) {
      return res.json({ success: false, message: "Incorrect Password" });
    }

    console.log('🔐 SuperAdmin Login - JWT_SECRET being used:', JWT_SECRET.substring(0, 10) + '...');
    console.log('🔐 SuperAdmin Login - JWT_SECRET length:', JWT_SECRET.length);
    console.log('🔐 SuperAdmin Login - Using env var?', !!process.env.JWT_SECRET);
    
    const token = jwt.sign(
      {
        id: superAdmin._id,
        role: "SuperAdmin",
        firstName: superAdmin.firstName,
        lastName: superAdmin.lastName,
      },
      JWT_SECRET,
      {
        expiresIn: "6d",
      }
    );
    
    console.log('✅ SuperAdmin Token generated, preview:', token.substring(0, 50) + '...');
    return res.json({
      success: true,
      token,
      superAdminId: superAdmin._id,
      superAdminEMailAddress: superAdmin.EMailAddress,
      superAdminRole: superAdmin.role,
    });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
};

exports.adminSignUp = async function (req, res) {
  try {
    console.log(req.body);

    console.log("Profile Photo For Admin", req.file);
    // Generate a token
    const token = crypto.randomBytes(20).toString("hex");
    const tokenExpiry = Date.now() + 10 * 60 * 1000; // 10 minutes from now
    
    // Convert filename to lowercase for consistent database storage
    const originalPath = req.file.path || req.file.filename || req.file.originalname;
    const pathParts = originalPath.split(/[/\\]/); // Handle both / and \ separators
    const filename = pathParts[pathParts.length - 1].toLowerCase();
    const photoUrl = `${getUploadsBaseUrl()}/uploads/${filename}`;
    
    // Create admin without password
    const adminData = {
      ...req.body,
      passwordResetToken: token,
      passwordResetExpires: tokenExpiry,
      photo: photoUrl,
    };
    console.log("Admin Data", adminData);
    const admin = await AdminModel.create(adminData);

    // Send email with token
    const resetURL = `${getFrontendUrl()}/admin/create-password/${token}`;
    const message = `Welcome to Trip Hog!\n\nClick on the link below to create your admin password:\n\n${resetURL}\n\nThis link will expire in 10 minutes for security purposes.\n\nBest regards,\nTrip Hog Team`;

    const fromEmail = process.env.GMAIL_EMAIL || "noreply@triphog.com";
    await sendEmailSafely(transport, {
      from: `Trip Hog <${fromEmail}>`,
      to: admin.email,
      subject: "Welcome to Trip Hog - Create Your Admin Password",
      text: message,
    });

    res.status(201).json({
      status: "success",
      message:
        "Admin created successfully. Check your email to create a password.",
      data: admin,
    });
  } catch (err) {
    console.log("🧨 Error Occurred ", err);
    res.status(500).json({
      status: "failed",
      message: "Admin creation failed",
    });
  }
};
exports.sendPasswordLink = async (req, res) => {
  console.log("Sending Password Link", req.params.adminId);
  try {
    let admin = await AdminModel.findOne({ _id: req.params.adminId });
    if (!admin) {
      res.json({ success: false });
    } else {
      const token = crypto.randomBytes(20).toString("hex");
      const tokenExpiry = Date.now() + 10 * 60 * 1000; // 10 minutes from now
      admin.passwordResetToken = token;
      admin.passwordResetExpires = tokenExpiry;
      await admin.save();
      const resetURL = `${getFrontendUrl()}/admin/create-password/${token}`;
      const message = `Welcome to Trip Hog!\n\nClick on the link below to create your admin password:\n\n${resetURL}\n\nThis link will expire in 10 minutes for security purposes.\n\nBest regards,\nTrip Hog Team`;

      const fromEmail = process.env.GMAIL_EMAIL || "noreply@triphog.com";
      await sendEmailSafely(transport, {
        from: `Trip Hog <${fromEmail}>`,
        to: admin.email,
        subject: "Welcome to Trip Hog - Create Your Admin Password",
        text: message,
      });
      res.json({ success: true });
    }
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
};

// Password Creation Controller
exports.createPassword = async function (req, res) {
  try {
    const { token } = req.params;
    console.log(token);
    const { password, confirmPassword } = req.body;

    const admin = await AdminModel.findOne({
      passwordResetToken: token,
      passwordResetExpires: { $gt: Date.now() },
    });

    if (!admin) {
      return res.status(400).json({
        status: "failed",
        message: "Token is invalid or has expired",
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({
        status: "failed",
        message: "Passwords do not match",
      });
    }

    // Update admin with new password
    let salt = await bcrypt.genSalt(10);
    let hashedPassword = await bcrypt.hash(password, salt);

    admin.password = hashedPassword; // Assuming you have a pre-save hook to hash //the password
    admin.passwordResetToken = undefined;
    admin.passwordResetExpires = undefined;
    admin.status = "active";
    await admin.save();

    res.status(200).json({
      status: "success",
      message: "Password created successfully",
    });
  } catch (err) {
    console.log("🧨 Error Occurred ", err);
    res.status(500).json({
      status: "failed",
      message: "Password creation failed",
    });
  }
};

exports.getAllAdmins = async (req, resp) => {
  try {
    let data = await AdminModel.find();
    resp.status(200).json({
      status: "success",
      message: "Admins get Successfully",
      data,
    });
  } catch (err) {
    console.log("🧨 Error Occurred ", err);
    resp.status(500).json({
      status: "failed",
      message: "Admin get Failed",
    });
  }
};

exports.createPayment = async (req, resp) => {
  try {
    const data = await PaymentModel.create({
      ...req.body,
      admin: req.params.id,
    });
    await AdminModel.findByIdAndUpdate(req.params.id, {
      $push: { payments: data._id },
      status: req.body.status,
      plan: req.body.plan,
      subscriptionExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    resp.status(201).json({
      status: "success",
      message: "Payment Created Successflly",
    });
  } catch (err) {
    console.log("🧨 Error Occured ", err);
    resp
      .status(500)
      .json({ status: "failed", message: "Payment Creation Failed" });
  }
};

exports.editPayment = async (req, resp) => {
  try {
    const data = await PaymentModel.findByIdAndUpdate(req.params.id, req.body);
    await AdminModel.findByIdAndUpdate(data.admin, {
      status: req.body.status,
      plan: req.body.plan,
    });
    resp.status(200).json({
      status: "success",
      message: "Payment Updated Successfully",
      data,
    });
  } catch (err) {
    console.log("🧨 Error Occured ", err);
    resp
      .status(500)
      .json({ status: "failed", message: "Payment Updation Failed" });
  }
};

exports.deletePayment = async (req, resp) => {
  try {
    const data = await PaymentModel.findByIdAndDelete(req.params.id);
    resp.status(200).json({
      status: "success",
      message: "Payment Deleted Successfully",
    });
  } catch (err) {
    console.log("🧨 Error Occured ", err);
    resp
      .status(500)
      .json({ status: "failed", message: "Payment Deletion Failed" });
  }
};
exports.getAllPayments = async (req, resp) => {
  try {
    const data = await AdminModel.findById(req.params.id).populate({
      path: "payments",
    });
    resp.status(200).json({
      status: "success",
      message: "Payments Get Successfully",
      data,
    });
  } catch (err) {
    console.log("🧨 Error Occured ", err);
    resp.status(500).json({ status: "failed", message: "Payments Get Failed" });
  }
};

exports.getSingleAdmin = async (req, resp) => {
  console.log("Admin Id", req.userId);
  try {
    const data = await AdminModel.findById(req.userId);
    console.log("data", data);
    resp.status(200).json({
      status: "success",
      message: "Admin Get Successfully",
      data,
    });
  } catch (err) {
    console.log("🧨 Error Occured ", err);
    resp.status(500).json({ status: "failed", message: "Admin Get Failed" });
  }
};

// New controller for profile that handles both Admin and SuperAdmin
exports.getProfileData = async (req, resp) => {
  console.log("Profile request - User ID:", req.userId, "Role:", req.userRole);
  try {
    let data;
    
    // Check if this is a SuperAdmin or regular Admin (handle both "SuperAdmin" and "Super Admin")
    if (req.userRole === "SuperAdmin" || req.userRole === "Super Admin") {
      data = await SuperAdminModel.findById(req.userId);
      console.log("SuperAdmin profile data:", data);
      
      // If no data found, return error
      if (!data) {
        return resp.status(404).json({
          status: "failed",
          message: "SuperAdmin profile not found",
        });
      }
    } else {
      data = await AdminModel.findById(req.userId);
      console.log("Admin profile data:", data);
      
      // If no data found, return error
      if (!data) {
        return resp.status(404).json({
          status: "failed",
          message: "Admin profile not found",
        });
      }
    }
    
    resp.status(200).json({
      status: "success",
      message: "Profile retrieved successfully",
      data,
    });
  } catch (err) {
    console.log("🧨 Error Occurred ", err);
    resp.status(500).json({ 
      status: "failed", 
      message: "Profile retrieval failed",
      error: err.message 
    });
  }
};

exports.updateAdmin = async (req, resp) => {
  // Get token from Authorization header to determine user role
  const token = req.headers["authorization"];
  let userRole = null;
  let userId = null;
  
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      userRole = decoded.role;
      userId = decoded.id;
    } catch (err) {
      console.error("Token verification error:", err);
    }
  }
  
  if (req.file) {
    // Use API endpoint instead of static file serving (more reliable)
    const originalFilename = req.file.filename || req.file.originalname;
    // Convert filename to lowercase for database storage (consistent)
    const filename = originalFilename.toLowerCase();
    // URL-encode the filename to handle special characters
    const encodedFilename = encodeURIComponent(filename);
    const photoUrl = `${getUploadsBaseUrl()}/uploads/${encodedFilename}`;
    
    // Verify file exists (use original filename for file system lookup)
    const filePath = path.join(__dirname, '..', 'uploads', originalFilename);
    if (fs.existsSync(filePath)) {
      console.log("✅ File exists at:", filePath);
      console.log("✅ Original filename:", originalFilename);
      console.log("✅ Lowercase filename (for DB):", filename);
      console.log("✅ Encoded filename:", encodedFilename);
      req.body.photo = photoUrl;
      console.log("✅ Photo URL set to:", photoUrl);
    } else {
      // Try lowercase version if original doesn't exist
      const lowerFilePath = path.join(__dirname, '..', 'uploads', filename);
      if (fs.existsSync(lowerFilePath)) {
        console.log("✅ File exists at (lowercase):", lowerFilePath);
        req.body.photo = photoUrl;
        console.log("✅ Photo URL set to:", photoUrl);
      } else {
        console.error("❌ File does NOT exist at:", filePath);
        console.error("❌ Also tried (lowercase):", lowerFilePath);
        console.error("Expected file:", originalFilename);
        return resp.status(400).json({
          status: "failed",
          message: "Uploaded file not found on server"
        });
      }
    }
  }
  
  try {
    let data;
    const updateId = req.params.id;

    // Company code is immutable - must never be updated on any account
    const updateBody = { ...req.body };
    delete updateBody.companyCode;

    // Check if this is a SuperAdmin or regular Admin
    if (userRole === "SuperAdmin" || userRole === "Super Admin") {
      // For superadmins, use SuperAdminModel
      data = await SuperAdminModel.findByIdAndUpdate(updateId, updateBody, { new: true });
      console.log("Updated superadmin data:", data);
    } else {
      // For regular admins, use AdminModel
      data = await AdminModel.findByIdAndUpdate(updateId, updateBody, { new: true });
      console.log("Updated admin data:", data);
    }
    
    if (!data) {
      return resp.status(404).json({
        status: "failed",
        message: "User not found"
      });
    }
    
    resp.status(200).json({
      status: "success",
      message: "Profile Updated Successfully",
      data,
    });
  } catch (err) {
    console.log("🧨 Error Occured ", err);
    resp
      .status(500)
      .json({ status: "failed", message: "Profile Update Failed" });
  }
};
exports.getAdminById = async (req, res) => {
  try {
    // Verify photo file exists if photo URL is present
    if (req.query.verifyPhoto) {
      const admin = await AdminModel.findById(req.user.id);
      if (admin && admin.photo) {
        // Extract relative path from photo URL
        const apiBase = getApiUrl();
        let photoPath = admin.photo.replace(apiBase + "/", "");
        const filePath = path.join(__dirname, '..', photoPath);
        const exists = fs.existsSync(filePath);
        console.log(`📸 Photo verification: ${admin.photo} - Exists: ${exists} - Path: ${filePath}`);
        return res.json({ exists, path: filePath, url: admin.photo });
      }
      return res.json({ exists: false, message: 'No photo URL in profile' });
    }
    const admin = await AdminModel.findById(req.params.adminId);
    res.json({ success: true, admin });
  } catch (e) {
    res.json({ success: false });
  }
};
exports.reActivateAdmin = async (req, res) => {
  try {
    await AdminModel.findByIdAndUpdate(req.params.adminId, { isOnHold: false });
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false });
  }
};
exports.holdAdmin = async (req, res) => {
  try {
    await AdminModel.findByIdAndUpdate(
      req.params.adminId,
      { isOnHold: true, warningMsg: req.body.warningMsg },
      { new: true, runValidators: true }
    );
    res.json({ success: true });
  } catch (e) {
    res.json({ success: true });
  }
};
exports.deleteAdmin = async (req, resp) => {
  try {
    const data = await AdminModel.findByIdAndDelete(req.params.id);
    resp.status(200).json({
      status: "success",
      message: "Admin Deleted Successfully",
    });
  } catch (err) {
    console.log("🧨 Error Occured ", err);
    resp
      .status(500)
      .json({ status: "failed", message: "Admin Deletion Failed" });
  }
};

exports.giveWarning = async (req, resp) => {
  try {
    const getAdmin = await AdminModel.findById(req.params.id).populate({
      path: "payments",
    });
    const id = getAdmin.payments[getAdmin.payments.length - 1];
    const data = await PaymentModel.findByIdAndUpdate(id, req.body);
    resp.status(201).json({
      status: "success",
      message: "Warning Send Successfully",
    });
  } catch (err) {
    console.log("🧨 Error Occured ", err);
    resp.status(500).json({ status: "failed", message: "Warning Send Failed" });
  }
};

exports.getUsersForChat = async (req, res) => {
  try {
    // Only Admins can communicate with Super Admins; Super Admin sees only Admins (not Sub Admins/Users).
    const allAdmins = await AdminModel.find({})
      .select("_id firstName lastName photo")
      .sort({ createdAt: -1 })
      .lean();

    const admins = allAdmins.map((a) => ({ ...a, role: "Admin" }));

    return res.status(200).json({
      success: true,
      message: "All Users for chat",
      data: admins,
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

    if (!recipient?.role) {
      return res.status(400).json({ success: false, message: "Invalid recipient." });
    }
    if (!conversationId && recipient.role !== "Group" && (!recipient._id || !recipient.role)) {
      return res.status(400).json({ success: false, message: "Invalid recipient." });
    }

    // Super Admin may message Admins, or send to a group they're in.
    if (recipient.role !== "Admin" && recipient.role !== "Group") {
      return res.status(403).json({
        success: false,
        message: "Super Admin can only message Admins or group conversations.",
      });
    }
    if (recipient.role === "Admin" && !recipient._id) {
      return res.status(400).json({ success: false, message: "Invalid recipient." });
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
        (r) => String(r.id) === String(senderId) && r.role === "SuperAdmin"
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
          { id: senderId, role: "SuperAdmin" },
          { id: recipient._id, role: recipient.role },
        ],
      });

      await newConversation.save();

      convId = newConversation._id;
    }

    const newMessage = new ChatMessage({
      content,
      conversationId: convId,
      sender: {
        id: senderId,
        role: "SuperAdmin",
      },
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
    const { id: superAdminId } = req.user;
    if (!superAdminId) {
      return res.status(200).json({
        success: true,
        message: "Conversations.",
        data: [],
      });
    }

    const idStr = String(superAdminId).trim();
    let superAdminObjId;
    try {
      superAdminObjId = mongoose.Types.ObjectId.createFromHexString(idStr);
    } catch (_) {
      return res.status(200).json({
        success: true,
        message: "Conversations.",
        data: [],
      });
    }

    const convos = await ChatConversation.find({
      recipients: {
        $elemMatch: {
          role: "SuperAdmin",
          id: { $in: [superAdminObjId, idStr] },
        },
      },
    })
      .sort({ updatedAt: -1 })
      .lean();

    const result = [];
    for (const c of convos) {
      const me = c.recipients?.find(
        (r) =>
          (String(r.id) === idStr || String(r.id) === String(superAdminObjId)) &&
          r.role === "SuperAdmin"
      );
      if (!me) continue;
      const other = c.recipients?.find(
        (r) =>
          String(r.id) !== idStr &&
          String(r.id) !== String(superAdminObjId)
      );
      let recipient;
      if (c.isGroup) {
        recipient = {
          _id: c._id,
          firstName: c.groupName || "Group",
          lastName: "",
          role: "Group",
        };
      } else if (other) {
        const admin = await AdminModel.findById(other.id)
          .select("_id firstName lastName")
          .lean();
        recipient = admin
          ? { ...admin, role: other.role }
          : { _id: other.id, firstName: "Admin", lastName: "", role: other.role };
      } else {
        recipient = { _id: c._id, firstName: "Unknown", lastName: "", role: "Admin" };
      }
      const isCreator =
        String(c.creatorRole) === "SuperAdmin" &&
        (String(c.creatorId) === idStr ||
          (superAdminObjId && String(c.creatorId) === String(superAdminObjId)));

      result.push({
        _id: c._id,
        recipient,
        latestMessage: c.latestMessage || "",
        isGroup: !!c.isGroup,
        groupName: c.groupName || "",
        isGroupCreator: !!c.isGroup && isCreator,
        createdAt: c.updatedAt,
      });
    }

    const convIds = result.map((r) => r._id);
    const currentUserId = mongoose.Types.ObjectId.createFromHexString(String(superAdminId));
    const reads = await ConversationRead.find({
      userId: currentUserId,
      userRole: "SuperAdmin",
      conversationId: { $in: convIds },
    })
      .lean();
    const lastReadMap = new Map(reads.map((r) => [String(r.conversationId), r.lastReadAt]));
    const unreadCounts = await Promise.all(
      convIds.map(async (cid) => {
        const lastRead = lastReadMap.get(String(cid)) || new Date(0);
        return ChatMessage.countDocuments({
          conversationId: cid,
          "sender.id": { $ne: currentUserId },
          createdAt: { $gt: lastRead },
        });
      })
    );
    result.forEach((r, i) => {
      r.unreadCount = unreadCounts[i] || 0;
    });

    return res.status(200).json({
      success: true,
      message: "Conversations.",
      data: result,
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
    const { id: superAdminId } = req.user;
    const { groupName, recipients } = req.body;

    if (!groupName || !recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Group name and at least one recipient are required.",
      });
    }

    // SuperAdmin can only add Admins to groups
    for (const r of recipients) {
      if (!r.id || !r.role) continue;
      if (r.role !== "Admin") {
        return res.status(403).json({
          success: false,
          message: "Super Admin can only add Admins to a group.",
        });
      }
      const adminExists = await AdminModel.findById(r.id).select("_id").lean();
      if (!adminExists) {
        return res.status(403).json({
          success: false,
          message: "Invalid admin in group.",
        });
      }
    }

    const recipientList = [
      { id: superAdminId, role: "SuperAdmin" },
      ...recipients.map((r) => ({ id: r.id, role: r.role })),
    ];

    const newConversation = new ChatConversation({
      latestMessage: "",
      isGroup: true,
      groupName: groupName.trim(),
      creatorId: superAdminId,
      creatorRole: "SuperAdmin",
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
    const { id: userId, role } = req.user || {};

    if (!conversationId) {
      return res
        .status(400)
        .json({ success: false, message: "conversationId is required." });
    }
    if (!userId || !role) {
      return res
        .status(403)
        .json({ success: false, message: "Unauthorized." });
    }

    const conversation = await ChatConversation.findById(conversationId);

    if (!conversation) {
      return res
        .status(404)
        .json({ success: false, message: "Conversation not found." });
    }

    const idStr = String(userId).trim();

    if (conversation.isGroup) {
      // Only the group creator can delete the group conversation
      const isCreator =
        String(conversation.creatorRole) === String(role) &&
        String(conversation.creatorId) === idStr;

      if (!isCreator) {
        return res.status(403).json({
          success: false,
          message: "Only the group creator can delete this group. Use leave-group instead.",
        });
      }

      await ChatConversation.deleteOne({ _id: conversationId });
    } else {
      // 1:1 conversation: any participant may delete the whole thread
      let objId = null;
      try {
        objId = mongoose.Types.ObjectId.createFromHexString(idStr);
      } catch (_) {
        objId = null;
      }
      const allowedIds = objId ? [objId, idStr] : [idStr];

      const deleted = await ChatConversation.findOneAndDelete({
        _id: conversationId,
        recipients: {
          $elemMatch: {
            role,
            id: { $in: allowedIds },
          },
        },
      });

      if (!deleted) {
        return res
          .status(404)
          .json({ success: false, message: "Conversation not found." });
      }
    }

    await ChatMessage.deleteMany({ conversationId });

    return res.status(200).json({
      success: true,
      message: "Chat deleted successfully.",
    });
  } catch (err) {
    console.log(err);
    return res.status(500).json({
      success: false,
      message: err.message ?? "Error deleting chat, please try again later.",
    });
  }
};

exports.leaveGroup = async (req, res) => {
  try {
    const { conversationId } = req.body;
    const { id: userId, role } = req.user || {};

    if (!conversationId) {
      return res
        .status(400)
        .json({ success: false, message: "conversationId is required." });
    }
    if (!userId || !role) {
      return res
        .status(403)
        .json({ success: false, message: "Unauthorized." });
    }

    const conversation = await ChatConversation.findById(conversationId);
    if (!conversation || !conversation.isGroup) {
      return res.status(404).json({
        success: false,
        message: "Group conversation not found.",
      });
    }

    const idStr = String(userId).trim();
    const isParticipant = conversation.recipients?.some(
      (r) => String(r.role) === String(role) && String(r.id) === idStr
    );
    if (!isParticipant) {
      return res.status(404).json({
        success: false,
        message: "You are not a participant of this group.",
      });
    }

    const isCreator =
      String(conversation.creatorRole) === String(role) &&
      String(conversation.creatorId) === idStr;

    if (isCreator) {
      return res.status(403).json({
        success: false,
        message: "Group creator cannot leave the group. Delete the group instead.",
      });
    }

    const updatedRecipients = (conversation.recipients || []).filter(
      (r) => !(String(r.role) === String(role) && String(r.id) === idStr)
    );

    if (updatedRecipients.length <= 1) {
      // If 0 or 1 participant remains, delete the whole conversation
      await ChatConversation.deleteOne({ _id: conversationId });
      await ChatMessage.deleteMany({ conversationId });
    } else {
      conversation.recipients = updatedRecipients;
      await conversation.save();
    }

    return res.status(200).json({
      success: true,
      message: "You have left the group.",
    });
  } catch (err) {
    console.log(err);
    return res.status(500).json({
      success: false,
      message: err.message ?? "Error leaving group, please try again later.",
    });
  }
};

exports.updateGroup = async (req, res) => {
  try {
    const { conversationId, groupName } = req.body;
    const { id: userId, role } = req.user || {};

    if (!conversationId || !groupName?.trim()) {
      return res.status(400).json({
        success: false,
        message: "conversationId and groupName are required.",
      });
    }
    if (!userId || !role) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized.",
      });
    }

    const conversation = await ChatConversation.findById(conversationId);
    if (!conversation || !conversation.isGroup) {
      return res.status(404).json({
        success: false,
        message: "Group conversation not found.",
      });
    }

    const isCreator =
      String(conversation.creatorRole) === String(role) &&
      String(conversation.creatorId) === String(userId);

    if (!isCreator) {
      return res.status(403).json({
        success: false,
        message: "Only the group creator can update group settings.",
      });
    }

    conversation.groupName = groupName.trim();
    await conversation.save();

    return res.status(200).json({
      success: true,
      message: "Group updated.",
      data: {
        conversationId: conversation._id,
        groupName: conversation.groupName,
      },
    });
  } catch (err) {
    console.log(err);
    return res.status(500).json({
      success: false,
      message: err.message ?? "Error updating group.",
    });
  }
};
