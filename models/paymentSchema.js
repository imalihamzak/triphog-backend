const mongoose = require("mongoose");
const Admin = require("./adminSchema");
const paymentSchema = new mongoose.Schema(
  {
    amount: {
      type: Number,
      default: 0,
    },
    paymentMethod: {
      type: String,
      default: "None",
    },
    status: {
      type: String,
      default: "Pending",
    },
    plan: {
      type: String,
      default: "Ultimate",
    },
    warning: {
      type: String,
      trim: true,
    },
    admin: { type: String },
  },
  { timestamps: true }
);

const Payment = mongoose.model("Payment", paymentSchema);

module.exports = Payment;
