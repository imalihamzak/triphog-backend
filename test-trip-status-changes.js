const mongoose = require('mongoose');
const TripModel = require('./models/TripModel');
const Admin = require('./models/adminSchema');

// Configuration
const DB_CONNECTION = 'mongodb+srv://user1:shoaib123@cluster0.fyoqxwj.mongodb.net/Triphog?appName=Cluster0';

async function demonstrateTripStatusChanges() {
  console.log('🧪 Demonstrating Trip Status Changes and Dashboard Updates...\n');
  
  try {
    // Connect to database
    console.log('📡 Connecting to MongoDB...');
    await mongoose.connect(DB_CONNECTION);
    console.log('✅ Connected to MongoDB\n');
    
    // Find admin
    const admin = await Admin.findOne({});
    const adminId = admin._id;
    
    // Function to calculate and display current statistics
    const showCurrentStats = async (title) => {
      const trips = await TripModel.find({
        $or: [
          { addedByCompanyCode: admin.companyCode },
          { addedBy: adminId }
        ]
      });
      
      const stats = {
        totalTrips: trips.length,
        completed: trips.filter(trip => trip.status === 'Completed').length,
        nonResponsive: trips.filter(trip => trip.status === 'Non Responsive').length,
        cancelled: trips.filter(trip => trip.status === 'Cancelled').length,
        assigned: trips.filter(trip => trip.status === 'Assigned').length,
        notAssigned: trips.filter(trip => trip.status === 'Not Assigned').length
      };
      
      console.log(`📊 ${title}:`);
      console.log(`   • Total Trips: ${stats.totalTrips}`);
      console.log(`   • Completed: ${stats.completed}`);
      console.log(`   • Non Responsive: ${stats.nonResponsive}`);
      console.log(`   • Cancelled: ${stats.cancelled}`);
      console.log(`   • Assigned: ${stats.assigned}`);
      console.log(`   • Not Assigned: ${stats.notAssigned}`);
      console.log('');
      
      return stats;
    };
    
    // Show current statistics
    await showCurrentStats('Current Dashboard Statistics');
    
    // Find some trips to update
    const tripsToUpdate = await TripModel.find({
      $or: [
        { addedByCompanyCode: admin.companyCode },
        { addedBy: adminId }
      ]
    }).limit(5);
    
    if (tripsToUpdate.length === 0) {
      console.log('❌ No trips found to demonstrate status changes');
      return;
    }
    
    console.log('🔄 Demonstrating status changes...\n');
    
    // Update first trip to Completed
    if (tripsToUpdate[0]) {
      console.log(`📝 Updating Trip 1 to "Completed"...`);
      await TripModel.findByIdAndUpdate(
        tripsToUpdate[0]._id,
        {
          status: 'Completed',
          completedAt: new Date(),
          endedAt: new Date(),
          timeTaken: 30
        }
      );
      await showCurrentStats('After Setting Trip 1 to Completed');
    }
    
    // Update second trip to Cancelled
    if (tripsToUpdate[1]) {
      console.log(`📝 Updating Trip 2 to "Cancelled"...`);
      await TripModel.findByIdAndUpdate(
        tripsToUpdate[1]._id,
        { status: 'Cancelled' }
      );
      await showCurrentStats('After Setting Trip 2 to Cancelled');
    }
    
    // Update third trip to Non Responsive
    if (tripsToUpdate[2]) {
      console.log(`📝 Updating Trip 3 to "Non Responsive"...`);
      await TripModel.findByIdAndUpdate(
        tripsToUpdate[2]._id,
        { status: 'Non Responsive' }
      );
      await showCurrentStats('After Setting Trip 3 to Non Responsive');
    }
    
    console.log('✅ Status change demonstration completed!');
    console.log('\n💡 Key Points:');
    console.log('   • Dashboard statistics update immediately when trip statuses change');
    console.log('   • Each status category counts trips with exact status match');
    console.log('   • Total trips always shows the complete count');
    console.log('   • The dashboard you saw (11 total, 0 completed, 0 cancelled, 0 non-responsive)');
    console.log('     is correct because all trips were "Not Assigned" or "Assigned"');
    
    // Revert changes for cleanup
    console.log('\n🔄 Reverting changes for cleanup...');
    await TripModel.findByIdAndUpdate(tripsToUpdate[0]._id, { status: 'Not Assigned' });
    await TripModel.findByIdAndUpdate(tripsToUpdate[1]._id, { status: 'Not Assigned' });
    await TripModel.findByIdAndUpdate(tripsToUpdate[2]._id, { status: 'Not Assigned' });
    
    await showCurrentStats('Final Statistics (After Cleanup)');
    
  } catch (error) {
    console.error('💥 Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
  }
}

// Run the demonstration
demonstrateTripStatusChanges().catch(console.error);