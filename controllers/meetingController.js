const mongoose = require("mongoose"); // Add this import at the top
const MeetingModel = require("../models/MeetingModel");
exports.createMeeting = async (req, res) => {
  try {
    req.body.createdBy = req.createdBy;
    console.log("Meeting Body", req.body);
    let meeting = new MeetingModel(req.body);
    await meeting.save();
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false });
  }
};

exports.getMeetings = async (req, res) => {
  try {
    // Fetch the limit and page from query parameters
    const limit = parseInt(req.query.limit) || 25;
    const page = parseInt(req.query.page) || 1;
    const filter = req.query.filter || "all time";
    const userId = req.user?.id || req.user?._id;

    // If no query params are provided, return meetings only for the logged-in user
    if (Object.keys(req.query).length === 0) {
      const meetings = await MeetingModel.find({ createdBy: userId });

      return res.json({ success: true, meetings });
    } else {
      // Define date filters
      let dateQuery = {};
      const currentDate = new Date();

      if (filter === "today") {
        const startOfDay = new Date();
        startOfDay.setUTCHours(0, 0, 0, 0);
        const endOfDay = new Date();
        endOfDay.setUTCHours(23, 59, 59, 999);
        dateQuery = { createdAt: { $gte: startOfDay, $lte: endOfDay } };
      } else if (filter === "weekly") {
        const startOfWeek = new Date();
        startOfWeek.setDate(currentDate.getDate() - 7);
        startOfWeek.setUTCHours(0, 0, 0, 0);
        dateQuery = { createdAt: { $gte: startOfWeek } };
      } else if (filter === "monthly") {
        const startOfMonth = new Date();
        startOfMonth.setDate(currentDate.getDate() - 30);
        startOfMonth.setUTCHours(0, 0, 0, 0);
        dateQuery = { createdAt: { $gte: startOfMonth } };
      }

      // Get total meetings count
      const totalMeetings = await MeetingModel.countDocuments({ ...dateQuery, createdBy: userId });


      // Get paginated meetings
      // let meetings = await MeetingModel.find(dateQuery)
      //   .sort({ createdAt: -1 }) // Newest first
      //   .limit(limit)
      //   .skip((page - 1) * limit);
      const query = {
        ...dateQuery,
        createdBy: userId,
      };

      let meetings = await MeetingModel.find(query)
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip((page - 1) * limit);


      res.json({
        success: true,
        meetings,
        currentPage: page,
        totalMeetings,
        totalPages: Math.ceil(totalMeetings / limit),
      });
    }
  } catch (e) {
    console.error("Error fetching meetings:", e);
    res.status(500).json({
      success: false,
      message: e.message,
    });
  }
};

// exports.getMeetingStats = async (req, res) => {
//   try {
//     const now = new Date();
//     const startOfToday = new Date(now);
//     startOfToday.setUTCHours(0, 0, 0, 0);

//     const startOfWeek = new Date(now);
//     startOfWeek.setDate(startOfWeek.getDate() - 7);
//     startOfWeek.setUTCHours(0, 0, 0, 0);

//     const startOfMonth = new Date(now);
//     startOfMonth.setDate(startOfMonth.getDate() - 30);
//     startOfMonth.setUTCHours(0, 0, 0, 0);

//     const [total, today, weekly, monthly] = await Promise.all([
//       MeetingModel.countDocuments(),
//       MeetingModel.countDocuments({ createdAt: { $gte: startOfToday } }),
//       MeetingModel.countDocuments({ createdAt: { $gte: startOfWeek } }),
//       MeetingModel.countDocuments({ createdAt: { $gte: startOfMonth } }),
//     ]);

//     res.json({
//       success: true,
//       stats: {
//         totalMeetings: total,
//         todayMeetings: today,
//         weeklyMeetings: weekly,
//         monthlyMeetings: monthly,
//       },
//     });
//   } catch (e) {
//     console.error("Error fetching meeting stats:", e);
//     res.status(500).json({
//       success: false,
//       message: "Failed to fetch meeting stats",
//     });
//   }
// };

// exports.getMeetingStats = async (req, res) => {
//   try {
//     const now = new Date();

//     // Time filters
//     const startOfToday = new Date(now);
//     startOfToday.setUTCHours(0, 0, 0, 0);

//     const startOfWeek = new Date(now);
//     startOfWeek.setDate(startOfWeek.getDate() - 7);
//     startOfWeek.setUTCHours(0, 0, 0, 0);

//     const startOfMonth = new Date(now);
//     startOfMonth.setDate(startOfMonth.getDate() - 30);
//     startOfMonth.setUTCHours(0, 0, 0, 0);

//     // Parallel queries
//     const [
//       totalMeetings,
//       scheduled,
//       completed,
//       cancelled,
//       todayMeetings,
//       weeklyMeetings,
//       monthlyMeetings,
//     ] = await Promise.all([
//       MeetingModel.countDocuments(),
//       MeetingModel.countDocuments({ status: "scheduled" }),
//       MeetingModel.countDocuments({ status: "completed" }),
//       MeetingModel.countDocuments({ status: "cancelled" }),
//       MeetingModel.countDocuments({ createdAt: { $gte: startOfToday } }),
//       MeetingModel.countDocuments({ createdAt: { $gte: startOfWeek } }),
//       MeetingModel.countDocuments({ createdAt: { $gte: startOfMonth } }),
//     ]);

