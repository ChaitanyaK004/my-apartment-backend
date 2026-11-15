import { Router } from "express";
import CommunityPost from "../models/CommunityPost.js";
import { createWithId } from "../utils/nextId.js";
import { asyncHandler, httpError } from "../middleware/errors.js";
import { logSaved } from "../utils/log.js";
import { pick, str } from "../utils/format.js";
import { requireRole, ADMIN, isResident } from "../middleware/auth.js";

const router = Router();
const regex = (q) => new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

router.get("/posts", asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.tag && req.query.tag !== "All") filter.tag = str(req.query.tag);
  if (req.query.q) {
    const q = regex(req.query.q);
    filter.$or = [{ author: q }, { text: q }, { flat: q }];
  }
  const posts = await CommunityPost.find(filter).sort({ createdAt: -1 });
  const userId = req.user._id.toString();
  res.json(
    posts.map((p) => {
      const j = p.toJSON();
      j.hasLiked = (p.likes || []).includes(userId);
      return j;
    })
  );
}));

router.post("/posts", asyncHandler(async (req, res) => {
  const text = String(req.body.text || "").trim();
  if (!text) throw httpError(400, "Post text cannot be empty");
  const tag = ["Community", "Recommendation", "Buy & Sell"].includes(req.body.tag) ? req.body.tag : "Community";
  const author = req.user.name;
  const flat = req.user.flat || (req.user.role === "Admin" ? "Management Office" : "Society");
  const initials = author.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");

  const doc = await createWithId(CommunityPost, { author, flat, initials, tag, text, likes: [], comments: [] }, "community_post", "POST-", 3);
  logSaved("community_posts", doc);
  res.status(201).json(doc);
}));

router.post("/posts/:id/like", asyncHandler(async (req, res) => {
  const doc = await CommunityPost.findOne({ id: req.params.id });
  if (!doc) throw httpError(404, "Post not found");
  const userId = req.user._id.toString();
  if (!doc.likes) doc.likes = [];
  const idx = doc.likes.indexOf(userId);
  if (idx >= 0) {
    doc.likes.splice(idx, 1);
  } else {
    doc.likes.push(userId);
  }
  await doc.save();
  const j = doc.toJSON();
  j.hasLiked = (doc.likes || []).includes(userId);
  res.json(j);
}));

router.post("/posts/:id/comments", asyncHandler(async (req, res) => {
  const text = String(req.body.text || "").trim();
  if (!text) throw httpError(400, "Comment cannot be empty");
  const doc = await CommunityPost.findOne({ id: req.params.id });
  if (!doc) throw httpError(404, "Post not found");
  doc.comments.push({
    author: req.user.name,
    flat: req.user.flat || "",
    text,
    createdAt: new Date(),
  });
  await doc.save();
  res.status(201).json(doc);
}));

router.delete("/posts/:id", asyncHandler(async (req, res) => {
  const doc = await CommunityPost.findOne({ id: req.params.id });
  if (!doc) throw httpError(404, "Post not found");
  if (req.user.role !== ADMIN && doc.author !== req.user.name) {
    throw httpError(403, "You can only delete your own posts");
  }
  await doc.deleteOne();
  res.json({ deleted: req.params.id });
}));

export default router;
