const multer=require('multer')
const express=require('express')
const{verify, verifyDriver}=require('../middlewares/verify')
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

const verifyRoles = (roles) => (req, res, next) => {
  verify(req, res, () => {
    if (roles.includes(req.userRole)) {
      if (req.userRole === "Driver") req.driverId = req.userId;
      return next();
    }
    return res.json({ success: false, message: "UnAuthorized" });
  });
};

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
router.get("/gettripbyId/:tripId", verifyRoles(["Admin", "User", "Driver"]), getTripById);
router.post("/addtrip", verify, addTrip);
router.put("/updatestatus/:tripId", verifyDriver, updateStatus);
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
router.post("/start/:tripId", verifyDriver, startTrip);
router.post("/end/:tripId", verifyDriver, endTrip);

router.get("/trip-status-counts", verify, getTripStatusCounts);

module.exports=router
