import mongoose from "mongoose";

mongoose.set("strictQuery", true);

if (process.env.DEBUG_DB === "true") {
  mongoose.set("debug", (collection, method, ...args) => {
    const shown = args
      .filter((a) => a && typeof a === "object" && !a.session)
      .map((a) => JSON.stringify(a))
      .join(", ");
    console.log(`🗄  db.${collection}.${method}(${shown})`);
  });
}

export function explainConnectionError(err) {
  const msg = String(err?.message || err);
  console.error("\n❌ Could not connect to MongoDB Atlas.\n   Reason:", msg, "\n");
  if (/bad auth|authentication failed/i.test(msg)) {
    console.error("👉 Wrong username or password in MONGODB_URI.\n   Atlas → Database Access: check the user, or reset the password.\n   Special characters in the password must be URL-encoded (@ → %40, # → %23).");
  } else if (/querySrv|ENOTFOUND|EAI_AGAIN/i.test(msg)) {
    console.error("👉 DNS problem (the mongodb+srv:// lookup failed).\n   Try: another network / mobile hotspot, set DNS to 8.8.8.8, or use the\n   non-SRV 'mongodb://' string (Atlas → Connect → Compass → older driver version).");
  } else if (/ECONNREFUSED|timed out|Server selection/i.test(msg)) {
    console.error("👉 Atlas is not accepting your connection.\n   1) Atlas → Network Access → Add IP Address → 'Allow access from anywhere' (0.0.0.0/0) or your current IP.\n   2) Wait ~1 minute after saving, then retry.\n   3) College/office Wi-Fi often blocks port 27017 — try a mobile hotspot.");
  } else if (/MONGODB_URI/.test(msg)) {
    console.error("👉 Create backend/.env from .env.example and paste your Atlas connection string.");
  }
  console.error("");
}

export async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri || uri.includes("<db_password>")) {
    throw new Error("MONGODB_URI is missing or still has the <db_password> placeholder");
  }
  await mongoose.connect(uri, {
    dbName: process.env.DB_NAME || "my_apartment",
    serverSelectionTimeoutMS: 10000,
  });
  const { host, name } = mongoose.connection;
  console.log(`✅ MongoDB connected  →  host: ${host}  |  database: ${name}`);
}
