import { Router } from "express";
import mongoose from "mongoose";
import Notification from "../models/Notification.js";
import User from "../models/User.js";
import { asyncHandler, httpError } from "../middleware/errors.js";
import { requireRole, ADMIN, GUARD } from "../middleware/auth.js";
import { bus, notifyUsers } from "../utils/notify.js";

// Every route here is already behind requireAuth (see app.js) and only ever touches
// the logged-in user's own notifications.
const router = Router();
const mine = (req, extra = {}) => ({ recipient: req.user._id, ...extra });

// GET /api/notifications?unread=true&limit=50  ->  { items, unread }
router.get("/", asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const filter = mine(req, req.query.unread === "true" ? { read: false } : {});
  if (req.query.type) filter.type = String(req.query.type);
  const [items, unread] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).limit(limit),
    Notification.countDocuments(mine(req, { read: false })),
  ]);
  res.json({ items, unread });
}));

router.get("/unread-count", asyncHandler(async (req, res) => {
  res.json({ unread: await Notification.countDocuments(mine(req, { read: false })) });
}));

// Live updates (Server-Sent Events). The website reads this with fetch() so the
// JWT stays in the Authorization header and never appears in a URL.
router.get("/stream", (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no", // disable proxy buffering (nginx)
  });
  res.flushHeaders();
  res.write(`event: ready\ndata: {}\n\n`);

  const channel = `user:${req.user._id}`;
  const send = (item) => res.write(`event: notification\ndata: ${JSON.stringify(item)}\n\n`);
  const sendEmergency = (data) => res.write(`event: emergency\ndata: ${JSON.stringify(data)}\n\n`);
  const sendResolved = (data) => res.write(`event: emergency_resolved\ndata: ${JSON.stringify(data)}\n\n`);
  const sendParking = (data) => res.write(`event: parking_updated\ndata: ${JSON.stringify(data)}\n\n`);
  const ping = setInterval(() => res.write(`: ping\n\n`), 25_000);
  bus.on(channel, send);
  bus.on("emergency:broadcast", sendEmergency);
  bus.on("emergency:resolved", sendResolved);
  bus.on("parking:updated", sendParking);
  req.on("close", () => {
    clearInterval(ping);
    bus.off(channel, send);
    bus.off("emergency:broadcast", sendEmergency);
    bus.off("emergency:resolved", sendResolved);
    bus.off("parking:updated", sendParking);
  });
});

router.patch("/read-all", asyncHandler(async (req, res) => {
  const result = await Notification.updateMany(mine(req, { read: false }), { $set: { read: true, readAt: new Date() } });
  res.json({ updated: result.modifiedCount, unread: 0 });
}));

router.patch("/:id/read", asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw httpError(400, "Invalid notification id");
  const doc = await Notification.findOneAndUpdate(
    mine(req, { _id: req.params.id }),
    { $set: { read: true, readAt: new Date() } },
    { new: true }
  );
  if (!doc) throw httpError(404, "Notification not found");
  res.json(doc);
}));

router.delete("/:id", asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw httpError(400, "Invalid notification id");
  const doc = await Notification.findOneAndDelete(mine(req, { _id: req.params.id }));
  if (!doc) throw httpError(404, "Notification not found");
  res.json({ deleted: req.params.id });
}));

router.delete("/", asyncHandler(async (req, res) => {
  const result = await Notification.deleteMany(mine(req));
  res.json({ deleted: result.deletedCount });
}));

// POST /api/notifications/announce  { title, message, type: "Announcement" | "Security", flat? }
// Admin: any announcement. Security Guard: security announcements only.
// Without "flat" it goes to every resident; with "flat" only to that flat.
router.post("/announce", requireRole(ADMIN, GUARD), asyncHandler(async (req, res) => {
  const title = String(req.body.title || "").trim();
  const message = String(req.body.message || "").trim();
  const type = req.user.role === GUARD ? "Security" : req.body.type === "Security" ? "Security" : "Announcement";
  const flat = String(req.body.flat || "").trim().toUpperCase();
  if (!title) throw httpError(400, "Title is required");
  if (!message) throw httpError(400, "Message is required");
  if (title.length > 120) throw httpError(400, "Title must be 120 characters or less");
  if (message.length > 1000) throw httpError(400, "Message must be 1000 characters or less");

  const filter = { role: "Resident", ...(flat ? { flat } : {}) };
  const residents = await User.find(filter, { _id: 1 });
  if (!residents.length) throw httpError(404, flat ? `No resident login found for flat ${flat}` : "No resident accounts found");
  const docs = await notifyUsers(residents, {
    type, title, message,
    link: type === "Security" ? "/security" : "/notifications",
    createdBy: req.user.name,
  });
  res.status(201).json({ sent: docs.length, type, audience: flat || "All Residents" });
}));

export default router;
