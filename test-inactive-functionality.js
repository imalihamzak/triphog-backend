const mongoose = require('mongoose');

// Import models
const UserModel = require('./models/UserModel');
const Admin = require('./models/adminSchema');

// Configuration
const API_BASE_URL = 'http://localhost:21098/api/v1';
const DB_CONNECTION = 'mongodb+srv://user1:shoaib123@cluster0.fyoqxwj.mongodb.net/Triphog?appName=Cluster0';

// Test user data
const TEST_USER = {
  firstName: 'Test',
  lastName: 'User',
  EMailAddress: 'testinactive@example.com',
  password: 'testpassword123',
  phoneNumber: '+1234567890',
  accessibilities: ['dashboard'],
  status: 'active'
};

async function runCompleteTest() {
  console.log('🧪 Starting Complete Inactive User Login Test...\n');
  
  let testUserId = null;
  let adminId = null;
  
  try {
    // Connect to database
    console.log('📡 Connecting to MongoDB...');
    await mongoose.connect(DB_CONNECTION);
    console.log('✅ Connected to MongoDB\n');
    
    // Step 1: Find an admin to associate the user with
    console.log('👤 Finding an admin to associate test user...');
    const admin = await Admin.findOne({});
    if (!admin) {
      console.log('❌ No admin found in database. Cannot proceed with test.');
      return;
    }
    adminId = admin._id;
    console.log(`✅ Found admin: ${admin.firstName} ${admin.lastName}\n`);
    
    // Step 2: Create a test user
    console.log('👤 Creating test user...');
    const testUser = new UserModel({
      ...TEST_USER,
      addedBy: adminId
    });
    await testUser.save();
    testUserId = testUser._id;
    console.log(`✅ Test user created with ID: ${testUserId}\n`);
    
    // Step 3: Test login with active user using fetch
    console.log('🔐 Test 1: Login with ACTIVE user...');
    try {
      const activeLoginResponse = await fetch(`${API_BASE_URL}/user/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: TEST_USER.EMailAddress,
          password: TEST_USER.password
        })
      });
      
      const activeLoginData = await activeLoginResponse.json();
      
      if (activeLoginData.success) {
        console.log('✅ Test 1 PASSED: Active user can login successfully');
      } else {
        console.log('❌ Test 1 FAILED: Active user cannot login');
        console.log('Response:', activeLoginData);
      }
    } catch (error) {
      console.log('❌ Test 1 ERROR:', error.message);
    }
    console.log('');
    
    // Step 4: Set user as inactive
    console.log('⚠️  Setting user status to INACTIVE...');
    await UserModel.findByIdAndUpdate(testUserId, { status: 'inactive' });
    console.log('✅ User status updated to inactive\n');
    
    // Step 5: Test login with inactive user
    console.log('🔐 Test 2: Login with INACTIVE user...');
    try {
      const inactiveLoginResponse = await fetch(`${API_BASE_URL}/user/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: TEST_USER.EMailAddress,
          password: TEST_USER.password
        })
      });
      
      const inactiveLoginData = await inactiveLoginResponse.json();
      
      if (inactiveLoginData.success === false && 
          inactiveLoginData.message.includes('deactivated')) {
        console.log('✅ Test 2 PASSED: Inactive user login correctly blocked');
        console.log('Message:', inactiveLoginData.message);
      } else if (inactiveLoginData.success === true) {
        console.log('❌ Test 2 FAILED: Inactive user was able to login');
        console.log('Response:', inactiveLoginData);
      } else {
        console.log('⚠️  Test 2 INCONCLUSIVE: Unexpected response');
        console.log('Response:', inactiveLoginData);
      }
    } catch (error) {
      console.log('❌ Test 2 ERROR:', error.message);
    }
    console.log('');
    
    // Step 6: Test with different case variations
    console.log('🔐 Test 3: Login with INACTIVE user (case variations)...');
    await UserModel.findByIdAndUpdate(testUserId, { status: 'INACTIVE' });
    
    try {
      const caseTestResponse = await fetch(`${API_BASE_URL}/user/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: TEST_USER.EMailAddress,
          password: TEST_USER.password
        })
      });
      
      const caseTestData = await caseTestResponse.json();
      
      if (caseTestData.success === false && 
          caseTestData.message.includes('deactivated')) {
        console.log('✅ Test 3 PASSED: Case-insensitive inactive check works');
      } else {
        console.log('❌ Test 3 FAILED: Case-insensitive check failed');
        console.log('Response:', caseTestData);
      }
    } catch (error) {
      console.log('❌ Test 3 ERROR:', error.message);
    }
    
  } catch (error) {
    console.error('💥 Test Error:', error.message);
  } finally {
    // Cleanup
    if (testUserId) {
      console.log('\n🧹 Cleaning up test user...');
      await UserModel.findByIdAndDelete(testUserId);
      console.log('✅ Test user deleted');
    }
    
    // Disconnect from database
    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
    
    console.log('\n🏁 Test completed!');
  }
}

// Run the test
runCompleteTest().catch(console.error);