import mongoose from "mongoose";
import { photoField } from "../utils/photo.js";

export const MAINTENANCE_CATEGORIES = ["Plumbing", "Electrical", "Cleaning", "General Repairs", "Carpentry", "Lift", "Painting"];
export const WORK_STATUSES = ["Available", "Busy", "Off Duty", "On Leave"];

const schema = new mongoose.Schema(
  {
    id: { type: String, unique: true },
    name: { type: String, required: [true, "Staff name is required"], trim: true },
    photo: photoField,
    phone: { type: String, required: [true, "Contact number is required"], trim: true },
    jobRole: { type: String, required: [true, "Job role is required"], trim: true }, // e.g. "Senior Plumber"
    category: { type: String, enum: MAINTENANCE_CATEGORIES, default: "General Repairs" },
    workStatus: { type: String, enum: WORK_STATUSES, default: "Available" },
    username: { type: String, trim: true, lowercase: true }, // linked login account (role Maintenance Staff), optional
  },
  { timestamps: true, id: false }
);

schema.set("toJSON", {
  transform(doc, ret) {
    delete ret._id;
    delete ret.__v;
    ret.available = ret.workStatus === "Available";
    return ret;
  },
});

// Saved in the "maintenance_staff" collection
export default mongoose.models.MaintenanceStaff || mongoose.model("MaintenanceStaff", schema, "maintenance_staff");
