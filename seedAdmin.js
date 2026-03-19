const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const Admin = require("./models/adminSchema");
const { DBConfig } = require("./config");

const MONGO_URI = `${DBConfig.dbURL}/${DBConfig.dbName}`;

async function seedSuperAdmin() {
  try {
    // Connect to MongoDB
    await mongoose.connect(MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("✅ Connected to MongoDB");

    const email = "superadmin@gmail.com";
    const existingAdmin = await Admin.findOne({ email });

    if (existingAdmin) {
      console.log("⚠️ Super admin already exists.");
      return process.exit(0);
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash("test123", 10);

    // Sample payment records
    const payments = [
      {
        paymentId: "PAY-001",
        amount: 199.99,
        currency: "USD",
        method: "Credit Card",
        plan: "Ultimate",
        status: "Completed",
        transactionDate: new Date("2025-10-15T10:00:00Z"),
        expiryDate: new Date("2025-11-15T10:00:00Z"),
        reference: "TXN-Ultimate-001",
      },
      {
        paymentId: "PAY-002",
        amount: 199.99,
        currency: "USD",
        method: "Credit Card",
        plan: "Ultimate",
        status: "Completed",
        transactionDate: new Date("2025-11-01T14:30:00Z"),
        expiryDate: new Date("2025-12-01T14:30:00Z"),
        reference: "TXN-Ultimate-002",
      },
    ];

    // Create new Super Admin
    const newAdmin = new Admin({
      _id: new mongoose.Types.ObjectId("690895184e7688d54225fe39"),
      firstName: "Super",
      lastName: "Admin",
      email,
      password: hashedPassword,
      phoneNumber: "+1-555-123-4567",
      companyName: "System Headquarters",
      companyCode: "HQ001",
      isOnHold: false,
      warningMsg: "",
      docs: [
        {
          name: "Company Registration",
          url: "https://example.com/docs/company-registration.pdf",
        },
        {
          name: "Tax Certificate",
          url: "https://example.com/docs/tax-certificate.pdf",
        },
      ],
      frequentlyVisitedPages: [
        { title: "View Trips", path: "/admin/trips" },
        { title: "Schedule Meeting", path: "/admin/meeting" },
        { title: "Billing History", path: "/admin/billing" },
        { title: "Manage Users", path: "/admin/users" },
      ],
      photo: "https://example.com/images/superadmin-avatar.png",
      features: [
        "analytics",
        "report_generation",
        "user_management",
        "subscription_tracking",
        "calendar_integration",
        "api_access",
      ],
      paymentStatus: "paid",
      status: "active",
      plan: "Ultimate",
      hasPlan: true,
      createdAt: new Date("2025-11-03T11:42:16.476Z"),
      googleCalendarTokens: {
        access_token: "ya29.a0AfH6SMCEXAMPLEACCESS",
        refresh_token: "1//0gExampleRefreshToken",
        scope: "https://www.googleapis.com/auth/calendar",
        token_type: "Bearer",
        expiry_date: 1762166400000,
      },
      payments,
      passwordResetToken: "9f3f3c4a5d8f4a23b123f9bca8d6e91234efabcd",
      passwordResetExpires: new Date("2025-11-10T11:42:16.476Z"),
    });

    await newAdmin.save();
    console.log(
      "🎉 Super Admin created successfully with all fields populated!"
    );
    console.log({
      email: newAdmin.email,
      password: "test123 (hashed in DB)",
      payments: newAdmin.payments.length,
    });
  } catch (error) {
    console.error("❌ Error seeding super admin:", error);
  } finally {
    mongoose.connection.close();
  }
}

seedSuperAdmin();
