import mongoose from "mongoose";
import { fmtDate } from "../utils/format.js";
import { MAINTENANCE_CATEGORIES } from "./MaintenanceStaff.js";

export const REQUEST_STATUSES = ["Pending", "Assigned", "In Progress", "Completed"];

const historySchema = new mongoose.Schema(
  { status: String, note: String, by: String, at: { type: Date, default: Date.now } },
  { _id: false }
);

const schema = new mongoose.Schema(
  {
    id: { type: String, unique: true },
    title: { type: String, required: [true, "Request title is required"], trim: true },
    category: { type: String, enum: MAINTENANCE_CATEGORIES, default: "General Repairs" },
    description: { type: String, required: [true, "Please describe the issue"], trim: true },
    flat: { type: String, required: [true, "Flat number is required"], trim: true, uppercase: true },
    residentName: { type: String, required: [true, "Resident name is required"], trim: true },
    residentPhone: { type: String, trim: true },
    residentUsername: { type: String, trim: true, lowercase: true }, // who submitted it (for notifications)
    priority: { type: String, enum: ["Low", "Medium", "High"], default: "Medium" },
    status: { type: String, enum: REQUEST_STATUSES, default: "Pending" },
    assignedTo: { type: String, trim: true }, // MaintenanceStaff.id e.g. MNT-002
    assignedToName: { type: String, trim: true },
    assignedAt: Date,
    completedAt: Date,
    history: [historySchema],
  },
  { timestamps: true, id: false }
);

schema.set("toJSON", {
  transform(doc, ret) {
    delete ret._id;
    delete ret.__v;
    ret.date = fmtDate(ret.createdAt);
    ret.completedDate = fmtDate(ret.completedAt);
    return ret;
  },
});

export default mongoose.models.MaintenanceRequest || mongoose.model("MaintenanceRequest", schema, "maintenance_requests");
