const Admin = require("../models/adminSchema");
const SuperAdminModel = require("../models/SuperAdminModel");
const ReviewModel = require("../models/ReviewModel");
const DriverModel = require("../models/DriverModel");
const PatientModel = require("../models/PatientModel");
const sendMail = require("../mailer");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const JWT_SECRET = require("../config/jwtSecret");
const JWT_COOKIE_EXPIRES_IN = "600000";
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const { createEmailTransporter, sendEmailSafely } = require("../utils/emailConfig");
const { getFrontendUrl, getUploadsBaseUrl } = require("../config/appUrls");

const stripe = require("stripe")(process.env.STRIPE_KEY);

const mailerTransport = createEmailTransporter();

// Helper function to create and send token via cookie
const createSendToken = (admin, statusCode, res) => {
  const token = jwt.sign({ id: admin._id }, JWT_SECRET, {
    expiresIn: "5d",
  });

  // Convert JWT_COOKIE_EXPIRES_IN to a number and calculate milliseconds
  const cookieExpiresIn = parseInt(JWT_COOKIE_EXPIRES_IN, 10) || 90; // default to 90 days if not set

  const cookieOptions = {
    expires: new Date(Date.now() + cookieExpiresIn * 24 * 60 * 60 * 1000),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production", // Use secure cookies in production
  };

  res.cookie("jwt", token, cookieOptions);

  // Remove password from output
  admin.password = undefined;

  res.status(statusCode).json({
    status: "success",
    data: {
      admin,
    },
  });
};
exports.requestDemo = async (req, res) => {
  try {
    // Extract form data from request body
    const { name, email, company, phone, available } = req.body;

    // Validate required fields
    if (!name || !email || !company || !phone || !available) {
      return res.status(400).json({
        success: false,
        message:
          "All fields are required: name, email, company, phone, and available time for calling",
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email address",
      });
    }

    // Validate phone number (basic validation - adjust pattern as needed)
    const phoneRegex = /^\+?[0-9\s\-\(\)]{8,20}$/;
    if (!phoneRegex.test(phone)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid phone number",
      });
    }

    // Prepare email content
    const subject = "New Demo Request";
    const message = `
      A new demo request has been submitted:
      
      Name: ${name}
      Email: ${email}
      Company: ${company}
      Phone: ${phone}
      Available for Calling: ${available}
    `;

    // Send email
    await sendMail({
      to: "dsdugar@gmail.com",
      subject,
      text: message,
    });

    // Return success response
    return res.status(200).json({
      success: true,
      message: "Demo request submitted successfully",
    });
  } catch (error) {
    console.error("Error in requestDemo controller:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error while processing your request",
    });
  }
};
exports.getAdminById = async (req, res) => {
  try {
    let admin = await Admin.findById(req.params.id);
    if (!admin) {
      res.json({ success: false, message: "Admin Not Found!" });
    } else {
      res.json({ success: true, admin });
    }
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
};
exports.updateFrequentlyVisitedPages = async (req, res) => {
  try {
    await Admin.findByIdAndUpdate(
      req.userId,
      { frequentlyVisitedPages: req.body.frequentlyVisitedPages },
      { new: true, runValidators: true }
    );
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false });
  }
};
const mongoose = require("mongoose");
const Payment = require("../models/paymentSchema");
const ChatConversation = require("../models/ChatConversation");
const ChatMessage = require("../models/ChatMessage");
const ConversationRead = require("../models/ConversationRead");
const UserModel = require("../models/UserModel");

exports.addDoc = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.userId); // Ensure it's a valid ObjectId
    console.log(typeof userId);
    let admin = await Admin.findOne({ _id: userId });
    let docUrl = getUploadsBaseUrl() + "/" + req.file.path;

    if (admin) {
      let _docs = admin.docs;
      _docs = _docs.concat({
        url: docUrl,
        title: req.file.originalname,
        Id: Math.random().toString(),
      });

      console.log("Docs", _docs);

      await Admin.findByIdAndUpdate(
        userId,
        { docs: _docs },
        { new: true, runValidators: true }
      );

      res.json({ success: true });
    } else {
      res.json({ success: false });
    }
  } catch (e) {
    console.error(e);
    res.json({ success: false });
  }
};

