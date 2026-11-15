import mongoose from "mongoose";
import { photoField } from "../utils/photo.js";

export const SHIFTS = ["Morning", "Evening", "Night", "General"];
export const DUTY_STATUSES = ["On Duty", "Off Duty", "On Break", "On Leave"];

const schema = new mongoose.Schema(
  {
    id: { type: String, unique: true },
    name: { type: String, required: [true, "Staff name is required"], trim: true },
    photo: photoField,
    phone: { type: String, required: [true, "Contact number is required"], trim: true },
    post: { type: String, trim: true, default: "Main Gate" }, // gate / tower they guard
    shift: { type: String, enum: SHIFTS, default: "Morning" },
    shiftStart: { type: String, trim: true, default: "06:00" }, // "HH:mm"
    shiftEnd: { type: String, trim: true, default: "14:00" },
    dutyStatus: { type: String, enum: DUTY_STATUSES, default: "Off Duty" },
    username: { type: String, trim: true, lowercase: true }, // linked login account (role Security Guard), optional
  },
  { timestamps: true, id: false }
);

schema.set("toJSON", {
  transform(doc, ret) {
    delete ret._id;
    delete ret.__v;
    ret.available = ret.dutyStatus === "On Duty";
    return ret;
  },
});

// Saved in the "security_staff" collection
export default mongoose.models.SecurityStaff || mongoose.model("SecurityStaff", schema, "security_staff");
