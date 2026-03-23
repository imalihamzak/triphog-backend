const TripModel = require('../models/TripModel')
const mongoose = require('mongoose')
const path = require('path')
const MessageModel = require("../models/MessageModel")
const { getIO, getReceiverSocketId } = require('../io')
const axios = require('axios')
const fs = require('fs')
const xlsx = require('xlsx')
const Admin = require('../models/adminSchema')
const UserModel = require('../models/UserModel')
const NotificationModel = require('../models/NotificationModel')
const PatientModel = require('../models/PatientModel')
const DriverModel = require('../models/DriverModel')
const moment = require('moment')
const { DateTime } = require("luxon");
const { getUploadsBaseUrl } = require("../config/appUrls");

/** Normalize id from token/req to a string (handles ObjectId-like objects). */
function toId(v) {
  if (v == null) return null;
  const s = typeof v === "string" ? v : (v && (v.toString?.() || v.valueOf?.())) ? String(v) : null;
  return s && s.trim() && s !== "[object Object]" ? s.trim() : null;
}

/** Order within a group: main (0), return (1), additional (2). */
function getTripTypeOrder(trip) {
  const t = (trip.tripType || "").toLowerCase();
  if (t === "main") return 0;
  if (t === "return") return 1;
  if (t === "additional") return 2;
  const legId = (trip.legId || "").trim();
  if (legId === "Return" || legId.endsWith("-Return")) return 1;
  return trip.isOtherTrip ? 2 : 0;
}

/** Sort trips by booking group: each group shows main, then return, then additional; groups ordered by newest booking first. */
function sortTripsMainReturnAdditional(trips) {
  const groupMap = new Map(); // groupId -> { minCreatedAt, trips: [] }
  for (const trip of trips) {
    const gid = trip.tripGroupId ? String(trip.tripGroupId) : String(trip._id);
    if (!groupMap.has(gid)) {
      groupMap.set(gid, { minCreatedAt: trip.createdAt ? new Date(trip.createdAt).getTime() : 0, trips: [] });
    }
    const entry = groupMap.get(gid);
    entry.trips.push(trip);
    const t = trip.createdAt ? new Date(trip.createdAt).getTime() : 0;
    if (t < entry.minCreatedAt) entry.minCreatedAt = t;
  }
  const sortedGroups = [...groupMap.entries()].sort((a, b) => b[1].minCreatedAt - a[1].minCreatedAt); // newest group first
  const result = [];
  for (const [, entry] of sortedGroups) {
    entry.trips.sort((a, b) => {
      const orderA = getTripTypeOrder(a);
      const orderB = getTripTypeOrder(b);
      if (orderA !== orderB) return orderA - orderB;
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateA - dateB;
    });
    result.push(...entry.trips);
  }
  trips.splice(0, trips.length, ...result);
  return trips;
}

/** Build filter: Admin sees own trips; User sees parent admin's trips; Driver sees only trips assigned to them. */
async function getTripVisibilityFilter(req) {
  const role = req.user?.role || req.userRole;

  if (role === "Driver") {
    const driverId = toId(req.user?.id) || toId(req.userId);
    if (!driverId || !mongoose.Types.ObjectId.isValid(driverId))
      return { driverRef: mongoose.Types.ObjectId.createFromHexString("000000000000000000000000") };
    return { driverRef: driverId };
  }

  if (role === "User") {
    const tokenId = toId(req.user?.id) || toId(req.subAdminId);
    const tokenCreatedBy = toId(req.user?.createdBy) || toId(req.userId);
    const subUser = tokenId ? await UserModel.findById(tokenId).select("addedBy").lean().catch(() => null) : null;
    let parentAdminId = subUser?.addedBy != null ? toId(subUser.addedBy) : null;
    if (!parentAdminId && tokenId && mongoose.Types.ObjectId.isValid(tokenId)) parentAdminId = tokenId;
    // Company-locked visibility: if parent admin has a company code, use it to prevent cross-company leakage
    if (parentAdminId && mongoose.Types.ObjectId.isValid(parentAdminId)) {
      const adminForCode = await Admin.findById(parentAdminId).select("companyCode").lean().catch(() => null);
      const code = adminForCode?.companyCode ? String(adminForCode.companyCode).trim() : null;
      if (code) {
        return { addedByCompanyCode: code };
      }
    }
    const allIds = [parentAdminId, tokenId, tokenCreatedBy]
      .filter((id) => id && typeof id === "string" && id.trim() && mongoose.Types.ObjectId.isValid(id))
      .map((id) => String(id).trim());
    const ids = [...new Set(allIds)];
    if (ids.length === 0) return { addedBy: "impossible-id-no-match" };
    const filter = { $or: ids.map((id) => ({ addedBy: id })) };
    console.log("[getTripVisibilityFilter] User:", { tokenId, tokenCreatedBy, parentAdminId, ids, filter: JSON.stringify(filter) });
    return filter;
  }

  const adminId = toId(req.userId) || toId(req.user?.id);
  if (!adminId || !mongoose.Types.ObjectId.isValid(adminId))
    return { addedBy: "impossible-id-no-match" };

  // Company-locked visibility for Admin: prefer company code when available
  const adminForCode = await Admin.findById(adminId).select("companyCode").lean().catch(() => null);
  const code = adminForCode?.companyCode ? String(adminForCode.companyCode).trim() : null;
  if (code) return { addedByCompanyCode: code };

  // Fallback for legacy data without addedByCompanyCode
  return { addedBy: adminId };
}

