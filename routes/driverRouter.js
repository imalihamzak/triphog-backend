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
const { verify, verifyDriver } = require("../middlewares/verify");
const multer = require("multer");

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
router.get("/getstatistics", verifyDriver, getStatistics);
router.put("/updatelocation", verifyDriver, updateLocation);
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
router.get("/getupcomingtrips", verifyDriver, getUpcomingTrips);
router.get("/getcancelledtrips", verifyDriver, getCancelledTrips);
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
router.get("/getmytrips", verifyDriver, getMyTrips);

router.post("/createpassword/:token", createPassword);
router.post("/changepassword", verifyDriver, changePassword);
router.get("/stats", verify, getDriverStats);

// Test endpoint for location updates (for debugging)
router.post("/test-location-update", testLocationUpdate);

module.exports = router
