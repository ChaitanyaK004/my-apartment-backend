import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const clusters = [
  { name: 'cluster0 (local .env)', uri: 'mongodb+srv://kulkarnipg0_db_user:5%40Bb4gDz6C%23zzd8@cluster0.5rj0rpl.mongodb.net/My-Apartment?retryWrites=true&w=majority' },
  { name: 'aryancluster (Render cloud)', uri: 'mongodb+srv://My-Apartment:Myapartment@aryancluster.wnwgnsz.mongodb.net/My-Apartment?retryWrites=true&w=majority' }
];

async function syncAll() {
  const newPassword = 'Maint@123';
  const newHash = await bcrypt.hash(newPassword, 10);

  for (const { name, uri } of clusters) {
    console.log(`\n=== Syncing ${name} ===`);
    const conn = await mongoose.createConnection(uri).asPromise();
    const usersCol = conn.collection('users');

    // 1. Update ravi
    await usersCol.updateMany(
      { $or: [{ username: 'ravi' }, { role: 'Maintenance Staff' }, { email: 'ravi@myapartment.com' }] },
      { $set: { passwordHash: newHash } }
    );
    console.log('Updated existing maintenance users to password Maint@123');

    // 2. Ensure "maintenance" user exists
    const maintUser = await usersCol.findOne({ username: 'maintenance' });
    if (!maintUser) {
      await usersCol.insertOne({
        username: 'maintenance',
        email: 'maintenance@myapartment.com',
        passwordHash: newHash,
        name: 'Maintenance Team',
        role: 'Maintenance Staff',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      console.log('Created "maintenance" user account with Maint@123');
    } else {
      await usersCol.updateOne({ _id: maintUser._id }, { $set: { passwordHash: newHash, role: 'Maintenance Staff' } });
      console.log('Updated "maintenance" user account with Maint@123');
    }

    // 3. Ensure "maint" user exists
    const maintShort = await usersCol.findOne({ username: 'maint' });
    if (!maintShort) {
      await usersCol.insertOne({
        username: 'maint',
        email: 'maint@myapartment.com',
        passwordHash: newHash,
        name: 'Maintenance Staff',
        role: 'Maintenance Staff',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      console.log('Created "maint" user account with Maint@123');
    } else {
      await usersCol.updateOne({ _id: maintShort._id }, { $set: { passwordHash: newHash, role: 'Maintenance Staff' } });
      console.log('Updated "maint" user account with Maint@123');
    }

    // Verify all maintenance users in this database
    const allMaint = await usersCol.find({
      $or: [{ username: { $in: ['ravi', 'maintenance', 'maint'] } }, { role: 'Maintenance Staff' }]
    }).toArray();

    for (const u of allMaint) {
      const ok = await bcrypt.compare(newPassword, u.passwordHash);
      console.log(`Verified user ${u.username} (${u.role}): login works? ${ok}`);
    }

    await conn.close();
  }
}

syncAll().catch(console.error);
