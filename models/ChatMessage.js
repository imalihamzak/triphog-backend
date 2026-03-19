const { Schema, model } = require("mongoose");

const chatMessageSchema = new Schema(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "AdminChatConversation",
      required: [true, "Conversation ID is required."],
    },
    content: { type: String, required: [true, "Message Content is required."] },
    isRead: { type: Boolean, default: false },
    sender: {
      id: { type: Schema.Types.ObjectId },
      role: {
        type: String,
        enum: ["Admin", "SuperAdmin", "User", "Driver", "Patient"],
      },
    },
    reciever: {
      id: { type: Schema.Types.ObjectId },
      role: {
        type: String,
        enum: ["Admin", "SuperAdmin", "User", "Driver", "Patient", "Group"],
      },
    },
  },
  { timestamps: true }
);

const ChatMessage = model("ChatMessage", chatMessageSchema);

module.exports = ChatMessage;
