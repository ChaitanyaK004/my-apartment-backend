import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    id: { type: String, unique: true },
    type: { type: String, enum: ["Resident Reserved", "Visitor"], default: "Resident Reserved" },
    residentName: { type: String, required: [true, "Resident name is required"], trim: true },
    flat: { type: String, required: [true, "Flat number is required"], trim: true, uppercase: true },
    vehicleNumber: { type: String, trim: true, uppercase: true },
    slot: { type: String, required: [true, "Parking slot is required"], trim: true, uppercase: true },
    fromTime: { type: Date, required: [true, "Start time is required"] },
    toTime: {
      type: Date,
      required: [true, "End time is required"],
      validate: {
        validator(v) { return !this.fromTime || v > this.fromTime; },
        message: "End time must be after start time",
      },
    },
    status: { type: String, enum: ["Active", "Completed", "Cancelled"], default: "Active" },
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

// Saved in the "parking" collection
export default mongoose.models.ParkingReservation || mongoose.model("ParkingReservation", schema, "parking");
