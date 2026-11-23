import mongoose from 'mongoose';

const uri = 'mongodb+srv://My-Apartment:Myapartment@aryancluster.wnwgnsz.mongodb.net/My-Apartment?retryWrites=true&w=majority';

async function reset() {
  await mongoose.connect(uri);
  const res = await mongoose.connection.collection('payments').updateOne(
    { id: 'PAY-1029' },
    { $set: { status: 'Pending Approval' } }
  );
  console.log('Reset PAY-1029 to Pending Approval, modified:', res.modifiedCount);
  await mongoose.disconnect();
}

reset().catch(console.error);
