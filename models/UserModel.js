const { default: mongoose } = require("mongoose");
const crypto = require("crypto");
const token = crypto.randomBytes(20).toString("hex");
let userSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: true,
  },
  lastName: {
    type: String,
    required: true,
  },
  EMailAddress: {
    type: String,
    required: true,
    unique: [true],
  },
  password: {
    type: String,
    default: "",
  },
  status: {
    type: String,
    default: "Not Active",
  },
  addedBy: {
    type: String,
    required: true,
  },
  token: {
    type: String,
    default: token,
  },
  phoneNumber: {
    type: String,
    required: true,
  },
  accessibilities: {
    type: Array,
    required: true,
  },
  profilePhotoUrl: {
    type: String,
    default: "",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  passwordResetToken: { type: String },
  passwordResetExpires: { type: Date },
});
const UserModel = mongoose.model("TriphogUsers", userSchema);
module.exports = UserModel;
