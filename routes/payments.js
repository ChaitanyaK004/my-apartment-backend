import { Router } from "express";
import Payment from "../models/Payment.js";
import { createWithId } from "../utils/nextId.js";
import { asyncHandler, httpError } from "../middleware/errors.js";
import { logSaved } from "../utils/log.js";
import { pick, str, fmtDate } from "../utils/format.js";
import { requireRole, ADMIN, RESIDENT, isResident } from "../middleware/auth.js";
import { notifyFlat } from "../utils/notify.js";

const router = Router();
const regex = (q) => new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

router.get("/summary", requireRole(ADMIN, RESIDENT), asyncHandler(async (req, res) => {
  const filter = isResident(req.user) ? { flat: req.user.flat || "__none__" } : {};
  const all = await Payment.find(filter);
  const paid = all.filter((p) => p.status === "Paid");
  const pending = all.filter((p) => p.status === "Pending");
  const overdue = all.filter((p) => p.status === "Overdue");

  const collectedTotal = paid.reduce((sum, p) => sum + (p.amount || 0), 0);
  const pendingTotal = pending.reduce((sum, p) => sum + (p.amount || 0), 0);
  const overdueTotal = overdue.reduce((sum, p) => sum + (p.amount || 0), 0);

  res.json({
    totalCount: all.length,
    paidCount: paid.length,
    collectedTotal,
    pendingCount: pending.length,
    pendingTotal,
    overdueCount: overdue.length,
    overdueTotal,
    collectionRate: all.length ? Math.round((paid.length / all.length) * 100) : 100,
  });
}));

router.get("/", requireRole(ADMIN, RESIDENT), asyncHandler(async (req, res) => {
  const filter = {};
  for (const k of ["status", "flat", "month"]) if (req.query[k]) filter[k] = str(req.query[k]);
  if (isResident(req.user)) filter.flat = req.user.flat || "__none__";
  if (req.query.q) {
    const q = regex(req.query.q);
    filter.$or = [{ resident: q }, { flat: q }, { id: q }, { month: q }];
  }
  res.json(await Payment.find(filter).sort({ createdAt: -1 }));
}));

router.post("/", requireRole(ADMIN), asyncHandler(async (req, res) => {
  const data = pick(req.body, ["resident", "flat", "month", "amount", "date", "method", "status", "residenceName"]);
  const doc = await createWithId(Payment, data, "payment", "PAY-", 4);
  logSaved("payments", doc);
  await notifyFlat(doc.flat, {
    type: "System",
    title: `Maintenance due for ${doc.month}`,
    message: `₹${(doc.amount || 4350).toLocaleString("en-IN")} maintenance bill generated for flat ${doc.flat}.`,
    link: "/payments",
    refId: doc.id,
    createdBy: req.user.name,
  });
  res.status(201).json(doc);
}));

router.post("/:id/pay", asyncHandler(async (req, res) => {
  const doc = await Payment.findOne({ id: req.params.id });
  if (!doc) throw httpError(404, "Payment record not found");
  if (isResident(req.user) && doc.flat !== req.user.flat) {
    throw httpError(403, "You can only pay dues for your own flat");
  }
  if (doc.status === "Paid") throw httpError(409, "This bill is already paid");

  const method = String(req.body.method || "UPI").trim();
  doc.status = "Paid";
  doc.method = method;
  doc.paidAt = new Date();
  doc.date = fmtDate(new Date());
  await doc.save();
  logSaved("payments (paid)", doc);

  await notifyFlat(doc.flat, {
    type: "System",
    title: `Payment successful: ₹${doc.amount}`,
    message: `Payment of ₹${doc.amount.toLocaleString("en-IN")} for ${doc.month} was recorded via ${method}.`,
    link: "/payments",
    refId: doc.id,
    createdBy: req.user.name,
  });

  res.json(doc);
}));

router.patch("/:id", requireRole(ADMIN), asyncHandler(async (req, res) => {
  const doc = await Payment.findOneAndUpdate(
    { id: req.params.id },
    { $set: pick(req.body, ["status", "amount", "method", "date"]) },
    { new: true, runValidators: true }
  );
  if (!doc) throw httpError(404, "Payment record not found");
  logSaved("payments (updated)", doc);
  res.json(doc);
}));

router.delete("/:id", requireRole(ADMIN), asyncHandler(async (req, res) => {
  const doc = await Payment.findOneAndDelete({ id: req.params.id });
  if (!doc) throw httpError(404, "Payment record not found");
  res.json({ deleted: req.params.id });
}));

export default router;
