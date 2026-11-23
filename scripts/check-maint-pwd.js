import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const MONGODB_URI = 'mongodb+srv://kulkarnipg0_db_user:5%40Bb4gDz6C%23zzd8@cluster0.5rj0rpl.mongodb.net/My-Apartment?retryWrites=true&w=majority';

async function main() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  const usersCol = mongoose.connection.collection('users');
  const staffCol = mongoose.connection.collection('maintenance_staff');

  const allUsers = await usersCol.find({}).toArray();
  console.log('Total users in DB:', allUsers.length);
  for (const u of allUsers) {
    console.log(`User: username="${u.username}", email="${u.email}", role="${u.role}", name="${u.name}"`);
  }

  const maintUsers = allUsers.filter(u => 
    u.role === 'Maintenance Staff' || 
    u.username === 'ravi' || 
    (u.role && u.role.toLowerCase().includes('maint'))
  );

  console.log('\n--- Maintenance Users Found ---');
  for (const u of maintUsers) {
    const isMaint123 = u.passwordHash ? await bcrypt.compare('Maint@123', u.passwordHash) : false;
    const isStaff123 = u.passwordHash ? await bcrypt.compare('Staff@123', u.passwordHash) : false;
    console.log(`User ${u.username} (${u.name}): matches Maint@123? ${isMaint123}, matches Staff@123? ${isStaff123}`);
  }

  const staffMembers = await staffCol.find({}).toArray();
  console.log('\n--- Maintenance Staff Collection ---');
  for (const s of staffMembers) {
    console.log(`Staff: id="${s.id}", name="${s.name}", role="${s.role}", category="${s.category}", username="${s.username}", phone="${s.phone}"`);
  }

  await mongoose.disconnect();
}

main().catch(console.error);
