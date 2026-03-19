const { google } = require("googleapis");
const Admin = require("../models/adminSchema");
const Event = require("../models/Meeting/Event");

const getGoogleCalendar = async (admin) => {
  console.log("Getting calendar for admin:", admin._id);

  if (
    !admin.googleCalendarTokens ||
    Object.keys(admin.googleCalendarTokens).length === 0
  ) {
    throw new Error("Google Calendar not connected for this admin");
  }

  console.log("Admin Google Calendar Tokens:", admin.googleCalendarTokens);

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  oauth2Client.setCredentials(admin.googleCalendarTokens);

  // Refresh token if expired
  if (
    admin.googleCalendarTokens.expiry_date &&
    admin.googleCalendarTokens.expiry_date <= Date.now()
  ) {
    console.log("Refreshing access token...");
    try {
      const { credentials } = await oauth2Client.refreshAccessToken();
      admin.googleCalendarTokens = credentials;
      await admin.save();
      console.log("Access token refreshed and saved.");
    } catch (error) {
      console.error("Error refreshing access token:", error);
      throw new Error("Error refreshing access token");
    }
  }

  return google.calendar({ version: "v3", auth: oauth2Client });
};
exports.getEvents = async (req, res) => {
  try {
    const calendar = await getGoogleCalendar(req.admin);

    // Get events for the next 7 days
    const oneWeekFromNow = new Date();
    oneWeekFromNow.setDate(oneWeekFromNow.getDate() + 287);

    const events = await calendar.events.list({
      calendarId: "primary",
      timeMin: new Date().toISOString(),
      timeMax: oneWeekFromNow.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
    });

    console.log("Fetched events:", events.data.items);

    if (events.data.items.length) {
      res.json(events.data.items);
    } else {
      res.json({ message: "No upcoming events found." });
    }
  } catch (error) {
    console.error("Error fetching events:", error);

    if (error.response) {
      console.error("Response data:", error.response.data);
      console.error("Response status:", error.response.status);
      console.error("Response headers:", error.response.headers);
    } else if (error.request) {
      console.error("No response received:", error.request);
    } else {
      console.error("Error setting up request:", error.message);
    }

    res.status(500).json({
      message: "Error fetching events",
      error: error.response?.data?.error || error.message,
    });
  }
};
exports.createEvent = async (req, res) => {
  try {
    const { title, startDateTime, location, invite, summary } = req.body;

    // Validate input
    if (!title || !startDateTime) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    console.log("Request body:", JSON.stringify(req.body, null, 2));

    const calendar = await getGoogleCalendar(req.admin);

    const event = {
      summary: title,
      description: summary,
      location: location,
      start: { dateTime: startDateTime, timeZone: "UTC" },
      end: { dateTime: startDateTime, timeZone: "UTC" }, // Set end time same as start time
    };

    // Only add attendees if invite is provided
    if (invite) {
      event.attendees = [{ email: invite }];
    }

    console.log("Event object:", JSON.stringify(event, null, 2));

    const response = await calendar.events.insert({
      calendarId: "primary",
      resource: event,
    });

    res.status(201).json(response.data);
  } catch (error) {
    console.error("Error creating event:", error);

    // More detailed error logging
    if (error.response) {
      console.error("Response data:", error.response.data);
      console.error("Response status:", error.response.status);
      console.error("Response headers:", error.response.headers);
    } else if (error.request) {
      console.error("No response received:", error.request);
    } else {
      console.error("Error setting up request:", error.message);
    }

    res.status(error.response?.status || 500).json({
      message: "Error creating event",
      error: error.response?.data?.error || error.message,
    });
  }
};

exports.updateEvent = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { title, startDate, startTime, location, invite, summary } = req.body;

    console.log("Update request body:", JSON.stringify(req.body, null, 2));
    console.log("Event ID:", eventId);

    const calendar = await getGoogleCalendar(req.admin);

    // Combine startDate and startTime into a valid ISO string
    const startDateTime = new Date(
      `${startDate}T${startTime}:00`
    ).toISOString();

    const event = {
      summary: title,
      description: summary,
      location: location,
      start: { dateTime: startDateTime, timeZone: "UTC" },
      end: { dateTime: startDateTime, timeZone: "UTC" }, // Set end time same as start time
    };

    // Only add attendees if invite is provided
    if (invite) {
      event.attendees = [{ email: invite }];
    }

    console.log("Update event object:", JSON.stringify(event, null, 2));

    const response = await calendar.events.update({
      calendarId: "primary",
      eventId: eventId,
      resource: event,
    });

    console.log(
      "Google Calendar response:",
      JSON.stringify(response.data, null, 2)
    );

    res.json(response.data);
  } catch (error) {
    console.error("Error updating event:", error);

    if (error.response) {
      console.error("Response data:", error.response.data);
      console.error("Response status:", error.response.status);
      console.error("Response headers:", error.response.headers);
    } else if (error.request) {
      console.error("No response received:", error.request);
    } else {
      console.error("Error setting up request:", error.message);
    }

    res.status(error.response?.status || 500).json({
      message: "Error updating event",
      error: error.response?.data?.error || error.message,
    });
  }
};

exports.deleteEvent = async (req, res) => {
  try {
    const { eventId } = req.params;

    const calendar = await getGoogleCalendar(req.admin);

    await calendar.events.delete({
      calendarId: "primary",
      eventId,
    });

    await Event.findOneAndDelete({
      admin: req.admin._id,
      googleEventId: eventId,
    });

    res.json({ message: "Event deleted successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error deleting event", error: error.message });
  }
};
