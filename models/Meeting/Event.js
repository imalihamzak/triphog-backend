const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema(
  {
    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
    googleEventId: {
      type: String,
      required: true,
    },
    summary: {
      type: String,
      required: true,
    },
    description: String,
    start: {
      type: Date,
      required: true,
    },
    end: {
      type: Date,
      required: true,
    },
    attendees: [
      {
        email: String,
        name: String,
      },
    ],
  },
  { timestamps: true }
);

const Event = mongoose.model("Event", eventSchema);

module.exports = Event;
