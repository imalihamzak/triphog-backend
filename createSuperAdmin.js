const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const SuperAdminModel = require('./models/SuperAdminModel');
require('dotenv').config();

// Connect to MongoDB - use the same connection as the main server
const connectDB = async () => {
  try {
    // Try to get DB connection from environment or use default
    const dbConnection = process.env.DB_CONNECTION || process.env.MONGODB_URI || 'mongodb://localhost:27017/triphog';
    await mongoose.connect(dbConnection, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    console.error('💡 Make sure your database is running and DB_CONNECTION is set in .env');
    process.exit(1);
  }
};

// Create superadmin
const createSuperAdmin = async () => {
  try {
    await connectDB();

    // Superadmin credentials
    const email = 'superadmin@gmail.com';
    const password = 'superadmin123';
    const firstName = 'Super';
    const lastName = 'Admin';

    // Check if superadmin already exists and delete it
    const existingAdmin = await SuperAdminModel.findOne({ EMailAddress: email });
    if (existingAdmin) {
      console.log('⚠️  Superadmin already exists. Deleting and recreating...');
      await SuperAdminModel.deleteOne({ EMailAddress: email });
      console.log('🗑️  Existing superadmin deleted');
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create superadmin
    const superAdmin = new SuperAdminModel({
      firstName,
      lastName,
      EMailAddress: email,
      password: hashedPassword,
      role: 'Super Admin',
    });

    await superAdmin.save();

    console.log('✅ Superadmin created successfully!');
    console.log('📧 Email:', email);
    console.log('🔑 Password:', password);
    console.log('👤 Name:', `${firstName} ${lastName}`);
    console.log('🆔 ID:', superAdmin._id);

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating superadmin:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
};

// Run the script
createSuperAdmin();

