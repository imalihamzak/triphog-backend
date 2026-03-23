const PatientModel = require('../models/PatientModel')
const TripModel = require('../models/TripModel')
const Admin = require("../models/adminSchema");
const DriverModel = require("../models/DriverModel");
const SuperAdminModel = require("../models/SuperAdminModel");
const nodemailer = require('nodemailer')
const { createEmailTransporter, sendEmailSafely } = require("../utils/emailConfig");
const bcrypt = require('bcryptjs')
const crypto = require('crypto')
const fs = require('fs');
const path = require('path');
const { DateTime } = require("luxon");
const JWT_SECRET = require("../config/jwtSecret");
const jwt = require("jsonwebtoken");
const moment = require("moment");
const { default: mongoose } = require("mongoose");
const { getFrontendUrl, getUploadsBaseUrl } = require("../config/appUrls");
const ChatConversation = require("../models/ChatConversation");
const ChatMessage = require("../models/ChatMessage");

const buildUploadsUrl = (file) => {
  if (!file) return "";
  const raw = file.filename || (file.path ? path.basename(file.path) : "") || "";
  const filename = String(raw).trim();
  if (!filename) return "";
  return `${getUploadsBaseUrl()}/uploads/${encodeURIComponent(filename)}`;
};
exports.deleteSelected = async (req, res) => {
  try {
    await PatientModel.deleteMany({
      _id: { $in: req.body.selectedPatientsIds },
    });
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false });
  }
};
exports.forgotPassword = async (req, res) => {
  let EMailAddress = req.body.EMailAddress;
  console.log("Forgot Password Implementation");
  try {
    let patient = await PatientModel.findOne({ EMailAddress: EMailAddress });
    console.log("Patient", patient);
    if (!patient) {
      res.json({ success: false, message: "Patient Not Found" });
    } else {
      const transport = createEmailTransporter();
      const token = crypto.randomBytes(20).toString("hex");

      patient.passwordResetToken = token;
      patient.passwordResetExpires = Date.now() + 3600000; // 1 hour expiry

      await patient.save(); //updating patient token and expire time

      const resetURL = `${getFrontendUrl()}/patient/reset-password/${token}`;
      const message = `Welcome to Trip Hog!\n\nYou have requested to reset your password. Click on the link below to reset it:\n\n${resetURL}\n\nThis link will expire in 1 hour for security purposes.\n\nIf you did not request this password reset, please ignore this email.\n\nBest regards,\nTrip Hog Team`;
      const fromEmail = process.env.GMAIL_EMAIL || "noreply@triphog.com";
      await sendEmailSafely(transport, {
        from: `Trip Hog <${fromEmail}>`,
        to: patient.EMailAddress,
        subject: "Reset Your Patient Password",
        text: message,
      });
      res.json({ success: true });
    }
  } catch (e) {
    console.error("Error creating patient:", e);
    if (e.code === 11000 && e.keyPattern && e.keyPattern.EMailAddress) {
      return res.status(400).json({
        success: false,
        message: "A patient with this email address already exists. Please use a different email or update the existing patient.",
      });
    }
    res.status(500).json({
      success: false,
      message: "Failed to create patient. Please try again or contact support if the issue continues.",
    });
  }
};
exports.resetPassword = async (req, res) => {
  console.log("Reseting PassWord");
  try {
    const patient = await PatientModel.findOne({
      passwordResetToken: req.params.token,
      passwordResetExpires: { $gt: Date.now() }, // Check expiry
    });
    console.log("Patient", patient);

    if (!patient) {
      return res.json({ success: false, message: "Invalid or expired reset token" });
    }
    console.log("password to set", req.body.password);
    const salt = await bcrypt.genSalt(10);
    console.log("Patient Updated Encrypted PassWord");
    const hashedPassword = await bcrypt.hash(req.body.password, salt);
    patient.password = hashedPassword;
    patient.passwordResetToken = undefined;
    patient.passwordResetExpires = undefined;

    await patient.save();

    res.json({ success: true });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
};
exports.getStatistics = async (req, res) => {
  try {
    let trips = await TripModel.find({ patientRef: req.patientId });
    let cancelledTrips = trips.filter((trip) => {
      return trip.status == "Cancelled";
    });
    let completedTrips = trips.filter((trip) => {
      return trip.status == "Completed";
    });
    console.log("My Trips", trips);
    console.log("Completed Trips", completedTrips);
    let completionRate = (completedTrips.length * 100) / trips.length;
    res.json({
      success: true,
      totalTrips: trips.length,
      cancelledTrips: cancelledTrips.length,
      completionRate,
    });
  } catch (e) {
    res.json({ success: false });
  }
};
exports.getPatientsByDate = async (req, res) => {
  let date = req.params.date;
  try {
    const limit = parseInt(req.query.limit) || 25; // Number of records per page, default to 25
    const page = parseInt(req.query.page) || 1; // Page number, default to 1

    // Set the start and end of the day based on the date provided
    const startOfDay = new Date(date);
    startOfDay.setUTCHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setUTCHours(23, 59, 59, 999);

    // Find patients created on the given date, filter by the logged-in user
    let patients = await PatientModel.find({
      createdAt: {
        $gte: startOfDay,
        $lte: endOfDay,
      },
      addedBy: req.userId,
    })
      .limit(limit) // Limit the number of patients per page
      .skip((page - 1) * limit); // Skip patients based on the page number

    // Count the total number of patients matching the query without pagination
    const totalPatients = await PatientModel.countDocuments({
      createdAt: {
        $gte: startOfDay,
        $lte: endOfDay,
      },
      addedBy: req.userId,
    });

    const totalPages = Math.ceil(totalPatients / limit); // Calculate total pages

    // Return response with pagination info
    res.json({
      success: true,
      patients, // Patients for the current page
      totalPatients, // Total patients count matching the query
      totalPages, // Total number of pages
      currentPage: page, // Current page number
    });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
};
exports.getFilteredPatients = async (req, res) => {
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
    let filteredPatients = await PatientModel.find({
      createdAt: { $gte: startDate, $lte: endDate },
    });
    filteredPatients = filteredPatients.filter((patient) => {
      return patient.addedBy == req.userId;
    });
    res.json(filteredPatients);
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
};
exports.changePassword = async (req, res) => {
  const { oldPassword, EMailAddress, newPassword } = req.body;
  console.log("Changing Patient Password");
  console.log(req.body);
  try {
    let patient = await PatientModel.findOne({ EMailAddress });
    console.log("Patient Found", patient);
    if (!patient) {
      res.json({ success: false, message: "Not Found!" });
    } else {
      let isMatched = await bcrypt.compare(oldPassword, patient.password);
      if (isMatched) {
        console.log("Has Matched Patient Password");
        let salt = await bcrypt.genSalt(10);
        let hashedPassword = await bcrypt.hash(newPassword, salt);
        patient.password = hashedPassword;
        await patient.save();
        res.json({ success: true });
      } else {
        res.json({ success: false, message: "InCorrect Old Password" });
      }
    }
  } catch (e) {
    res.json({ success: false });
  }
};
exports.getMyTrips = async (req, res) => {
  try {
    let allTrips = await TripModel.find();
    let MyTrips = allTrips.filter((trip) => {
      return trip.patientRef == req.patientId;
    });
    console.log(allTrips);
    res.json({ success: true, MyTrips });
  } catch (e) {
    res.json({ success: false });
  }
};
exports.login = async (req, res) => {
  try {
    let patients = await PatientModel.find();
    console.log("All Patients", patients);
    let patient = await PatientModel.findOne({
      EMailAddress: req.body.EMailAddress,
    });
    console.log("Patient Found!", patient);
    console.log(req.body);
    if (!patient) {
      res.json({ success: false, message: "Patient Not Found!" });
    } else {
      // Block inactive patients from logging in (only "active" allowed)
      const rawStatus = patient.status;
      const normalizedStatus = rawStatus
        ? String(rawStatus).toLowerCase().trim().replace(/\s+/g, "")
        : "";
      if (normalizedStatus !== "active") {
        return res.status(403).json({
          success: false,
          message:
            "Your account is inactive. Please contact your administrator to activate your account.",
        });
      }

      let isMatched = await bcrypt.compare(req.body.password, patient.password);
      console.log("Matching Password", isMatched);
      const admin = await Admin.findOne({
        companyCode: patient.companyCode ? patient.companyCode : "CompanyCode",
      });
      if (isMatched) {
        const admin = await Admin.findOne({ companyCode: patient.companyCode });
        const token = jwt.sign(
          {
            id: patient._id,
            role: "Patient",
            admin: admin
              ? admin
              : { _id: "AdminId", firstName: "Wahab", lastName: "Mazhar" },
          },
          JWT_SECRET,
          {
            expiresIn: "6d",
          }
        );
        res.json({
          success: true,
          patient,
          token,
          admin: admin
            ? admin
            : { _id: "AdminId", firstName: "Wahab", lastName: "Mazhar" },
        });
      } else {
        res.json({ success: false, message: "Incorrect Password" });
      }
    }
  } catch (e) {
    res.json({ success: false });
  }
};
exports.signUp = async (req, res) => {
  const allAdmins = await Admin.find();
  const {
    firstName,
    lastName,
    EMailAddress,
    phoneNumber,
    location,
    password,
    companyCode,
    gender,
    age,
  } = req.body;
  let foundAdmins = allAdmins.filter((admin) => {
    return admin.companyCode == companyCode;
  });
  console.log("Sign up  for patient");
  console.log("file Path", req.files);
  let profilePhotoUrl = "";
  let signatureUrl =
    req.files && req.files.signature
      ? buildUploadsUrl(req.files.signature[0])
      : "https://tse2.mm.bing.net/th?id=OIP.NFarNt0hAOdooIWgaScQ2QHaHa&pid=Api&P=0&h=220";
  if (req.files && req.files.profilePhoto) {
    profilePhotoUrl =
      buildUploadsUrl(req.files.profilePhoto[0]);
  } else {
    profilePhotoUrl =
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR6THPf2g9_WpHppDKnduSodFwztd-apK7DxA&s";
  }

  console.log(signatureUrl);
  console.log(profilePhotoUrl);

  console.log("Found Admins", foundAdmins);

  console.log("Patient Data For Sign UP", req.body);

  // Validate input (you might want to add more validation)
  if (!firstName || !lastName || !EMailAddress || !password) {
    console.log("Error While Adding Patient");
    return res.status(400).json({ error: "All fields are required" });
  }

  try {
    // Check if user already exists
    const existingPatient = await PatientModel.findOne({ EMailAddress });
    if (existingPatient) {
      return res.status(400).json({ error: "Email already in use" });
    }
    let salt = await bcrypt.genSalt(10);

    // Encrypt the password
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create new patient
    const newPatient = new PatientModel({
      firstName,
      lastName,
      EMailAddress,
      phoneNumber: phoneNumber ? phoneNumber : "",
      location: location ? location : "",
      password: hashedPassword,
      companyCode: companyCode ? companyCode : "",
      gender,
      age,
      signatureUrl,
      profilePhotoUrl,
    });

    // Save the patient to the database
    await newPatient.save();

    res
      .status(201)
      .json({ message: "Patient registered successfully", newPatient });
  } catch (error) {
    console.error("Error registering patient:", error);
    res.status(500).json({ error: "Server error", message: error.message });
  }
};
exports.addPatient = async (req, res) => {
  console.log(req.body);
  let admin = await Admin.findOne({ _id: req.userId });
  console.log("Admin", admin);
  try {
    req.body.addedBy = req.userId;
    if (req.files) {
      if (req.files.profilePhoto) {
        req.body.profilePhotoUrl =
          buildUploadsUrl(req.files.profilePhoto[0]);
      } else {
        req.body.profilePhotoUrl =
          "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR6THPf2g9_WpHppDKnduSodFwztd-apK7DxA&s";
      }
      if (req.files.signature) {
        req.body.signatureUrl =
          buildUploadsUrl(req.files.signature[0]);
      }
    }
    req.body.companyCode = admin.companyCode;
    console.log("Patient Body", req.body);

    let patient = new PatientModel(req.body);
    console.log(patient);
    let token = Math.random().toString() + req.body.EMailAddress;
    patient.token = token;

    let passwordCreationLink = `${getFrontendUrl()}/patient/createpassword/${token}`;

    console.log("Password Creation For Patient");

    function replacePlaceholders(template, data) {
      let result = template;
      for (const key in data) {
        result = result.replace(new RegExp(`{{${key}}}`, "g"), data[key]);
      }
      return result;
    }

    // Create a transport
    const transporter = createEmailTransporter();

    // Function to send the email
    async function sendEmail(to, subject, data) {
      // Read the HTML template
      const templatePath = path.join(__dirname, "../templates/template.html");
      const template = fs.readFileSync(templatePath, "utf8");

      // Replace placeholders in the template with actual data
      const htmlContent = replacePlaceholders(template, data);

      // Set up email options
      const fromEmail = process.env.GMAIL_EMAIL || "noreply@triphog.com";
      const mailOptions = {
        from: `Trip Hog <${fromEmail}>`,
        to: to,
        subject: subject,
        html: htmlContent,
      };

      // Send the email
      return await sendEmailSafely(transporter, mailOptions);
    }

    // Save patient first (before sending email)
    await patient.save();
    
    // Send email asynchronously (don't block patient creation if email fails)
    const recipientEmail = patient.EMailAddress;
    const emailSubject = "Welcome to Trip Hog!";
    const emailData = {
      name: patient.firstName + " " + patient.lastName,
      passwordCreationLink: passwordCreationLink,
    };

    sendEmail(recipientEmail, emailSubject, emailData).then((result) => {
      if (result && result.success) {
        console.log("✅ Password creation email sent to:", recipientEmail);
      } else {
        console.error("❌ Failed to send password creation email to:", recipientEmail);
        console.error("⚠️ Patient created but email failed. Password link:", passwordCreationLink);
      }
    }).catch((error) => {
      console.error("❌ Error sending email:", error);
      console.error("⚠️ Patient created but email failed. Password link:", passwordCreationLink);
    });
    
    // Return success even if email fails (patient is created)
    res.json({ success: true, patient, message: "Patient created successfully. Password creation email sent." });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
};
exports.createPassword = async (req, res) => {
  try {
    const { password, confirmPassword } = req.body;
    console.log("Patient createPassword payload received");

    if (!password || typeof password !== "string") {
      return res.json({
        success: false,
        message: "Password is required.",
      });
    }

    if (confirmPassword && password !== confirmPassword) {
      return res.json({
        success: false,
        message: "Passwords do not match.",
      });
    }

    const rawToken = req.params.token;
    if (!rawToken) {
      return res.json({
        success: false,
        message: "Invalid or missing token.",
      });
    }

    const token = String(rawToken).trim();
    const patient = await PatientModel.findOne({ token });
    console.log("Patient for createPassword:", !!patient);

    if (!patient) {
      return res.json({
        success: false,
        notFound: true,
        message: "This password link is invalid or has already been used.",
      });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    patient.password = hashedPassword;
    patient.status = "active";
    // Invalidate token so link cannot be reused
    patient.token = "_sd__sdfd_0%34@_3454545";
    await patient.save();

    const admin = await Admin.findOne({ companyCode: patient.companyCode });
    const jwtToken = jwt.sign(
      {
        id: patient._id,
        role: "Patient",
        admin: admin
          ? admin
          : { _id: "AdminId", firstName: "Wahab", lastName: "Mazhar" },
      },
      JWT_SECRET,
      { expiresIn: "6d" }
    );

    return res.json({
      success: true,
      token: jwtToken,
      message: "Password created successfully.",
    });
  } catch (error) {
    console.error("Patient createPassword error:", error.message);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to create password.",
    });
  }
};
exports.getPatients = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 25; // Number of records per page, default to 25
    const page = parseInt(req.query.page) || 1; // Page number, default to 1
    const filter = req.query.filter || "all time"; // Filter, default to "all time"
    const timezone = req.query.timezone || "UTC";

    // Find the current admin based on the logged-in user ID
    let admin = await Admin.findOne({ _id: req.userId });
    if (Object.keys(req.query).length == 0) {
      let patients = await PatientModel.find({
        $or: [
          { addedBy: req.userId }, // Filter by patients added by the current user
          { companyCode: admin.companyCode }, // Filter by companyCode
        ],
      });
      res.json({ success: true, patients });
    } else {
      // Date filtering logic
      let dateFilter = {}; // Default to an empty object, no date filter for "all time"

      if (filter !== "all") {
        const now = DateTime.now().setZone(timezone);

        switch (filter) {
          case "today":
            dateFilter.createdAt = {
              $gte: now.startOf("day").toUTC().toJSDate(),
              $lte: now.endOf("day").toUTC().toJSDate(),
            };
            break;

          case "weekly":
            dateFilter.createdAt = {
              $gte: now.startOf("week").toUTC().toJSDate(),
              $lte: now.endOf("week").toUTC().toJSDate(),
            };
            break;

          case "monthly":
            dateFilter.createdAt = {
              $gte: now.startOf("month").toUTC().toJSDate(),
              $lte: now.endOf("month").toUTC().toJSDate(),
            };
            break;

          case "all time":
            // No date filter needed
            break;

          default:
            return res.status(400).json({
              success: false,
              message:
                "Invalid filter type. Use 'today', 'weekly', 'monthly', or 'all time'",
            });
        }
      }

      // Fetch patients, apply filters for user/companyCode and the createdAt date filter
      let patients = await PatientModel.find({
        $and: [
          {
            $or: [
              { addedBy: req.userId }, // Filter by patients added by the current user
              { companyCode: admin.companyCode }, // Filter by companyCode
            ],
          },
          dateFilter, // Apply the date filter based on the selected filter
        ],
      })
        .limit(limit) // Limit the number of results based on the page size
        .skip((page - 1) * limit); // Skip the records according to the page

      // Count the total number of patients that match the filter, without pagination
      const totalPatients = await PatientModel.countDocuments({
        $and: [
          {
            $or: [
              { addedBy: req.userId }, // Filter by patients added by the current user
              { companyCode: admin.companyCode }, // Filter by companyCode
            ],
          },
          dateFilter, // Apply the date filter for total count
        ],
      });

      const totalPages = Math.ceil(totalPatients / limit); // Calculate total pages

      // Return the response with the patients and pagination details
      res.json({
        success: true,
        patients, // Patients for the current page
        currentPage: page, // Current page number
        totalPatients, // Total number of patients that match the filters
        totalPages, // Total number of pages based on the limit
      });
    }
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
};
exports.resendWelcomeEmail = async (req, res) => {
  try {
    const patient = await PatientModel.findById(req.params.Id);
    if (!patient) {
      return res.json({ success: false, message: "Patient not found." });
    }
    if (!patient.EMailAddress) {
      return res.json({ success: false, message: "Patient has no email address." });
    }
    const token = Math.random().toString() + patient.EMailAddress;
    patient.token = token;
    await patient.save();

    const passwordCreationLink = `${getFrontendUrl()}/patient/createpassword/${token}`;
    function replacePlaceholders(template, data) {
      let result = template;
      for (const key in data) {
        result = result.replace(new RegExp(`{{${key}}}`, "g"), data[key]);
      }
      return result;
    }
    const transporter = createEmailTransporter();
    const templatePath = path.join(__dirname, "../templates/template.html");
    const template = fs.readFileSync(templatePath, "utf8");
    const emailData = {
      name: (patient.firstName || "") + " " + (patient.lastName || ""),
      passwordCreationLink,
    };
    const htmlContent = replacePlaceholders(template, emailData);
    const fromEmail = process.env.GMAIL_EMAIL || "noreply@triphog.com";
    const result = await sendEmailSafely(transporter, {
      from: `Trip Hog <${fromEmail}>`,
      to: patient.EMailAddress,
      subject: "Welcome to Trip Hog!",
      html: htmlContent,
    });
    if (result.success) {
      return res.json({ success: true, message: "Welcome email sent successfully." });
    }
    return res.json({ success: false, message: result.error || "Failed to send email." });
  } catch (e) {
    console.error("Resend welcome email (patient) error:", e.message);
    res.json({ success: false, message: e.message });
  }
};

exports.getPatient = async (req, res) => {
  try {
    let patient = await PatientModel.findById(req.params.Id);
    res.json({ success: true, patient });
  } catch (e) {
    res.json({ success: false });
  }
};
exports.updatePatient = async (req, res) => {
  try {
    if (req.files) {
      if (req.files.signature) {
        req.body.signatureUrl =
          buildUploadsUrl(req.files.signature[0]);
      }
      if (req.files.profilePhoto) {
        req.body.profilePhotoUrl =
          buildUploadsUrl(req.files.profilePhoto[0]);
      }
    }
    // Company code is immutable — never allow it to be changed on update
    const updateBody = { ...req.body };
    delete updateBody.companyCode;

    const updatedPatient = await PatientModel.findByIdAndUpdate(
      req.params.Id,
      updateBody,
      { new: true, runValidators: true }
    );

    res.json({ success: true, updatedPatient });
  } catch (error) {
    res.json({ success: false });
  }
};

// ---------- Chat APIs for Patients ----------

// Patients can chat with:
// - Their Admin
// - Drivers from their trips
// - SuperAdmins
exports.getUsersForChat = async (req, res) => {
  try {
    const { id: patientId } = req.user;
    if (!patientId) {
      return res.status(200).json({
        success: true,
        message: "All Users for chat",
        data: [],
      });
    }

    const patientDoc = await PatientModel.findById(patientId)
      .select("addedBy companyCode")
      .lean();
    if (!patientDoc) {
      return res.status(200).json({
        success: true,
        message: "All Users for chat",
        data: [],
      });
    }

    const admin = patientDoc.addedBy
      ? await Admin.findById(patientDoc.addedBy)
          .select("_id firstName lastName")
          .lean()
      : await Admin.findOne({ companyCode: patientDoc.companyCode })
          .select("_id firstName lastName")
          .lean();

    const trips = await TripModel.find({ patientRef: patientId })
      .select("driverRef")
      .lean();
    const driverIds = [
      ...new Set(
        trips
          .map((t) => (t.driverRef ? String(t.driverRef) : null))
          .filter(Boolean)
      ),
    ];

    const drivers = driverIds.length
      ? await DriverModel.find({ _id: { $in: driverIds } })
          .select("_id firstName lastName")
          .sort({ firstName: 1 })
          .lean()
      : [];

    const superAdmins = await SuperAdminModel.find({})
      .select("_id firstName lastName")
      .sort({ createdAt: -1 })
      .lean();

    const result = [];
    if (admin) result.push({ ...admin, role: "Admin" });
    result.push(...drivers.map((d) => ({ ...d, role: "Driver" })));
    result.push(
      ...superAdmins.map((s) => ({ ...s, role: "SuperAdmin" }))
    );

    return res.status(200).json({
      success: true,
      message: "All Users for chat",
      data: result,
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
      return res
        .status(400)
        .json({ success: false, message: "Invalid recipient." });
    }

    // For new 1:1 conversations we need recipient._id
    if (!conversationId && recipient.role !== "Group" && !recipient._id) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid recipient." });
    }

    const patientDoc = await PatientModel.findById(senderId)
      .select("addedBy companyCode")
      .lean();
    const companyCode = patientDoc?.companyCode;

    // Patients can message their Admin, drivers from their trips, SuperAdmins,
    // and can send messages inside group conversations they are part of.
    if (recipient.role === "Group") {
      // For groups we only validate membership against the conversation below.
    } else if (recipient.role === "Admin") {
      const adminDoc = await Admin.findById(recipient._id)
        .select("companyCode")
        .lean();
      if (!adminDoc || adminDoc.companyCode !== companyCode) {
        return res.status(403).json({
          success: false,
          message: "You can only message your own Admin.",
        });
      }
    } else if (recipient.role === "Driver") {
      const tripExists = await TripModel.exists({
        driverRef: recipient._id,
        patientRef: senderId,
      });
      if (!tripExists) {
        return res.status(403).json({
          success: false,
          message: "You can only message drivers you have trips with.",
        });
      }
    } else if (recipient.role === "SuperAdmin") {
      // Always allowed; no additional checks.
    } else {
      return res.status(403).json({
        success: false,
        message: "Patients can only message Admins, Drivers, SuperAdmins, or groups they are in.",
      });
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
        (r) => String(r.id) === String(senderId) && r.role === "Patient"
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
          { id: senderId, role: "Patient" },
          { id: recipient._id, role: recipient.role },
        ],
      });
      await newConversation.save();
      convId = newConversation._id;
    }

    const newMessage = new ChatMessage({
      content,
      conversationId: convId,
      sender: { id: senderId, role: "Patient" },
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

exports.createGroup = async (req, res) => {
  try {
    const { id: patientId } = req.user;
    const { groupName, recipients } = req.body;

    if (!patientId) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized.",
      });
    }

    if (!groupName || !recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Group name and at least one recipient are required.",
      });
    }

    const patientDoc = await PatientModel.findById(patientId)
      .select("companyCode")
      .lean();
    if (!patientDoc) {
      return res.status(403).json({
        success: false,
        message: "Patient not found.",
      });
    }

    const companyCode = patientDoc.companyCode;

    // Validate all recipients are messageable by this patient
    for (const r of recipients) {
      if (!r.id || !r.role) continue;

      if (r.role === "Admin") {
        const adminDoc = await Admin.findById(r.id).select("companyCode").lean();
        if (!adminDoc || adminDoc.companyCode !== companyCode) {
          return res.status(403).json({
            success: false,
            message: "Invalid or unlinked admin in group.",
          });
        }
      } else if (r.role === "Driver") {
        const tripExists = await TripModel.exists({
          driverRef: r.id,
          patientRef: patientId,
        });
        if (!tripExists) {
          return res.status(403).json({
            success: false,
            message: "Invalid or unlinked driver in group.",
          });
        }
      } else if (r.role === "SuperAdmin") {
        // Always allowed
      } else if (r.role === "Patient") {
        // Only allow self (we will add patient automatically below)
        if (String(r.id) !== String(patientId)) {
          return res.status(403).json({
            success: false,
            message: "Patients cannot add other patients to groups.",
          });
        }
      } else {
        return res.status(403).json({
          success: false,
          message: "Invalid recipient role for group.",
        });
      }
    }

    const recipientList = [
      { id: patientId, role: "Patient" },
      ...recipients.map((r) => ({ id: r.id, role: r.role })),
    ];

    const newConversation = new ChatConversation({
      latestMessage: "",
      isGroup: true,
      groupName: groupName.trim(),
      creatorId: patientId,
      creatorRole: "Patient",
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

exports.getConversations = async (req, res) => {
  try {
    const { id: patientId } = req.user;
    if (!patientId) {
      return res.status(200).json({
        success: true,
        message: "Conversations.",
        data: [],
      });
    }

    const patientObjId = mongoose.Types.ObjectId.createFromHexString(
      String(patientId)
    );

    const rawConversations = await ChatConversation.find({
      recipients: { $elemMatch: { role: "Patient", id: patientObjId } },
    })
      .sort({ updatedAt: -1 })
      .lean();

    const filtered = [];
    for (const c of rawConversations) {
      const recipients = c.recipients || [];
      const isCurrentUser = (r) =>
        r.role === "Patient" &&
        (String(r.id) === String(patientId) ||
          String(r.id) === patientObjId.toString());
      const other = recipients.find((r) => !isCurrentUser(r));
      if (!other) continue;

      if (c.isGroup) {
        const isCreator =
          String(c.creatorRole) === "Patient" &&
          String(c.creatorId) === String(patientId);
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

      const otherIdStr = String(other.id);
      if (other.role === "Admin") {
        const adminDoc = await Admin.findById(other.id)
          .select("_id firstName lastName")
          .lean();
        filtered.push({
          _id: c._id,
          recipient: adminDoc
            ? {
                _id: adminDoc._id,
                firstName: adminDoc.firstName,
                lastName: adminDoc.lastName || "",
                role: "Admin",
              }
            : {
                _id: other.id,
                firstName: "Admin",
                lastName: "",
                role: "Admin",
              },
          latestMessage: c.latestMessage || "",
          isGroup: false,
          groupName: "",
          createdAt: c.updatedAt,
        });
        continue;
      }
      if (other.role === "Driver") {
        const driverDoc = await DriverModel.findById(other.id)
          .select("_id firstName lastName")
          .lean();
        if (driverDoc) {
          filtered.push({
            _id: c._id,
            recipient: {
              _id: driverDoc._id,
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
        continue;
      }
      if (other.role === "SuperAdmin") {
        const saDoc = await SuperAdminModel.findById(other.id)
          .select("_id firstName lastName")
          .lean();
        if (saDoc) {
          filtered.push({
            _id: c._id,
            recipient: {
              _id: saDoc._id,
              firstName: saDoc.firstName,
              lastName: saDoc.lastName || "",
              role: "SuperAdmin",
            },
            latestMessage: c.latestMessage || "",
            isGroup: false,
            groupName: "",
            createdAt: c.updatedAt,
          });
        }
        continue;
      }
    }

    return res.status(200).json({
      success: true,
      message: "Conversations.",
      data: filtered,
    });
  } catch (err) {
    console.log(err);
    return res.status(500).json({
      success: false,
      message: err.message ?? "Error fetching conversations.",
    });
  }
};
exports.deletePatient = async (req, res) => {
  console.log("Deleting Patient By id");
  try {
    await PatientModel.findByIdAndDelete(req.params.Id);
    res.json({ success: true });
  } catch (error) {
    res.json({ success: false });
  }
};

exports.getPatientStats = async (req, res) => {
  try {
    const { timezone = "UTC" } = req.query;
    const userId = req.userId; // From auth middleware

    // Validate timezone
    if (!Intl.supportedValuesOf("timeZone").includes(timezone)) {
      return res.status(400).json({
        success: false,
        message: "Invalid timezone provided",
      });
    }

    // Get today's date range in the specified timezone
    const now = new Date();
    const todayStart = new Date(
      now.toLocaleString("en-US", { timeZone: timezone })
    );
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date(todayStart);
    todayEnd.setHours(23, 59, 59, 999);

    // Convert to UTC for database query
    const utcTodayStart = new Date(todayStart.toISOString());
    const utcTodayEnd = new Date(todayEnd.toISOString());

    // Get all counts in parallel
    const [
      totalPatients,
      repeatedPatients,
      todaysBookings,
      todaysCancellations,
      patientsWithPortalAccess,
    ] = await Promise.all([
      // Total patients count (only for this user, no time filter)
      PatientModel.countDocuments({ addedBy: userId }),

      // Repeated patients (only for this user, no time filter)
      PatientModel.aggregate([
        {
          $match: { addedBy: userId },
        },
        {
          $lookup: {
            from: "trips",
            localField: "_id",
            foreignField: "patientRef",
            as: "trips",
          },
        },
        {
          $match: {
            "trips.1": { $exists: true }, // At least 2 trips
            "trips.addedBy": userId, // Ensure trips belong to this user
          },
        },
        { $count: "count" },
      ]),

      // Today's bookings (time-based)
      TripModel.countDocuments({
        addedBy: userId,
        createdAt: { $gte: utcTodayStart, $lte: utcTodayEnd },
        status: { $nin: ["Cancelled"] },
      }),

      // Today's cancellations (time-based)
      TripModel.countDocuments({
        addedBy: userId,
        createdAt: { $gte: utcTodayStart, $lte: utcTodayEnd },
        status: "Cancelled",
      }),
      // Patients with portal access (have a password set)
      PatientModel.countDocuments({
        addedBy: userId,
        password: { $exists: true, $ne: null },
      }),
    ]);

    res.json({
      success: true,
      stats: {
        totalPatients,
        repeatedPatients: repeatedPatients[0]?.count || 0,
        todaysBookings,
        todaysCancellations,
        patientsWithPortalAccess,
        timezoneUsed: timezone,
        dateRange: {
          start: todayStart.toISOString(),
          end: todayEnd.toISOString(),
        },
      },
    });
  } catch (e) {
    res.status(500).json({
      success: false,
      message: e.message,
    });
  }
};

exports.bulkUploadPatients = async (req, res) => {
  try {
    const userId = req.userId;
    const admin = await Admin.findById(userId);
    if (!req.file) {
      return res.status(400).json({ success: false, message: "CSV file is required." });
    }

    const csvContent = fs.readFileSync(req.file.path, "utf8");
    const lines = csvContent.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length <= 1) {
      return res.status(400).json({ success: false, message: "CSV file is empty." });
    }

    const rawHeader = lines[0].split(",").map((h) => h.trim());
    const normalizeHeader = (value) =>
      value
        .replace(/^\uFEFF/, "") // Handle BOM on first header cell
        .replace(/\s+/g, "") // Remove spaces (e.g., "First Name" -> "Firstname")
        .replace(/_/g, "") // Remove underscores
        .replace(/-/g, "") // Remove dashes
        .toLowerCase();

    // Support both header formats:
    // - firstName / lastName / phoneNumber / EmailAddress (no spaces)
    // - First Name / Last Name / Phone Number / Email Address (with spaces)
    const headerIndex = {};
    for (let idx = 0; idx < rawHeader.length; idx++) {
      const normalized = normalizeHeader(rawHeader[idx]);
      if (normalized) headerIndex[normalized] = idx;
    }

    const REQUIRED = [
      { aliases: ["firstname"], display: "First Name" },
      { aliases: ["lastname"], display: "Last Name" },
      { aliases: ["emailaddress", "email"], display: "Email Address" },
      { aliases: ["phonenumber"], display: "Phone Number" },
      { aliases: ["location"], display: "Location" },
      { aliases: ["age"], display: "Age" },
      { aliases: ["gender"], display: "Gender" },
      { aliases: ["emergencycontactname"], display: "Emergency Contact Name" },
      {
        aliases: ["emergencycontactnumber"],
        display: "Emergency Contact Number",
      },
      { aliases: ["notes"], display: "Notes" },
    ];

    const missingList = [];
    for (const reqHeader of REQUIRED) {
      const present = reqHeader.aliases.some((a) => headerIndex[a] !== undefined);
      if (!present) missingList.push(reqHeader.display);
    }

    if (missingList.length) {
      return res.status(400).json({
        success: false,
        message: `Missing required columns: ${missingList.join(", ")}`,
      });
    }
    const patientsToInsert = [];

    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].split(",");
      if (!row.length || row.every((cell) => cell.trim() === "")) continue;

      const getByAliases = (aliases) => {
        for (const alias of aliases) {
          const idx = headerIndex[alias];
          if (idx !== undefined) return (row[idx] || "").trim();
        }
        return "";
      };

      const firstName = getByAliases(["firstname"]);
      const lastName = getByAliases(["lastname"]);
      const email = getByAliases(["emailaddress", "email"]);
      if (!firstName || !lastName || !email) continue;

      patientsToInsert.push({
        firstName,
        lastName,
        EMailAddress: email,
        phoneNumber: getByAliases(["phonenumber"]),
        location: getByAliases(["location"]),
        age: Number(getByAliases(["age"])) || 0,
        gender: getByAliases(["gender"]) || "None",
        emergencyContactName: getByAliases(["emergencycontactname"]),
        emergencyContactNumber: getByAliases(["emergencycontactnumber"]),
        notes: getByAliases(["notes"]),
        addedBy: userId,
        companyCode: admin?.companyCode || "",
      });
    }

    if (!patientsToInsert.length) {
      return res.status(400).json({
        success: false,
        message: "No valid patient rows found in CSV.",
      });
    }

    await PatientModel.insertMany(patientsToInsert);

    res.json({
      success: true,
      message: `Imported ${patientsToInsert.length} patient(s) successfully.`,
      count: patientsToInsert.length,
    });
  } catch (error) {
    console.error("Bulk upload error:", error);

    // Handle duplicate email errors from MongoDB (code 11000)
    if (
      error.code === 11000 ||
      (Array.isArray(error.writeErrors) &&
        error.writeErrors.some((e) => e.code === 11000))
    ) {
      let duplicateEmail = "";
      if (
        error.keyValue &&
        (error.keyValue.EMailAddress || error.keyValue.EmailAddress)
      ) {
        duplicateEmail =
          error.keyValue.EMailAddress || error.keyValue.EmailAddress;
      } else if (Array.isArray(error.writeErrors)) {
        const dup = error.writeErrors.find((e) => e.code === 11000);
        if (dup?.err?.keyValue) {
          duplicateEmail =
            dup.err.keyValue.EMailAddress || dup.err.keyValue.EmailAddress || "";
        }
      }

      return res.status(400).json({
        success: false,
        message: duplicateEmail
          ? `The email "${duplicateEmail}" is already used by another patient. Please remove or change this email in your CSV and try again.`
          : "One or more emails in your CSV are already used by existing patients. Please remove duplicates and try again.",
      });
    }

    res.status(500).json({
      success: false,
      message:
        "Failed to bulk upload patients. Please check your CSV and try again.",
    });
  }
};