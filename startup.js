#!/usr/bin/env node

// Load environment variables first (from server folder so it works regardless of cwd)
const path = require("path");
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { server } = require("./index");
const mongoose = require("mongoose");
const fs = require("fs");
const { DBConfig, AppConfig } = require("./config");

// Log environment info for debugging
console.log("=== Server Startup ===");
console.log("Environment:", process.env.NODE_ENV);
console.log("Port:", process.env.PORT);
console.log("Frontend URL:", process.env.FRONTEND_URL);
console.log("DB Connection:", process.env.DB_CONNECTION ? "Configured" : "Missing");
console.log("Gmail (for emails):", process.env.GMAIL_EMAIL && process.env.GMAIL_PASSWORD ? "Configured" : "Missing - set GMAIL_EMAIL and GMAIL_PASSWORD in .env");

// Create uploads directory if it doesn't exist
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log("✅ Created uploads directory");
}

// Connect to MongoDB with retries (helps with DNS/network ETIMEOUT)
const maxRetries = 3;
const retryDelayMs = 5000;
const connectOptions = {
  dbName: DBConfig.dbName,
  serverSelectionTimeoutMS: 30000, // 30 seconds (DNS + server selection)
  connectTimeoutMS: 30000,        // 30 seconds (initial connection)
  socketTimeoutMS: 45000,
};

function connectWithRetry(attempt) {
  console.log(`🔄 Connecting to MongoDB... (attempt ${attempt}/${maxRetries})`);
  return mongoose
    .connect(DBConfig.dbURL, connectOptions)
    .then(() => {
      console.log("✅ MongoDB connected successfully");
      console.log("Database:", DBConfig.dbName);
    })
    .catch((err) => {
      console.error("❌ MongoDB connection failed:", err.message);
      if (err.code === "ETIMEOUT" || err.syscall === "querySrv") {
        console.error("💡 Tip: DNS SRV lookup timed out. If this persists:");
        console.error("   - Try the standard connection string from Atlas (Connect → Drivers → toggle off 'SRV')");
        console.error("   - Check firewall/VPN or try another network");
      }
      if (attempt < maxRetries) {
        console.log(`   Retrying in ${retryDelayMs / 1000}s...`);
        return new Promise((resolve) => setTimeout(resolve, retryDelayMs)).then(() =>
          connectWithRetry(attempt + 1)
        );
      }
    });
}

connectWithRetry(1);

// Start server with better error handling
const PORT = process.env.PORT || 21098;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server Started on Port ${PORT}`);
  console.log(`🌐 Server URL: http://localhost:${PORT}`);
  console.log(`🔗 API Base: http://localhost:${PORT}/api/v1`);
  console.log(`🔌 Socket.IO: http://localhost:${PORT}/socket.io`);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
    mongoose.connection.close();
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
    mongoose.connection.close();
  });
});