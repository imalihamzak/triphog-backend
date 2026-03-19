const express = require("express");
const jwt = require("jsonwebtoken");
const JWT_SECRET = require("../config/jwtSecret");
const {
  createMeeting,
  getMeetings,
  editMeeting,
  deleteMeeting,
  deleteBulkMeetings,
  getMeetingStats,
} = require("../controllers/meetingController");

const router = express.Router();

// Authentication middleware
const authenticateAndAuthorize = (roles = ["Admin", "SuperAdmin", "User"]) => {
  return (req, res, next) => {
    const token = req.headers["authorization"];
    if (!token) {
      return res
        .status(401)
        .json({ success: false, message: "No token provided!" });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (err) {
        return res
          .status(403)
          .json({ success: false, message: "Forbidden - Invalid token" });
      }

      if (!roles.includes(user.role)) {
        return res.status(403).json({
          success: false,
          message: "Unauthorized - Insufficient privileges",
        });
      }

      // Attach user information to the request
      req.user = user;
      req.createdBy = user.id;
      next();
    });
  };
};

// Routes
router.post("/create-meeting", authenticateAndAuthorize(), createMeeting);

router.get("/getmeetings", authenticateAndAuthorize(), getMeetings);
router.get("/stats", authenticateAndAuthorize(), getMeetingStats);

router.put("/edit-meeting/:id", authenticateAndAuthorize(), editMeeting);

router.delete("/delete-meeting/:id", authenticateAndAuthorize(), deleteMeeting);

router.delete("/bulk-delete", authenticateAndAuthorize(), deleteBulkMeetings);

// Additional meeting routes can be added here following the same pattern
// router.delete("/delete-meeting/:id", authenticateAndAuthorize(), deleteMeeting);

module.exports = router;