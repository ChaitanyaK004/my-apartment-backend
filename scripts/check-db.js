// Run:  npm run check-db   — tests the Atlas connection and prints what is stored.
import "dotenv/config";
import mongoose from "mongoose";
import { connectDB, explainConnectionError } from "../config/db.js";

try {
  await connectDB();
  await mongoose.connection.db.admin().ping();
  console.log("🏓 Ping OK — Atlas is reachable.\n");
  const cols = await mongoose.connection.db.listCollections().toArray();
  if (!cols.length) console.log("Database is empty. Run: npm run seed");
  for (const { name } of cols) {
    console.log(`${name.padEnd(12)} ${await mongoose.connection.db.collection(name).countDocuments()} documents`);
  }
  await mongoose.disconnect();
} catch (err) {
  explainConnectionError(err);
  process.exit(1);
}
