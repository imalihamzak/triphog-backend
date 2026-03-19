const Admin = require("./models/adminSchema");
const socketIo = require("socket.io");
const setUpChatHandler = require("./sockets/chat-sockets");
let IO;
let connectedUsers = [];
let allAdmins = [];

(async () => {
  try {
    allAdmins = await Admin.find();
    // console.log("All Admins IN IO after fetch", allAdmins);
  } catch (error) {
    console.log("ERROR", error);
  }
})();

let getAdminId = (companyCode) => {
  let filteredAdmins = allAdmins.filter((admin) => {
    return admin.companyCode == companyCode;
  });
  return filteredAdmins[0]?._id.toString();
};

const { getAllowedOrigins } = require("./config/appUrls");

const initializeSocket = (server) => {
  const allowedOrigins = getAllowedOrigins();

  IO = socketIo(server, {
    cors: {
      origin: allowedOrigins,
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
      credentials: true,
      allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept", "Origin"]
    },
    pingTimeout: 120000,
    pingInterval: 30000,
    transports: ['polling', 'websocket'],
    allowEIO3: true,
    connectTimeout: 45000,
    allowRequest: (req, callback) => {
      const origin = req.headers.origin;
      
      // Always allow, but log for debugging
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.log('Socket.IO allowing origin:', origin);
        callback(null, true);
      }
    }
  });

  // Handle Socket.IO connection errors (log only message/code/context to avoid dumping req/res)
  IO.engine.on("connection_error", (err) => {
    const msg = [err?.message, err?.code].filter(Boolean).join(" ") || "unknown";
    const ctx = err?.context ? JSON.stringify(err.context) : "";
    console.error("Socket.IO connection_error:", msg, ctx || "");
  });

  IO.on("connection", (socket) => {
    try {
      let userId = socket.handshake.query.userId;

      if (!userId) {
        socket.disconnect();
        return;
      }

    socket.on("current-location", (data) => {
      const socketID = getReceiverSocketId(data.addedBy);
      IO.to(socketID).emit("location-changed", data);
    });
    socket.emit("latest-location", {
      message: "Your Location Is Changing Properly",
    });

    socket.on("location-changed", (updatedLocation) => {
      if (updatedLocation.addedByCompanyCode && updatedLocation.addedByCompanyCode.length > 0) {
        let adminId = getAdminId(updatedLocation.addedByCompanyCode);
        let adminSocketId = getReceiverSocketId(adminId);
        let patientSocketId = getReceiverSocketId(updatedLocation.patientRef);

        if (adminSocketId) {
          IO.to(adminSocketId).emit("update-location", updatedLocation);
        }
        if (patientSocketId) {
          IO.to(patientSocketId).emit("update-location", updatedLocation);
        }
      } else {
        let adminSocketId = getReceiverSocketId(updatedLocation.addedBy);
        let patientSocketId = getReceiverSocketId(updatedLocation.patientRef);

        if (adminSocketId) {
          IO.to(adminSocketId).emit("update-location", updatedLocation);
        }
        if (patientSocketId) {
          IO.to(patientSocketId).emit("update-location", updatedLocation);
        }
      }
    });

    let alreadyConnected = connectedUsers.some((user) => user.ID === userId);
    if (alreadyConnected) {
      connectedUsers = connectedUsers.filter((user) => user.ID !== userId);
    }
    connectedUsers.push({ ID: userId, socketId: socket.id });

    socket.on("disconnect", (reason) => {
      connectedUsers = connectedUsers.filter(
        (user) => user.socketId !== socket.id
      );
    });
    socket.on("reconnect", () => {});

    setUpChatHandler(IO, socket, connectedUsers);
    } catch (error) {
      console.error("Socket.IO connection handler error:", error?.message || error);
      socket.emit("error", { message: "Connection error occurred" });
      socket.disconnect();
    }
  });
};

const getIO = () => {
  if (!IO) {
    throw new Error("Socket.IO not initialized!");
  }
  return IO;
};

const getReceiverSocketId = (userId) => {
  const user = connectedUsers.find((user) => user.ID === userId);
  return user ? user.socketId : "";
};

module.exports = { initializeSocket, getReceiverSocketId, getIO };
