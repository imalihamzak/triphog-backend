const express = require("express");
const jwt = require("jsonwebtoken");
const JWT_SECRET = require("../config/jwtSecret");
const { verify } = require("../middlewares/verify");
const multer = require("multer");
const {
  login,
  forgotPassword,
  resetPassword,
  changePassword,
  getAllUsers,
  createCheckoutSession,
  updatePaymentHistory,
  approveDriver,
  denyDriver,
  getDocs,
  addDoc,
  deleteDoc,
  addReview,
  getReviews,
  deleteReview,
  updateFrequentlyVisitedPages,
  getAdminById,
  requestDemo,
  verifyStripePayment,
  recordStripePayment,
  getPaymentsByAdmin,
  getUsersForChat,
  sendMessage,
  getConversations,
  getConversationChat,
  deleteConversations,
  createGroup,
  addFrequentlyVisitedPage,
  getFrequentlyVisitedPages,
  removeFrequentlyVisitedPage,
  getCustomQuickTabs,
  updateCustomQuickTabs,
  testEmail,
} = require("../controllers/adminController");
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

const router = express.Router();
router.post("/request-demo", requestDemo);
router.get("/getsingleadmin/:id", getAdminById);
router.put(
  "/update-frequently-visited-pages",
  verify,
  updateFrequentlyVisitedPages
);
router.delete("/deletereview/:reviewId", deleteReview);
router.post("/adddoc", verify, upload.single("document"), addDoc);
router.get("/getdocs", verify, getDocs);
router.delete("/deletedoc/:docId", verify, deleteDoc);
router.post("/addreview", addReview);
router.get("/getallreviews", verify, getReviews);
router.put("/approvedriver/:driverId", approveDriver);
router.put("/denydriver/:driverId", denyDriver);
router.put(
  "/update-payment-history",
  (req, res, next) => {
    try {
      const token = req.headers["authorization"];
      if (!token) {
        res.json({ success: false, message: "Not Token Provided!" });
      } else {
        jwt.verify(token, JWT_SECRET, (err, user) => {
          if (err) {
            res.json({ success: false, message: "Invalid Token!" });
            console.log("Error", err);
          } else {
            console.log("user", user);
            if (user.role == "Admin") {
              req.adminId = user.id;
              next();
            } else {
              res.json({ success: false, message: "Unauthorized" });
            }
          }
        });
      }
    } catch (e) {
      res.json({ success: false });
    }
  },
  updatePaymentHistory
);
router.route("/login").post(login);
router.get("/getallusers", verify, getAllUsers);
router.post("/forgotpassword", forgotPassword);
router.post("/resetpassword/:token", resetPassword);
router.post("/changepassword", changePassword);
// Strip Payment Routes
router.post("/create-checkout-session", createCheckoutSession);
router.post("/verify-stripe-payment", verifyStripePayment);
router.post("/:adminId/payment", recordStripePayment);
router.get("/:adminId/payment-history", getPaymentsByAdmin);

// chat
router.get("/chat/get-users", verify, getUsersForChat);
router.post("/chat/send-message", verify, sendMessage);
router.post("/chat/create-group", verify, createGroup);
router.get("/chat/get-conversations", verify, getConversations);
router.get("/chat/get-chat-by-conversation-id", verify, getConversationChat);
router.delete("/chat/delete-conversation", verify, deleteConversations);
router.post("/chat/leave-group", verify, require("../controllers/superAdminController").leaveGroup);
router.post("/chat/update-group", verify, require("../controllers/superAdminController").updateGroup);

// ✅ Frequently Visited Pages
router.post("/frequent/add", addFrequentlyVisitedPage);
router.post("/frequent/get", getFrequentlyVisitedPages);
router.post("/frequent/remove", removeFrequentlyVisitedPage);

// ✅ Custom Quick Tabs
router.post("/quicktabs/get", getCustomQuickTabs);
router.post("/quicktabs/update", updateCustomQuickTabs);

// Test email configuration
router.get("/test-email", testEmail);

module.exports = router;
