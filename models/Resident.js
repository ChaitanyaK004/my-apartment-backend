import mongoose from "mongoose";
import { fmtDate } from "../utils/format.js";

const COLORS = ["orange", "purple", "green", "pink", "teal"];

const schema = new mongoose.Schema(
  {
    id: { type: String, unique: true },
    name: { type: String, required: [true, "Resident name is required"], trim: true },
    flat: { type: String, required: [true, "Flat number is required"], trim: true, uppercase: true },
    residenceName: { type: String, default: "Green Valley", trim: true },
    wing: { type: String, trim: true },
    mobile: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    type: { type: String, enum: ["Owner", "Tenant"], default: "Owner" },
    status: { type: String, enum: ["Active", "Inactive"], default: "Active" },
    moveInDate: { type: Date, default: Date.now },
    username: { type: String, trim: true, lowercase: true }, // linked login account (set when the resident signs up)
    source: { type: String, enum: ["Admin", "Self Registration"], default: "Admin" },
    members: [
      {
        id: { type: String },
        name: { type: String, required: true },
        relationship: { type: String, required: true },
        phone: { type: String },
        verified: { type: Boolean, default: true },
        addedAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true, id: false }
);

schema.pre("validate", function (next) {
  if (!this.wing && this.flat) this.wing = `${this.flat[0]} Wing`;
  next();
});

schema.set("toJSON", {
  transform(doc, ret) {
    delete ret._id;
    delete ret.__v;
    ret.initials = ret.name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join("");
    ret.color = COLORS[ret.name.length % COLORS.length];
    ret.date = fmtDate(ret.moveInDate);
    return ret;
  },
});

export default mongoose.models.Resident || mongoose.model("Resident", schema);
