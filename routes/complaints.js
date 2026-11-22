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
  // Auto-cleanup any resolved complaint older than 7 days (unsolved complaints are never touched)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  await Complaint.deleteMany({
    status: "Resolved",
    $or: [
      { resolvedAt: { $lt: sevenDaysAgo } },
      { resolvedAt: { $exists: false }, updatedAt: { $lt: sevenDaysAgo } },
    ],
  });

  const filter = {};
  for (const k of ["status", "category", "flat", "priority"]) if (req.query[k]) filter[k] = str(req.query[k]);

  // Residents only see their own flat's complaints (never other residents' personal or normal complaints)
  if (isResident(req.user)) {
    filter.flat = req.user.flat || "__none__";
  }

  // Maintenance Staff and Security Guards NEVER see Personal Complaints
  if (
    req.user.role === MAINTENANCE ||
    req.user.role === "Maintenance Staff" ||
    req.user.role === GUARD ||
    req.user.role === "Security Guard"
  ) {
    filter.category = { $nin: ["Personal Complaint", "Personal"] };
    filter.isPersonal = { $ne: true };
  }

  res.json(await Complaint.find(filter).sort({ createdAt: -1 }));
}));

router.post("/", asyncHandler(async (req, res) => {
  const { title, category = "Other", priority, description, residenceName } = req.body;
  const isPersonal = category === "Personal Complaint" || category === "Personal" || Boolean(req.body.isPersonal);

  // A resident always raises complaints for their own flat; staff/admin can specify flat/area
  const resident = isResident(req.user) ? req.user.name : (req.body.resident || req.user.name);
  const flat = isResident(req.user) ? req.user.flat : (req.body.flat || (req.user.role === "Maintenance Staff" ? "Maintenance" : "Common Area"));

  // Default problems (Water / Electricity / Parking / Personal) get their title automatically;
  // "Write your own problem" (category Other) must come with the user's own title.
  const finalTitle = String(title || DEFAULT_TITLES[category] || "").trim();
  if (!finalTitle) throw httpError(400, "Pick a problem or write your own");

  const doc = await createWithId(
    Complaint,
    { title: finalTitle, category, priority, description, resident, flat, residenceName, isPersonal },
    "complaint", "C", 3
  );
  logSaved("complaints", doc);

  // Instantly alert all Admins (Maintenance Staff and Guards are NOT alerted for personal complaints)
  const admins = await User.find({ role: ADMIN, _id: { $ne: req.user._id } }, { _id: 1 });
  await notifyUsers(admins, {
    type: "Complaint",
    title: isPersonal ? `Personal Complaint: ${doc.title}` : `New ${doc.priority || "Normal"} Complaint: ${doc.title}`,
    message: isPersonal
      ? `Personal Complaint: ${doc.resident} (Flat ${doc.flat}) sent a personal complaint to Admin.`
      : `${doc.resident} (Flat ${doc.flat}) reported: ${doc.title} (${doc.category}).`,
    link: "/complaints",
    refId: doc.id,
    createdBy: req.user.name,
  });

  res.status(201).json(doc);
}));

router.patch("/:id", requireRole(ADMIN, GUARD, MAINTENANCE), asyncHandler(async (req, res) => {
  const before = await Complaint.findOne({ id: req.params.id });
  if (!before) throw httpError(404, "Complaint not found");

  const isPersonalComplaint = before.category === "Personal Complaint" || before.category === "Personal" || before.isPersonal;
  // Maintenance staff and guards CANNOT view or modify personal complaints
  if (isPersonalComplaint && req.user.role !== ADMIN) {
    throw httpError(403, "Personal complaints can only be managed by Society Admins.");
  }

  const update = pick(req.body, ["status", "priority", "description"]);
  const updateDoc = { $set: update };
  if (update.status === "Resolved") {
    // When complaint is solved, stamp resolvedAt to start the 7-day retention countdown
    updateDoc.$set.resolvedAt = new Date();
  } else if (update.status && update.status !== "Resolved") {
    // When complaint is unsolved (In Progress / Pending), remove resolvedAt so it remains permanent
    updateDoc.$unset = { resolvedAt: 1 };
  }

  const doc = await Complaint.findOneAndUpdate({ id: req.params.id }, updateDoc, { new: true, runValidators: true });
  logSaved("complaints (updated)", doc);
  if (update.status && before?.status !== doc.status) {
    await notifyFlat(doc.flat, {
      type: "Complaint", title: isPersonalComplaint ? `Personal complaint ${doc.status.toLowerCase()}` : `Complaint ${doc.status.toLowerCase()}`,
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

  const isPersonalComplaint = doc.category === "Personal Complaint" || doc.category === "Personal" || doc.isPersonal;
  if (isPersonalComplaint && req.user.role !== ADMIN && !isResident(req.user)) {
    throw httpError(403, "Only Admin and the resident can comment on personal complaints");
  }

  if (isResident(req.user)) {
    const flatMatches = String(doc.flat || "").trim().toLowerCase() === String(req.user.flat || "").trim().toLowerCase();
    if (!flatMatches) {
      throw httpError(403, "You can only comment on your own complaints");
    }
  }

  doc.comments.push({ author: req.user.name, role: req.user.role, text, date: new Date() });
  await doc.save();
  logSaved("complaints (comment)", doc);

  if (isResident(req.user)) {
    const admins = await User.find({ role: ADMIN }, { _id: 1 });
    await notifyUsers(admins, {
      type: "Complaint",
      title: isPersonalComplaint ? `Personal update on ${doc.id}` : `Update on complaint ${doc.id}`,
      message: `${req.user.name} (${doc.flat}): ${text.slice(0, 150)}`,
      link: "/complaints", refId: doc.id, createdBy: req.user.name,
    });
  } else {
    await notifyFlat(doc.flat, {
      type: "Complaint",
      title: isPersonalComplaint ? `Admin response on ${doc.id}` : `New update on complaint ${doc.id}`,
      message: `${req.user.name} (${req.user.role}): ${text.slice(0, 150)}`,
      link: "/complaints", refId: doc.id, createdBy: req.user.name,
    });
  }
  res.status(201).json(doc);
}));

router.delete("/:id", asyncHandler(async (req, res) => {
  const doc = await Complaint.findOne({ id: req.params.id });
  if (!doc) throw httpError(404, "Complaint not found");

  // Admins can delete any complaint
  if (req.user?.role === ADMIN) {
    await Complaint.deleteOne({ _id: doc._id });
    logSaved("complaints (deleted by admin)", { id: req.params.id, deletedBy: req.user.name });
    return res.json({ deleted: req.params.id });
  }

  // Residents can delete their own flat's complaint if it is still Pending (e.g. submitted by mistake)
  if (isResident(req.user)) {
    const flatMatches =
      String(doc.flat || "").trim().toLowerCase() === String(req.user.flat || "").trim().toLowerCase();
    if (!flatMatches) {
      throw httpError(403, "You can only delete complaints filed for your own flat");
    }
    if (doc.status !== "Pending") {
      throw httpError(400, "You can only delete a complaint while it is Pending. Once In Progress or Resolved, complaints cannot be deleted.");
    }
    await Complaint.deleteOne({ _id: doc._id });
    logSaved("complaints (deleted by resident)", { id: req.params.id, deletedBy: req.user.name, flat: req.user.flat });
    return res.json({ deleted: req.params.id });
  }

  throw httpError(403, "You do not have permission to delete complaints");
}));

export default router;
