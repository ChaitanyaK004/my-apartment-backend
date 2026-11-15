import mongoose from "mongoose";

// "Maintenance Staff" was added for the Maintenance Team module.
export const ROLES = ["Admin", "Resident", "Security Guard", "Maintenance Staff"];

// Login accounts. Passwords are NEVER stored as text - only a bcrypt hash.
const schema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, trim: true, lowercase: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    name: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ROLES, default: "Resident" },
    flat: { type: String, trim: true, uppercase: true },
    phone: { type: String, trim: true },
  },
  { timestamps: true }
);

schema.set("toJSON", {
  transform(doc, ret) {
    delete ret._id;
    delete ret.__v;
    delete ret.passwordHash; // never leaves the server
    return ret;
  },
});

export default mongoose.models.User || mongoose.model("User", schema);
