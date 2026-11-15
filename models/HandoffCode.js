import mongoose from "mongoose";

// Short-lived, single-use codes that let the mobile app open the website already logged in.
// Only a SHA-256 hash of the code is stored. MongoDB deletes expired codes automatically (TTL index).
const schema = new mongoose.Schema({
  codeHash: { type: String, required: true, unique: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
});

export default mongoose.models.HandoffCode || mongoose.model("HandoffCode", schema, "handoff_codes");
