const { Schema, model } = require("mongoose");

const conversationReadSchema = new Schema(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: "ChatConversation", required: true },
    userId: { type: Schema.Types.ObjectId, required: true },
    userRole: { type: String, required: true, enum: ["Admin", "SuperAdmin", "User", "Driver"] },
    lastReadAt: { type: Date, default: null },
  },
  { timestamps: true }
);

conversationReadSchema.index({ conversationId: 1, userId: 1, userRole: 1 }, { unique: true });

const ConversationRead = model("ConversationRead", conversationReadSchema);
module.exports = ConversationRead;
