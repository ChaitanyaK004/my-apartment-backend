import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const uri = 'mongodb+srv://My-Apartment:Myapartment@aryancluster.wnwgnsz.mongodb.net/My-Apartment?retryWrites=true&w=majority';

async function testAryanCluster() {
  console.log('Connecting to aryancluster...');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  console.log('Connected to aryancluster successfully!');

  const usersCol = mongoose.connection.collection('users');
  const allUsers = await usersCol.find({}).toArray();
  console.log('Total users in aryancluster:', allUsers.length);
  for (const u of allUsers) {
    const isMaint123 = u.passwordHash ? await bcrypt.compare('Maint@123', u.passwordHash) : false;
    const isStaff123 = u.passwordHash ? await bcrypt.compare('Staff@123', u.passwordHash) : false;
    console.log(`User ${u.username} (${u.role}): matches Maint@123? ${isMaint123}, matches Staff@123? ${isStaff123}`);
  }

  // Update password for ravi/maintenance staff on aryancluster
  const newHash = await bcrypt.hash('Maint@123', 10);
  const res = await usersCol.updateMany(
    {
      $or: [
        { username: 'ravi' },
        { role: 'Maintenance Staff' },
        { email: 'ravi@myapartment.com' }
      ]
    },
    { $set: { passwordHash: newHash } }
  );
  console.log(`Updated ${res.modifiedCount} user(s) on aryancluster to Maint@123!`);

  await mongoose.disconnect();
}

testAryanCluster().catch(console.error);
