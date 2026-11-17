import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    id: { type: String, unique: true },
    facilityId: { type: String, required: true, trim: true },
    facilityName: { type: String, required: true, trim: true },
    residentName: { type: String, required: true, trim: true },
    flat: { type: String, required: true, trim: true, uppercase: true },
    date: { type: String, required: true, trim: true },
    slot: { type: String, required: true, trim: true },
    fee: { type: String, default: "Free for residents" },
    status: { type: String, enum: ["Pending", "Confirmed", "Cancelled", "Rejected"], default: "Pending" },
    fromTime: { type: String, trim: true },
    toTime: { type: String, trim: true },
    approvedBy: { type: String, trim: true },
    rejectionReason: { type: String, trim: true },
  },
  { timestamps: true, id: false }
);

schema.set("toJSON", {
  transform(doc, ret) {
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export default mongoose.models.FacilityBooking || mongoose.model("FacilityBooking", schema);
