const multer=require('multer')
const express=require('express')
const jwt = require("jsonwebtoken");
const JWT_SECRET = require("../config/jwtSecret");
const{verify}=require('../middlewares/verify')
const {
  addTrip,
  startTrip,
  getTripStatusCounts,
  cancelTrip,
  endTrip,
  getTrips,
  assignTrip,
  addReview,
  getTripById,
  getFilteredTrips,
  deleteTrip,
  updateTrip,
  bookTripsUsingCSV,
  getTripsByDate,
  updateStatus,
  resumeTrip,
  deleteSelected,
  pauseTrip,
  addSignature,
  deleteTripReview,
} = require("../controllers/tripController");

let router = express.Router();

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
router.delete("/deletereview/:tripId/:reviewId", deleteTripReview);
router.delete("/deleteselected", deleteSelected);
router.put("/addsignature/:tripId", upload.single("signature"), addSignature);
router.post("/pausetrip/:tripId", pauseTrip);
router.post("/resumetrip/:tripId", resumeTrip);
router.post("/addreview/:tripId", upload.array("images"), addReview);
router.put("/cancel/:tripId", cancelTrip);
router.get(
  "/gettripbyId/:tripId",
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
            if (
              user.role == "Admin" ||
              user.role == "User" ||
              user.role == "Driver"
            ) {
              req.userId = user.id;
              next();
            } else {
              res.json({ succes: false, message: "UnAuthorized" });
            }
          }
        });
      }
    } catch (e) {
      res.json({ success: false });
    }
  },
  getTripById
);
router.post("/addtrip", verify, addTrip);
router.put(
  "/updatestatus/:tripId",
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
          console.log("Ending Trip");
          next();
        } else {
          res.json({ success: false, message: "UnAuthorized" });
        }
      });
    } else {
      res.status(401).json({ message: "Unauthorized" });
    }
  },
  updateStatus
);
router.get("/gettripsbydate/:date", verify, getTripsByDate);
router.delete("/delete/:tripId", verify, deleteTrip);
router.put("/update/:tripId", verify, updateTrip);
router.get("/gettrips", verify, getTrips);
router.post(
  "/booktripsusingCSV",
  verify,
  upload.single("xlsx"),
  bookTripsUsingCSV
);
router.post("/assigntrip/:tripId/:driverId", verify, assignTrip);
router.get("/getfilteredtrips/:filter", verify, getFilteredTrips);
router.post(
  "/start/:tripId",
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
          console.log("Starting Trip");
          next();
        } else {
          res.json({ success: false, message: "UnAuthorized" });
        }
      });
    } else {
      res.status(401).json({ message: "Unauthorized" });
    }
  },
  startTrip
);
router.post(
  "/end/:tripId",
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
          console.log("Ending Trip");
          next();
        } else {
          res.json({ success: false, message: "UnAuthorized" });
        }
      });
    } else {
      res.status(401).json({ message: "Unauthorized" });
    }
  },
  endTrip
);

router.get("/trip-status-counts", verify, getTripStatusCounts);

module.exports=router