exports.deleteSelected = async (req, res) => {
  try {
    console.log("Selected Trips Ids", req.body.selectedTripsIds);
    await TripModel.deleteMany({ _id: { $in: req.body.selectedTripsIds } });
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false });
  }
};
exports.updateStatus = async (req, res) => {
  try {
    const DEFAULT_FROM_PHOTO_URL =
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRo1KQPQY6ldUIZfCi4UOUx6ide2_s0vuIxRQ&s";
    if (req.body.status == "Cancelled") {
      let trip = await TripModel.findOne({ _id: req.params.tripId });
      let driver = await DriverModel.findOne({ _id: trip.driverRef });
      if (trip.patientRef) {
        let notification = new NotificationModel({
          fromId: driver._id,
          toId: trip.patientRef ? trip.patientRef : "randomReference",
          fromPhotoUrl: driver.profilePhotoUrl || DEFAULT_FROM_PHOTO_URL,
          type: "TripCancelled",
          text: "Cancelled Your Trip",
          from: driver.firstName + driver.lastName,
        });
      }

      let notification2 = new NotificationModel({
        fromId: driver._id,
        toId: trip.addedBy ? trip.addedBy : "Admin",
        fromPhotoUrl: driver.profilePhotoUrl || DEFAULT_FROM_PHOTO_URL,
        type: "TripCancelled",
        text: "Cancelled Your Trip",
        from: driver.firstName + driver.lastName,
      });
    }
    const updateData = {
      status: req.body.status,
    };
    let updatedTrip;
    if (req.body.status == "Completed") {
      let endingAtDate = new Date();
      updatedTrip = await TripModel.findByIdAndUpdate(
        req.params.tripId,
        {
          status: "Completed",
          completedAt: endingAtDate,
          timeTaken: 0,
          endedAt: endingAtDate,
        },
        { new: true, runValidators: true }
      );
    } else {
      updatedTrip = await TripModel.findByIdAndUpdate(
        req.params.tripId,
        { status: req.body.status },
        { new: true, runValidators: true }
      );
      console.log(updatedTrip);
    }

    if (req.body.status === "Completed" || req.body.status === "Cancelled") {
      if (updatedTrip && updatedTrip.driverRef) {
        await DriverModel.findByIdAndUpdate(updatedTrip.driverRef, { isAvailable: true });
      }
    }

    res.json({
      success: true,
      message: "Trip marked as completed successfully",
      updatedTrip,
    });
  } catch (e) {
    res.json({ success: false, message: "Internal Server Error!" });
  }
};
exports.addReview = async (req, res) => {
  console.log("Review For Trip Id", req.params.tripId);
  console.log(req.params.tripId);
  try {
    let trip = await TripModel.findById(req.params.tripId);
    if (!trip) {
      res.json({ success: false, message: "Trip Not Found!" });
    } else {
      console.log("Trip Review Data");
      let reviews = trip.reviews;
      let images = [];
      if (req.files) {
        for (let file of req.files) {
          images.push(getUploadsBaseUrl() + "/uploads/" + file.path);
        }
      }
      reviews = reviews.concat({
        ID: Math.random(),
        addedON: new Date(),
        description: req.body.description,
        rating: Number(req.body.rating),
        images,
      });
      let newtrip = await TripModel.findByIdAndUpdate(
        req.params.tripId,
        { reviews: reviews },
        { new: true, runValidators: true }
      );
      console.log("New Trip Reviews", newtrip.reviews);
      res.json({ success: true });
    }
  } catch (e) {
    res.json({ success: false });
  }
};
exports.deleteTripReview = async (req, res) => {
  console.log("Deleting Trip Review", req.params);
  try {
    let trip = await TripModel.findById(req.params.tripId);
    let reviews = trip.reviews;
    let _reviews = reviews.filter((review) => {
      return review.ID != req.params.reviewId;
    });
    await TripModel.findByIdAndUpdate(
      req.params.tripId,
      { reviews: _reviews },
      { new: true, runValidators: true }
    );
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
};
exports.cancelTrip = async (req, res) => {
  try {
    await TripModel.findByIdAndUpdate(
      req.params.tripId,
      { status: "Cancelled" },
      { new: true, runValidators: true }
    );
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false });
  }
};
(exports.startTrip = async (req, res) => {
  try {
    let trip = await TripModel.findById(req.params.tripId);
    if (!trip) {
      res.json({ success: false, message: "Trip Not Found!" });
    } else {
      let date = new Date();
      await TripModel.findByIdAndUpdate(
        req.params.tripId,
        { startedAt: date, status: "On Route" },
        { new: true, runValidators: true }
      );
      await DriverModel.findByIdAndUpdate(
        req.driverId,
        { status: "On Route" },
        { new: true, runValidators: true }
      );
      trip = await TripModel.findById(req.params.tripId);
      console.log("Trip Has Started At", trip.startedAt);

      res.json({ success: true });
    }
  } catch (e) {
    res.json({ success: false });
  }
}),
  (exports.resumeTrip = async (req, res) => {
    try {
      const trip = await TripModel.findById(req.params.tripId);
      trip.pauses.push({ pauseTime: new Date() });
      await trip.save();
      res.json({ success: true });
    } catch (e) {
      res.json({ success: false });
    }
  });
