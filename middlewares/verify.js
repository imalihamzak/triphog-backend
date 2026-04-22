const jwt = require("jsonwebtoken");
const JWT_SECRET = require("../config/jwtSecret");
const UserModel = require("../models/UserModel");

const getTokenFromHeaders = (req) => {
  let token = req.headers["authorization"] || req.headers["Authorization"];
  if (token && typeof token === "string") {
    token = token.replace(/^\s*Bearer\s+/i, "").trim();
  }
  return token;
};

let verify = (req, res, next) => {
  try {
    let token = getTokenFromHeaders(req);
    if (!token) {
      res.json({ success: false, message: "Not Token Provided!" });
    } else {
      jwt.verify(token, JWT_SECRET, async (err, user) => {
        if (err) {
          res.json({ success: false, message: "Invalid Token!" });
          console.log("Error", err);
        } else {
          req.user = user;
          console.log("user", user);
          
          // Check if user is inactive (for sub-admin users)
          // This is an additional safeguard - the login function also checks status
          if (user.role === "User") {
            try {
              const currentUser = await UserModel.findById(user.id);
              if (currentUser) {
                // Normalize status: lowercase, trim, remove all spaces
                const normalizedStatus = currentUser.status 
                  ? String(currentUser.status).toLowerCase().trim().replace(/\s+/g, '') 
                  : "";
                
                // Block if status is NOT exactly "active"
                if (normalizedStatus !== "active") {
                  console.log("🚫 Middleware: User is inactive, blocking request");
                  console.log("🚫 User ID:", user.id);
                  console.log("🚫 Raw Status:", currentUser.status);
                  console.log("🚫 Normalized Status:", normalizedStatus);
                  return res.status(403).json({ 
                    success: false, 
                    message: "Your account is inactive. Please contact your administrator to activate your account." 
                  });
                }
              }
            } catch (dbError) {
              console.log("Database error while checking user status:", dbError);
            }
          }
          
          if (user.role == "Admin") {
            req.userId = user.id;
            req.userRole = "Admin";
            next();
          } else if (user.role == "User") {
            req.userId = user.createdBy != null ? String(user.createdBy).trim() : undefined;
            req.subAdminId = user.id != null ? String(user.id).trim() : undefined;
            req.userRole = "User";
            next();
          } else if (user.role == "Patient" || user.role == "Driver") {
            req.userId = user.id;
            req.userRole = user.role;
            next();
          } else {
            req.userId = user.id;
            req.userRole = user.role || null;
            next();
          }
        }
      });
    }
  } catch (e) {
    res.json({ success: false });
  }
};

const verifyDriver = (req, res, next) => {
  try {
    const token = getTokenFromHeaders(req);
    if (!token) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (err) {
        console.log("Driver JWT Error:", err);
        return res.status(403).json({ success: false, message: "Forbidden" });
      }

      if (user.role !== "Driver") {
        return res.status(403).json({ success: false, message: "Unauthorized" });
      }

      req.user = user;
      req.userId = user.id;
      req.userRole = "Driver";
      req.driverId = user.id;
      req.EMailAddress = user.EMailAddress;
      next();
    });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
};

const verifySuperAdmin = (req, res, next) => {
  try {
    const token = getTokenFromHeaders(req);

    if (!token) {
      return res.status(401).json({ success: false, message: "Forbidden!" });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (err) {
        return res.status(401).json({ success: false, message: "Forbidden!" });
      }

      if (user.role !== "SuperAdmin") {
        return res.status(401).json({ success: false, message: "Forbidden!" });
      }

      req.user = user;
      next();
    });
  } catch (e) {
    return res
      .status(500)
      .json({ success: false, message: e.message ?? "Forbidden!" });
  }
};

module.exports = { verify, verifyDriver, verifySuperAdmin };
