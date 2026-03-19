const express = require('express')
let router = express.Router()
const {
  addNewDriver,
  getDrivers,
  deleteDriver,
  updateDriver,
  getDriverStats,
  getDriver,
  createPassword,
  login,
  changePassword,
  getMyTrips,
  getFilteredDrivers,
  getDriversByDate,
  getCancelledTrips,
  pay,
  updateLocation,
  getAvailableDrivers,
  getDrivenDrivers,
  getUpcomingTrips,
  getStatistics,
  deleteSelected,
  getProfileStatistics,
  forgotPassword,
  resetPassword,
  getDocs,
  addDoc,
  deleteDoc,
  testLocationUpdate,
  resendWelcomeEmail,
  getUsersForChat,
  sendMessage,
  getConversations,
  createGroup,
} = require("../controllers/driverController");
const {
  getConversationChat,
  deleteConversations,
} = require("../controllers/superAdminController");
const { verify } = require("../middlewares/verify");
const multer = require("multer");
const jwt = require("jsonwebtoken");
const JWT_SECRET = require("../config/jwtSecret");

let storage = multer.diskStorage({
  destination: (req, file, cb) => {
    console.log(file);
    cb(null, "uploads");
  },
  filename: (req, file, cb) => {
    console.log(file);
    cb(null, file.originalname);
  },
});

let upload = multer({ storage: storage });
router.post("/adddoc/:driverId", upload.single("document"), addDoc);
router.get("/getdocs/:driverId", getDocs);
router.delete("/deletedoc/:driverId/:docId", deleteDoc);
router.delete("/deleteselected", deleteSelected);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password/:token", resetPassword);
router.get("/getmystatistics/:driverId", getProfileStatistics);
router.get(
  "/getstatistics",
  (req, res, next) => {
    const token = req.headers["authorization"];
    if (token) {
      jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
          return res.status(403).json({ message: "Forbidden" });
        }
        console.log("Driver", user);

        if ((user.role = "Driver")) {
          req.driverId = user.id;
          console.log("Getting Upcoming Trips");
          next();
        } else {
          res.json({ success: false, message: "UnAuthorized" });
        }
      });
    } else {
      res.status(401).json({ message: "Unauthorized" });
    }
  },
  getStatistics
);
router.put(
  "/updatelocation",
  (req, res, next) => {
    const token = req.headers["authorization"];
    if (token) {
      jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
          return res.status(403).json({ message: "Forbidden" });
        }
        console.log("Driver", user);

        if ((user.role = "Driver")) {
          req.driverId = user.id;
          console.log("Getting Upcoming Trips");
          next();
        } else {
          res.json({ success: false, message: "UnAuthorized" });
        }
      });
    } else {
      res.status(401).json({ message: "Unauthorized" });
    }
  },
  updateLocation
);
router.post("/pay/:driverId", verify, pay);
router.get("/getdriven/:startDate/:endDate", verify, getDrivenDrivers);
router.get("/getfiltereddrivers/:filter", verify, getFilteredDrivers);
router.post(
  "/addnewdriver",
  verify,
  upload.fields([
    { name: "signature", maxCount: 1 },
    { name: "profilePhoto", maxCount: 1 },
    { name: "IDCard", maxCount: 1 },
  ]),
  addNewDriver
);
router.get("/getdrivers", verify, getDrivers);
router.get("/getavailabledrivers", verify, getAvailableDrivers);
router.get("/getdriver/:Id", verify, getDriver);
router.post("/resend-welcome-email/:Id", verify, resendWelcomeEmail);
router.get(
  "/getupcomingtrips",
  (req, res, next) => {
    const token = req.headers["authorization"];
    if (token) {
      jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
          return res.status(403).json({ message: "Forbidden" });
        }
        console.log("Driver", user);

        if ((user.role = "Driver")) {
          req.driverId = user.id;
          console.log("Getting Upcoming Trips");
          next();
        } else {
          res.json({ success: false, message: "UnAuthorized" });
        }
      });
    } else {
      res.status(401).json({ message: "Unauthorized" });
    }
  },
  getUpcomingTrips
);
router.get(
  "/getcancelledtrips",
  (req, res, next) => {
    const token = req.headers["authorization"];
    if (token) {
      jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
          return res.status(403).json({ message: "Forbidden" });
        }
        console.log("Driver", user);

        if ((user.role = "Driver")) {
          req.driverId = user.id;
          next();
        } else {
          res.json({ success: false, message: "UnAuthorized" });
        }
      });
    } else {
      res.status(401).json({ message: "Unauthorized" });
    }
  },
  getCancelledTrips
);
router.get("/getdriversbydate/:date", verify, getDriversByDate);
router.delete("/delete/:Id", verify, deleteDriver);
router.put(
  "/update/:Id",
  verify,
  upload.fields([
    { name: "signature", maxCount: 1 },
    { name: "profilePhoto", maxCount: 1 },
    { name: "IDCard", maxCount: 1 },
    { name: "liscense", maxCount: 1 },
  ]),
  updateDriver
);
router.post("/login", login);
// chat for drivers
router.get("/chat/get-users", verify, getUsersForChat);
router.post("/chat/send-message", verify, sendMessage);
router.get("/chat/get-conversations", verify, getConversations);
router.get("/chat/get-chat-by-conversation-id", verify, getConversationChat);
router.post("/chat/create-group", verify, createGroup);
router.delete("/chat/delete-conversation", verify, deleteConversations);
router.post("/chat/leave-group", verify, require("../controllers/superAdminController").leaveGroup);
router.post("/chat/update-group", verify, require("../controllers/superAdminController").updateGroup);
router.get(
  "/getmytrips",
  (req, res, next) => {
    const token = req.headers["authorization"];
    console.log("Driver Token:", token);

    if (!token) {
      console.log("No token provided");
      return res.status(401).json({ message: "Unauthorized" });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (err) {
        console.log("JWT Error:", err);
        return res.status(403).json({ message: "Forbidden" });
      }

      console.log("Decoded User:", user);

      if (user.role === "Driver") {
        req.driverId = user.id;
        console.log("Driver Authorized:", req.driverId);
        next();
      } else {
        console.log("Unauthorized Role:", user.role);
        return res.json({ success: false, message: "Unauthorized" });
      }
    });
  },
  getMyTrips
);

router.post("/createpassword/:token", createPassword);
router.post(
  "/changepassword",
  (req, res, next) => {
    console.log("Changing Password");
    const token = req.headers["authorization"];
    try {
      const token = req.headers["authorization"];
      if (!token) {
        res.json({ success: false, message: "Not Token Provided" });
      } else {
        console.log("Verifying");

        jwt.verify(token, JWT_SECRET, (err, user) => {
          if (err) {
            console.log("Error While Verifying");
            res.json({ success: false, message: "Invalid Token!" });
          } else {
            console.log("JWT TOKEN verification done");
            req.EMailAddress = user.EMailAddress;

            next();
          }
        });
      }
    } catch (e) {
      res.json({ success: false, token });
    }
  },
  changePassword
);
router.get("/stats", verify, getDriverStats);

// Test endpoint for location updates (for debugging)
router.post("/test-location-update", testLocationUpdate);

module.exports = router