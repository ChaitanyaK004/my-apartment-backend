import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    id: { type: String, unique: true },
    resident: { type: String, required: [true, "Resident name is required"], trim: true },
    flat: { type: String, required: [true, "Flat number is required"], trim: true, uppercase: true },
    month: { type: String, required: [true, "Billing month is required"], trim: true },
    amount: { type: Number, required: [true, "Amount is required"], default: 4350 },
    date: { type: String, default: "-" },
    method: { type: String, default: "-" },
    status: { type: String, enum: ["Paid", "Pending", "Overdue"], default: "Pending" },
    paidAt: { type: Date },
    residenceName: { type: String, default: "Green Valley", trim: true },
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

export default mongoose.models.Payment || mongoose.model("Payment", schema);
