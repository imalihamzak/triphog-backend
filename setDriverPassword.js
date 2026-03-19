const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const DriverModel = require("./models/DriverModel");
const { DBConfig } = require("./config");

const MONGO_URI = `${DBConfig.dbURL}/${DBConfig.dbName}`;

async function setDriverPassword() {
  try {
    // Connect to MongoDB
    await mongoose.connect(MONGO_URI);
    console.log("✅ Connected to MongoDB");

    // Get driver email from command line
    const args = process.argv.slice(2);
    const email = args[0];
    const password = args[1] || "driver123"; // Default password

    if (!email) {
      console.log("\n❌ Please provide driver email!");
      console.log("\nUsage:");
      console.log("  node setDriverPassword.js <email> [password]");
      console.log("\nExample:");
      console.log("  node setDriverPassword.js ahmed@example.com mypassword");
      console.log("  node setDriverPassword.js ahmed@example.com");
      console.log("  (default password: driver123)");
      process.exit(1);
    }

    // Find driver
    const driver = await DriverModel.findOne({ EMailAddress: email });

    if (!driver) {
      console.log(`\n❌ Driver not found with email: ${email}`);
      console.log("\nAvailable drivers:");
      const allDrivers = await DriverModel.find({}).select("firstName lastName EMailAddress");
      allDrivers.forEach(d => {
        console.log(`  - ${d.firstName} ${d.lastName} (${d.EMailAddress})`);
      });
      process.exit(1);
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Update driver
    driver.password = hashedPassword;
    driver.status = "active";
    driver.isApproved = true;
    await driver.save();

    console.log("\n✅ Password set successfully!");
    console.log("\n📱 Driver Login Credentials:");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`👤 Name:     ${driver.firstName} ${driver.lastName}`);
    console.log(`📧 Email:    ${driver.EMailAddress}`);
    console.log(`🔑 Password: ${password}`);
    console.log(`🚗 Vehicle:  ${driver.vehicleName}`);
    console.log(`📱 Phone:    ${driver.phoneNumber}`);
    console.log(`✅ Status:   ${driver.status}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("\n💡 Driver ab mobile app mein login kar sakta hai!");

  } catch (error) {
    console.error("❌ Error:", error.message);
  } finally {
    mongoose.connection.close();
  }
}

setDriverPassword();
