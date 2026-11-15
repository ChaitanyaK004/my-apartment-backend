import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });

import os from "os";
import mongoose from "mongoose";
import app from "./app.js";
import { connectDB, explainConnectionError } from "./config/db.js";

const PORT = Number(process.env.PORT) || 5001;

function getNetworkIp() {
  try {
    const interfaces = os.networkInterfaces();
    for (const ifaceName of Object.keys(interfaces)) {
      for (const net of interfaces[ifaceName] || []) {
        if (net.family === "IPv4" && !net.internal) {
          return net.address;
        }
      }
    }
  } catch {
    // fallback
  }
  return "127.0.0.1";
}

try {
  await connectDB();
} catch (err) {
  explainConnectionError(err);
  process.exit(1);
}

// Show what is already inside the database every time the server starts
const names = (await mongoose.connection.db.listCollections().toArray()).map((c) => c.name).sort();
console.log("📚 Collections:", names.length ? names.join(", ") : "(none yet — run `npm run seed` or add data from the website)");
for (const name of names.filter((n) => n !== "counters")) {
  console.log(`   • ${name}: ${await mongoose.connection.db.collection(name).countDocuments()} documents`);
}

const networkIp = getNetworkIp();
app.listen(PORT, "0.0.0.0", () => {
  console.log("\n🚀 API Server Ready for Web and Mobile App Connections:");
  console.log(`   • Local (Computer):    http://localhost:${PORT}/api`);
  console.log(`   • Network (Phone/App): http://${networkIp}:${PORT}/api`);
  console.log(`   • Health Check:        http://${networkIp}:${PORT}/api/health\n`);
});

