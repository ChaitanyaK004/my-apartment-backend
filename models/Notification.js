import mongoose from "mongoose";

export const NOTIFICATION_TYPES = ["Maintenance", "Security", "Visitor", "Announcement", "Complaint", "System", "Emergency"];

// One document per recipient, so read/unread is tracked per person.
const schema = new mongoose.Schema(
  {
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, enum: NOTIFICATION_TYPES, default: "System" },
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    link: { type: String, trim: true }, // website route to open, e.g. "/maintenance"
    refId: { type: String, trim: true }, // e.g. MR-004 / VIS-503
    read: { type: Boolean, default: false },
    readAt: Date,
    createdBy: { type: String, trim: true },
    isEmergency: { type: Boolean, default: false },
    location: { type: String, trim: true },
  },
  { timestamps: true }
);

schema.index({ recipient: 1, createdAt: -1 });

schema.set("toJSON", {
  transform(doc, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    delete ret.recipient;
    return ret;
  },
});

export default mongoose.models.Notification || mongoose.model("Notification", schema);
