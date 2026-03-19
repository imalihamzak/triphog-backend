const { server } = require("./index");
const mongoose = require("mongoose");

const fs = require("fs");
const path = require("path");

const { DBConfig, AppConfig } = require("./config");

const uploadDir = path.join(__dirname, "uploads");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

server.listen(AppConfig.port, () => {
  console.log(`Server Started on Port ${AppConfig.port}`);
});

mongoose
  .connect(DBConfig.dbURL, { dbName: DBConfig.dbName })
  .then(() => {
    console.log("MongoDB connected successfully.");
  })
  .catch((err) => {
    console.log("MONGO DB ERROR", err.message);
    console.log("Database Connection Failed ", err);
  });