exports.pauseTrip = async (req, res) => {
  try {
    const trip = await TripModel.findById(req.params.tripId);
    const lastPause = trip.pauses[trip.pauses.length - 1];
    if (lastPause && !lastPause.resumeTime) {
      lastPause.resumeTime = new Date();
      await trip.save();
    }
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false });
  }
};
exports.addSignature = async (req, res) => {
  try {
    if (!req.file) {
      res.json({ success: false, message: "Signature Is Missing" });
    } else {
      let signatureUrl = getUploadsBaseUrl() + "/" + req.file.path;
      await TripModel.findByIdAndUpdate(
        { _id: req.params.tripId },
        { status: "Completed", patientSignatureUrl: signatureUrl },
        { new: true, runValidators: true }
      );
      res.json({ success: true });
    }
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
};
exports.endTrip = async (req, res) => {
  try {
    let trip = await TripModel.findById(req.params.tripId);
    if (!trip) {
      res.json({ success: false, message: "Trip Not Found!" });
    } else {
      let currentDate = new Date();
      let endingDate = new Date();
      console.log("Trip Started at", trip.startedAt);
      let startingDate = new Date(trip.startedAt);
      let differenceInMilliSeconds = endingDate - startingDate;

      console.log("Milli Seconds", differenceInMilliSeconds);
      let totalPausedTime = 0;

      trip.pauses.forEach((pause) => {
        if (pause.resumeTime) {
          totalPausedTime += pause.resumeTime - pause.pauseTime;
        }
      });

      // Convert milliseconds to hours
      let TOTALPAUSEDTIMEINHOURS = totalPausedTime / (1000 * 60 * 60);
      let hours = differenceInMilliSeconds / 3600000; // Convert milliseconds to hours
      console.log("Time Taken In Hours", hours);
      console.log("Total Paused Time In Hours", TOTALPAUSEDTIMEINHOURS);
      hours = parseFloat(hours.toFixed(2));
      console.log("Time Taken", hours);

      console.log("Time Taken Difference", hours - TOTALPAUSEDTIMEINHOURS);
      if (trip.patientRef) {
        await TripModel.findByIdAndUpdate(req.params.tripId, {
          endedAt: endingDate,
          completedAt: endingDate,
          status: "Completed",
          timeTaken: hours - TOTALPAUSEDTIMEINHOURS,
        });
        await DriverModel.findByIdAndUpdate(req.driverId, {
          status: "Available",
        });
        let Trip = await TripModel.findById(req.params.tripId);
        console.log("Patient Reference", trip.patientRef);
        let socketId = getReceiverSocketId(trip.patientRef);
        console.log(
          "Ending Trip And Notifying Patient With SocketId",
          socketId
        );
        getIO().to(socketId).emit("trip-ended", req.params.tripId);
        res.json({ success: true });
      } else {
        await TripModel.findByIdAndUpdate(req.params.tripId, {
          endedAt: endingDate,
          completedAt: endingDate,
          timeTaken: hours - TOTALPAUSEDTIMEINHOURS,
        });

        res.json({ success: false, isPatientMissing: true });
      }
    }
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
};
exports.getTripsByDate = async (req, res) => {
  let date = req.params.date;

  try {
    const limit = parseInt(req.query.limit) || 25; // Number of records per page, default is 25
    const page = parseInt(req.query.page) || 1; // Page number, default is 1
    const status = req.query.status ? String(req.query.status).trim() : null;
    const search = req.query.search ? String(req.query.search).trim() : null;

    // Start and end of the day
    let startOfDay = new Date(date);
    startOfDay.setUTCHours(0, 0, 0, 0);

    let endOfDay = new Date(date);
    endOfDay.setUTCHours(23, 59, 59, 999);

    let isPickUpDateSelected = req.query.isPickUpDateSelected == "true";
    let dateField = isPickUpDateSelected ? "pickUpDate" : "createdAt";

    const addedByFilter = await getTripVisibilityFilter(req);
    let queryConditions = {
      ...addedByFilter,
    };
    if (status) queryConditions.status = status;
    if (search) {
      const s = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(s, "i");
      queryConditions.$or = [
        { driverName: re },
        { patientName: re },
        { patientPhoneNumber: re },
        { patientPhone: re },
        { pickUpDate: re },
      ];
    }

    // If dateField is 'pickUpDate', convert startOfDay and endOfDay to match the format (YYYY/MM/DD).
    if (dateField === "pickUpDate") {
      queryConditions.pickUpDate = date;
    } else {
      // For createdAt (Date range query)
      const startOfDay = new Date(date);
      startOfDay.setUTCHours(0, 0, 0, 0);

      const endOfDay = new Date(date);
      endOfDay.setUTCHours(23, 59, 59, 999);

      queryConditions.createdAt = {
        $gte: startOfDay,
        $lte: endOfDay,
      };
    }

    // Query the database with pagination, then sort main → return → additional
    let trips = await TripModel.find(queryConditions)
      .sort({ createdAt: -1 })
      .limit(limit) // Limit the results based on the query parameter
      .skip((page - 1) * limit);

    sortTripsMainReturnAdditional(trips);

    console.log(trips);
    // Get the total number of trips for this day using the same date field
    const totalTrips = await TripModel.countDocuments(queryConditions);

    const totalPages = Math.ceil(totalTrips / limit); // Calculate total number of pages

    res.json({
      success: true,
      trips, // Trips for the current page
      currentPage: page,
      totalTrips, // Total number of trips for this day
      totalPages, // Total number of pages based on the limit
    });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
};
exports.getFilteredTrips = async (req, res) => {
  const { filter } = req.params;
  let startDate;
  let endDate = moment().endOf("day").toDate(); // End of the current day

  if (filter === "today") {
    startDate = moment().startOf("day").toDate(); // Start of the current day
  } else if (filter === "week") {
    startDate = moment().subtract(7, "days").startOf("day").toDate(); // 7 days ago
  } else if (filter === "month") {
    startDate = moment().subtract(30, "days").startOf("day").toDate(); // 30 days ago
  } else {
    return res.status(400).json({ error: "Invalid filter type" });
  }

  try {
    let filteredTrips = await TripModel.find({
      createdAt: { $gte: startDate, $lte: endDate },
    });
    filteredTrips = filteredTrips.filter((trip) => {
      return trip.addedBy == req.userId;
    });
    res.json(filteredTrips);
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
};
exports.bookTripsUsingCSV = async (req, res) => {
  let routesFound = 0;
  let routesMissing = 0;
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      success: false,
      message: "Google Maps API key is not configured. Please contact support.",
    });
  }

  // Helper function to normalize phone numbers
  function normalizePhoneNumber(phoneNumber) {
    return phoneNumber ? phoneNumber.toString().replace(/[^\d]/g, "") : "";
  }
  function convertTo24Hour(timeStr) {
    if (timeStr == null || timeStr === undefined || String(timeStr).trim() === "") return "00:00";
    timeStr = String(timeStr).trim();
    const parts = timeStr.split(" ");
    const time = parts[0] || "00:00";
    const modifier = (parts[1] || "").toUpperCase();
    const [h, m] = time.split(":").map((n) => parseInt(n, 10) || 0);
    let hours = isNaN(h) ? 0 : h;
    const minutes = isNaN(m) ? 0 : m;
    if (modifier === "PM" && hours !== 12) hours += 12;
    if (modifier === "AM" && hours === 12) hours = 0;
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
  }

  function convertExcelTime(excelTime) {
    if (excelTime == null || excelTime === "") return "00:00";
    if (excelTime instanceof Date) {
      const h = excelTime.getHours();
      const m = excelTime.getMinutes();
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }
    if (typeof excelTime === "number") {
      // Excel time: fraction of day (0.5 = noon), or date+time serial
      let hours, minutes;
      if (excelTime < 1) {
        const totalMins = Math.round(excelTime * 24 * 60);
        hours = Math.floor(totalMins / 60) % 24;
        minutes = totalMins % 60;
      } else {
        const date = new Date((excelTime - 25569) * 86400 * 1000);
        hours = date.getUTCHours();
        minutes = date.getUTCMinutes();
      }
      return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    }
    const s = String(excelTime).trim();
    if (!s) return "00:00";
    return convertTo24Hour(s);
  }

  function parsePickUpDate(val) {
    if (val == null || val === "") return "";
    if (val instanceof Date) {
      if (isNaN(val.getTime())) return "";
      return val.toISOString().split("T")[0];
    }
    if (typeof val === "number" || (typeof val === "string" && /^\d+\.?\d*$/.test(String(val).trim()))) {
      const num = typeof val === "number" ? val : parseFloat(val);
      if (num > 100000) return ""; // Likely a timestamp
      const d = new Date((num - 25569) * 86400 * 1000);
      if (isNaN(d.getTime())) return "";
      return d.toISOString().split("T")[0];
    }
    const str = String(val).trim();
    if (!str) return "";
    const m = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (m) return `${m[3].length === 2 ? "20" + m[3] : m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.split("T")[0];
    return str;
  }
  async function geocodeAddress(address) {
    if (address == null || String(address).trim() === "") return "";
    const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
      address
    )}&key=${apiKey}`;
    try {
      const response = await axios.get(geocodeUrl);
      if (response.data.results.length > 0) {
        const formattedAddress = response.data.results[0].formatted_address;
        console.log(`Geocoded Address: ${formattedAddress}`);
        return formattedAddress;
      } else {
        console.log(`No geocode results for address: ${address}`);
        return address;
      }
    } catch (error) {
      console.error(`Error during geocoding: ${error}`);
      return address;
    }
  }

  try {
    if (!req.file || !req.file.path) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded. Please select a CSV or Excel file.",
      });
    }
    console.log("ADMIN ID", req.userId);
    const filePath = path.join(__dirname, "..", req.file.path);
    console.log("File Path:", filePath);

    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
    if (!rows || rows.length === 0 || !rows[0]) {
      return res.status(400).json({
        success: false,
        message: "The file appears to be empty or has no data rows.",
      });
    }
    console.log("Column Count In File", rows[0].length);

    let columnsCount = rows[0].length;
    const rawHeaders = (rows[0] || []).map((h) => String(h || "").replace(/^\ufeff/, "").trim());
    const headerSet = new Set(rawHeaders.map((h) => h.toLowerCase()));
    const hasPatientName = headerSet.has("patient name") || headerSet.has("patientname");
    const hasPickupAddress = headerSet.has("pickup address") || headerSet.has("pick up address") || headerSet.has("pickupaddress");
    const hasDropoffAddress = headerSet.has("drop-off address") || headerSet.has("dropoff address") || headerSet.has("drop off address") || headerSet.has("dropoffaddress");
    const useSimpleFormat = columnsCount >= 6 && (hasPatientName || hasPickupAddress) && hasDropoffAddress;

    // Resolve company code for sub-admin/main admin visibility
    let addedByCompanyCode = undefined;
    if (req.userId) {
      const adminForCode = await Admin.findOne({ _id: req.userId }).catch(() => null);
      if (adminForCode?.companyCode) addedByCompanyCode = String(adminForCode.companyCode);
    }

    if (useSimpleFormat) {
      const sheetRows = xlsx.utils.sheet_to_json(sheet, { defval: "" });
      const getVal = (row, ...keys) => {
        const norm = (s) => String(s || "").replace(/^\ufeff/, "").trim().toLowerCase();
        for (const k of keys) {
          const v = row[k];
          if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
          const match = Object.keys(row || {}).find((h) => norm(h) === norm(k));
          if (match != null) {
            const v2 = row[match];
            if (v2 !== undefined && v2 !== null && String(v2).trim() !== "") return String(v2).trim();
          }
        }
        return "";
      };
      const hasTripType = headerSet.has("trip type") || headerSet.has("triptype");
      const hasGroupId = headerSet.has("group id") || headerSet.has("groupid") || headerSet.has("group");
      const groupIdToMainId = new Map(); // groupId -> tripGroupId (main trip's _id)
      let tripsCreated = 0;
      for (let row of sheetRows) {
        const tripTypeRaw = hasTripType ? getVal(row, "Trip Type", "tripType").toLowerCase() : "";
        const groupId = hasGroupId ? getVal(row, "Group ID", "groupId", "Group") : "";
        const patientName = getVal(row, "Patient Name", "patientName") || getVal(row, "FULL NAME");
        const patientType = getVal(row, "Patient Type", "patientType") || "Wheel Chair";
        const pickUpAddress = getVal(row, "Pickup Address", "Pick Up Address", "pickUpAddress");
        const dropOffAddress = getVal(row, "Drop-off Address", "Dropoff Address", "Drop off Address", "dropOffAddress");
        const pickUpDateRaw = getVal(row, "Pickup Date", "Pick Up Date", "pickUpDate", "PickupDate") || getVal(row, "Date");
        const appointmentTimeRaw = getVal(row, "Appointment Time", "appointmentTime", "Appt Time", "Appt. Time", "APPOINTMENT TIME", "AppointmentTime");
        const pickUpTimeRaw = getVal(row, "Pickup Time", "Pick Up Time", "pickUpTime", "PREF. PICK UP TIME", "PickupTime");
        const patientPhone = getVal(row, "Patient Phone", "patientPhone", "Member's Phone Number", "Phone", "Phone Number");
        const legIdFromCsv = getVal(row, "Leg ID", "Leg/Trip ID", "Trip ID", "legId", "LegId");

        if (!patientName || !pickUpAddress || !dropOffAddress) continue;

        const pickUpDate = parsePickUpDate(pickUpDateRaw);
        const appointmentTime = convertExcelTime(appointmentTimeRaw);
        const pickUpTime = convertExcelTime(pickUpTimeRaw);

        let possibleRoutes = [];
        let mileage = 0;
        try {
          const dirUrl = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(pickUpAddress)}&destination=${encodeURIComponent(dropOffAddress)}&key=${apiKey}`;
          const dirResponse = await axios.get(dirUrl);
          if (dirResponse.data.routes && dirResponse.data.routes.length > 0 && dirResponse.data.routes[0].legs?.length > 0) {
            possibleRoutes = dirResponse.data.routes[0].legs;
            const distText = dirResponse.data.routes[0].legs[0].distance?.text;
            if (distText) {
              const num = Number(String(distText).split(" ")[0]);
              mileage = Number.isFinite(num) ? num : 0;
            }
          }
        } catch (err) {
          console.log("Error fetching route:", err);
        }

        const isMain = tripTypeRaw === "main";
        const isReturn = tripTypeRaw === "return";
        const isAdditional = tripTypeRaw === "additional";
        let tripGroupId = null;
        if (hasTripType && hasGroupId && groupId) {
          if (isMain) {
            // Main creates the group; we'll set tripGroupId after save
          } else if (isReturn || isAdditional) {
            tripGroupId = groupIdToMainId.get(String(groupId).trim());
            if (!tripGroupId) continue; // Skip Return/Additional if no Main in group yet
          }
        }

        try {
          const payload = {
            patientName,
            patientPhoneNumber: normalizePhoneNumber(patientPhone) || "",
            possibleRoutes,
            mileage: String(Number.isFinite(mileage) ? mileage : 0),
            pickUpAddress,
            dropOffAddress,
            patientType,
            legId: legIdFromCsv || (isReturn ? (groupId ? `${groupId}-Return` : "Return") : ""),
            pickUpDate: pickUpDate || "",
            pickUpTime: pickUpTime || "00:00",
            appointmentTime: appointmentTime || "00:00",
            addedBy: req.userId || "",
            ...(addedByCompanyCode && { addedByCompanyCode }),
          };
          if (hasTripType && (isMain || isReturn || isAdditional)) {
            payload.tripType = isMain ? "main" : isReturn ? "return" : "additional";
            payload.isOtherTrip = !isMain;
            if (tripGroupId) payload.tripGroupId = tripGroupId;
          } else {
            payload.isOtherTrip = true;
          }
          const newTrip = new TripModel(payload);
          await newTrip.save();
          if (isMain && hasGroupId && groupId) {
            groupIdToMainId.set(String(groupId).trim(), newTrip._id);
          }
          tripsCreated++;
          routesFound++;
        } catch (rowErr) {
          console.log("Error saving trip row:", rowErr);
        }
      }
      return res.json({
        success: true,
        message: "File processed successfully.",
        tripsCreated,
        routesFound,
        routesMissing: Math.max(0, sheetRows.length - tripsCreated),
      });
    } else if (columnsCount == 12) {
      const rows = xlsx.utils.sheet_to_json(sheet);

      for (let row of rows) {
        console.log("Total Rows", rows.length);

        // Normalize phone number before using it
        const phoneNumber = normalizePhoneNumber(row["Member's Phone Number"]);
        console.log("Normalized Phone Number:", phoneNumber);

        let pickUpAddress = await geocodeAddress(row["Pick Up Address"]);
        let dropOffAddress = await geocodeAddress(row["Delivery Address"]);
        console.log("Pick Up Address", pickUpAddress);
        console.log("Delivery Address", dropOffAddress);

        let appoinmentTime =
          row["APPOINMENT TIME"] !== undefined
            ? convertTo24Hour(row["APPOINMENT TIME"])
            : "00:00";
        let pickUpTime =
          row["PREF. PICK UP TIME"] !== "B LEG WILL CALL" &&
            row["PREF. PICK UP TIME"] !== "C LEG WILL CALL"
            ? convertTo24Hour(row["PREF. PICK UP TIME"])
            : "00:00";

        if (!pickUpAddress || !dropOffAddress) {
          req.body.possibleRoutes = [];
          routesMissing++;
        } else {
        try {
          const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(
            `${pickUpAddress}`
          )}&destination=${encodeURIComponent(
            `${dropOffAddress}`
          )}&alternatives=true&key=${apiKey}`;
          const response = await axios.get(url);
          const routes = response.data.routes; // Retrieve all routes

          console.log("Routes For Trip", routes);

          // Check if routes are available
          if (routes && routes.length > 0) {
            // Find the first route with valid legs
            const validRoute = routes.find(
              (route) => route.legs && route.legs.length > 0
            );

            // If a valid route is found, use it
            if (validRoute) {
              console.log("Valid Route Legs");
              req.body.possibleRoutes = routes[0].legs;
              req.body.mileage = Number(
                routes[0].legs[0].distance.text.toString().split(" ")[0]
              );

              routesFound++;
            } else {
              // If no valid routes, but we have routes available, we can choose the first one as an alternative
              req.body.possibleRoutes = routes[0].legs || [];
              req.body.mileage = Number(
                routes[0].legs[0].distance.text.toString().split(" ")[0]
              );

              routesFound++;
            }
          } else {
            req.body.possibleRoutes = [];
            routesMissing++;
          }
        } catch (err) {
          console.log("Error fetching route:", err);
          req.body.possibleRoutes = [];
          routesMissing++;
        }
        }

        // Search the database using the normalized phone number

        console.log("TRIP CAN BE ADDED");

        function convertExcelDate(excelSerialDate) {
          const offset = 25567;
          const millisecondsInADay = 24 * 60 * 60 * 1000;
          const formattedDate = new Date(
            (excelSerialDate - offset) * millisecondsInADay
          );
          return formattedDate.toLocaleDateString("en-US");
        }

        const newTrip = new TripModel({
          patientName: row["FULL NAME"],
          patientPhoneNumber: phoneNumber,
          possibleRoutes: req.body.possibleRoutes,
          pickUpAddress: row["Pick Up Address"],
          dropOffAddress: row["Delivery Address"],
          patientType: row["Passenger Type"],
          confirmation: row["Confirmation"],
          legId: row["LEG ID"],
          pickUpDate: row["Pick Up Date"]
            ? convertExcelDate(row["Pick Up Date"])
            : "",
          pickUpTime: pickUpTime,
          appointmentTime: appoinmentTime,
          addedBy: req.userId,
          ...(addedByCompanyCode && { addedByCompanyCode }),
          isOtherTrip: true,
        });

        console.log("Possible Routes", req.body.possibleRoutes);
        await newTrip.save();
      }
      console.log("Routes Found For Trips", routesFound);
      console.log("Routes Missing For Trips", routesMissing);

      return res.json({
        success: true,
        message: "File processed successfully.",
        routesFound,
        routesMissing,
        tripsCreated: rows.length,
      });
    } else {
      console.log("File Columns Are More Than 12 That You Are Trying To Read");
      const rows = xlsx.utils.sheet_to_json(sheet);
      const convertExcelTime = (excelTime) => {
        // Total seconds in a day
        const totalSeconds = 86400;

        // If the value is in seconds (e.g., `968` seconds after midnight)
        const hours = Math.floor(excelTime / 3600); // Extract hours
        const minutes = Math.floor((excelTime % 3600) / 60); // Extract minutes
        const seconds = excelTime % 60; // Remaining seconds

        // Format into HH:MM:SS
        const formattedTime = `${hours.toString().padStart(2, "0")}:${minutes
          .toString()
          .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;

        return formattedTime;
      };

      // Example Usage
      const timeValue = 968; // Value from the Excel file
      console.log(convertExcelTime(timeValue)); // Output: 00:16:08

      for (let row of rows) {
        console.log("Total Rows", rows.length);

        // Normalize phone number before using it
        const phoneNumber = normalizePhoneNumber(row["Member's Phone Number"]);
        console.log("Normalized Phone Number:", phoneNumber);

        let pickUpAddress = await geocodeAddress(
          row["Pickup Address"] + "," + row["Pickup City"]
        );
        let dropOffAddress = await geocodeAddress(
          row["Delivery Address"] + "," + row["Delivery City"]
        );
        console.log("Pick Up Address", pickUpAddress);
        console.log("Delivery Address", dropOffAddress);
        const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(
          `${pickUpAddress}`
        )}&destination=${encodeURIComponent(
          `${dropOffAddress}`
        )}&alternatives=true&key=${apiKey}`; // Added alternatives=true to fetch multiple routes

        console.log("TIME VALUE", row["PREF\\. PICK UP TIME"]);
        console.log("Again Time value", row["PREF\\. PICK UP TIME"]);

        let appoinmentTime =
          row["Time"] !== undefined ? convertExcelTime(row["Time"]) : "00:00";
        let pickUpTime =
          row["Pick Up Time"] != undefined
            ? convertExcelTime(row["Pick Up Time"])
            : "00:00";

        try {
          const response = await axios.get(url);
          const routes = response.data.routes; // Retrieve all routes

          console.log("Routes For Trip", routes);

          // Check if routes are available
          if (routes && routes.length > 0) {
            // Find the first route with valid legs
            const validRoute = routes.find(
              (route) => route.legs && route.legs.length > 0
            );

            // If a valid route is found, use it
            if (validRoute) {
              console.log("Valid Route Legs");
              req.body.possibleRoutes = routes[0].legs;
              req.body.mileage = Number(
                routes[0].legs[0].distance.text.toString().split(" ")[0]
              );

              routesFound++;
            } else {
              // If no valid routes, but we have routes available, we can choose the first one as an alternative
              req.body.possibleRoutes = routes[0].legs || [];
              req.body.mileage = Number(
                routes[0].legs[0].distance.text.toString().split(" ")[0]
              );

              routesFound++;
            }
          } else {
            req.body.possibleRoutes = [];
            routesMissing++;
          }
        } catch (err) {
          console.log("Error fetching route:", err);
          req.body.possibleRoutes = [];
          routesMissing++;
        }

        // Search the database using the normalized phone number

        console.log("TRIP CAN BE ADDED");

        function convertExcelDate(excelSerialDate) {
          const offset = 25567;
          const millisecondsInADay = 24 * 60 * 60 * 1000;
          const formattedDate = new Date(
            (excelSerialDate - offset) * millisecondsInADay
          );
          return formattedDate.toLocaleDateString("en-US");
        }

        const newTrip = new TripModel({
          patientName: row["Member's First Name"] + row["Member's Last Name"],
          patientPhoneNumber: phoneNumber ? phoneNumber : "",
          possibleRoutes: req.body.possibleRoutes,
          pickUpAddress: row["Pickup Address"] + "," + row["Pickup City"],
          dropOffAddress: row["Delivery Address"] + "," + row["Delivery City"],
          patientType: row["Passenger Type"],
          pickUpDate: row["Pick Up Date"]
            ? convertExcelDate(row["Pick Up Date"])
            : "",
          pickUpTime: pickUpTime,
          appointmentTime: appoinmentTime,
          addedBy: req.userId,
          ...(addedByCompanyCode && { addedByCompanyCode }),
          isOtherTrip: true,
        });

        console.log("Possible Routes", req.body.possibleRoutes);
        await newTrip.save();
      }
      console.log("Routes Found For Trips", routesFound);
      console.log("Routes Missing For Trips", routesMissing);

      return res.json({
        success: true,
        message: "File processed successfully.",
        routesFound,
        routesMissing,
      });
    }
  } catch (error) {
    console.error("Error processing file:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Error processing file.",
    });
  }
};

