const { default: mongoose } = require("mongoose");
const DriverModel = require("../models/DriverModel");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const Admin = require("../models/adminSchema");
const TripModel = require("../models/TripModel");
const PatientModel = require("../models/PatientModel");
const nodemailer = require("nodemailer");
const { createEmailTransporter, sendEmailSafely } = require("../utils/emailConfig");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { DateTime } = require("luxon");
const JWT_SECRET = require("../config/jwtSecret");
const jwt = require("jsonwebtoken");
const { getFrontendUrl, getUploadsBaseUrl } = require("../config/appUrls");
const ChatConversation = require("../models/ChatConversation");
const ChatMessage = require("../models/ChatMessage");
const NotificationModel = require("../models/NotificationModel");

/**
 * Geocode an address string to latitude/longitude using Google Geocoding API.
 * Used so drivers with a text location (e.g. "Lake Charles") appear on the map.
 * @param {string} address
 * @returns {{ latitude: number, longitude: number } | null}
 */
async function geocodeAddress(address) {
  if (!address || typeof address !== "string" || !address.trim()) return null;
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.warn("GOOGLE_MAPS_API_KEY not set; skipping driver location geocode.");
    return null;
  }
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
      address.trim()
    )}&key=${apiKey}`;
    const response = await axios.get(url);
    if (
      response.data &&
      response.data.status === "OK" &&
      response.data.results &&
      response.data.results[0]
    ) {
      const loc = response.data.results[0].geometry.location;
      return {
        latitude: Number(loc.lat),
        longitude: Number(loc.lng),
      };
    }
    return null;
  } catch (e) {
    console.error("Geocode error for address:", address, e.message);
    return null;
  }
}

exports.addDoc = async (req, res) => {
  console.log("ADDING Document");
  console.log(req.file);
  console.log("REQ PARAMS", req.params);
  console.log("REQ BODY", req.body);
  try {
    let driver = await DriverModel.findOne({ _id: req.params.driverId });
    // Use uploads/ + filename (normalize path separators for URLs)
    const filename = req.file.filename || req.file.originalname || path.basename(req.file.path);
    let docUrl = getUploadsBaseUrl() + "/uploads/" + filename.replace(/\\/g, "/");
    if (driver) {
      let _docs = driver.docs;
      let doc = {
        url: docUrl,
        title: req.file.originalname,
        type: req.body.documentType || "Other",
        Id: Math.random().toString(),
        uploadedAt: new Date(),
      };
      _docs = _docs.concat(doc);
      console.log("Docs", _docs);
      await DriverModel.findByIdAndUpdate(
        req.params.driverId,
        { docs: _docs },
        { new: true, runValidators: true }
      );
      res.json({ success: true, doc });
    } else {
      res.json({ success: false });
    }
  } catch (e) {
    console.log("ERROR WHILE ADDING DOC", e.message);
    res.json({ success: false });
  }
};
exports.deleteDoc = async (req, res) => {
  try {
    let driver = await DriverModel.findOne({ _id: req.params.driverId });
    if (driver) {
      console.log("Deleting Doc With Id", req.params.docId);

      let _docs = driver.docs;
      _docs = _docs.filter((doc) => {
        return doc.Id != req.params.docId;
      });
      console.log("Latest Docs After Deleting", _docs);
      await DriverModel.findByIdAndUpdate(
        req.params.driverId,
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
    let driver = await DriverModel.findOne({ _id: req.params.driverId });
    if (driver) {
      let docs = driver.docs;
      res.json({ success: true, docs });
    } else {
      res.json({ success: false });
    }
  } catch (e) {
    res.json({ success: false });
  }
};
exports.deleteSelected = async (req, res) => {
  try {
    await DriverModel.deleteMany({ _id: { $in: req.body.selectedDriversIds } });
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false });
  }
};
exports.forgotPassword = async (req, res) => {
  let EMailAddress = req.body.EMailAddress;
  console.log("Forgot Password Implementation");
  try {
    let driver = await DriverModel.findOne({ EMailAddress: EMailAddress });
    console.log("Driver", driver);
    if (!driver) {
      res.json({ success: false, message: "Driver Not Found" });
    } else {
      const transport = createEmailTransporter();
      const token = crypto.randomBytes(20).toString("hex");

      driver.passwordResetToken = token;
      driver.passwordResetExpires = Date.now() + 3600000; // 1 hour expiry

      await driver.save(); //updating driver token and expire time

      const resetURL = `${getFrontendUrl()}/driver/reset-password/${token}`;
      const message = `Welcome to Trip Hog!\n\nYou have requested to reset your password. Click on the link below to reset it:\n\n${resetURL}\n\nThis link will expire in 1 hour for security purposes.\n\nIf you did not request this password reset, please ignore this email.\n\nBest regards,\nTrip Hog Team`;
      const fromEmail = process.env.GMAIL_EMAIL || "noreply@triphog.com";
      await sendEmailSafely(transport, {
        from: `Trip Hog <${fromEmail}>`,
        to: driver.EMailAddress,
        subject: "Reset Your Driver Password",
        text: message,
      });
      res.json({ success: true });
    }
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
};
exports.resetPassword = async (req, res) => {
  console.log("Reseting PassWord");
  try {
    const driver = await DriverModel.findOne({
      passwordResetToken: req.params.token,
      passwordResetExpires: { $gt: Date.now() }, // Check expiry
    });
    console.log("Driver", driver);

    if (!driver) {
      return res.json({ success: false, message: "Invalid or expired reset token" });
    }
    console.log("password to set", req.body.password);
    const salt = await bcrypt.genSalt(10);
    console.log("Driver Updated Encrypted PassWord");
    const hashedPassword = await bcrypt.hash(req.body.password, salt);
    driver.password = hashedPassword;
    driver.passwordResetToken = undefined;
    driver.passwordResetExpires = undefined;

    await driver.save();

    res.json({ success: true });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
};
exports.getProfileStatistics = async (req, res) => {
  try {
    let totalTrips = await TripModel.find({ driverRef: req.params.driverId });
    let completedTrips = totalTrips.filter((trip) => {
      return trip.status == "Completed";
    });
    let cancelledTrips = totalTrips.filter((trip) => {
      return trip.status == "Cancelled";
    });
    let nonResponsiveTrips = totalTrips.filter((trip) => {
      return trip.status == "Non Responsive";
    });
    let noShowTrips = totalTrips.filter((trip) => {
      return trip.status == "No Show";
    });
    res.json({
      success: true,
      completedTrips: completedTrips.length,
      totalTrips: totalTrips.length,
      cancelledTrips: cancelledTrips.length,
      nonResponsiveTrips: nonResponsiveTrips.length,
      noShowTrips: noShowTrips.length,
    });
  } catch (e) {
    res.json({ success: false });
  }
};
exports.getStatistics = async (req, res) => {
  try {
    const now = new Date();
    let allTrips = await TripModel.find();

    let startDate = new Date(now.setHours(0, 0, 0, 0));
    let todayTrips = await TripModel.find({ createdAt: { $gte: startDate } });

    startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);
    let weeklyTrips = await TripModel.find({ createdAt: { $gte: startDate } });

    startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    let monthlyTrips = await TripModel.find({ createdAt: { $gte: startDate } });

    let MyTrips = allTrips.filter((trip) => trip.driverRef == req.driverId);
    let completedTrips = MyTrips.filter((trip) => trip.status == "Completed");
    let cancelledTrips = MyTrips.filter((trip) => trip.status == "Cancelled");

    let hoursDriven = completedTrips.reduce(
      (total, trip) => total + trip.timeTaken,
      0
    );

    let allTimeMileage = 0;
    for (let trip of completedTrips) {
      allTimeMileage = allTimeMileage + Number(trip.mileage);
    }

    let MyWeeklyTrips = weeklyTrips.filter(
      (trip) => trip.driverRef == req.driverId
    );
    let weeklyCompletedTrips = MyWeeklyTrips.filter(
      (trip) => trip.status == "Completed"
    );
    let weeklyCancelledTrips = MyWeeklyTrips.filter(
      (trip) => trip.status == "Cancelled"
    );

    let weeklyHoursDriven = weeklyCompletedTrips.reduce(
      (total, trip) => total + trip.timeTaken,
      0
    );
    let weeklyMileage = 0;
    for (let trip of weeklyCompletedTrips) {
      weeklyMileage = weeklyMileage + Number(trip.mileage);
    }

    let MyMonthlyTrips = monthlyTrips.filter(
      (trip) => trip.driverRef == req.driverId
    );
    let monthlyCompletedTrips = MyMonthlyTrips.filter(
      (trip) => trip.status == "Completed"
    );
    let monthlyCancelledTrips = MyMonthlyTrips.filter(
      (trip) => trip.status == "Cancelled"
    );
    let monthlyMileage = 0;

    for (let trip of monthlyCompletedTrips) {
      monthlyMileage = monthlyMileage + Number(trip.mileage);
    }

    let monthlyHoursDriven = monthlyCompletedTrips.reduce(
      (total, trip) => total + trip.timeTaken,
      0
    );

    let MyTodaysTrips = todayTrips.filter(
      (trip) => trip.driverRef == req.driverId
    );
    let todaysCompletedTrips = MyTodaysTrips.filter(
      (trip) => trip.status == "Completed"
    );
    let todaysCancelledTrips = MyTodaysTrips.filter(
      (trip) => trip.status == "Cancelled"
    );

    let todaysHoursDriven = todaysCompletedTrips.reduce(
      (total, trip) => total + trip.timeTaken,
      0
    );
    let todaysMileage = 0;
    for (let trip of todaysCompletedTrips) {
      todaysMileage = todaysMileage + Number(trip.mileage);
    }

    console.log("Getting Driver Statistics");
    console.log("All Time Mileage", allTimeMileage);
    console.log("Monlthy Mileage", monthlyMileage);
    res.json({
      success: true,
      all: {
        myTrips: MyTrips.length,
        completedTrips: completedTrips.length,
        cancelledTrips: cancelledTrips.length,
        hoursDriven,
        tripsLeft: MyTrips.length - completedTrips.length,
        mileage: allTimeMileage,
      },
      today: {
        myTrips: MyTodaysTrips.length,
        completedTrips: todaysCompletedTrips.length,
        cancelledTrips: todaysCancelledTrips.length,
        hoursDriven: todaysHoursDriven,
        tripsLeft: MyTodaysTrips.length - todaysCompletedTrips.length,
        mileage: todaysMileage,
      },
      weekly: {
        myTrips: MyWeeklyTrips.length,
        completedTrips: weeklyCompletedTrips.length,
        cancelledTrips: weeklyCancelledTrips.length,
        hoursDriven: weeklyHoursDriven,
        tripsLeft: MyWeeklyTrips.length - weeklyCompletedTrips.length,
        mileage: weeklyMileage,
      },
      monthly: {
        myTrips: MyMonthlyTrips.length,
        completedTrips: monthlyCompletedTrips.length,
        cancelledTrips: monthlyCancelledTrips.length,
        hoursDriven: monthlyHoursDriven,
        tripsLeft: MyMonthlyTrips.length - monthlyCompletedTrips.length,
        mileage: monthlyMileage,
      },
    });
  } catch (e) {
    console.log("Stats Error", e.message);
    res.json({ success: false, message: e.message });
  }
};
const moment = require("moment");
exports.pay = async (req, res) => {
  try {
    let driver = await DriverModel.findById(req.params.driverId);
    if (!driver) {
      res.json({ success: false, message: "Not Driver Found!" });
    } else {
      let paymentHistory = driver.paymentHistory;
      let currentDate = new Date();
      const _date = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth(),
        currentDate.getDate(),
        0,
        0,
        0
      );

      let _paymentHistory = paymentHistory.concat({
        date: _date,
        amount: req.body.amount,
        status: "Paid",
        type: req.body.type,
      });
      await DriverModel.findByIdAndUpdate(
        req.params.driverId,
        { paymentHistory: _paymentHistory },
        { new: true, runValidators: true }
      );
      res.json({ success: true });
    }
  } catch (e) {
    res.json({ success: false });
  }
};
exports.updateLocation = async (req, res) => {
  try {
    const updatedDriver = await DriverModel.findByIdAndUpdate(
      req.driverId,
      { longitude: req.body.longitude, latitude: req.body.latitude },
      { new: true, runValidators: true }
    );

    // Emit location update via socket
    const { getIO } = require('../io');
    const io = getIO();
    
    const locationData = {
      driverRef: req.driverId,
      addedBy: req.driverId,
      latitude: req.body.latitude,
      longitude: req.body.longitude,
      timestamp: new Date(),
      driverName: `${updatedDriver.firstName} ${updatedDriver.lastName}`,
      isAvailable: updatedDriver.isAvailable
    };

    // Emit to all connected clients (admins, patients, etc.)
    io.emit("location-changed", locationData);
    io.emit("update-location", locationData);
    
    console.log("Driver location updated and broadcasted:", locationData);
    
    res.json({ success: true, location: locationData });
  } catch (e) {
    console.error("Error updating driver location:", e);
    res.json({ success: false, error: e.message });
  }
};

// ---------- Chat APIs for Drivers ----------

// Drivers can chat with:
// - Their linked Admin (DriverModel.addedBy)
// - Patients for trips they've driven
exports.getUsersForChat = async (req, res) => {
  try {
    const { id: driverId } = req.user;
    if (!driverId) {
      return res.status(200).json({
        success: true,
        message: "All Users for chat",
        data: [],
      });
    }

    const driverDoc = await DriverModel.findById(driverId)
      .select("addedBy")
      .lean();
    if (!driverDoc?.addedBy) {
      return res.status(200).json({
        success: true,
        message: "All Users for chat",
        data: [],
      });
    }

    const admin = await Admin.findById(driverDoc.addedBy)
      .select("_id firstName lastName")
      .lean();

    const trips = await TripModel.find({ driverRef: driverId })
      .select("patientRef")
      .lean();
    const patientIds = [
      ...new Set(
        trips
          .map((t) => (t.patientRef ? String(t.patientRef) : null))
          .filter(Boolean)
      ),
    ];

    const patients = patientIds.length
      ? await PatientModel.find({ _id: { $in: patientIds } })
          .select("_id firstName lastName")
          .sort({ firstName: 1 })
          .lean()
      : [];

    const result = [];
    if (admin) result.push({ ...admin, role: "Admin" });
    result.push(...patients.map((p) => ({ ...p, role: "Patient" })));

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

    const driverDoc = await DriverModel.findById(senderId)
      .select("addedBy")
      .lean();
    const adminIdStr = driverDoc?.addedBy ? String(driverDoc.addedBy) : null;

    // Drivers can message their linked Admin, patients from their trips,
    // and can send messages inside group conversations they are part of.
    if (recipient.role === "Group") {
      // For groups we only validate membership against the conversation below.
    } else if (recipient.role === "Admin") {
      if (!adminIdStr || String(recipient._id) !== adminIdStr) {
        return res.status(403).json({
          success: false,
          message: "You can only message your linked Admin.",
        });
      }
    } else if (recipient.role === "Patient") {
      const tripExists = await TripModel.exists({
        driverRef: senderId,
        patientRef: recipient._id,
      });
      if (!tripExists) {
        return res.status(403).json({
          success: false,
          message: "You can only message patients you have trips with.",
        });
      }
    } else {
      return res.status(403).json({
        success: false,
        message: "Drivers can only message their Admin, patients, or groups they are in.",
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
        (r) => String(r.id) === String(senderId) && r.role === "Driver"
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
          { id: senderId, role: "Driver" },
          { id: recipient._id, role: recipient.role },
        ],
      });
      await newConversation.save();
      convId = newConversation._id;
    }

    const newMessage = new ChatMessage({
      content,
      conversationId: convId,
      sender: { id: senderId, role: "Driver" },
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
    const { id: driverId } = req.user;
    if (!driverId) {
      return res.status(200).json({
        success: true,
        message: "Conversations.",
        data: [],
      });
    }

    const driverObjId = mongoose.Types.ObjectId.createFromHexString(
      String(driverId)
    );

    const rawConversations = await ChatConversation.find({
      recipients: { $elemMatch: { role: "Driver", id: driverObjId } },
    })
      .sort({ updatedAt: -1 })
      .lean();

    const filtered = [];
    for (const c of rawConversations) {
      const recipients = c.recipients || [];
      const isCurrentUser = (r) =>
        r.role === "Driver" &&
        (String(r.id) === String(driverId) ||
          String(r.id) === driverObjId.toString());
      const other = recipients.find((r) => !isCurrentUser(r));
      if (!other) continue;

      if (c.isGroup) {
        const isCreator =
          String(c.creatorRole) === "Driver" &&
          String(c.creatorId) === String(driverId);
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
      if (other.role === "Patient") {
        const patientDoc = await PatientModel.findById(other.id)
          .select("_id firstName lastName")
          .lean();
        if (patientDoc) {
          filtered.push({
            _id: c._id,
            recipient: {
              _id: patientDoc._id,
              firstName: patientDoc.firstName,
              lastName: patientDoc.lastName || "",
              role: "Patient",
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

exports.createGroup = async (req, res) => {
  try {
    const { id: driverId } = req.user;
    const { groupName, recipients } = req.body;

    if (!driverId) {
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

    const driverDoc = await DriverModel.findById(driverId)
      .select("addedBy")
      .lean();
    const adminIdStr = driverDoc?.addedBy ? String(driverDoc.addedBy) : null;
    if (!adminIdStr) {
      return res.status(403).json({
        success: false,
        message: "Driver is not linked to an admin.",
      });
    }

    // Validate all recipients are messageable by this driver
    for (const r of recipients) {
      if (!r.id || !r.role) continue;

      if (r.role === "Admin") {
        if (String(r.id) !== adminIdStr) {
          return res.status(403).json({
            success: false,
            message: "Invalid admin in group.",
          });
        }
      } else if (r.role === "Patient") {
        const tripExists = await TripModel.exists({
          driverRef: driverId,
          patientRef: r.id,
        });
        if (!tripExists) {
          return res.status(403).json({
            success: false,
            message: "Invalid or unlinked patient in group.",
          });
        }
      } else if (r.role === "Driver") {
        // Allow only self if explicitly included
        if (String(r.id) !== String(driverId)) {
          return res.status(403).json({
            success: false,
            message: "Drivers cannot add other drivers to groups.",
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
      { id: driverId, role: "Driver" },
      ...recipients.map((r) => ({ id: r.id, role: r.role })),
    ];

    const newConversation = new ChatConversation({
      latestMessage: "",
      isGroup: true,
      groupName: groupName.trim(),
      creatorId: driverId,
      creatorRole: "Driver",
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

exports.getDrivenDrivers = async (req, res) => {
  try {
    const { startDate, endDate } = req.params;
    console.log(startDate.slice(4, 15));
    let startingDate = new Date(startDate.slice(4, 15));
    let endingDate = new Date(endDate.slice(4, 15));
    console.log("Starting Date", startingDate);
    console.log("Ending Date", endingDate);
    let adminId = req.userId;
    console.log("Admin Id For Getting Drivers", adminId);

    let allTrips = await TripModel.find();
    let allDrivers = await DriverModel.find({ addedBy: adminId });

    let driversWhoDrove = [];

    let drivers = allDrivers.filter((driver) => {
      let driverTrips = allTrips.filter((trip) => {
        return trip.status == "Completed" && trip.driverRef == driver._id;
      });
      console.log("Driver Trips", driverTrips);

      let filteredTrips = driverTrips.filter((trip) => {
        console.log("Is Within Range");
        console.log(
          new Date(trip.completedAt) >= startingDate &&
            new Date(trip.completedAt) <= endingDate
        );
        return (
          new Date(trip.completedAt) >= startingDate &&
          new Date(trip.completedAt) <= endingDate
        );
      });
      console.log("Completed Trips By Driver", filteredTrips);

      if (filteredTrips.length > 0) {
        console.log("Driver Found With Trips", driver);
        if (driver.paymentType == "hourly") {
          console.log("Getting Driven Drivers Whose Type Is Hourly");

          let hoursRidden = 0;
          let amountPaid = 0;
          for (let trip of driverTrips) {
            hoursRidden = hoursRidden + Number(trip.timeTaken);
          }
          for (let payment of driver.paymentHistory) {
            if (payment.type == "hourly") {
              amountPaid += payment.amount;
            }
          }
          console.log("Hours Ridden", hoursRidden);
          console.log("Amount Paid", amountPaid);
          const Driver = { ...driver.toObject(), hoursRidden, amountPaid };

          console.log("Driver", Driver);
          driversWhoDrove.push(Driver);
          return driver;
        } else if (driver.paymentType == "mileage") {
          console.log("Getting Driven Drivers Whose Payment Type Is Mileage");

          let milesDriven = 0;
          console.log("Miles Driven", milesDriven);
          let amountPaid = 0;
          for (let trip of driverTrips) {
            if (trip.mileage && isNaN(trip.mileage) == false) {
              console.log("Adding To Miles", trip.mileage);

              milesDriven = milesDriven + Number(trip.mileage);
              console.log("Miles Driven ADding ", milesDriven);
            }
          }
          for (let payment of driver.paymentHistory) {
            if (payment.type == "mileage") {
              amountPaid += payment.amount;
            }
          }
          console.log("Miles Driven", milesDriven);
          console.log("Amount Paid", amountPaid);
          const Driver = { ...driver.toObject(), milesDriven, amountPaid };

          console.log("Driver Added Whose Payment Type Is Mileage", Driver);
          driversWhoDrove.push(Driver);
          return driver;
        } else if (driver.paymentType == "direct") {
          console.log("Getting driver with direct pay payment type");
          driversWhoDrove.push(driver);
          return driver;
        }
      }
      return false; // Ensure this driver is skipped if no conditions are met
    });

    console.log("Drivers Who Drove", driversWhoDrove);
    console.log("Starting Date", startingDate);
    console.log("Ending Date", endingDate);

    res.json({ success: true, driversWhoDrove });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
};
exports.getDriversByDate = async (req, res) => {
  let date = req.params.date;
  let limit = parseInt(req.query.limit) || 25; // Default limit to 25 if not provided
  let page = parseInt(req.query.page) || 1; // Default page to 1 if not provided

  try {
    const startOfDay = new Date(date);
    startOfDay.setUTCHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setUTCHours(23, 59, 59, 999);

    // Fetch drivers with date filter
    let drivers = await DriverModel.find({
      createdAt: {
        $gte: startOfDay,
        $lte: endOfDay,
      },
      addedBy: req.userId, // Filter directly in the query
    })
      .limit(limit) // Limit the number of results
      .skip((page - 1) * limit); // Skip records based on the current page

    // Optionally, you can get the total count for pagination information
    const totalCount = await DriverModel.countDocuments({
      createdAt: {
        $gte: startOfDay,
        $lte: endOfDay,
      },
      addedBy: req.userId,
    });

    res.json({
      success: true,
      drivers,
      totalCount,
      totalPages: Math.ceil(totalCount / limit), // Calculate total pages
      currentPage: page, // Current page
    });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
};
exports.getFilteredDrivers = async (req, res) => {
  const { filter } = req.params;
  console.log(filter);
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
    let filteredDrivers = await DriverModel.find({
      createdAt: { $gte: startDate, $lte: endDate },
    });
    console.log("Filtered Drivers", filteredDrivers);
    filteredDrivers = filteredDrivers.filter((driver) => {
      return driver.addedBy == req.userId;
    });
    console.log("Filtered Drivers For Admin", filteredDrivers);

    res.json(filteredDrivers);
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
};
exports.changePassword = async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  console.log("Changing Driver Password");
  console.log(req.body);
  try {
    let driver = await DriverModel.findOne({ EMailAddress: req.EMailAddress });
    console.log("Driver Found", driver);
    if (!driver) {
      res.json({ success: false, message: "Not Found!" });
    } else {
      let isMatched = await bcrypt.compare(oldPassword, driver.password);
      if (isMatched) {
        console.log("Has Matched Driver Password");
        let salt = await bcrypt.genSalt(10);
        let hashedPassword = await bcrypt.hash(newPassword, salt);
        driver.password = hashedPassword;
        await driver.save();
        res.json({ success: true });
      } else {
        res.json({ success: false, message: "InCorrect Old Password" });
      }
    }
  } catch (e) {
    res.json({ success: false });
  }
};

exports.login = async (req, res) => {
  try {
    const transport = createEmailTransporter();

    console.log(">>REQ BODY", req.body);
    let driver = await DriverModel.findOne({
      EMailAddress: req.body.email,
    });
    let isApproved = false;
    if (driver) {
      isApproved = driver.isApproved;
    }
    console.log("Patient Found!", driver);
    if (!driver) {
      res.json({ success: false, message: "Driver Not Found!" });
    } else {
      // Block inactive drivers from logging in (only "active" allowed)
      const rawStatus = driver.status;
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

      let isMatched = await bcrypt.compare(req.body.password, driver.password);
      console.log("Matching Password", isMatched);
      if (isMatched) {
        let admin = await Admin.findOne({ _id: driver.addedBy });
        const token = jwt.sign(
          {
            id: driver._id,
            role: "Driver",
            EMailAddress: driver.EMailAddress,
            admin,
          },
          JWT_SECRET,
          {
            expiresIn: "6d",
          }
        );
        if (isApproved) {
          let admin = await Admin.findOne({ _id: driver.addedBy });
          res.json({ success: true, driver, token, admin });
        } else {
          res.json({ success: false, message: "You Are Not Approved!" });
        }
      } else {
        res.json({ success: false, message: "Incorrect Password" });
      }
    }
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
};
exports.getAvailableDrivers = async (req, res) => {
  const parseTime = (date, time) => {
    const [hours, minutes] = time.split(":").map(Number);
    const result = new Date(date);
    result.setHours(hours, minutes, 0, 0);
    return result;
  };
  const { pickUpDate, pickUpTime, appointmentTime } = req.query;

  const pickUpDateTime = parseTime(pickUpDate, pickUpTime);
  const appointmentDateTime = parseTime(pickUpDate, appointmentTime);

  try {
    // Fetch all drivers
    const drivers = await DriverModel.find();
    const availableDrivers = [];

    for (const driver of drivers) {
      const overlappingTrips = await TripModel.find({
        driverRef: driver._id,
        pickUpDate: pickUpDate,
        $or: [
          {
            pickUpTime: { $lt: appointmentTime, $gt: pickUpTime },
          },
          {
            appointmentTime: { $lt: appointmentTime, $gt: pickUpTime },
          },
        ],
      });

      if (overlappingTrips.length === 0) {
        availableDrivers.push(driver);
      }
    }

    res.status(200).json(availableDrivers);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
exports.getUpcomingTrips = async (req, res) => {
  const handleCombine = (time, date) => {
    const [hours, minutes] = time.split(":").map(Number);
    const combinedDate = new Date(date);
    combinedDate.setHours(hours, minutes, 0, 0);

    return combinedDate;
  };

  try {
    let allTrips = await TripModel.find();
    let MyTrips = allTrips.filter((trip) => {
      return (
        trip.status != "Completed" &&
        trip.driverRef == req.driverId &&
        trip.status != "Cancelled"
      );
    });
    console.log(MyTrips);
    let upcomingTrips = MyTrips.sort((t1, t2) => {
      let d1 = handleCombine(t1.pickUpTime, t1.pickUpDate);
      let d2 = handleCombine(t2.pickUpTime, t2.pickUpDate);
      if (d1 < d2) {
        return -1;
      } else {
        return 1;
      }
    });
    console.log("Upcoming Trips", upcomingTrips);
    res.json({ success: true, upcomingTrips });
  } catch (error) {
    res.json({ success: false });
  }
};
exports.getCancelledTrips = async (req, res) => {
  try {
    console.log("Getting Cancelled Trips");
    let allTrips = await TripModel.find();
    console.log(req.driverId);
    let cancelledTrips = allTrips.filter((trip) => {
      return trip.status == "Cancelled" && trip.driverRef == req.driverId;
    });
    res.json({ success: true, cancelledTrips, driverId: req.driverId });
  } catch (e) {
    res.json({ success: false });
  }
};
exports.getMyTrips = async (req, res) => {
  try {
    // Query by driverRef so reassignments and updates reflect immediately on driver dashboard
    let MyTrips = await TripModel.find({ driverRef: req.driverId }).sort({ pickUpDate: 1, pickUpTime: 1 });
    res.json({ success: true, MyTrips });
  } catch (e) {
    res.json({ success: false });
  }
};

// Add new Driver API Fixed
exports.addNewDriver = async (req, res) => {
  const uploadsBase = getUploadsBaseUrl();
  if (req.files.profilePhoto && req.files.profilePhoto[0]) {
    req.body.profilePhotoUrl =
      uploadsBase + "/uploads/" + encodeURIComponent(req.files.profilePhoto[0].filename);
  } else {
    req.body.profilePhotoUrl =
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTyNAzESlk0ZBEa2byO_j3-gEm62VGNdlaz5A&s";
  }

  if (req.files.signature && req.files.signature[0]) {
    req.body.signatureUrl =
      uploadsBase + "/uploads/" + encodeURIComponent(req.files.signature[0].filename);
  }

  if (req.files.liscense && req.files.liscense[0]) {
    req.body.licenseUrl =
      uploadsBase + "/uploads/" + encodeURIComponent(req.files.liscense[0].filename);
  }

  if (req.files.IDCard && req.files.IDCard[0]) {
    req.body.IDCardUrl =
      uploadsBase + "/uploads/" + encodeURIComponent(req.files.IDCard[0].filename);
  }

  try {
    let driver = new DriverModel({
      firstName: req.body.firstName,
      lastName: req.body.lastName,
      hourlyPay: Number(req.body.hourlyPay),
      EMailAddress: req.body.EMailAddress,
      phoneNumber: req.body.phoneNumber,
      location: req.body.location,
      vehicleName: req.body.vehicleName,
      gender: req.body.gender,
      addedBy: req.userId,
      IDCardUrl: req.body.IDCardUrl,
      licenseUrl: req.body.licenseUrl,
      profilePhotoUrl: req.body.profilePhotoUrl,
      signatureUrl: req.body.signatureUrl,
      paymentType: req.body.paymentType,
      payPerMile: req.body.payPerMile,
      startDate: req.body.startDate || "",
      endDate: req.body.endDate || "",
      totalMiles: Number(req.body.totalMiles) || 0,
      notes: req.body.notes || "",
    });
    if (req.body.location) {
      const coords = await geocodeAddress(req.body.location);
      if (coords) {
        driver.latitude = coords.latitude;
        driver.longitude = coords.longitude;
      }
    }
    console.log(driver);
    let token = Math.random().toString() + req.body.EMailAddress;
    driver.token = token;
    const passwordCreationLink = `${getFrontendUrl()}/driver/createpassword/${token}`;

    console.log("Sending Link To Driver For Password Creation", driver);
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

    // Save driver first (before sending email)
    await driver.save();
    console.log(driver);
    
    // Send email asynchronously (don't block driver creation if email fails)
    const recipientEmail = req.body.EMailAddress;
    const emailSubject = "Welcome to Trip Hog!";
    const emailData = {
      name: driver.firstName + " " + driver.lastName,
      passwordCreationLink: passwordCreationLink,
    };

    sendEmail(recipientEmail, emailSubject, emailData).then((result) => {
      if (result && result.success) {
        console.log("✅ Password creation email sent to:", recipientEmail);
      } else {
        console.error("❌ Failed to send password creation email to:", recipientEmail);
        console.error("⚠️ Driver created but email failed. Password link:", passwordCreationLink);
      }
    }).catch((error) => {
      console.error("❌ Error sending email:", error);
      console.error("⚠️ Driver created but email failed. Password link:", passwordCreationLink);
    });
    
    // Return success even if email fails (driver is created)
    res.json({ success: true, driver, message: "Driver created successfully. Password creation email sent." });
  } catch (e) {
    console.log(e);
    console.log("Error While Adding Drivers");
    let message = e.message;
    if (e.code === 11000 && e.keyPattern?.EMailAddress) {
      message = "A driver with this email address already exists.";
    } else if (e.code === 11000 && e.keyPattern?.phoneNumber) {
      message = "A driver with this phone number already exists.";
    }
    res.json({ success: false, message });
  }
};
exports.createPassword = async (req, res) => {
  console.log("YourPassword", req.body.password);
  try {
    let driver = await DriverModel.findOne({ token: req.params.token });
    console.log("Driver", driver);
    if (!driver) {
      console.log("Not found!");
      res.json({ success: false, notFound: true });
    } else {
      console.log("Encrypting Password");
      let salt = await bcrypt.genSalt(10);
      console.log("Salt Value", salt);
      let hashedPassword = await bcrypt.hash(req.body.password, salt);
      console.log("Hashed Password", hashedPassword);
      driver.password = hashedPassword;
      driver.status = "active";
      driver.token = "_sd__sdfd_0%34@_3454545";
      await driver.save();
      const admin = await Admin.findOne({ _id: driver.addedBy });
      const token = jwt.sign(
        {
          id: driver._id,
          role: "Driver",
          EMailAddress: driver.EMailAddress,
          admin,
        },
        JWT_SECRET,
        { expiresIn: "6d" }
      );
      res.json({ success: true, token });
    }
  } catch (error) {
    res.json({ success: false });
  }
};

exports.getDrivers = async (req, res) => {
  console.log("Getting Drivers");

  try {
    // Get query parameters with defaults
    const limit = parseInt(req.query.limit) || 25;
    const page = parseInt(req.query.page) || 1;
    const filter = req.query.filter?.toLowerCase() || "all";
    const timezone = req.query.timezone || "UTC";

    // Calculate pagination values
    const skip = (page - 1) * limit;

    // Initialize filter query with user ID
    const filterQuery = { addedBy: req.userId };

    // Apply date filters based on the selected filter type
    if (filter !== "all") {
      const now = DateTime.now().setZone(timezone);

      switch (filter) {
        case "today":
          filterQuery.createdAt = {
            $gte: now.startOf("day").toUTC().toJSDate(),
            $lte: now.endOf("day").toUTC().toJSDate(),
          };
          break;

        case "weekly":
          filterQuery.createdAt = {
            $gte: now.startOf("week").toUTC().toJSDate(),
            $lte: now.endOf("week").toUTC().toJSDate(),
          };
          break;

        case "monthly":
          filterQuery.createdAt = {
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

    // Fetch drivers with pagination
    const [driversRaw, totalDrivers] = await Promise.all([
      DriverModel.find(filterQuery).limit(limit).skip(skip),
      DriverModel.countDocuments(filterQuery),
    ]);

    // Automatically compute total miles and hours driven from trips for these drivers
    let drivers = driversRaw;
    if (driversRaw.length > 0) {
      const driverIdStrings = driversRaw.map((d) => String(d._id));

      // Only completed trips are counted toward driven miles/hours
      const completedTrips = await TripModel.find({
        driverRef: { $in: driverIdStrings },
        status: "Completed",
      }).lean();

      const aggregates = {};
      for (const trip of completedTrips) {
        const key = String(trip.driverRef);
        if (!aggregates[key]) {
          aggregates[key] = { totalMiles: 0, totalSeconds: 0 };
        }
        const miles = Number(trip.mileage);
        if (!Number.isNaN(miles)) {
          aggregates[key].totalMiles += miles;
        }
        // trip.timeTaken is stored in hours; completionTime is in seconds for display (hours * 3600)
        const hoursTaken = Number(trip.timeTaken) || 0;
        aggregates[key].totalSeconds += hoursTaken * 3600;
      }

      drivers = driversRaw.map((d) => {
        const key = String(d._id);
        const agg = aggregates[key] || { totalMiles: 0, totalSeconds: 0 };
        const plain = d.toObject ? d.toObject() : d;
        // Expose computed metrics without mutating the stored document
        plain.totalMiles = agg.totalMiles;
        plain.completionTime = agg.totalSeconds;
        return plain;
      });
    }

    // Calculate total pages
    const totalPages = Math.ceil(totalDrivers / limit);

    // Send response
    res.json({
      success: true,
      drivers,
      pagination: {
        totalPages,
        totalDrivers,
        currentPage: page,
        itemsPerPage: limit,
      },
    });
  } catch (e) {
    console.error("Error fetching drivers:", e);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: process.env.NODE_ENV === "development" ? e.message : undefined,
    });
  }
};
exports.resendWelcomeEmail = async (req, res) => {
  try {
    const driver = await DriverModel.findById(req.params.Id);
    if (!driver) {
      return res.json({ success: false, message: "Driver not found." });
    }
    if (!driver.EMailAddress) {
      return res.json({ success: false, message: "Driver has no email address." });
    }
    const token = Math.random().toString() + driver.EMailAddress;
    driver.token = token;
    await driver.save();

    const passwordCreationLink = `${getFrontendUrl()}/driver/createpassword/${token}`;
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
      name: (driver.firstName || "") + " " + (driver.lastName || ""),
      passwordCreationLink,
    };
    const htmlContent = replacePlaceholders(template, emailData);
    const fromEmail = process.env.GMAIL_EMAIL || "noreply@triphog.com";
    const result = await sendEmailSafely(transporter, {
      from: `Trip Hog <${fromEmail}>`,
      to: driver.EMailAddress,
      subject: "Welcome to Trip Hog!",
      html: htmlContent,
    });
    if (result.success) {
      return res.json({ success: true, message: "Welcome email sent successfully." });
    }
    return res.json({ success: false, message: result.error || "Failed to send email." });
  } catch (e) {
    console.error("Resend welcome email (driver) error:", e.message);
    res.json({ success: false, message: e.message });
  }
};

exports.getDriver = async (req, res) => {
  console.log("Getting Driver");
  try {
    console.log("Getting Single Driver");
    const driverDoc = await DriverModel.findById(req.params.Id);
    if (!driverDoc) {
      return res.json({ success: false, message: "Driver not found" });
    }

    // Compute total miles and hours driven for this driver from completed trips
    const completedTrips = await TripModel.find({
      driverRef: String(driverDoc._id),
      status: "Completed",
    }).lean();

    let totalMiles = 0;
    let totalSeconds = 0;
    for (const trip of completedTrips) {
      const miles = Number(trip.mileage);
      if (!Number.isNaN(miles)) totalMiles += miles;
      // trip.timeTaken is stored in hours; we expose completionTime in seconds (for frontend: completionTime/3600 = hours)
      const hoursTaken = Number(trip.timeTaken) || 0;
      totalSeconds += hoursTaken * 3600;
    }

    const driver = {
      ...(driverDoc.toObject ? driverDoc.toObject() : driverDoc),
      totalMiles,
      completionTime: totalSeconds,
    };

    console.log(driver);
    res.json({ success: true, driver });
  } catch (e) {
    res.json({ success: false });
  }
};
exports.deleteDriver = async (req, res) => {
  try {
    await DriverModel.deleteOne({ _id: req.params.Id });
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false });
  }
};
exports.updateDriver = async (req, res) => {
  if (req.files) {
    const uploadsBase = getUploadsBaseUrl();
    if (req.files.signature && req.files.signature[0]) {
      req.body.signatureUrl =
        uploadsBase + "/uploads/" + encodeURIComponent(req.files.signature[0].filename);
    }
    if (req.files.profilePhoto && req.files.profilePhoto[0]) {
      console.log("Updating Driver Profile Photo", req.files.profilePhoto);
      req.body.profilePhotoUrl =
        uploadsBase + "/uploads/" + encodeURIComponent(req.files.profilePhoto[0].filename);
    }
    if (req.files.liscense && req.files.liscense[0]) {
      req.body.licenseUrl =
        uploadsBase + "/uploads/" + encodeURIComponent(req.files.liscense[0].filename);
    }
    if (req.files.IDCard && req.files.IDCard[0]) {
      req.body.IDCardUrl =
        uploadsBase + "/uploads/" + encodeURIComponent(req.files.IDCard[0].filename);
    }
  }
  console.log("Updating Driver");
  console.log("Pay Per Mile Of Driver Is", req.body.payPerMile);
  try {
    if (req.body.location) {
      const coords = await geocodeAddress(req.body.location);
      if (coords) {
        req.body.latitude = coords.latitude;
        req.body.longitude = coords.longitude;
      }
    }
    const previousDriver = await DriverModel.findById(req.params.Id).lean();
    const updatedDriver = await DriverModel.findByIdAndUpdate(
      req.params.Id,
      req.body,
      { new: true, runValidators: true } // Options: new returns the updated document, runValidators ensures the update adheres to schema validation
    );
    console.log(updatedDriver);

    // Notify driver when status is changed to active or inactive (feature: message when driver is active/inactive)
    const newStatus = req.body.status != null ? String(req.body.status).toLowerCase().trim() : null;
    if (newStatus && previousDriver) {
      const prevStatus = (previousDriver.status || "").toString().toLowerCase().trim();
      const prevInactive = prevStatus === "inactive" || prevStatus === "unactive";
      const nowInactive = newStatus === "inactive" || newStatus === "unactive";
      if (prevInactive !== nowInactive) {
        const admin = await Admin.findById(updatedDriver.addedBy).select("firstName lastName photo").lean();
        const fromName = admin ? `${admin.firstName || ""} ${admin.lastName || ""}`.trim() || "Admin" : "Admin";
        const fromPhoto = admin?.photo || "";
        const notification = new NotificationModel({
          fromId: updatedDriver.addedBy,
          toId: String(updatedDriver._id),
          fromPhotoUrl: fromPhoto,
          type: nowInactive ? "DriverDeactivated" : "DriverActivated",
          text: nowInactive
            ? "Your account has been set to inactive by your admin. Please contact your admin if you have questions."
            : "Your account has been activated by your admin. You can log in and use the app.",
          from: fromName,
        });
        await notification.save();
      }
    }

    res.json({ success: true, updatedDriver });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
};

exports.getDriverStats = async (req, res) => {
  try {
    const userId = req.userId; // From auth middleware
    const timezone = req.query.timezone || "UTC";

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

    // First get all drivers assigned to trips today
    const todaysActiveDrivers = await TripModel.aggregate([
      {
        $match: {
          addedBy: userId,
          $or: [
            { status: "Assigned" },
            { status: "On Route" },
            { status: "In Progress" },
          ],
          createdAt: { $gte: utcTodayStart, $lte: utcTodayEnd },
        },
      },
      {
        $group: {
          _id: "$driverRef",
          count: { $sum: 1 },
        },
      },
    ]);

    const onRouteDriverIds = todaysActiveDrivers.map((driver) => driver._id);

    // Get all counts in parallel
    const [totalDrivers, inactiveDrivers, allAvailableDrivers] =
      await Promise.all([
        // Total drivers count for this user
        DriverModel.countDocuments({ addedBy: userId }),

        // Inactive drivers
        DriverModel.countDocuments({
          addedBy: userId,
          status: "unactive",
        }),

        // All potentially available drivers (not inactive)
        DriverModel.find({
          addedBy: userId,
          status: { $ne: "unactive" },
        }),
      ]);

    // Calculate available drivers (not inactive and not on route today)
    const availableDrivers = allAvailableDrivers.filter(
      (driver) => !onRouteDriverIds.includes(driver._id.toString())
    ).length;

    res.json({
      success: true,
      stats: {
        totalDrivers,
        availableDrivers,
        onRouteDrivers: onRouteDriverIds.length,
        inactiveDrivers,
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

// Test endpoint to simulate location updates for debugging
exports.testLocationUpdate = async (req, res) => {
  try {
    const { driverId, latitude, longitude } = req.body;
    
    if (!driverId || !latitude || !longitude) {
      return res.json({ 
        success: false, 
        message: "driverId, latitude, and longitude are required" 
      });
    }

    const driver = await DriverModel.findById(driverId);
    if (!driver) {
      return res.json({ success: false, message: "Driver not found" });
    }

    // Update driver location in database
    const updatedDriver = await DriverModel.findByIdAndUpdate(
      driverId,
      { longitude: parseFloat(longitude), latitude: parseFloat(latitude) },
      { new: true, runValidators: true }
    );

    // Emit location update via socket
    const { getIO } = require('../io');
    const io = getIO();
    
    const locationData = {
      driverRef: driverId,
      addedBy: driverId,
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      timestamp: new Date(),
      driverName: `${updatedDriver.firstName} ${updatedDriver.lastName}`,
      isAvailable: updatedDriver.isAvailable
    };

    // Emit to all connected clients
    io.emit("location-changed", locationData);
    io.emit("update-location", locationData);
    
    console.log("Test location update broadcasted:", locationData);
    
    res.json({ 
      success: true, 
      message: "Location updated and broadcasted successfully",
      location: locationData,
      driver: {
        id: updatedDriver._id,
        name: `${updatedDriver.firstName} ${updatedDriver.lastName}`,
        latitude: updatedDriver.latitude,
        longitude: updatedDriver.longitude
      }
    });
  } catch (e) {
    console.error("Error in test location update:", e);
    res.json({ success: false, error: e.message });
  }
};