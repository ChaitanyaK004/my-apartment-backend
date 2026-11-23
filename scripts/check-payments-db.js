import mongoose from 'mongoose';

const uri = 'mongodb+srv://My-Apartment:Myapartment@aryancluster.wnwgnsz.mongodb.net/My-Apartment?retryWrites=true&w=majority';

async function run() {
  await mongoose.connect(uri);
  const list = await mongoose.connection.collection('payments').find({}).toArray();
  console.log('Total payments:', list.length);
  list.forEach(p => console.log(`${p.id} | ${p.resident} | Flat ${p.flat} | ${p.month} | ₹${p.amount} | Status: "${p.status}"`));
  await mongoose.disconnect();
}

run().catch(console.error);
