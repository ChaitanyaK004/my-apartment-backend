import { Router } from "express";
import Complaint, { DEFAULT_CATEGORIES, DEFAULT_TITLES } from "../models/Complaint.js";
import { createWithId } from "../utils/nextId.js";
import { asyncHandler, httpError } from "../middleware/errors.js";
import { logSaved } from "../utils/log.js";
import { pick, str } from "../utils/format.js";
import { requireRole, ADMIN, GUARD, MAINTENANCE, isResident } from "../middleware/auth.js";
import { notifyFlat, notifyUsers } from "../utils/notify.js";
import User from "../models/User.js";

const router = Router();

// The default one-click problems shown in the form
router.get("/categories", (req, res) => res.json(DEFAULT_CATEGORIES));

router.get("/", asyncHandler(async (req, res) => {
  const filter = {};
  for (const k of ["status", "category", "flat", "priority"]) if (req.query[k]) filter[k] = str(req.query[k]);
  // Residents only see their own flat's complaints
  if (isResident(req.user)) filter.flat = req.user.flat || "__none__";
  res.json(await Complaint.find(filter).sort({ createdAt: -1 }));
}));

router.post("/", asyncHandler(async (req, res) => {
  const { title, category = "Other", priority, description, residenceName } = req.body;
  // A resident always raises complaints for their own flat; staff/admin can specify flat/area
  const resident = isResident(req.user) ? req.user.name : (req.body.resident || req.user.name);
  const flat = isResident(req.user) ? req.user.flat : (req.body.flat || (req.user.role === "Maintenance Staff" ? "Maintenance" : "Common Area"));
  // Default problems (Water / Electricity / Parking) get their title automatically;
  // "Write your own problem" (category Other) must come with the user's own title.
  const finalTitle = String(title || DEFAULT_TITLES[category] || "").trim();
  if (!finalTitle) throw httpError(400, "Pick a problem or write your own");
  const doc = await createWithId(
    Complaint,
    { title: finalTitle, category, priority, description, resident, flat, residenceName },
    "complaint", "C", 3
  );
  logSaved("complaints", doc);

  // Instantly alert all Admins so resident requests arrive immediately
  const admins = await User.find({ role: ADMIN, _id: { $ne: req.user._id } }, { _id: 1 });
  await notifyUsers(admins, {
    type: "Complaint",
    title: `New ${doc.priority || "Normal"} Complaint: ${doc.title}`,
    message: `${doc.resident} (Flat ${doc.flat}) reported: ${doc.title} (${doc.category}).`,
    link: "/complaints",
    refId: doc.id,
    createdBy: req.user.name,
  });

  res.status(201).json(doc);
}));

router.patch("/:id", requireRole(ADMIN, GUARD, MAINTENANCE), asyncHandler(async (req, res) => {
  const update = pick(req.body, ["status", "priority", "description"]);
  const before = await Complaint.findOne({ id: req.params.id }, { status: 1 });
  const doc = await Complaint.findOneAndUpdate({ id: req.params.id }, { $set: update }, { new: true, runValidators: true });
  if (!doc) throw httpError(404, "Complaint not found");
  logSaved("complaints (updated)", doc);
  if (update.status && before?.status !== doc.status) {
    await notifyFlat(doc.flat, {
      type: "Complaint", title: `Complaint ${doc.status.toLowerCase()}`,
      message: `Your complaint "${doc.title}" (${doc.id}) is now ${doc.status}.`,
      link: "/complaints", refId: doc.id, createdBy: req.user.name,
    });
  }
  res.json(doc);
}));

router.post("/:id/comments", asyncHandler(async (req, res) => {
  const text = String(req.body.text || "").trim();
  if (!text) throw httpError(400, "Comment text is required");
  const doc = await Complaint.findOne({ id: req.params.id });
  if (!doc) throw httpError(404, "Complaint not found");
  if (isResident(req.user) && doc.flat !== req.user.flat) {
    throw httpError(403, "You can only comment on your own complaints");
  }
  doc.comments.push({ author: req.user.name, role: req.user.role, text, date: new Date() });
  await doc.save();
  logSaved("complaints (comment)", doc);

  if (isResident(req.user)) {
    const admins = await User.find({ role: ADMIN }, { _id: 1 });
    await notifyUsers(admins, {
      type: "Complaint",
      title: `Update on complaint ${doc.id}`,
      message: `${req.user.name} (${doc.flat}): ${text.slice(0, 150)}`,
      link: "/complaints", refId: doc.id, createdBy: req.user.name,
    });
  } else {
    await notifyFlat(doc.flat, {
      type: "Complaint",
      title: `New update on complaint ${doc.id}`,
      message: `${req.user.name} (${req.user.role}): ${text.slice(0, 150)}`,
      link: "/complaints", refId: doc.id, createdBy: req.user.name,
    });
  }
  res.status(201).json(doc);
}));

router.delete("/:id", requireRole(ADMIN), asyncHandler(async (req, res) => {
  const doc = await Complaint.findOneAndDelete({ id: req.params.id });
  if (!doc) throw httpError(404, "Complaint not found");
  res.json({ deleted: req.params.id });
}));

export default router;
