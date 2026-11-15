// Run:  npm run seed-users
// Creates (or resets) the fixed login accounts. Safe to run many times; it does NOT touch complaints/visitors/etc.
import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { connectDB, explainConnectionError } from "../config/db.js";
import User from "../models/User.js";

const accounts = [
  {
    username: (process.env.ADMIN_USERNAME || "admin").toLowerCase(),
    email: (process.env.ADMIN_EMAIL || "admin@gmail.com").toLowerCase(),
    password: process.env.ADMIN_PASSWORD || "Admin@123",
    name: "Society Admin",
    role: "Admin",
  },
  { username: "arjun", email: "arjun@myapartment.com", password: "Resident@123", name: "Arjun Mehta", role: "Resident", flat: "A-1203" },
  { username: "priya", email: "priya@myapartment.com", password: "Resident@123", name: "Priya Patel", role: "Resident", flat: "C-502" },
  { username: "guard", email: "guard@myapartment.com", password: "Guard@123", name: "Ramesh Kumar", role: "Security Guard" },
  // Linked to maintenance staff profile MNT-001 (see seed.js)
  { username: "ravi", email: "ravi@myapartment.com", password: "Maint@123", name: "Ravi Shinde", role: "Maintenance Staff" },
];

try {
  await connectDB();
  for (const { password, ...data } of accounts) {
    const passwordHash = await bcrypt.hash(password, 10);
    await User.findOneAndUpdate({ username: data.username }, { $set: { ...data, passwordHash } }, { upsert: true, new: true, setDefaultsOnInsert: true });
  }
  console.log("\n✅ Login accounts are ready:\n");
  console.table(accounts.map((a) => ({ role: a.role, username: a.username, email: a.email, password: a.password })));
  console.log("Check in mongosh:  db.users.find({}, { username: 1, role: 1, _id: 0 })\n");
  await mongoose.disconnect();
} catch (err) {
  explainConnectionError(err);
  process.exit(1);
}
