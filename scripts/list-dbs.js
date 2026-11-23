import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const uri = 'mongodb+srv://kulkarnipg0_db_user:5%40Bb4gDz6C%23zzd8@cluster0.5rj0rpl.mongodb.net/?retryWrites=true&w=majority';

async function listDbs() {
  await mongoose.connect(uri);
  const adminDb = mongoose.connection.db.admin();
  const dbs = await adminDb.listDatabases();
  console.log('Databases on cluster:');
  for (const d of dbs.databases) {
    console.log(' - ' + d.name + ' (' + d.sizeOnDisk + ' bytes)');
    // Check if there is a users collection in this database
    const dbInstance = mongoose.connection.client.db(d.name);
    const collections = await dbInstance.listCollections().toArray();
    const hasUsers = collections.some(c => c.name === 'users');
    if (hasUsers) {
      console.log(`   --> ${d.name} has 'users' collection!`);
      const users = await dbInstance.collection('users').find({}).toArray();
      for (const u of users) {
        if (u.username === 'ravi' || u.role === 'Maintenance Staff') {
          const isMaint = u.passwordHash ? await bcrypt.compare('Maint@123', u.passwordHash) : false;
          const isStaff = u.passwordHash ? await bcrypt.compare('Staff@123', u.passwordHash) : false;
          console.log(`       User ${u.username} in db ${d.name}: Maint@123=${isMaint}, Staff@123=${isStaff}`);
        }
      }
    }
  }
  await mongoose.disconnect();
}
listDbs().catch(console.error);
