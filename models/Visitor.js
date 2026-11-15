import mongoose from "mongoose";
import { fmtDateTime } from "../utils/format.js";

const schema = new mongoose.Schema(
  {
    id: { type: String, unique: true },
    name: { type: String, required: [true, "Visitor name is required"], trim: true },
    purpose: { type: String, enum: ["Personal Visit", "Delivery", "Service Provider"], default: "Personal Visit" },
    resident: { type: String, trim: true, default: "Not specified" }, // the resident who is being visited / called
    flat: { type: String, required: [true, "Flat number is required"], trim: true, uppercase: true },
    phone: { type: String, trim: true },
    vehicle: { type: String, trim: true, default: "-" },
    visitTime: { type: Date, default: Date.now },
    status: { type: String, enum: ["Pending", "Approved", "Rejected", "Checked In", "Checked Out"], default: "Pending" },
    checkedInAt: Date, // entry time
    checkedOutAt: Date, // exit time
    createdBy: { type: String, trim: true }, // who registered the visitor (guard / resident / admin)
    decidedBy: { type: String, trim: true }, // who approved or rejected
  },
  { timestamps: true, id: false }
);

schema.set("toJSON", {
  transform(doc, ret) {
    delete ret._id;
    delete ret.__v;
    ret.time = fmtDateTime(ret.visitTime);
    ret.entryTime = fmtDateTime(ret.checkedInAt);
    ret.exitTime = fmtDateTime(ret.checkedOutAt);
    return ret;
  },
});

export default mongoose.models.Visitor || mongoose.model("Visitor", schema);
