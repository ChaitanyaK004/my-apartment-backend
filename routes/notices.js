import { Router } from "express";
import Notice from "../models/Notice.js";
import Resident from "../models/Resident.js";
import { createWithId } from "../utils/nextId.js";
import { asyncHandler, httpError } from "../middleware/errors.js";
import { logSaved } from "../utils/log.js";
import { pick, str } from "../utils/format.js";
import { requireRole, ADMIN, isAdmin } from "../middleware/auth.js";
import { notifyUsers } from "../utils/notify.js";
import User from "../models/User.js";

const router = Router();

router.get("/", asyncHandler(async (req, res) => {
  const filter = {};
  for (const k of ["type", "category", "audience"]) if (req.query[k]) filter[k] = str(req.query[k]);
  res.json(await Notice.find(filter).sort({ pinned: -1, createdAt: -1 }));
}));

router.post("/", asyncHandler(async (req, res) => {
  const data = pick(req.body, ["type", "title", "body", "category", "audience", "pinned", "createdBy"]);
  // Only the society admin can publish official notices, polls, and schedule meetings. Residents can post a Suggestion.
  if (!isAdmin(req.user) && data.type !== "Suggestion") {
    throw httpError(403, "Only the society admin can publish notices, polls, and schedule meetings.");
  }
  if (!isAdmin(req.user)) data.pinned = false;
  data.createdBy = req.user.name;
  if (data.type === "Poll") {
    const options = (Array.isArray(req.body.pollOptions) ? req.body.pollOptions : [])
      .map((o) => String(typeof o === "string" ? o : o?.text || "").trim())
      .filter(Boolean);
    if (options.length < 2) throw httpError(400, "A poll needs at least 2 options");
    data.pollOptions = options.map((text) => ({ text }));
  }
  const doc = await createWithId(Notice, data, "notice", "NT-");
  logSaved("notices", doc);
  if (isAdmin(req.user)) {
    // Admin announcement -> every resident in the chosen audience gets a notification
    let userFilter = { role: "Resident" };
    if (data.audience === "Tenants" || data.audience === "All Owners") {
      const type = data.audience === "Tenants" ? "Tenant" : "Owner";
      const targetFlats = (await Resident.find({ type }, { flat: 1 })).map((r) => r.flat);
      userFilter.flat = { $in: targetFlats };
    }
    const residents = await User.find(userFilter, { _id: 1 });
    await notifyUsers(residents, {
      type: doc.category === "Security" ? "Security" : "Announcement",
      title: doc.type === "Poll" ? `New poll: ${doc.title}` : doc.title,
      message: doc.body.length > 200 ? `${doc.body.slice(0, 197)}...` : doc.body,
      link: "/notices", refId: doc.id, createdBy: req.user.name,
    });
  }
  res.status(201).json(doc);
}));

router.patch("/:id", requireRole(ADMIN), asyncHandler(async (req, res) => {
  const doc = await Notice.findOneAndUpdate({ id: req.params.id }, { $set: pick(req.body, ["title", "body", "pinned", "category", "audience"]) }, { new: true, runValidators: true });
  if (!doc) throw httpError(404, "Notice not found");
  res.json(doc);
}));

// A resident clicked "Acknowledge" -> reads + 1 (deduped per user)
router.post("/:id/read", asyncHandler(async (req, res) => {
  const readerId = req.user.username || req.user.email || req.user._id.toString();
  const doc = await Notice.findOne({ id: req.params.id });
  if (!doc) throw httpError(404, "Notice not found");
  if (!doc.readers) doc.readers = [];
  if (!doc.readers.includes(readerId)) {
    doc.readers.push(readerId);
    doc.reads = (doc.reads || 0) + 1;
    await doc.save();
  }
  res.json(doc);
}));

// Poll vote. One vote per logged-in user; voting again changes the vote.
router.post("/:id/vote", asyncHandler(async (req, res) => {
  const doc = await Notice.findOne({ id: req.params.id });
  if (!doc) throw httpError(404, "Notice not found");
  if (doc.type !== "Poll") throw httpError(400, "This notice is not a poll");
  const index = Number(req.body.optionIndex);
  const voter = req.user.username || req.user.email || req.user.name;
  if (!Number.isInteger(index) || index < 0 || index >= doc.pollOptions.length) throw httpError(400, "Invalid poll option");
  doc.voters = doc.voters.filter((v) => v.voter !== voter);
  doc.voters.push({ voter, optionIndex: index });
  await doc.save();
  logSaved("notices (vote)", doc);
  res.json(doc);
}));

router.delete("/:id", asyncHandler(async (req, res) => {
  const reqId = String(req.params.id || "").trim();
  const query = {
    $or: [
      { id: reqId },
      { id: req.params.id },
      ...(reqId.match(/^[0-9a-fA-F]{24}$/) ? [{ _id: reqId }] : []),
    ],
  };
  const doc = await Notice.findOne(query);
  if (!doc) throw httpError(404, "Notice not found");

  const role = String(req.user?.role || "").toLowerCase();
  const isSocietyAdmin = role === "admin" || role === "secretary";
  const isCreator = doc.createdBy && (doc.createdBy === req.user?.name || doc.createdBy === req.user?.username);

  if (!isSocietyAdmin && !isCreator) {
    throw httpError(403, "You do not have permission to delete this notice");
  }

  await doc.deleteOne();
  res.json({ deleted: req.params.id, message: "Notice deleted successfully" });
}));

export default router;
