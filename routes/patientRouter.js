const express = require("express");
const {
  addPatient,
  createPassword,
  getPatients,
  getPatient,
  getPatientStats,
  updatePatient,
  deletePatient,
  login,
  signUp,
  changePassword,
  getMyTrips,
  getFilteredPatients,
  getPatientsByDate,
  getStatistics,
  forgotPassword,
  deleteSelected,
  resetPassword,
  bulkUploadPatients,
  resendWelcomeEmail,
  getUsersForChat,
  sendMessage,
  getConversations,
  createGroup,
} = require("../controllers/patientController");
const {
  getConversationChat,
  deleteConversations,
} = require("../controllers/superAdminController");
const jwt = require("jsonwebtoken");
const JWT_SECRET = require("../config/jwtSecret");
const { verify } = require("../middlewares/verify");
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

let router = express.Router();
router.delete("/deleteselected", deleteSelected);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password/:token", resetPassword);
router.get(
  "/getstatistics",
  (req, res, next) => {
    const token = req.headers["authorization"];
    if (token) {
      jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
          return res.status(403).json({ message: "Forbidden" });
        }
        console.log("Patient", user);

        if ((user.role === "Patient")) {
          req.patientId = user.id;
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
router.post(
  "/add",
  verify,
  upload.single("signature"),
  addPatient
);
router.post("/createpassword/:token", createPassword);
router.get("/getall", verify, getPatients);
router.get("/getone/:Id", verify, getPatient);
router.post("/resend-welcome-email/:Id", verify, resendWelcomeEmail);
router.put(
  "/update/:Id",
  verify,
  upload.fields([
    { name: "signature", maxCount: 1 },
    { name: "profilePhoto", maxCount: 1 },
  ]),
  updatePatient
);
router.delete("/delete/:Id", deletePatient);
router.post("/login", login);
router.post(
  "/signup",
  upload.single("signature"),
  signUp
);
router.get("/getpatientsbydate/:date", verify, getPatientsByDate);
router.get("/getfilteredpatients/:filter", verify, getFilteredPatients);
router.get(
  "/getmytrips",
  (req, res, next) => {
    const token = req.headers["authorization"];
    if (token) {
      jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
          return res.status(403).json({ message: "Forbidden" });
        }
        console.log("Patient", user);

        if ((user.role === "Patient")) {
          req.patientId = user.id;
          next();
        } else {
          res.json({ success: false, message: "UnAuthorized" });
        }
      });
    } else {
      res.status(401).json({ message: "Unauthorized" });
    }
  },
  getMyTrips
);
router.post("/changepassword", changePassword);
router.get("/patient-stats", verify, getPatientStats);
router.post("/bulk-upload", verify, upload.single("file"), bulkUploadPatients);

// chat for patients
router.get("/chat/get-users", verify, getUsersForChat);
router.post("/chat/send-message", verify, sendMessage);
router.get("/chat/get-conversations", verify, getConversations);
router.get("/chat/get-chat-by-conversation-id", verify, getConversationChat);
router.post("/chat/create-group", verify, createGroup);
router.delete("/chat/delete-conversation", verify, deleteConversations);
router.post("/chat/leave-group", verify, require("../controllers/superAdminController").leaveGroup);
router.post("/chat/update-group", verify, require("../controllers/superAdminController").updateGroup);

module.exports = router;
