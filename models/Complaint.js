import mongoose from "mongoose";
import { fmtDate } from "../utils/format.js";

// These power the one-click buttons in the "Raise complaint" form.
export const DEFAULT_CATEGORIES = [
  { label: "Water Problem", category: "Water" },
  { label: "Electricity Problem", category: "Electrical" },
  { label: "Parking Problem", category: "Parking" },
  { label: "Personal Complaint (Admin Only)", category: "Personal Complaint" },
  { label: "Write your own problem", category: "Other" },
];
export const DEFAULT_TITLES = {
  Water: "Water Problem",
  Electrical: "Electricity Problem",
  Parking: "Parking Problem",
  "Personal Complaint": "Personal Complaint to Admin",
  Personal: "Personal Complaint to Admin",
};

const schema = new mongoose.Schema(
  {
    id: { type: String, unique: true },
    residenceName: { type: String, default: "Green Valley", trim: true },
    resident: { type: String, required: [true, "Resident name is required"], trim: true },
    flat: { type: String, required: [true, "Flat number is required"], trim: true, uppercase: true },
    category: {
      type: String,
      enum: ["Water", "Electrical", "Plumbing", "Parking", "Common Area", "Security", "Other", "Personal Complaint", "Personal"],
      default: "Other",
    },
    isPersonal: { type: Boolean, default: false },
    title: { type: String, required: [true, "Complaint title is required"], trim: true },
    description: { type: String, required: [true, "Please describe the problem"], trim: true },
    priority: { type: String, enum: ["Low", "Medium", "High"], default: "Medium" },
    status: { type: String, enum: ["Pending", "In Progress", "Resolved"], default: "Pending" },
    resolvedAt: { type: Date },
    comments: [{ author: String, role: String, text: String, date: { type: Date, default: Date.now }, _id: false }],
  },
  { timestamps: true, id: false }
);

// TTL index: Automatically remove resolved complaints 7 days after resolution (604,800 seconds).
// Unsolved complaints (where resolvedAt is null/undefined) NEVER expire and remain permanent.
schema.index({ resolvedAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

schema.set("toJSON", {
  transform(doc, ret) {
    delete ret._id;
    delete ret.__v;
    ret.date = fmtDate(ret.createdAt);
    return ret;
  },
});

export default mongoose.models.Complaint || mongoose.model("Complaint", schema);