//     res.json({
//       success: true,
//       stats: {
//         totalMeetings,
//         scheduled,
//         completed,
//         cancelled,
//         todayMeetings,
//         weeklyMeetings,
//         monthlyMeetings,
//       },
//     });
//   } catch (e) {
//     console.error("Error fetching meeting stats:", e);
//     res.status(500).json({
//       success: false,
//       message: "Failed to fetch meeting stats",
//     });
//   }
// };

exports.getMeetingStats = async (req, res) => {
  try {
    const now = new Date();
    const { id: userId, role } = req.user;

    // Time filters
    const startOfToday = new Date(now);
    startOfToday.setUTCHours(0, 0, 0, 0);

    const startOfWeek = new Date(now);
    startOfWeek.setDate(startOfWeek.getDate() - 7);
    startOfWeek.setUTCHours(0, 0, 0, 0);

    const startOfMonth = new Date(now);
    startOfMonth.setDate(startOfMonth.getDate() - 30);
    startOfMonth.setUTCHours(0, 0, 0, 0);

    // Filter by user unless SuperAdmin
    const userFilter = role === "Super Admin" ? {} : { createdBy: userId };

    // Parallel queries with filtering (treat missing status as "scheduled")
    const [
      totalMeetings,
      scheduled,
      completed,
      cancelled,
      todayMeetings,
      weeklyMeetings,
      monthlyMeetings,
    ] = await Promise.all([
      MeetingModel.countDocuments(userFilter),
      MeetingModel.countDocuments({ ...userFilter, $or: [{ status: "scheduled" }, { status: { $exists: false } }, { status: null }] }),
      MeetingModel.countDocuments({ ...userFilter, status: "completed" }),
      MeetingModel.countDocuments({ ...userFilter, status: "cancelled" }),
      MeetingModel.countDocuments({ ...userFilter, createdAt: { $gte: startOfToday } }),
      MeetingModel.countDocuments({ ...userFilter, createdAt: { $gte: startOfWeek } }),
      MeetingModel.countDocuments({ ...userFilter, createdAt: { $gte: startOfMonth } }),
    ]);

    res.json({
      success: true,
      stats: {
        totalMeetings,
        scheduled,
        completed,
        cancelled,
        todayMeetings,
        weeklyMeetings,
        monthlyMeetings,
      },
    });
  } catch (e) {
    console.error("Error fetching meeting stats:", e);
    res.status(500).json({
      success: false,
      message: "Failed to fetch meeting stats",
    });
  }
};



exports.editMeeting = async (req, res) => {
  try {
    const { id } = req.params; // Meeting ID to edit
    const updates = req.body; // Fields to update

    // Validate meeting ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid meeting ID",
      });
    }

    // Check if meeting exists
    const existingMeeting = await MeetingModel.findById(id);
    if (!existingMeeting) {
      return res.status(404).json({
        success: false,
        message: "Meeting not found",
      });
    }

    // Define allowed fields that can be updated
    const allowedUpdates = {
      title: String,
      location: String,
      date: Date,
      time: String,
      scheduleWith: String,
      notes: String,
      status: String,
    };

    // Validate updates against allowed fields
    const updatesKeys = Object.keys(updates);
    const isValidOperation = updatesKeys.every((key) =>
      allowedUpdates.hasOwnProperty(key)
    );

    if (!isValidOperation) {
      return res.status(400).json({
        success: false,
        message: "Invalid update fields",
      });
    }

    if (updates.status && !["scheduled", "completed", "cancelled"].includes(updates.status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Use scheduled, completed, or cancelled.",
      });
    }

    // Special handling for date field if provided
    if (updates.date) {
      updates.date = new Date(updates.date);
      if (isNaN(updates.date.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Invalid date format",
        });
      }
    }

    // Update the meeting
    const updatedMeeting = await MeetingModel.findByIdAndUpdate(
      id,
      updates,
      { new: true, runValidators: true } // Return updated document and run schema validators
    );

    res.json({
      success: true,
      message: "Meeting updated successfully",
      meeting: updatedMeeting,
    });
  } catch (e) {
    console.error("Error editing meeting:", e);
    res.status(500).json({
      success: false,
      message: e.message,
    });
  }
};

exports.deleteMeeting = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate meeting ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid meeting ID format",
      });
    }

    // Check if meeting exists
    const meeting = await MeetingModel.findById(id);
    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: "Meeting not found",
      });
    }

    // Verify user is authorized (creator or admin)
    if (req.user.role !== "Super Admin" && req.user.role !== "Admin") {
      return res.status(403).json({
        success: false,
        message: "Unauthorized to delete this meeting",
      });
    }

    // Delete the meeting
    await MeetingModel.findByIdAndDelete(id);

    res.json({
      success: true,
      message: "Meeting deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting meeting:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.deleteBulkMeetings = async (req, res) => {
  try {
    await MeetingModel.deleteMany({ _id: { $in: req.body.meetingIds } });
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false });
  }
};
