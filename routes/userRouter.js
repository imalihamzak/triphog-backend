const express = require("express");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const JWT_SECRET = require("../config/jwtSecret");
const {
  login,
  addUser,
  getUser,
  deleteUser,
  updateUser,
  getAllUsers,
  createPassword,
  deleteSelected,
  getFilteredUsers,
  getUsersByDate,
  getUsersForChat,
  sendMessage,
  getConversations,
  getConversationChat,
  deleteConversations,
  createGroup,
  forgotPassword,
  resetPassword,
  changePassword,
  updateOwnProfile,
  resendWelcomeEmail,
} = require("../controllers/UserController");
const { verify } = require("../middlewares/verify");

const router = express.Router();
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
router.delete("/deleteselected", deleteSelected);
router.post("/forgotpassword", forgotPassword);
router.post("/resetpassword/:token", resetPassword);
router.post("/changepassword", verify, changePassword);
router.put("/updateprofile", verify, upload.single("profilePhoto"), updateOwnProfile);
router.post(
  "/adduser",
  upload.single("profilePhoto"),
  (req, res, next) => {
    try {
      // Express normalizes headers to lowercase, but check both cases for safety
      const token = req.headers["authorization"] || req.headers["Authorization"];
      console.log("🔍 /adduser - All headers keys:", Object.keys(req.headers));
      console.log("🔍 /adduser - Token received:", token ? token.substring(0, 50) + '...' : 'NO TOKEN');
      console.log("🔍 /adduser - Token length:", token ? token.length : 0);
      console.log("🔍 /adduser - JWT_SECRET being used:", JWT_SECRET.substring(0, 10) + '...');
      console.log("🔍 /adduser - JWT_SECRET length:", JWT_SECRET.length);
      
      if (!token) {
        console.log("❌ No token found in headers");
        console.log("Available headers:", Object.keys(req.headers).filter(h => h.toLowerCase().includes('auth')));
        res.json({ success: false, message: "Not Token Provided!" });
        return;
      }
      
      // Trim token in case there's whitespace
      const cleanToken = token.trim();
      
      jwt.verify(cleanToken, JWT_SECRET, (err, user) => {
          if (err) {
          console.log("❌ JWT Verification Error:", {
            name: err.name,
            message: err.message,
            tokenPreview: cleanToken.substring(0, 50) + '...',
            tokenLength: cleanToken.length,
            jwtSecretPreview: JWT_SECRET.substring(0, 10) + '...',
            jwtSecretLength: JWT_SECRET.length,
            errorStack: err.stack
          });
          res.json({ success: false, message: `Invalid Token! ${err.name}: ${err.message}` });
          } else {
          console.log("✅ Decoded user:", JSON.stringify(user, null, 2));
            if (user.role == "Admin") {
              req.userId = user.id;
              next();
          } else {
            console.log("⚠️ Role mismatch. Expected: Admin, Got:", user.role);
            res.json({ success: false, message: `Unauthorized! Expected Admin role, got: ${user.role}` });
            }
          }
        });
    } catch (e) {
      console.log("❌ Exception in /adduser middleware:", e.message);
      console.log("❌ Exception stack:", e.stack);
      res.json({ success: false, message: e.message });
    }
  },
  addUser
);
router.get(
  "/getallusers",
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
              req.userId = user.id;
              next();
            }
          }
        });
      }
    } catch (e) {
      res.json({ success: false });
    }
  },
  getAllUsers
);
router.get(
  "/getuserbyId/:userId",
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
            // Allow Admin to access any user, or User to access their own data
            if (user.role == "Admin" || (user.role == "User" && user.id == req.params.userId)) {
              req.userId = req.params.userId;
              next();
            } else {
              res.json({ success: false, message: "Unauthorized!" });
            }
          }
        });
      }
    } catch (e) {
      res.json({ success: false });
    }
  },
  getUser
);
router.post("/login", login);
router.get(
  "/getfilteredusers/:filter",
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
              req.userId = user.id;
              next();
            }
          }
        });
      }
    } catch (e) {
      res.json({ success: false });
    }
  },
  getFilteredUsers
);
router.get(
  "/getusersbydate/:date",
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
              req.userId = user.id;
              next();
            }
          }
        });
      }
    } catch (e) {
      res.json({ success: false });
    }
  },
  getUsersByDate
);
router.put(
  "/updateuser/:userId",
  upload.single("profilePhoto"),
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
              req.userId = user.id;
              next();
            }
          }
        });
      }
    } catch (e) {
      res.json({ success: false });
    }
  },
  updateUser
);
router.delete(
  "/deleteuser/:userId",
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
              req.userId = user.id;
              next();
            }
          }
        });
      }
    } catch (e) {
      res.json({ success: false });
    }
  },
  deleteUser
);
router.post(
  "/resend-welcome-email/:userId",
  (req, res, next) => {
    try {
      const token = req.headers["authorization"];
      if (!token) {
        res.json({ success: false, message: "Not Token Provided!" });
      } else {
        jwt.verify(token, JWT_SECRET, (err, user) => {
          if (err) {
            res.json({ success: false, message: "Invalid Token!" });
          } else if (user.role == "Admin") {
            req.userId = user.id;
            next();
          } else {
            res.json({ success: false, message: "Unauthorized!" });
          }
        });
      }
    } catch (e) {
      res.json({ success: false });
    }
  },
  resendWelcomeEmail
);
router.post("/createpassword/:token", createPassword);

// Test endpoint to verify JWT_SECRET configuration (remove in production if needed)
router.get("/test-jwt-secret", (req, res) => {
  res.json({
    success: true,
    jwtSecretPreview: JWT_SECRET.substring(0, 10) + '...',
    jwtSecretLength: JWT_SECRET.length,
    usingEnvVar: !!process.env.JWT_SECRET,
    nodeEnv: process.env.NODE_ENV
  });
});

// chat
router.get("/chat/get-users", verify, getUsersForChat);
router.post("/chat/send-message", verify, sendMessage);
router.post("/chat/create-group", verify, createGroup);
router.get("/chat/get-conversations", verify, getConversations);
router.get("/chat/get-chat-by-conversation-id", verify, getConversationChat);
router.delete("/chat/delete-conversation", verify, deleteConversations);
router.post("/chat/leave-group", verify, require("../controllers/superAdminController").leaveGroup);
router.post("/chat/update-group", verify, require("../controllers/superAdminController").updateGroup);

module.exports = router;
