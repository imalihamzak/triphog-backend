const { Schema, model } = require("mongoose");

const participantSchema = new Schema(
  {
    id: { type: Schema.Types.ObjectId, required: true },
    role: {
      type: String,
      enum: ["Admin", "SuperAdmin", "User", "Driver", "Patient"],
      required: true,
    },
  },
  { _id: false }
);

const chatConversationSchema = new Schema(
  {
    latestMessage: {
      type: String,
      default: "",
    },
    isGroup: { type: Boolean, default: false },
    groupName: { type: String, default: "" },
    // User that created the group conversation (only set when isGroup === true)
    creatorId: { type: Schema.Types.ObjectId },
    creatorRole: {
      type: String,
      enum: ["Admin", "SuperAdmin", "User", "Driver", "Patient"],
    },
    recipients: { type: [participantSchema] },
  },
  { timestamps: true }
);

const ChatConversation = model("ChatConversation", chatConversationSchema);

module.exports = ChatConversation;