exports.addTrip = async (req, res) => {
  try {
    if (!req.body || typeof req.body !== "object") {
      return res.status(400).json({ success: false, message: "Invalid request body" });
    }
    if (req.userRole != "Patient") {
      let ownerAdminId = "";
      if (req.userRole === "User") {
        const subId = toId(req.user?.id) || toId(req.subAdminId);
        const subUser = subId ? await UserModel.findById(subId).select("addedBy").lean().catch(() => null) : null;
        if (subUser?.addedBy) ownerAdminId = String(subUser.addedBy).trim();
        else if (subId && mongoose.Types.ObjectId.isValid(subId)) ownerAdminId = String(subId).trim();
        else ownerAdminId = req.userId ? String(req.userId).trim() : "";
      } else {
        ownerAdminId = req.userId ? String(req.userId).trim() : "";
      }
      req.body.addedBy = ownerAdminId;
      const adminForCode = ownerAdminId ? await Admin.findOne({ _id: ownerAdminId }).catch(() => null) : null;
      if (adminForCode?.companyCode) req.body.addedByCompanyCode = String(adminForCode.companyCode);
    }
    console.log("Pick Up Address", req.body.pickUpAddress);
    console.log("DRop Off Address", req.body.dropOfAddress);

    // Call Google Maps API for directions
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(
      req.body.pickUpAddress
    )}&destination=${encodeURIComponent(
      req.body.dropOffAddress
    )}&key=${apiKey}`;
    const response = await axios.get(url);

    // Check if routes exist before proceeding
    if (!response.data.routes || response.data.routes.length === 0) {
      console.log("No routes found:", response.data);
      return res.json({
        success: false,
        message: "No valid route found between the pickup and dropoff locations. Please check the addresses.",
      });
    }

    const route = response.data.routes[0];

    console.log("Route Legs", route.legs);
    console.log("Directions", response.data);
    req.body.possibleRoutes = route.legs;
    req.body.mileage = Number(
      route.legs[0].distance.text.toString().split(" ")[0]
    );
    // Get patient details
    console.log("Patient Ref", req.body.patientRef);
    let patient;
    if (req.body.patientRef) {
      patient = await PatientModel.findById(req.body.patientRef);
    }

    console.log("Patient", patient);
    if (req.body.patientRef) {
      req.body.patientPhotoUrl = patient.profilePhotoUrl;
      req.body.patientSignatureUrl = patient.signatureUrl;
    }
    req.body.isOtherTrip = req.body.patientRef ? false : true;
    // Persist tripType from client (main | return | additional) for list/edit labels; infer for legacy trips if missing
    if (!req.body.tripType && req.body.legId) {
      const lid = String(req.body.legId).trim();
      if (lid === "Return" || lid.endsWith("-Return")) req.body.tripType = "return";
    }
    if (!req.body.tripType) req.body.tripType = req.body.isOtherTrip ? "additional" : "main";

    // Handle driver assignment if driverRef is provided
    if (req.body.driverRef) {
      const driver = await DriverModel.findById(req.body.driverRef);
      if (driver) {
        req.body.driverName = `${driver.firstName} ${driver.lastName}`;
        req.body.driverSignatureUrl = driver.signatureUrl;
        req.body.status = "Assigned";
        // Mark driver as unavailable
        await DriverModel.findByIdAndUpdate(req.body.driverRef, { isAvailable: false });
      }
    }

    // Save the trip
    let trip = new TripModel(req.body);
    console.log(trip);
    let notification = new NotificationModel({
      fromId: trip.addedBy ? trip.addedBy : "adminId ",
      toId: trip.patientRef ? trip.patientRef : "randomRef",
      fromPhotoUrl:
        "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRo1KQPQY6ldUIZfCi4UOUx6ide2_s0vuIxRQ&s",
      type: "TripBooked",
      text: "Booked A Trip For You",
      from: "Admin",
    });

    await notification.save();
    await trip.save();

    // If this is the first trip in a group (no tripGroupId sent), set tripGroupId to self so return/additional can link to it
    if (!trip.tripGroupId) {
      trip.tripGroupId = trip._id;
      await trip.save();
    }

    // For Admin users
    if (req.userRole == "Admin") {
      console.log("Sending Message");
      // Create a message model and emit socket event for Admin-Patient
      let message = new MessageModel({
        text: `A Trip has been booked for patient:\n ${req.body.patientName}\n :from ${req.body.pickUpAddress} \n:to ${req.body.dropOffAddress}. \nPick Up Time Is:${req.body.pickUpTime}  \nAnd The Appointment Time is:${req.body.appointmentTime}`,
        senderId: req.userId,
        receiverId: req.body.patientRef ? req.body.patientRef : "randomRef",
        addedON: new Date().toLocaleString(),
        addedAt: new Date().toLocaleTimeString(),
      });
      console.log("Message", message);
      await message.save();
      try {
        const response = await axios.post(
          process.env.FIREBASE_NOTIFICATION_URL,
          {
            message: {
              topic: req.body.patientRef ? req.body.patientRef : "randomRef",
              data: {
                sender: "",
                message: `A Trip has been booked for patient:${req.body.patientName} from ${req.body.pickUpAddress} to ${req.body.dropOffAddress}. Pick Up Time Is:${req.body.pickUpTime}  And The Appointment Time is:${req.body.appointmentTime}`,
                type: "notification",
              },
              notification: {
                title: "",
                body: `A Trip has been booked for patient:${req.body.patientName} from ${req.body.pickUpAddress} to ${req.body.dropOffAddress}. Pick Up Time Is:${req.body.pickUpTime}  And The Appointment Time is:${req.body.appointmentTime}`,
              },
            },
          },
          {
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
          }
        );
        console.log("Successfully Sent Notification Msg");
      } catch (e) {
        console.log("Error While Sending Notification message", e.message);
      }

      let socketId1 = getReceiverSocketId(req.userId);
      let socketId2 = getReceiverSocketId(
        req.body.patientRef ? req.body.patientRef : "randomRef"
      );

      console.log("Socket Id 1", socketId1);
      if (socketId1.length > 0) {
        console.log("Emitting NewMsg Event for Admin");
        getIO().to(socketId1).emit("newMsg", message);
      }

      console.log("Socket Id 2", socketId2);
      if (socketId2.length > 0) {
        console.log("Emitting NewMsg Event for Patient");
        getIO().to(socketId2).emit("newMsg", message);
      }
    }
    // For non-admin (Patient)
    else {
      if (req.body.patient) {
        console.log("Company Code", patient.companyCode);
        let admin = await Admin.findOne({ companyCode: patient.companyCode });
        console.log("Admin To Send Message", admin);

        // Create a message model and emit socket event for Patient-Admin
        let message = new MessageModel({
          text: `A Trip has been booked for patient:\n${req.body.patientName} \n from ${req.body.pickUpAddress} \nto ${req.body.dropOffAddress}. \nPick Up Time Is:${req.body.pickUpTime}  \nAnd The Appointment Time is:${req.body.appointmentTime}`,
          senderId: req.body.patientRef,
          receiverId: admin._id,
          addedON: new Date().toLocaleString(),
          addedAt: new Date().toLocaleTimeString(),
        });
        await message.save();
        let socketId1 = getReceiverSocketId(admin._id.toString());
        let socketId2 = getReceiverSocketId(req.body.patientRef);
        console.log("Socket Id 1", socketId1);
        if (socketId1.length > 0) {
          console.log("Emitting NewMsg Event for Admin");
          getIO().to(socketId1).emit("newMsg", message);
          getIO()
            .to(socketId1)
            .emit(
              "trip-booking-notification",
              `A Trip has been booked for patient:${req.body.patientName} from ${req.body.pickUpAddress} to ${req.body.dropOffAddress}. Pick Up Time Is:${req.body.pickUpTime}  And The Appointment Time is:${req.body.appointmentTime}`
            );
        }

        // Check if routes exist before proceeding
        if (!response.data.routes || response.data.routes.length === 0) {
          console.log("No routes found:", response.data);
          return res.json({
            success: false,
            message: "No valid route found between the pickup and dropoff locations. Please check the addresses."
          });
        }
        console.log("Socket Id 2", socketId2);
        if (socketId2.length > 0) {
          console.log("Emitting NewMsg Event for Patient");
          getIO().to(socketId2).emit("newMsg", message);
        }
      }
    }

    // Send success response
    res.json({ success: true, trip });
    console.log("Added Successfully");
  } catch (e) {
    console.log(e.message);
    res.json({ success: false, message: e.message });
  }
};

// --------------

exports.getTrips = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 25;
    const page = parseInt(req.query.page) || 1;
    const timezone = req.query.timezone || "UTC";
    const filter = req.query.filter || "all time";
    const status = req.query.status ? String(req.query.status).trim() : null;
    const search = req.query.search ? String(req.query.search).trim() : null;

    let tripFilter = await getTripVisibilityFilter(req);
    if (status) tripFilter.status = status;
    if (search) {
      const s = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(s, "i");
      const searchConditions = [
        { driverName: re },
        { patientName: re },
        { patientPhoneNumber: re },
        { patientPhone: re },
      ];
      const dateStr = search.replace(/\D/g, "");
      if (dateStr.length >= 4) {
        searchConditions.push({ pickUpDate: re });
      }
      tripFilter = { $and: [tripFilter, { $or: searchConditions }] };
    }
    const isUserRole = (req.user?.role || req.userRole) === "User";
    if (isUserRole) console.log("[getTrips] User filter applied:", JSON.stringify(tripFilter));
    // Get the admin information
    if (Object.keys(req.query).length == 0) {
      console.log(" Records Without Query");
      let trips = await TripModel.find(tripFilter)
        .sort({ createdAt: -1 });
      console.log("Trips Length", trips.length);
      sortTripsMainReturnAdditional(trips);
      res.json({ success: true, trips });
    } else {
      // Define date filters based on the filter query parameter
      let dateQuery = {};

      if (filter !== "all") {
        const now = DateTime.now().setZone(timezone);

        // pickUpDate is stored as string (e.g. YYYY-MM-DD) - use string range for correct comparison
        const fmt = "yyyy-MM-dd";
        switch (filter) {
          case "today": {
            const todayStr = now.toFormat(fmt);
            dateQuery.pickUpDate = { $gte: todayStr, $lte: todayStr };
            break;
          }
          case "weekly": {
            const endStr = now.toFormat(fmt);
            const startStr = now.minus({ days: 6 }).toFormat(fmt);
            dateQuery.pickUpDate = { $gte: startStr, $lte: endStr };
            break;
          }
          case "monthly": {
            const endStr = now.toFormat(fmt);
            const startStr = now.minus({ days: 29 }).toFormat(fmt);
            dateQuery.pickUpDate = { $gte: startStr, $lte: endStr };
            break;
          }

          case "all time":
            // No date filter needed
            break;

          default:
            return res.status(400).json({
              success: false,
              message:
                "Invalid filter type. Use 'today', 'weekly', 'monthly', or 'all time'",
            });
        }
      }

      // Get total number of trips matching the query before pagination
      const totalTrips = await TripModel.countDocuments({
        ...dateQuery,
        ...tripFilter,
      });

      // Calculate total pages
      const totalPages = Math.ceil(totalTrips / limit);

      // Get trips with date filter and pagination applied, then sort main → return → additional
      let trips = await TripModel.find({
        ...dateQuery,
        ...tripFilter,
      })
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip((page - 1) * limit); // Skip records based on current page

      sortTripsMainReturnAdditional(trips);

      const payload = {
        success: true,
        trips,
        currentPage: page,
        totalTrips,
        totalPages,
      };
      if (isUserRole && req.query.debug === "1") payload._debugFilter = tripFilter;
      res.json(payload);
    }
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
};
exports.getTripById = async (req, res) => {
  try {
    let trip = await TripModel.findById(req.params.tripId)
    res.json({ success: true, trip })
  }
  catch (e) {
    res.json({ success: false, message: e.message })

  }

}
exports.updateTrip = async (req, res) => {
  let trip = await TripModel.findById(req.params.tripId)
  try {
    const DEFAULT_FROM_PHOTO_URL =
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRo1KQPQY6ldUIZfCi4UOUx6ide2_s0vuIxRQ&s";
    const newDriverId = req.body.driverRef ? String(req.body.driverRef).trim() : null;
    const currentDriverId = trip.driverRef ? String(trip.driverRef) : null;
    const isReassigning = newDriverId && newDriverId !== currentDriverId;

    // Handle driver assignment / reassignment (allowed at any time)
    if (isReassigning) {
      const driver = await DriverModel.findById(newDriverId);
      if (driver) {
        // Company lock: prevent assigning drivers from another company
        const tripAdmin = await Admin.findById(trip.addedBy)
          .select("companyCode")
          .lean()
          .catch(() => null);
        const driverAdmin = await Admin.findById(driver.addedBy)
          .select("companyCode")
          .lean()
          .catch(() => null);

        const tripCompanyCode = tripAdmin?.companyCode ? String(tripAdmin.companyCode).trim() : null;
        const driverCompanyCode = driverAdmin?.companyCode ? String(driverAdmin.companyCode).trim() : null;

        if (tripCompanyCode && driverCompanyCode && tripCompanyCode !== driverCompanyCode) {
          return res.status(403).json({
            success: false,
            message: "You can only assign drivers from your company.",
          });
        }

        req.body.driverName = `${driver.firstName} ${driver.lastName}`;
        req.body.driverSignatureUrl = driver.signatureUrl;
        if (req.body.status === "Not Assigned") {
          req.body.status = "Assigned";
        }
        // Mark new driver as unavailable
        await DriverModel.findByIdAndUpdate(newDriverId, { isAvailable: false });
        // Mark old driver as available if there was one
        if (currentDriverId) {
          await DriverModel.findByIdAndUpdate(currentDriverId, { isAvailable: true });
        }
        // Notify new driver so reassignment reflects immediately on their dashboard
        const admin = await Admin.findById(trip.addedBy).select("firstName lastName photo").lean();
        const fromName = admin ? `${admin.firstName || ""} ${admin.lastName || ""}`.trim() || "Admin" : "Admin";
        const fromPhoto = admin?.photo || DEFAULT_FROM_PHOTO_URL;
        const notification = new NotificationModel({
          fromId: trip.addedBy,
          toId: newDriverId,
          fromPhotoUrl: fromPhoto,
          type: "TripAssigned",
          text: "A trip has been assigned to you.",
          from: fromName,
        });
        await notification.save();
      }
    } else if (!newDriverId && currentDriverId) {
      // Driver was removed, mark old driver as available
      await DriverModel.findByIdAndUpdate(currentDriverId, { isAvailable: true });
      req.body.driverName = "";
      req.body.driverSignatureUrl = "";
      req.body.status = "Not Assigned";
    }

    if (req.body.status == "Cancelled") {

      let trip = await TripModel.findOne({ _id: req.params.tripId })
      let admin = await Admin.findOne({ _id: trip.addedBy })
      console.log("Added By Admin", admin)
      console.log("Patient Ref", trip.patientRef)
      console.log("Driver Ref", trip.driverRef)
      if (trip.patientRef) {
        let notification = new NotificationModel({
          fromId: admin._id,
          toId: trip.patientRef,
          fromPhotoUrl: admin.photo || DEFAULT_FROM_PHOTO_URL,
          type: "TripCancelled",
          text: "Cancelled Your Trip",
          from: admin.firstName + admin.lastName
        })
        await notification.save()

      }
      if (trip.driverRef) {
        let notification2 = new NotificationModel({
          fromId: admin._id,
          toId: trip.driverRef,
          fromPhotoUrl: admin.photo || DEFAULT_FROM_PHOTO_URL,
          type: "TripCancelled",
          text: "Cancelled Your Trip",
          from: admin.firstName + admin.lastName
        })
        await notification2.save()
      }




      console.log("SUccessfully Added Notification")





    }
    if (req.body.status == "Completed") {
      req.body.completedAt = new Date()
      const endingDate = new Date()
      const startingDate = trip?.startedAt ? new Date(trip.startedAt) : null

      // If startedAt is missing or invalid, avoid crashing the update
      if (!startingDate || isNaN(startingDate.getTime())) {
        req.body.timeTaken = 0
      } else {
        const differenceInMilliSeconds = endingDate - startingDate

        let totalPausedTime = 0
        for (const pause of (trip.pauses || [])) {
          // Guard missing pause fields
          if (pause?.resumeTime && pause?.pauseTime) {
            const resumeMs = new Date(pause.resumeTime).getTime()
            const pauseMs = new Date(pause.pauseTime).getTime()
            if (!isNaN(resumeMs) && !isNaN(pauseMs)) {
              totalPausedTime += resumeMs - pauseMs
            }
          }
        }

        // Convert milliseconds to hours
        const totalPausedHours = totalPausedTime / (1000 * 60 * 60)
        const hours = differenceInMilliSeconds / 3600000 // Convert ms -> hours
        req.body.timeTaken = hours - totalPausedHours
      }
    }

    const updatedTrip = await TripModel.findByIdAndUpdate(req.params.tripId, req.body, { new: true, runValidators: true });

    // When trip is completed or cancelled, mark driver as available again
    if (req.body.status === "Completed" || req.body.status === "Cancelled") {
      const driverId = trip.driverRef || updatedTrip.driverRef;
      if (driverId) {
        await DriverModel.findByIdAndUpdate(driverId, { isAvailable: true });
      }
    }

    // When notes are updated, sync notes to all trips in the same group (main + return + additional)
    if (req.body.notes !== undefined) {
      const groupId = trip.tripGroupId || trip._id;
      await TripModel.updateMany(
        { _id: { $ne: req.params.tripId }, tripGroupId: groupId },
        { $set: { notes: req.body.notes } }
      );
    }

    res.json({ success: true, updatedTrip });
  }
  catch (e) {
    res.json({ success: false, message: e.message });
  }
}
exports.deleteTrip = async (req, res) => {
  try {
    await TripModel.findByIdAndDelete(req.params.tripId)
    res.json({ success: true })

  }
  catch (e) {
    res.json({ success: false })

  }
}
exports.assignTrip = async (req, res) => {
  console.log("Assigning Trip To Driver")
  try {
    let driver = await DriverModel.findById(req.params.driverId)
    console.log(driver)
    let updatedTrip = await TripModel.findByIdAndUpdate(req.params.tripId, { driverRef: req.params.driverId, driverSignatureUrl: driver.signatureUrl, status: "Assigned", driverName: driver.firstName + " " + driver.lastName }, { new: true, runValidators: true })
    console.log(updatedTrip)
    await DriverModel.findByIdAndUpdate(req.params.driverId, { isAvailable: false }, { new: true, runValidators: true })
    let notification = new NotificationModel({ fromId: "adminId ", toId: req.params.driverId, fromPhotoUrl: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRo1KQPQY6ldUIZfCi4UOUx6ide2_s0vuIxRQ&s", type: "TripAssigned", text: "Assigned A Trip For You", from: "Admin" })

    await notification.save()
    res.json({ success: true })
  }
  catch (e) {
    console.log("Error While Assigning Trip", e.message)
    res.json({ success: false })

  }
}

exports.getTripStatusCounts = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const baseFilter = await getTripVisibilityFilter(req);

    // Add date filter if provided.
    // pickUpDate is stored as a string "YYYY-MM-DD".
    // We accept either full ISO strings or already-normalized YYYY-MM-DD.
    if (startDate && endDate) {
      const fmt = "yyyy-MM-dd";
      let startStr = null;
      let endStr = null;

      const ymdRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (ymdRegex.test(startDate) && ymdRegex.test(endDate)) {
        // Dates already in YYYY-MM-DD format
        startStr = startDate;
        endStr = endDate;
      } else {
        try {
          const start = DateTime.fromISO(startDate);
          const end = DateTime.fromISO(endDate);
          if (start.isValid && end.isValid) {
            startStr = start.toFormat(fmt);
            endStr = end.toFormat(fmt);
          }
        } catch (e) {
          console.warn(
            "Invalid date range for trip status counts:",
            startDate,
            endDate,
            e.message
          );
        }
      }

      if (startStr && endStr) {
        baseFilter.pickUpDate = { $gte: startStr, $lte: endStr };
      }
    }

    // Get all counts in parallel for better performance
    const [
      totalTrips,
      assignedTrips,
      onRouteTrips,
      completedTrips,
      cancelledTrips,
      unassignedTrips,
      nonResponsiveTrips,
    ] = await Promise.all([
      // Total trips count
      TripModel.countDocuments(baseFilter),

      // Assigned trips (status is "Assigned")
      TripModel.countDocuments({ ...baseFilter, status: "Assigned" }),

      // On route trips (status is "On Route")
      TripModel.countDocuments({ ...baseFilter, status: "On Route" }),

      // Completed trips (status is "Completed")
      TripModel.countDocuments({ ...baseFilter, status: "Completed" }),

      // Cancelled trips (status is "Cancelled")
      TripModel.countDocuments({ ...baseFilter, status: "Cancelled" }),

      // Unassigned trips (status is "Not Assigned")
      TripModel.countDocuments({ ...baseFilter, status: "Not Assigned" }),

      // Non-responsive trips (custom logic - adjust as needed)
      TripModel.countDocuments({
        ...baseFilter,
        status: { $in: ["Assigned", "On Route"] },
        lastDriverResponse: { $lt: new Date(Date.now() - 30 * 60 * 1000) }, // No response in 30 mins
      }),
    ]);

    res.json({
      success: true,
      counts: {
        total: totalTrips,
        assigned: assignedTrips,
        onRoute: onRouteTrips,
        completed: completedTrips,
        cancelled: cancelledTrips,
        unassigned: unassignedTrips,
        nonResponsive: nonResponsiveTrips,
      },
    });
  } catch (e) {
    res.status(500).json({
      success: false,
      message: e.message,
    });
  }
};
