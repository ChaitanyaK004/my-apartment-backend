import mongoose from "mongoose";
import { fmtDate } from "../utils/format.js";

const schema = new mongoose.Schema(
  {
    id: { type: String, unique: true },
    type: { type: String, enum: ["Notice", "Suggestion", "Poll"], default: "Notice" },
    title: { type: String, required: [true, "Title is required"], trim: true },
    body: { type: String, required: [true, "Message is required"], trim: true },
    category: { type: String, enum: ["Community", "Maintenance", "Security", "Facilities", "Payments"], default: "Community" },
    audience: { type: String, enum: ["All Residents", "All Owners", "Tenants"], default: "All Residents" },
    pinned: { type: Boolean, default: false },
    reads: { type: Number, default: 0 },
    readers: [{ type: String, _id: false }],
    createdBy: { type: String, trim: true },
    // Only used when type === "Poll"
    pollOptions: [{ text: { type: String, required: true, trim: true }, _id: false }],
    voters: [{ voter: String, optionIndex: Number, _id: false }],
  },
  { timestamps: true, id: false }
);

schema.set("toJSON", {
  transform(doc, ret) {
    delete ret._id;
    delete ret.__v;
    ret.date = fmtDate(ret.createdAt);
    if (ret.type === "Poll") {
      const voters = ret.voters || [];
      const totalVotes = voters.length;
      ret.totalVotes = totalVotes;
      ret.pollOptions = (ret.pollOptions || []).map((o, i) => {
        const count = voters.filter((v) => v.optionIndex === i).length;
        return {
          text: o.text,
          votes: count,
          percentage: totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0,
        };
      });
      ret.voters = voters.map((v) => ({ voter: v.voter, optionIndex: v.optionIndex }));
    } else {
      delete ret.pollOptions;
      delete ret.voters;
    }
    return ret;
  },
});

export default mongoose.models.Notice || mongoose.model("Notice", schema);
