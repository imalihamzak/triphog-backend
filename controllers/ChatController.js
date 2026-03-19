const { getIO, getReceiverSocketId } = require("../io");
const Admin = require("../models/adminSchema");
const DriverModel = require("../models/DriverModel");
const PatientModel = require("../models/PatientModel");
const MessageModel = require("../models/MessageModel");
const GroupModel = require("../models/GroupModel");
const SuperAdminModel = require("../models/SuperAdminModel");
const axios = require("axios");
const { getUploadsBaseUrl } = require("../config/appUrls");

exports.createGroup = async (req, res) => {
  console.log("Creating New Group");
  try {
    console.log(req.body);
    let newGroup = new GroupModel(req.body);
    await newGroup.save();
    res.json({ success: true, newGroup });
  } catch (e) {
    res.json({ success: false });
  }
};
exports.deleteChat = async (req, res) => {
  const senderId = req.params.senderId;
  const receiverId = req.params.receiverId;
  try {
    let allMessages = await MessageModel.find();
    let chatMessages = [];
    for (let message of allMessages) {
      if (
        (message.senderId == senderId || message.senderId == receiverId) &&
        (message.receiverId == receiverId || message.receiverId == senderId)
      ) {
        chatMessages.push(message);
      }
    }
    let messagesIds = [];
    for (let message of chatMessages) {
      messagesIds.push(message._id);
    }
    await MessageModel.deleteMany({ _id: { $in: messagesIds } });
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
};
exports.getMyMessages = async (req, res) => {
  const userRole = req.userRole;
  try {
    let allMessages = await MessageModel.find();
    let admin = await Admin.findOne({ _id: req.userId });
    let allDrivers = await DriverModel.find({ addedBy: req.userId });
    let allPatients = await PatientModel.find({
      $or: [
        { addedBy: req.userId }, // Condition 1: Match records where addedBy is req.userId
        { companyCode: admin.companyCode }, // Condition 2: Match records where companyCode is admin.companyCode
      ],
    });
    let allTimeMessages = [];

    console.log("All Patients", allPatients);
    let superAdmins = await SuperAdminModel.find();
    let allUsers =
      userRole == "Admin"
        ? [...allDrivers, ...allPatients, ...superAdmins]
        : [...allDrivers, ...allPatients];
    let chats = [];

    for (let user of allUsers) {
      let messages = [];

      for (let message of allMessages) {
        // Check if message senderId is equal to user._id and receiverId is req.userId
        if (message.senderId == user._id && message.receiverId == req.userId) {
          messages.push(message);
        }
      }

      if (messages.length > 0) {
        // Add senderName to each message before pushing to allTimeMessages
        let updatedMessages = messages.map((message) => {
          // Add the senderName property to the message object
          return {
            ...message._doc, // Spread existing message properties (_doc if Mongoose object)
            senderName: user.firstName + " " + user.lastName,
          };
        });

        // Push the updated messages to allTimeMessages
        allTimeMessages.push(...updatedMessages);
      }
    }

    res.json({ success: true, allTimeMessages });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
};

exports.sendMessage = async (req, res) => {
  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    console.log("Current Time Zone:", timeZone);
    const date = new Date();
    console.log("Latest Date", date.toLocaleDateString());
    console.log("To Locale Time String", date);
    let hours = date.getHours();
    console.log("Hours", hours);
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? "PM" : "AM";
    console.log("");

    // Convert 24-hour format to 12-hour format
    hours = hours % 12;
    hours = hours ? hours : 12; // the hour '0' should be '12'

    // Add leading zero to minutes if it's less than 10
    const minutesWithLeadingZero = minutes < 10 ? "0" + minutes : minutes;

    // Format the time as a string
    const timeString = hours + ":" + minutesWithLeadingZero + " " + ampm;

    if (req.body.text.length > 0) {
      console.log(req.params);
      console.log(req.body);
      let message = new MessageModel({
        text: req.body.text,
        senderId: req.params.senderId,
        receiverId: req.params.receiverId,
        addedON: new Date().toLocaleString(),
        addedAt: new Date().toLocaleTimeString(),
      });
      await message.save();

      let userSocketId = getReceiverSocketId(req.params.receiverId);
      console.log("Socket Id For Sending Notification", userSocketId);
      console.log("Sender Name", req.body.senderName);
      getIO()
        .to(userSocketId)
        .emit("new-notification", {
          senderName: req.body.senderName,
          mediaUrl: message.mediaUrl,
          mediaType: message.mediaType,
          text: message.text,
        });
      console.log("New Added Message", message);
      try {
        const response = await axios.post(
          process.env.FIREBASE_NOTIFICATION_URL,
          {
            message: {
              topic: req.params.receiverId,
              data: {
                sender: req.body.senderName,
                message:
                  req.body.senderName + " Has Sent A Message: " + req.body.text,
                type: "notification",
              },
              notification: {
                title: req.body.senderName,
                body:
                  req.body.senderName + " Has Sent A Message: " + req.body.text,
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

      let socketId = getReceiverSocketId(req.params.receiverId);
      console.log("Socket Id", socketId);
      if (socketId.length > 0) {
        console.log("Emitting NewMsg Even");

        getIO().to(socketId).emit("newMsg", message);
        console.log("Event Has Been Triggered");
        res.json({ success: true, message });
      } else {
        res.json({ success: true, message });
      }
    } else if (req.file) {
      req.body.mediaUrl = getUploadsBaseUrl() + "/" + req.file.path;
      console.log("Adding Message With Media");
      let message = new MessageModel({
        mediaUrl: req.body.mediaUrl,
        mediaType: req.body.mediaType,
        senderId: req.params.senderId,
        receiverId: req.params.receiverId,
        addedON: new Date().toLocaleString(),
        addedAt: new Date().toLocaleTimeString(),
      });
      await message.save();
      let userSocketId = getReceiverSocketId(req.params.receiverId);
      console.log("Socket Id For Sending Notification", userSocketId);
      console.log("Sender Name", req.body.senderName);
      getIO()
        .to(userSocketId)
        .emit("new-notification", {
          senderName: req.body.senderName,
          mediaUrl: message.mediaUrl,
          mediaType: message.mediaType,
          text: message.text,
        });

      try {
        const response = await axios.post(
          process.env.FIREBASE_NOTIFICATION_URL,
          {
            message: {
              topic: req.params.receiverId,
              data: {
                sender: req.body.senderName,
                message:
                  req.body.senderName + " Has Sent " + message.mediaType ==
                  "video"
                    ? "Video"
                    : "Image",
                type: "notification",
              },
              notification: {
                title: req.body.senderName,
                body:
                  req.body.senderName + " Has Sent A " + message.mediaType ==
                  "video"
                    ? "Video"
                    : "Image",
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
      let socketId = getReceiverSocketId(req.params.receiverId);
      if (socketId.length > 0) {
        console.log("Emitting NewMsg Even");
        getIO().to(socketId).emit("newMsg", message);
      }
      res.json({ success: true, message });
    }
  } catch (error) {
    console.log("Error While Sending Message", error.message);
    res.json({ success: false, error: error.message });
  }
};
exports.sendGroupMessage = async (req, res) => {
  try {
    console.log(req.body);
    console.log("Group Id", req.params.groupId);
    let group = await GroupModel.findOne({ _id: req.params.groupId });
    let groupMessages = group.messages;
    if (req.body.text.length > 0) {
      groupMessages = groupMessages.concat({
        id: Math.random().toString(),
        sentBy: req.body.senderId,
        text: req.body.text,
        addedON: new Date().toLocaleDateString(),
        addedAt: new Date().toTimeString(),
        mediaUrl: "",
        mediaType: "",
      });
      await GroupModel.findByIdAndUpdate(
        req.params.groupId,
        { messages: groupMessages },
        { new: true, runValidators: true }
      );
      res.json({ success: true, groupMessages });
    } else if (req.file) {
      console.log("Adding Group Message");
      console.log(req.body);
      req.body.mediaUrl = getUploadsBaseUrl() + "/" + req.file.path;
      groupMessages = groupMessages.concat({
        id: Math.random().toString(),
        sentBy: req.body.senderId,
        text: "",
        addedON: new Date().toLocaleDateString(),
        addedAt: new Date().toTimeString(),
        mediaUrl: req.body.mediaUrl,
        mediaType: req.body.mediaType,
      });
      await GroupModel.findByIdAndUpdate(
        req.params.groupId,
        { messages: groupMessages },
        { new: true, runValidators: true }
      );
      res.json({ success: true, groupMessages });
    } else {
      res.json({ success: false, message: "Error While Sending Message" });
    }
  } catch (e) {
    res.json({ success: false });
  }
};
exports.getGroupMessages = async (req, res) => {
  try {
    let group = await GroupModel.findById(req.params.groupId);
    res.json({ success: true, group });
  } catch (e) {
    res.json({ success: false });
  }
};
exports.getMessages = async (req, res) => {
  let messages = [];

  try {
    // Fetch all messages from the database
    let allMessages = await MessageModel.find();

    if (allMessages.length > 0) {
      // Filter messages between senderId and receiverId
      for (let message of allMessages) {
        if (
          (message.senderId == req.params.senderId ||
            message.senderId == req.params.receiverId) &&
          (message.receiverId == req.params.senderId ||
            message.receiverId == req.params.receiverId)
        ) {
          messages.push(message);
        }
      }

      // Update messages where senderId equals receiverId
      await MessageModel.updateMany(
        {
          senderId: req.params.receiverId,
          receiverId: req.params.senderId,
          isRead: false,
        },
        { $set: { isRead: true } }
      );
      let socketId = getReceiverSocketId(req.params.senderId);
      console.log("Event Has been emitted  for socket Id", socketId);
      getIO().to(socketId).emit("reload-notifications");

      res.json({ success: true, messages });
    } else {
      res.json({ success: true, messages });
    }
  } catch (e) {
    console.error("Error fetching/updating messages:", e);
    res.json({ success: false, message: "Error fetching messages" });
  }
};

exports.getMyChats = async (req, res) => {
  try {
    let userRole = req.userRole;
    let allMessages = await MessageModel.find();
    let ADMIN = {}; // Declare Admin outside the blocks

    if (userRole == "Patient" || userRole == "Driver") {
      let allAdmins = await Admin.find();
      let chats = [];

      if (userRole == "Patient") {
        let patient = await PatientModel.findOne({ _id: req.userId });
        ADMIN = await Admin.findOne({ companyCode: patient.companyCode });
      } else {
        let driver = await DriverModel.findOne({ _id: req.userId });
        console.log("Driver found", driver);
        ADMIN = await Admin.findOne({ _id: driver.addedBy });
      }

      for (let admin of allAdmins) {
        let messages = [];
        for (let message of allMessages) {
          if (
            (message.senderId == req.userId || message.senderId == admin._id) &&
            (message.receiverId == req.userId ||
              message.receiverId == admin._id)
          ) {
            console.log(message);
            messages.push(message);
          }
        }
        if (messages.length > 0) {
          chats.push({
            with: admin.firstName + " " + admin.lastName,
            lastMessage: messages[messages.length - 1],
            withId: admin._id,
            withProfilePhoto: admin.photo,
            withPhoneNumber: admin.phoneNumber,
          });
        }
      }

      console.log("Chats", chats);
      console.log("Admin", ADMIN);
      res.json({ success: true, chats, ADMIN });
    } else if (userRole == "SuperAdmin") {
      let allAdmins = await Admin.find();
      let chats = [];
      for (let admin of allAdmins) {
        let messages = [];
        for (let message of allMessages) {
          if (
            (message.senderId == req.userId || message.senderId == admin._id) &&
            (message.receiverId == req.userId ||
              message.receiverId == admin._id)
          ) {
            messages.push(message);
          }
        }
        if (messages.length > 0) {
          chats.push({
            with: admin.firstName + " " + admin.lastName,
            lastMessage: messages[messages.length - 1],
            withId: admin._id,
          });
        }
      }
      res.json({ success: true, chats });
    } else if (userRole == "Admin" || userRole == "User") {
      let admin = await Admin.findOne({ _id: req.userId });
      let allDrivers = await DriverModel.find({ addedBy: req.userId });
      let allPatients = await PatientModel.find({
        $or: [{ addedBy: req.userId }, { companyCode: admin.companyCode }],
      });

      console.log("All Patients", allPatients);
      let superAdmins = await SuperAdminModel.find();
      let allUsers =
        userRole == "Admin"
          ? [...allDrivers, ...allPatients, ...superAdmins]
          : [...allDrivers, ...allPatients];
      let chats = [];
      let MyGroups = await GroupModel.find({ createdBy: req.userId });
      for (let user of allUsers) {
        let messages = [];
        for (let message of allMessages) {
          if (
            (message.senderId == req.userId || message.senderId == user._id) &&
            (message.receiverId == req.userId || message.receiverId == user._id)
          ) {
            messages.push(message);
          }
        }
        if (messages.length > 0) {
          chats.push({
            with: user.firstName + " " + user.lastName,
            lastMessage: messages[messages.length - 1],
            withId: user._id,
            withRole: user.role ? user.role : "",
          });
        }
      }
      res.json({ success: true, MyGroups, chats });
    }
  } catch (e) {
    console.log("Chat Error Message");
    res.json({ success: false, errorMsg: e.message });
  }
};

/*

*/
