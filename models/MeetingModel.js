const mongoose = require('mongoose');

const meetingSchema = new mongoose.Schema({
  title: String,
  location: String,
  date: Date,
  time: String,
  scheduleWith: String,
  notes: String,
  status: { type: String, default: "scheduled", enum: ["scheduled", "completed", "cancelled"] },
  createdBy:{
      type:String,
      required:true
  },
  createdAt:{
      type:Date,
      default:Date.now
  }
});

const Meeting = mongoose.model('Meeting', meetingSchema);

module.exports = Meeting;