exports.deleteDoc = async (req, res) => {
  try {
    let admin = await Admin.findOne({ _id: req.userId });
    if (admin) {
      console.log("Deleting Doc With Id", req.params.docId);

      let _docs = admin.docs;
      _docs = _docs.filter((doc) => {
        return doc.Id != req.params.docId;
      });
      console.log("Latest Docs After Deleting", _docs);
      await Admin.findByIdAndUpdate(
        req.userId,
        { docs: _docs },
        { new: true, runValidators: true }
      );
      res.json({ success: true });
    } else {
      res.json({ success: false });
    }
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
};
exports.getDocs = async (req, res) => {
  try {
    let admin = await Admin.findOne({ _id: req.userId });
    if (admin) {
      let docs = admin.docs;
      res.json({ success: true, docs });
    } else {
      res.json({ success: false });
    }
  } catch (e) {
    res.json({ success: false });
  }
};
exports.deleteReview = async (req, res) => {
  try {
    await ReviewModel.findByIdAndDelete(req.params.reviewId);
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false });
  }
};
exports.getReviews = async (req, res) => {
  try {
    let allReviews = await ReviewModel.find();
    allReviews = allReviews.filter((review) => {
      return review.adminId == req.userId;
    });
    res.json({ success: true, allReviews });
  } catch (e) {
    res.json({ success: false });
  }
};
exports.addReview = async (req, res) => {
  try {
    req.body.addedON = new Date().toString();
    let review = new ReviewModel(req.body);
    await review.save();
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false });
  }
};
exports.approveDriver = async (req, res) => {
  try {
    const transport = createEmailTransporter();
    let driver = await DriverModel.findById(req.params.driverId);
    driver.isApproved = true;
    await driver.save();
    
    // Try to send email but don't fail if it doesn't work
    const fromEmail = process.env.GMAIL_EMAIL || "noreply@triphog.com";
    const emailResult = await sendEmailSafely(transport, {
      from: `Trip Hog <${fromEmail}>`,
      to: driver.EMailAddress,
      subject: "Welcome to Trip Hog - Account Approved!",
      text: "Congratulations! Your account has been approved by the admin.\n\nYou can now log in and get started with Trip Hog.\n\nBest regards,\nTrip Hog Team",
    });
    
    if (!emailResult.success) {
      console.warn("Failed to send approval email to driver:", emailResult.error);
    }
    
    res.json({ success: true });
  } catch (e) {
    console.error("Error approving driver:", e);
    res.json({ success: false, message: e.message });
  }
};
exports.denyDriver = async (req, res) => {
  try {
    const transport = createEmailTransporter();
    let driver = await DriverModel.findById(req.params.driverId);
    driver.isApproved = false;
    await driver.save();
    
    // Try to send email but don't fail if it doesn't work
    const fromEmail = process.env.GMAIL_EMAIL || "noreply@triphog.com";
    const emailResult = await sendEmailSafely(transport, {
      from: `Trip Hog <${fromEmail}>`,
      to: driver.EMailAddress,
      subject: "Trip Hog Account Status Update",
      text: "We regret to inform you that your account application has been denied by the admin.\n\nIf you have any questions or would like to discuss this decision, please contact our support team.\n\nBest regards,\nTrip Hog Team",
    });
    
    if (!emailResult.success) {
      console.warn("Failed to send denial email to driver:", emailResult.error);
    }
    
    res.json({ success: true });
  } catch (e) {
    console.error("Error denying driver:", e);
    res.json({ success: false, message: e.message });
  }
};
exports.updatePaymentHistory = async (req, res) => {
  try {
    console.log("Updating Payment History");
    let admin = await Admin.findOne({ _id: req.adminId });
    if (!admin) {
      res.json({ success: false, message: "No Admin Found!" });
    } else {
      let payments = admin.payments;
      payments = payments.concat({
        id: payments.length,
        amount: Number(req.body.amount),
        status: "Success",
        addedON: new Date(),
      });
      console.log("Admin Found", admin);
      admin.payments = payments;

      await Admin.findByIdAndUpdate(
        req.adminId,
        { payments: payments, status: "Paid" },
        { new: true, runValidators: true }
      );
      let latestAdmin = await Admin.findOne({ _id: req.adminId });
      console.log("Latest Admin", latestAdmin);
      res.json({ success: true });
    }
  } catch (e) {
    res.json({ success: false });
  }
};
exports.createCheckoutSession = async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.create({
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: Math.round(Number(req.body.amount) * 100),
            product_data: {
              name: `${req.body.plan} Plan`,
              description: `Paying To Triphog For ${req.body.plan}`,
            },
          },
          quantity: 1,
          adjustable_quantity: {
            enabled: false,
          },
        },
      ],
      mode: "payment",
      // success_url: `http://localhost:3000/success/${req.body.token}/${req.body.plan}/${Number(req.body.amount)}`,
      // success_url: `http://localhost:3000/success/${req.body.token}/${
      //   req.body.plan
      // }/${Number(req.body.amount)}?session_id={CHECKOUT_SESSION_ID}`,
      success_url: `${getFrontendUrl()}/success/${req.body.token}/${
        req.body.plan
      }/${Number(req.body.amount)}?session_id={CHECKOUT_SESSION_ID}`,

      cancel_url: `${getFrontendUrl()}/cancel`,
    });

    console.log(session);

    res.json({ id: session.id });
  } catch (error) {
    console.log(error);
    console.error(error);
    res.status(500).json({ error: "Error creating checkout session" });
  }
};

