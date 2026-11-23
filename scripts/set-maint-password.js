import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "../models/User.js";

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://kulkarnipg0_db_user:5%40Bb4gDz6C%23zzd8@cluster0.5rj0rpl.mongodb.net/My-Apartment?retryWrites=true&w=majority';

async function updatePassword() {
  await mongoose.connect(MONGODB_URI);
  console.log("Connected to MongoDB Atlas");

  const newPassword = "Maint@123";
  const newHash = await bcrypt.hash(newPassword, 10);

  // Update ravi and any Maintenance Staff users
  const result = await User.updateMany(
    {
      $or: [
        { username: "ravi" },
        { role: "Maintenance Staff" },
        { email: "ravi@myapartment.com" }
      ]
    },
    {
      $set: { passwordHash: newHash }
    }
  );

  console.log(`Updated ${result.modifiedCount} maintenance user(s) to password: ${newPassword}`);

  // Also check if username "maintenance" exists, or create it if beneficial so users typing "maintenance" can directly find the user
  const maintUser = await User.findOne({ username: "maintenance" });
  if (!maintUser) {
    // Check if ravi exists
    const ravi = await User.findOne({ username: "ravi" });
    if (ravi) {
      console.log("Verified 'ravi' account exists:", ravi.username, ravi.email, ravi.role);
    }
  }

  // Verify login with bcrypt
  const users = await User.find({
    $or: [
      { username: "ravi" },
      { role: "Maintenance Staff" }
    ]
  });

  for (const u of users) {
    const isValid = await bcrypt.compare(newPassword, u.passwordHash);
    console.log(`User ${u.username} (${u.role}): password verification for '${newPassword}': ${isValid ? 'SUCCESS ✅' : 'FAILED ❌'}`);
  }

  await mongoose.disconnect();
  console.log("Done.");
}

updatePassword().catch((err) => {
  console.error("Error updating password:", err);
  process.exit(1);
});
