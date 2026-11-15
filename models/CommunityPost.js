import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    id: { type: String, unique: true },
    author: { type: String, required: true, trim: true },
    flat: { type: String, required: true, trim: true, uppercase: true },
    initials: { type: String, trim: true },
    tag: { type: String, enum: ["Community", "Recommendation", "Buy & Sell"], default: "Community" },
    text: { type: String, required: [true, "Message is required"], trim: true },
    likes: [{ type: String, _id: false }],
    comments: [
      {
        author: { type: String, required: true },
        flat: { type: String, default: "" },
        text: { type: String, required: true },
        createdAt: { type: Date, default: Date.now },
        _id: false,
      },
    ],
  },
  { timestamps: true, id: false }
);

schema.set("toJSON", {
  transform(doc, ret) {
    delete ret._id;
    delete ret.__v;
    ret.likesCount = (ret.likes || []).length;
    ret.commentsCount = (ret.comments || []).length;
    return ret;
  },
});

export default mongoose.models.CommunityPost || mongoose.model("CommunityPost", schema);
