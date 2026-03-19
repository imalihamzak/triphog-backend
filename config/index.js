const dotenv = require("dotenv");

dotenv.config({ path: ".env" });

exports.DBConfig = {
  dbURL: process.env.DB_CONNECTION,
  dbName: process.env.DB_NAME,
};

exports.AppConfig = {
  port: process.env.PORT,
};