exports.verifyStripePayment = async (req, res) => {
  const { sessionId } = req.body;

  try {
    // Retrieve the session from Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status === "paid") {
      res.status(200).json({
        success: true,
        message: "Payment verified successfully",
        session: {
          id: session.id,
          object: session.object,
          amount_subtotal: session.amount_subtotal,
          amount_total: session.amount_total,
          currency: session.currency,
          customer_email: session.customer_details?.email,
          customer_name: session.customer_details?.name,
          customer_country: session.customer_details?.address?.country,
          payment_status: session.payment_status,
          payment_intent: session.payment_intent,
          plan_name: session.line_items?.[0]?.price?.product_data?.name || null,
          metadata: session.metadata,
          created: session.created,
          expires_at: session.expires_at,
          mode: session.mode,
          success_url: session.success_url,
          cancel_url: session.cancel_url,
        },
      });
    } else {
      res.status(400).json({
        success: false,
        message: "Payment not completed",
        payment_status: session.payment_status,
      });
    }
  } catch (error) {
    console.error("❌ Error verifying payment:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to verify payment",
      error: error.message,
    });
  }
};

exports.recordStripePayment = async (req, res) => {
  const { adminId } = req.params;
  const { amount, paymentMethod, status, plan, stripeSessionId, stripeEmail } =
    req.body;

  try {
    const newPayment = new Payment({
      admin: adminId,
      amount,
      paymentMethod,
      status,
      plan,
      warning: "",
    });

    await newPayment.save();

    // Debugging
    console.log("Payment saved successfully:", newPayment);
    console.log("Status received:", status);
    console.log("Admin ID to update:", adminId);

    if (status === "Success" || status === "paid") {
      const updatedAdmin = await Admin.findByIdAndUpdate(
        adminId,
        {
          hasPlan: true,
          paymentStatus: "paid",
          plan: plan || "Ultimate", // Make sure plan is updated too
        },
        { new: true } // Return the updated document
      );

      console.log("Admin updated:", updatedAdmin);

      if (!updatedAdmin) {
        console.error(`❌ Admin with ID ${adminId} not found`);
        return res.status(404).json({
          success: false,
          message: "Admin not found",
        });
      }
    }

    res.status(201).json({
      success: true,
      message: "Payment recorded successfully",
      payment: newPayment,
    });
  } catch (error) {
    console.error("❌ Error saving payment:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to record payment",
      error: error.message,
    });
  }
};
exports.getPaymentsByAdmin = async (req, res) => {
  const { adminId } = req.params;
  try {
    const payments = await Payment.find({ admin: adminId }).sort({
      createdAt: -1,
    });
    res.status(200).json({ success: true, data: payments });
  } catch (error) {
    console.error("Failed to fetch payments:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
exports.getAllUsers = async (req, res) => {
  try {
    console.log("Admin Id", req.userId);
    let admin = await Admin.findOne({ _id: req.userId });
    console.log("Admin Data", admin);
    console.log("Company COde", admin.companyCode);
    let allDrivers = await DriverModel.find({ addedBy: req.userId });
    let allPatients = await PatientModel.find({
      $or: [
        { addedBy: req.userId }, // Condition 1: Match records where addedBy is req.userId
        { companyCode: admin.companyCode }, // Condition 2: Match records where companyCode is admin.companyCode
      ],
    });
    let superAdmins = await SuperAdminModel.find();
    console.log("Getting Users For Admin");
    res.json({ success: true, allDrivers, allPatients, superAdmins });
  } catch (e) {
    console.log("Error Message", e.message);
    res.json({ success: false });
  }
};

exports.changePassword = async (req, res) => {
  const { currentPassword, email, newPassword } = req.body;
  console.log("Changing Admin Password");
  console.log(req.body);
  try {
    let admin = await Admin.findOne({ email });
    console.log("Admin Found", admin);
    if (!admin) {
      return res.json({ success: false, message: "Not Found!" });
    }
    
    // Use bcrypt.compare() to verify the current password (same as login)
    const isMatched = await bcrypt.compare(currentPassword, admin.password);
    if (!isMatched) {
      console.log("❌ Current password does not match");
      return res.json({ success: false, message: "InCorrect Old Password" });
    }
    
    console.log("✅ Current password matched, updating to new password");
    let salt = await bcrypt.genSalt(10);
    let hashedPassword = await bcrypt.hash(newPassword, salt);
    admin.password = hashedPassword;
    await admin.save();
    res.json({ success: true, message: "Password changed successfully" });
  } catch (e) {
    console.error("Error changing password:", e);
    res.json({ success: false, message: e.message || "Error changing password" });
  }
};

exports.login = async (req, res) => {
  try {
    console.log('🔍 Admin login request received:', req.body);
    console.log('🔗 Database URL:', process.env.DB_CONNECTION);
    console.log('🔗 Database Name:', process.env.DB_NAME);
    
    // Check total admins
    const totalAdmins = await Admin.countDocuments();
    console.log('📊 Total admins in database:', totalAdmins);
    
    // List all admin emails
    const allAdmins = await Admin.find({}, 'email').limit(5);
    console.log('📋 Available admin emails:', allAdmins.map(a => a.email));
    
    const { email, password } = req.body;
    if (!email || !password) {
      console.log('❌ Missing email or password');
      return res
        .status(400)
        .json({ success: false, message: "Please provide email and password" });
    }

    console.log('🔍 Looking for admin with email:', email);
    const admin = await Admin.findOne({ email });
    if (!admin) {
      console.log('❌ Admin not found in database');
      return res
        .status(401)
        .json({ success: false, message: "Admin not found" });
    }

    console.log('✅ Admin found:', admin.email);

    if (!admin.password) {
      return res
        .status(400)
        .json({ success: false, message: "Please set up your password." });
    }

    const isMatched = await bcrypt.compare(password, admin.password);
    if (!isMatched) {
      return res
        .status(401)
        .json({ success: false, message: "Incorrect password" });
    }

    console.log('✅ Password matched, generating token...');
    console.log('🔐 Login - JWT_SECRET being used:', JWT_SECRET.substring(0, 10) + '...');
    console.log('🔐 Login - JWT_SECRET length:', JWT_SECRET.length);
    console.log('🔐 Login - Using env var?', !!process.env.JWT_SECRET);

    const token = jwt.sign(
      {
        id: admin._id,
        role: "Admin",
        companyCode: admin.companyCode,
        firstName: admin.firstName,
        lastName: admin.lastName,
      },
      JWT_SECRET,
      { expiresIn: "6d" }
    );

    console.log('✅ Token generated successfully');
    console.log('✅ Token preview:', token.substring(0, 50) + '...');

    // Send response only once
    if (admin.hasPlan) {
      console.log('✅ Admin has plan, sending full response');
      return res.json({
        success: true,
        token,
        adminEmail: admin.email,
        adminId: admin._id,
        isOnHold: admin.isOnHold,
        warningMsg: admin.warningMsg,
        admin,
        hasPlan: true,
      });
    } else {
      console.log('✅ Admin has no plan, sending basic response');
      return res.json({
        success: true,
        token,
        adminEmail: admin.email,
        adminId: admin._id,
        hasPlan: false,
      });
    }
  } catch (error) {
    console.error("❌ Login error:", error);
    return res
      .status(500)
      .json({ success: false, message: "An error occurred during login" });
  }
};

// exports.login = async (req, res) => {
//   try {
//     const { email, password } = req.body; // Check if email and password are provided
//     if (!email || !password) { return res.status(400).json({ status: "fail", message: "Please provide email and password", }); }
//     // Find the admin by email
//     const admin = await Admin.findOne({ email })
//     console.log(admin)
//     if (!admin) { res.json({ success: false }) }
//     else {
//       let isMatched = await bcrypt.compare(req.body.password, admin.password)
//       if (isMatched) {
//         const token = jwt.sign({ id: admin._id, role: "Admin", companyCode: admin.companyCode, firstName: admin.firstName, lastName: admin.lastName }, JWT_SECRET, { expiresIn: "6d", })
//         console.log("JWt Token", token)
//         if (admin.hasPlan) { res.json({ success: true, token, adminEmail: admin.email, adminId: admin._id, isOnHold: admin.isOnHold, warningMsg: admin.warningMsg, admin }) }
//         else { res.json({ success: true, token, adminEmail: admin.email, adminId: admin._id, hasPlan: false }) }
//       }
//       else {
//         console.log("Admin ID", admin._id)
//         res.json({ success: false })
//       }
//     } // Check if admin exists and password is correct //
//     if (!admin || !(await bcrypt.compare(password, admin.password))) {
//       return res.status(401).json({ status: "fail", message: "Incorrect email or password", });
//     } // If everything ok, send token to client //
//     createSendToken(admin, 200, res);
//   }
//   catch (error) {
//     console.error("Login error:", error);
//     res.status(500).json({ status: "error", message: "An error occurred during login", });
//   }
// };

// exports.login = async (req, res) => {
//   try {
//     const { email, password } = req.body;

//     if (!email || !password) {
//       return res.status(400).json({ status: "fail", message: "Please provide email and password" });
//     }

//     const admin = await Admin.findOne({ email });

//     if (!admin) {
//       return res.json({ success: false });
//     }

//     if (admin.password !== password) {
//       return res.json({ success: false });
//     }

//     const token = jwt.sign(
//       {
//         id: admin._id,
//         role: "Admin",
//         companyCode: admin.companyCode,
//         firstName: admin.firstName,
//         lastName: admin.lastName,
//       },
//       JWT_SECRET,
//       { expiresIn: "6d" }
//     );

//     if (admin.hasPlan) {
//       return res.json({
//         success: true,
//         token,
//         adminEmail: admin.email,
//         adminId: admin._id,
//         isOnHold: admin.isOnHold,
//         warningMsg: admin.warningMsg,
//         admin
//       });
//     } else {
//       return res.json({
//         success: true,
//         token,
//         adminEmail: admin.email,
//         adminId: admin._id,
//         hasPlan: false
//       });
//     }
//   } catch (error) {
//     console.error("Login error:", error);
//     return res.status(500).json({ status: "error", message: "An error occurred during login" });
//   }
// };

// Optional: Add a controller to get the current user's info
exports.getMe = async (req, res) => {
  try {
    const admin = await Admin.findById(req.admin.id);
    res.status(200).json({
      status: "success",
      data: {
        admin,
      },
    });
  } catch (error) {
    console.error("Get me error:", error);
    res.status(500).json({
      status: "error",
      message: "An error occurred while fetching user data",
    });
  }
};

// Middleware to protect routes
exports.protect = async (req, res, next) => {
  try {
    const token = req.headers["authorization"];
    console.log("Admin Token For Calender ", token);

    if (!token) {
      return res.status(401).json({
        status: "fail",
        message: "You are not logged in. Please log in to get access.",
      });
    }

    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET);
    console.log("Decoded token:", decoded);

    // Check if admin still exists
    const currentAdmin = await Admin.findById(decoded.id);
    console.log("Current admin:", currentAdmin);

    if (!currentAdmin) {
      return res.status(401).json({
        status: "fail",
        message: "The admin belonging to this token no longer exists.",
      });
    }

    // Grant access to protected route
    req.admin = currentAdmin;
    console.log("Admin attached to request:", req.admin);
    next();
  } catch (error) {
    console.error("Auth error:", error);
    res.status(401).json({
      status: "fail",
      message: "Invalid token. Please log in again.",
    });
  }
};

// Logout function to clear the cookie
exports.logout = async (req, res) => {
  res.cookie("jwt", "loggedout", {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true,
  });
  res.status(200).json({ status: "success" });
};

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    const admin = await Admin.findOne({ email });

    if (!admin) {
      return res
        .status(404)
        .json({ success: false, message: "Admin Not Found" });
    }

    const token = crypto.randomBytes(20).toString("hex");

    admin.passwordResetToken = token;
    admin.passwordResetExpires = Date.now() + 3600000;

    await admin.save();

    const resetURL = `${getFrontendUrl()}/reset-password/${token}?userType=admin`;
    const message = `Welcome to Trip Hog!\n\nYou have requested to reset your password. Click on the link below to reset it:\n\n${resetURL}\n\nThis link will expire in 1 hour for security purposes.\n\nIf you did not request this password reset, please ignore this email.\n\nBest regards,\nTrip Hog Team`;

    // Try to send email but don't fail if it doesn't work
    const fromEmail = process.env.GMAIL_EMAIL || "noreply@triphog.com";
    const emailResult = await sendEmailSafely(mailerTransport, {
      from: `Trip Hog <${fromEmail}>`,
      to: admin.email,
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
    console.error("Error in forgotPassword:", e);
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

    const admin = await Admin.findOne({
      passwordResetToken: token,
      passwordResetExpires: { $gt: Date.now() },
    });

    if (!admin) {
      return res
        .status(404)
        .json({ success: false, message: "Admin Not Found" });
    }

    const salt = await bcrypt.genSalt(10);

    const hashedPassword = await bcrypt.hash(password, salt);

    admin.password = hashedPassword;
    admin.passwordResetToken = undefined;
    admin.passwordResetExpires = undefined;

    await admin.save();

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

exports.getUsersForChat = async (req, res) => {
  try {
    const { id: adminId } = req.user;

    // Admins can chat with Super Admins, linked Sub Admins, and their drivers.
    const allSuperAdmins = await SuperAdminModel.find({})
      .select("_id firstName lastName")
      .sort({ createdAt: -1 })
      .lean();

    const linkedUsers = await UserModel.find({ addedBy: String(adminId) })
      .select("_id firstName lastName")
      .sort({ createdAt: -1 })
      .lean();

    const drivers = await DriverModel.find({ addedBy: String(adminId) })
      .select("_id firstName lastName")
      .sort({ createdAt: -1 })
      .lean();

    const patients = await PatientModel.find({ addedBy: String(adminId) })
      .select("_id firstName lastName")
      .sort({ createdAt: -1 })
      .lean();

    const superAdmins = allSuperAdmins.map((a) => ({
      ...a,
      role: "SuperAdmin",
    }));
    const users = linkedUsers.map((a) => ({ ...a, role: "User" }));
    const driversWithRole = drivers.map((d) => ({ ...d, role: "Driver" }));
    const patientsWithRole = patients.map((p) => ({ ...p, role: "Patient" }));

    const allUsersToChat = [
      ...superAdmins,
      ...users,
      ...driversWithRole,
      ...patientsWithRole,
    ];

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

    if (!recipient?._id || !recipient?.role) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid recipient." });
    }

    // Role-based: Admin may message SuperAdmin, linked Sub Admins, or their drivers.
    if (recipient.role === "User") {
      const userDoc = await UserModel.findOne({ _id: recipient._id })
        .select("addedBy")
        .lean();
      if (!userDoc || String(userDoc.addedBy) !== String(senderId)) {
        return res.status(403).json({
          success: false,
          message: "You can only message Sub Admins linked to you.",
        });
      }
    }
    if (recipient.role === "Driver") {
      const driverDoc = await DriverModel.findOne({ _id: recipient._id })
        .select("addedBy")
        .lean();
      if (!driverDoc || String(driverDoc.addedBy) !== String(senderId)) {
        return res.status(403).json({
          success: false,
          message: "You can only message drivers linked to you.",
        });
      }
    }
    if (recipient.role === "Patient") {
      const patientDoc = await PatientModel.findOne({ _id: recipient._id })
        .select("addedBy")
        .lean();
      if (!patientDoc || String(patientDoc.addedBy) !== String(senderId)) {
        return res.status(403).json({
          success: false,
          message: "You can only message patients linked to you.",
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
        (r) => String(r.id) === String(senderId) && r.role === "Admin"
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
          { id: senderId, role: "Admin" },
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
        role: "Admin",
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
    const { id: adminId } = req.user;

    const allConversations = await ChatConversation.aggregate([
      {
        $match: {
          recipients: {
            $elemMatch: {
              id: mongoose.Types.ObjectId.createFromHexString(adminId),
              role: "Admin",
            },
          },
        },
      },
      {
        $addFields: {
          otherRecipient: {
            $first: {
              $filter: {
                input: "$recipients",
                as: "recipient",
                cond: {
                  $ne: [
                    "$$recipient.id",
                    mongoose.Types.ObjectId.createFromHexString(adminId),
                  ],
                },
              },
            },
          },
        },
      },
      {
        $lookup: {
          from: "triphogsuperadmins",
          localField: "otherRecipient.id",
          foreignField: "_id",
          as: "superAdminDetails",
        },
      },
      {
        $lookup: {
          from: "triphogusers",
          localField: "otherRecipient.id",
          foreignField: "_id",
          as: "userDetails",
        },
      },
      {
        $lookup: {
          from: "drivers",
          localField: "otherRecipient.id",
          foreignField: "_id",
          as: "driverDetails",
        },
      },
      {
        $addFields: {
          recipient: {
            $cond: {
              if: { $eq: ["$isGroup", true] },
              then: {
                _id: "$_id",
                firstName: { $ifNull: ["$groupName", "Group"] },
                lastName: "",
                role: "Group",
              },
              else: {
                $cond: {
                  if: { $eq: ["$otherRecipient.role", "SuperAdmin"] },
                  then: { $arrayElemAt: ["$superAdminDetails", 0] },
                  else: {
                    $cond: {
                      if: { $eq: ["$otherRecipient.role", "Driver"] },
                      then: { $arrayElemAt: ["$driverDetails", 0] },
                      else: { $arrayElemAt: ["$userDetails", 0] },
                    },
                  },
                },
              },
            },
          },
        },
      },
      {
        $addFields: {
          "recipient.role": {
            $cond: {
              if: { $eq: ["$isGroup", true] },
              then: "Group",
              else: "$otherRecipient.role",
            },
          },
        },
      },
      {
        $project: {
          _id: 1,
          creatorId: 1,
          creatorRole: 1,
          "recipient._id": 1,
          "recipient.firstName": 1,
          "recipient.lastName": 1,
          "recipient.role": 1,
          latestMessage: 1,
          isGroup: 1,
          groupName: 1,
          createdAt: "$updatedAt",
        },
      },
      {
        $sort: { createdAt: -1 },
      },
    ]);

    const convIds = allConversations.map((c) => c._id);
    const currentUserId = mongoose.Types.ObjectId.createFromHexString(String(adminId));
    const reads = await ConversationRead.find({
      userId: currentUserId,
      userRole: "Admin",
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
    allConversations.forEach((c, i) => {
      c.unreadCount = unreadCounts[i] || 0;
      if (c.isGroup) {
        c.isGroupCreator =
          String(c.creatorRole) === "Admin" &&
          String(c.creatorId) === String(adminId);
      }
    });

    return res.status(200).json({
      success: true,
      message: "Conversations.",
      data: allConversations,
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
    const { id: adminId } = req.user;
    const { groupName, recipients } = req.body;

    if (!groupName || !recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Group name and at least one recipient are required.",
      });
    }

    // Validate all recipients are messageable by this admin (linked users or drivers)
    for (const r of recipients) {
      if (!r.id || !r.role) continue;
      if (r.role === "User") {
        const userDoc = await UserModel.findOne({ _id: r.id }).select("addedBy").lean();
        if (!userDoc || String(userDoc.addedBy) !== String(adminId)) {
          return res.status(403).json({ success: false, message: "Invalid or unlinked user in group." });
        }
      } else if (r.role === "Driver") {
        const driverDoc = await DriverModel.findOne({ _id: r.id }).select("addedBy").lean();
        if (!driverDoc || String(driverDoc.addedBy) !== String(adminId)) {
          return res.status(403).json({ success: false, message: "Invalid or unlinked driver in group." });
        }
      }
      // SuperAdmin: admin can add any (optional to restrict)
    }

    const recipientList = [
      { id: adminId, role: "Admin" },
      ...recipients.map((r) => ({ id: r.id, role: r.role })),
    ];

    const newConversation = new ChatConversation({
      latestMessage: "",
      isGroup: true,
      groupName: groupName.trim(),
      creatorId: adminId,
      creatorRole: "Admin",
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

    const { id: adminId } = req.user;

    const conversation = await ChatConversation.findOneAndDelete({
      _id: conversationId,
      recipients: {
        $elemMatch: { id: adminId, role: "Admin" },
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

// ✅ Add a page to Frequently Visited
exports.addFrequentlyVisitedPage = async (req, res) => {
  try {
    const { adminId, title, path } = req.body;

    if (!adminId || !title || !path) {
      return res.json({
        success: false,
        message: "adminId, title and path required",
      });
    }

    const admin = await Admin.findById(adminId);
    if (!admin) return res.json({ success: false, message: "Admin not found" });

    // Prevent duplicates
    const exists = admin.frequentlyVisitedPages.find((p) => p.path === path);
    if (exists) {
      return res.json({ success: false, message: "Page already added" });
    }

    admin.frequentlyVisitedPages.push({ title, path });
    await admin.save();

    res.json({ success: true, pages: admin.frequentlyVisitedPages });
  } catch (err) {
    console.log(err);
    res.json({ success: false, message: "Server Error" });
  }
};

// ✅ Get all pages
exports.getFrequentlyVisitedPages = async (req, res) => {
  try {
    const { adminId } = req.body;

    if (!adminId)
      return res.json({ success: false, message: "adminId required" });

    const admin = await Admin.findById(adminId);
    if (!admin)
      return res.json({
        success: false,
        pages: [],
        message: "Admin not found",
      });

    res.json({
      success: true,
      pages: admin.frequentlyVisitedPages || [],
    });
  } catch (err) {
    res.json({ success: false, message: "Server error" });
  }
};

// ✅ Remove page
exports.removeFrequentlyVisitedPage = async (req, res) => {
  try {
    const { adminId, pageUrl } = req.body;

    if (!adminId || !pageUrl) {
      return res.json({
        success: false,
        message: "adminId and pageUrl required",
      });
    }

    const admin = await Admin.findById(adminId);
    if (!admin) return res.json({ success: false, message: "Admin not found" });

    admin.frequentlyVisitedPages = admin.frequentlyVisitedPages.filter(
      (p) => p.path !== pageUrl
    );

    await admin.save();

    res.json({
      success: true,
      message: "Removed",
      pages: admin.frequentlyVisitedPages,
    });
  } catch (err) {
    res.json({ success: false, message: "Server error" });
  }
};

// ✅ Get Custom Quick Tabs
exports.getCustomQuickTabs = async (req, res) => {
  try {
    const { adminId } = req.body;

    if (!adminId) {
      return res.json({ success: false, message: "adminId required" });
    }

    const admin = await Admin.findById(adminId);
    if (!admin) {
      return res.json({ success: false, message: "Admin not found" });
    }

    res.json({
      success: true,
      quickTabs: admin.customQuickTabs || []
    });
  } catch (err) {
    console.log(err);
    res.json({ success: false, message: "Server error" });
  }
};

// ✅ Update Custom Quick Tabs
exports.updateCustomQuickTabs = async (req, res) => {
  try {
    const { adminId, quickTabs } = req.body;

    if (!adminId || !Array.isArray(quickTabs)) {
      return res.json({
        success: false,
        message: "adminId and quickTabs array required",
      });
    }

    // Validate that we have exactly 3 tabs
    if (quickTabs.length !== 3) {
      return res.json({
        success: false,
        message: "Exactly 3 quick tabs are required",
      });
    }

    // Validate each tab has required fields
    for (const tab of quickTabs) {
      if (!tab.title || !tab.path || !tab.icon) {
        return res.json({
          success: false,
          message: "Each tab must have title, path, and icon",
        });
      }
    }

    const admin = await Admin.findById(adminId);
    if (!admin) {
      return res.json({ success: false, message: "Admin not found" });
    }

    admin.customQuickTabs = quickTabs;
    await admin.save();

    res.json({
      success: true,
      message: "Quick tabs updated successfully",
      quickTabs: admin.customQuickTabs,
    });
  } catch (err) {
    console.log(err);
    res.json({ success: false, message: "Server error" });
  }
};

// Test endpoint to check email configuration
exports.testEmail = async (req, res) => {
  try {
    const transport = createEmailTransporter();
    
    // Test connection first
    await transport.verify();
    console.log('✅ Gmail connection verified');
    
    // Send test email
    const emailResult = await sendEmailSafely(transport, {
      from: process.env.GMAIL_EMAIL || "noreply@triphog.com",
      to: process.env.GMAIL_EMAIL || "noreply@triphog.com",
      subject: "Test Email - Trip Hog Server",
      text: "This is a test email to verify Gmail SMTP configuration.",
      html: "<p>This is a test email to verify Gmail SMTP configuration.</p>"
    });
    
    if (emailResult.success) {
      res.json({
        success: true,
        message: "Email configuration is working correctly",
        messageId: emailResult.messageId
      });
    } else {
      res.json({
        success: false,
        message: "Email sending failed",
        error: emailResult.error
      });
    }
  } catch (error) {
    console.error('❌ Email test failed:', error);
    res.json({
      success: false,
      message: "Email configuration test failed",
      error: error.message
    });
  }
};