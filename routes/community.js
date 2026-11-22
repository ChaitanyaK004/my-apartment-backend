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
  const reqId = String(req.params.id || "").trim();
  const query = {
    $or: [
      { id: reqId },
      { id: req.params.id },
      ...(reqId.match(/^[0-9a-fA-F]{24}$/) ? [{ _id: reqId }] : []),
    ],
  };
  const doc = await CommunityPost.findOne(query);
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
  const reqId = String(req.params.id || "").trim();
  const query = {
    $or: [
      { id: reqId },
      { id: req.params.id },
      ...(reqId.match(/^[0-9a-fA-F]{24}$/) ? [{ _id: reqId }] : []),
    ],
  };
  const doc = await CommunityPost.findOne(query);
  if (!doc) throw httpError(404, "Post not found");
  if (!doc.comments) doc.comments = [];
  const commentId = "cmt-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
  doc.comments.push({
    id: commentId,
    author: req.user.name,
    flat: req.user.flat || (req.user.role === "Admin" ? "Management Office" : ""),
    text,
    createdAt: new Date(),
  });
  await doc.save();
  const j = doc.toJSON();
  const userId = req.user._id.toString();
  j.hasLiked = (doc.likes || []).includes(userId);
  res.status(201).json(j);
}));

router.delete("/posts/:id/comments/:commentId", asyncHandler(async (req, res) => {
  const reqId = String(req.params.id || "").trim();
  const query = {
    $or: [
      { id: reqId },
      { id: req.params.id },
      ...(reqId.match(/^[0-9a-fA-F]{24}$/) ? [{ _id: reqId }] : []),
    ],
  };
  const doc = await CommunityPost.findOne(query);
  if (!doc) throw httpError(404, "Post not found");

  const target = req.params.commentId;
  const isNumericIndex = !isNaN(Number(target)) && Number(target) >= 0 && Number(target) < (doc.comments || []).length;

  let commentIndex = -1;
  if (isNumericIndex) {
    commentIndex = parseInt(target, 10);
  } else {
    commentIndex = (doc.comments || []).findIndex(
      (c) => c.id === target || String(c._id) === target
    );
  }

  if (commentIndex === -1) {
    throw httpError(404, "Comment not found");
  }

  const comment = doc.comments[commentIndex];
  const role = String(req.user?.role || "").toLowerCase();
  const isSocietyAdmin = role === "admin" || role === "secretary";
  const isCommentAuthor = comment.author && (comment.author === req.user?.name || comment.author === req.user?.username);
  const isPostAuthor = doc.author && (doc.author === req.user?.name || doc.author === req.user?.username);

  if (!isSocietyAdmin && !isCommentAuthor && !isPostAuthor) {
    throw httpError(403, "You do not have permission to delete this comment");
  }

  doc.comments.splice(commentIndex, 1);
  await doc.save();

  const j = doc.toJSON();
  const userId = req.user._id.toString();
  j.hasLiked = (doc.likes || []).includes(userId);
  res.json(j);
}));

router.delete("/posts/:id", asyncHandler(async (req, res) => {
  const reqId = String(req.params.id || "").trim();
  const query = {
    $or: [
      { id: reqId },
      { id: req.params.id },
      ...(reqId.match(/^[0-9a-fA-F]{24}$/) ? [{ _id: reqId }] : []),
    ],
  };
  const doc = await CommunityPost.findOne(query);
  if (!doc) throw httpError(404, "Post not found");

  const role = String(req.user?.role || "").toLowerCase();
  const isSocietyAdmin = role === "admin" || role === "secretary";
  const isCreator = doc.author && (doc.author === req.user?.name || doc.author === req.user?.username);

  if (!isSocietyAdmin && !isCreator) {
    throw httpError(403, "You can only delete your own posts");
  }
  await doc.deleteOne();
  res.json({ deleted: req.params.id, message: "Community post deleted successfully" });
}));

export default router;
