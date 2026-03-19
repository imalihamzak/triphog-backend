const express = require("express");
const {
  adminSignUp,
  getAllAdmins,
  createPayment,
  editPayment,
  deletePayment,
  sendPasswordLink,
  getSingleAdmin,
  updateAdmin,
  getAdminById,
  holdAdmin,
  reActivateAdmin,
  changePassword,
  deleteAdmin,
  getSuperAdmin,
  giveWarning,
  getAllPayments,
  createSuperAdmin,
  createPassword,
  superAdminLogin,
  getDocs,
  addDoc,
  deleteDoc,
  superAdminForgotPassword,
  superAdminResetPassword,
  getAdminStatistics,
  getUsersForChat,
  sendMessage,
  getConversations,
  deleteConversations,
  getConversationChat,
  createGroup,
  getProfileData, // Add the new controller
} = require("../controllers/superAdminController");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const { verifySuperAdmin } = require("../middlewares/verify");
const JWT_SECRET = require("../config/jwtSecret");
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

//Create Admin
//Get All Admins
router.post(
  "/adddoc",
  (req, res, next) => {
    try {
      console.log("Adding Doc For Super Admin Middleware");
      const token = req.headers["authorization"];
      if (token) {
        jwt.verify(token, JWT_SECRET, (error, user) => {
          if (error) {
            res.json({ success: false });
          } else {
            if (user.role == "SuperAdmin") {
              req.userId = user.id;
              console.log("Super Admin Docs", req.userId);
              next();
            } else {
              console.log("Unathourized");
              res.json({ success: false });
            }
          }
        });
      } else {
        console.log("No Token Provided");
        res.json({ success: false });
      }
    } catch (e) {
      console.log(("Middleware ERror", e.message));
      res.json({ success: false });
    }
  },
  upload.single("document"),
  addDoc
);
router.get(
  "/getdocs",
  (req, res, next) => {
    console.log("Getting Docs For Super Admin");
    try {
      const token = req.headers["authorization"];
      if (token) {
        jwt.verify(token, JWT_SECRET, (error, user) => {
          if (error) {
            res.json({ success: false });
          } else {
            if (user.role == "SuperAdmin") {
              req.userId = user.id;
              console.log("Super Admin Docs", req.userId);
              next();
            } else {
              console.log("Unauthorized");
              res.json({ success: false });
            }
          }
        });
      } else {
        console.log("No Token Provided");
        res.json({ success: false });
      }
    } catch (e) {
      console.log("Error Msg", e.message);
      res.json({ success: false });
    }
  },
  getDocs
);
router.delete(
  "/deletedoc/:docId",
  (req, res, next) => {
    console.log("Deleting Super Admin Doc");
    try {
      const token = req.headers["authorization"];
      if (token) {
        jwt.verify(token, JWT_SECRET, (error, user) => {
          if (error) {
            res.json({ success: false });
          } else {
            if (user.role == "SuperAdmin") {
              req.userId = user.id;
              console.log("Super Admin Docs", req.userId);
              next();
            } else {
              console.log("UnAuthorized");
              res.json({ success: false });
            }
          }
        });
      } else {
        console.log("No Token Provided");
        res.json({ success: false });
      }
    } catch (e) {
      console.log("Error Msg", e.message);
      res.json({ success: false });
    }
  },
  deleteDoc
);
router.post("/admin/sendpasswordlink/:adminId", sendPasswordLink);
router.put("/admin/hold/:adminId", holdAdmin);
router.put("/admin/reactivate/:adminId", reActivateAdmin);
router.post("/createsuperadmin", createSuperAdmin);
router.get("/getadminstatistics", getAdminStatistics);
router.post("/admin", upload.single("profilePhoto"), adminSignUp);
router.route("/admin").get(getAllAdmins);
router.put("/changepassword", changePassword);
router.post("/admin/create-password/:token", createPassword);
//Get Single Admin
//Update Admin
//Delete Admin
router.get(
  "/getsuperadmin",
  (req, res, next) => {
    const token = req.headers["authorization"];
    if (token) {
      jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
          return res.status(403).json({ message: "Forbidden" });
        }
        console.log("Admin", user);

        req.superAdmin = user;
        next();
      });
    } else {
      res.status(401).json({ message: "Unauthorized" });
    }
  },
  getSuperAdmin
);
router.get("/getadminbyId/:adminId", getAdminById);
router.get(
  "/admin/getbyId/:token",
  (req, res, next) => {
    let token = req.params.token;
    if (token) {
      jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
          return res.status(403).json({ message: "Forbidden" });
        } else {
          if (user.role == "Admin") {
            req.userId = user.id;
            next();
          } else if (user.role == "User") {
            req.userId = user.createdBy;
            next();
          }
        }
        console.log("Admin", user);
      });
    } else {
      res.status(401).json({ message: "Unauthorized" });
    }
  },
  getSingleAdmin
);

// New route for profile page that uses Authorization header
router.get(
  "/admin/getbyId",
  (req, res, next) => {
    const token = req.headers["authorization"];
    if (token) {
      jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
          return res.status(403).json({ message: "Forbidden" });
        } else {
          // Handle both "SuperAdmin" and "Super Admin" role names
          if (user.role == "Admin" || user.role == "SuperAdmin" || user.role == "Super Admin") {
            req.userId = user.id;
            req.userRole = user.role; // Pass the role to the controller
            next();
          } else if (user.role == "User") {
            req.userId = user.createdBy;
            req.userRole = user.role;
            next();
          } else {
            return res.status(403).json({ message: "Forbidden - Invalid role" });
          }
        }
        console.log("User authenticated:", user);
      });
    } else {
      res.status(401).json({ message: "Unauthorized" });
    }
  },
  getProfileData // Use the new controller
);
router.put("/admin/update/:id", upload.single("profilePhoto"), updateAdmin);
router.delete("/admin/delete/:id", deleteAdmin);
router.post("/forgotpassword", superAdminForgotPassword);
router.post("/resetpassword/:token", superAdminResetPassword);

//Give Warning
router.route("/:id/warning").post(giveWarning);
//Create Payment
//Get All Payments of Specific User
// router.route("admin/:id/payment").post(createPayment).get(getAllPayments);
// Add leading slash to the route
router.route("/admin/:id/payment").post(createPayment).get(getAllPayments);
//Edit Payment
//Delete Payment
router.route("/payment/:id").patch(editPayment).delete(deletePayment);
router.post("/login", superAdminLogin);

// chat
router.get("/chat/get-users", verifySuperAdmin, getUsersForChat);
router.post("/chat/send-message", verifySuperAdmin, sendMessage);
router.post("/chat/create-group", verifySuperAdmin, createGroup);
router.get("/chat/get-conversations", verifySuperAdmin, getConversations);
router.get(
  "/chat/get-chat-by-conversation-id",
  verifySuperAdmin,
  getConversationChat
);
router.delete(
  "/chat/delete-conversation",
  verifySuperAdmin,
  deleteConversations
);

module.exports = router;
