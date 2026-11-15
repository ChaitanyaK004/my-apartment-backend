import mongoose from "mongoose";
import { fmtDateTime } from "../utils/format.js";

export const INCIDENT_TYPES = ["Suspicious Activity", "Theft", "Trespassing", "Fire / Safety", "Vehicle", "Emergency", "Other"];
export const INCIDENT_STATUSES = ["Open", "Investigating", "Resolved"];

const schema = new mongoose.Schema(
  {
    id: { type: String, unique: true },
    title: { type: String, required: [true, "Incident title is required"], trim: true },
    type: { type: String, enum: INCIDENT_TYPES, default: "Other" },
    description: { type: String, required: [true, "Please describe the incident"], trim: true },
    location: { type: String, trim: true, default: "Not specified" },
    severity: { type: String, enum: ["Low", "Medium", "High"], default: "Medium" },
    status: { type: String, enum: INCIDENT_STATUSES, default: "Open" },
    occurredAt: { type: Date, default: Date.now },
    reportedBy: { type: String, trim: true }, // display name
    reporterUsername: { type: String, trim: true, lowercase: true },
    reporterRole: { type: String, trim: true },
    flat: { type: String, trim: true, uppercase: true }, // set when a resident reports it
    actionTaken: { type: String, trim: true },
    resolvedAt: Date,
  },
  { timestamps: true, id: false }
);

schema.set("toJSON", {
  transform(doc, ret) {
    delete ret._id;
    delete ret.__v;
    ret.time = fmtDateTime(ret.occurredAt);
    return ret;
  },
});

export default mongoose.models.Incident || mongoose.model("Incident", schema);
