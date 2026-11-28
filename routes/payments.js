import { Router } from "express";
import Payment from "../models/Payment.js";
import { createWithId } from "../utils/nextId.js";
import { asyncHandler, httpError } from "../middleware/errors.js";
import { logSaved } from "../utils/log.js";
import { pick, str, fmtDate } from "../utils/format.js";
import { requireRole, ADMIN, RESIDENT, isResident } from "../middleware/auth.js";
import { notifyFlat, notifyRoles } from "../utils/notify.js";

const router = Router();
const regex = (q) => new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

router.get("/summary", requireRole(ADMIN, RESIDENT), asyncHandler(async (req, res) => {
  const filter = isResident(req.user) ? { flat: req.user.flat || "__none__" } : {};
  const all = await Payment.find(filter);
  const paid = all.filter((p) => p.status === "Paid");
  const pending = all.filter((p) => p.status === "Pending");
  const overdue = all.filter((p) => p.status === "Overdue");
  const awaitingApproval = all.filter(
    (p) => p.status === "Pending Approval" || p.status === "Under Verification"
  );

  const collectedTotal = paid.reduce((sum, p) => sum + (p.amount || 0), 0);
  const pendingTotal = pending.reduce((sum, p) => sum + (p.amount || 0), 0);
  const overdueTotal = overdue.reduce((sum, p) => sum + (p.amount || 0), 0);
  const awaitingApprovalTotal = awaitingApproval.reduce((sum, p) => sum + (p.amount || 0), 0);

  res.json({
    totalCount: all.length,
    paidCount: paid.length,
    collectedTotal,
    pendingCount: pending.length,
    pendingTotal,
    overdueCount: overdue.length,
    overdueTotal,
    awaitingApprovalCount: awaitingApproval.length,
    awaitingApprovalTotal,
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

router.post("/", requireRole(ADMIN, RESIDENT), asyncHandler(async (req, res) => {
  const data = pick(req.body, ["resident", "flat", "month", "amount", "date", "method", "status", "residenceName"]);
  if (isResident(req.user)) {
    if (!req.user.flat) throw httpError(400, "Your account has no flat assigned");
    data.flat = req.user.flat;
    data.resident = req.user.name;
  }
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
  if (!isResident(req.user)) {
    throw httpError(403, "Only residents can pay maintenance bills. Society Admin can approve or reject submitted payments.");
  }
  const doc = await Payment.findOne({ id: req.params.id });
  if (!doc) throw httpError(404, "Payment record not found");
  if (
    String(doc.flat || "").trim().toUpperCase() !== String(req.user.flat || "").trim().toUpperCase()
  ) {
    throw httpError(403, "You can only pay dues for your own flat");
  }
  if (doc.status === "Paid") throw httpError(409, "This bill is already paid and verified");
  if (doc.status === "Pending Approval" || doc.status === "Under Verification") {
    throw httpError(409, "Payment already submitted. Waiting for Admin verification");
  }

  const method = String(req.body.method || "UPI").trim();
  const txnRef = String(req.body.transactionRef || "").trim() || `TXN-${doc.id}-${Date.now().toString().slice(-6)}`;
  const isRes = isResident(req.user);
  const requireApproval = isRes || req.body.requireApproval === true;

  doc.method = method;
  doc.transactionRef = txnRef;
  doc.submittedAt = new Date();
  doc.submittedBy = req.user.name;

  if (requireApproval) {
    // When a resident pays, it moves to "Pending Approval" for the Admin to verify
    doc.status = "Pending Approval";
    doc.date = fmtDate(new Date());
    await doc.save();
    logSaved("payments (submitted for admin approval)", doc);

    // Notify Admin
    await notifyRoles([ADMIN], {
      type: "System",
      title: `💰 Payment submitted: Flat ${doc.flat} (₹${doc.amount})`,
      message: `${doc.resident} (Flat ${doc.flat}) submitted payment of ₹${doc.amount.toLocaleString("en-IN")} for ${doc.month} via ${method}. Please review and approve.`,
      link: "/payments",
      refId: doc.id,
      createdBy: req.user.name,
    });

    // Notify Resident
    await notifyFlat(doc.flat, {
      type: "System",
      title: `Payment submitted for verification: ₹${doc.amount}`,
      message: `Your payment of ₹${doc.amount.toLocaleString("en-IN")} for ${doc.month} via ${method} has been submitted to Admin for approval.`,
      link: "/payments",
      refId: doc.id,
      createdBy: req.user.name,
    });
  } else {
    // Admin directly records offline payment
    doc.status = "Paid";
    doc.paidAt = new Date();
    doc.date = fmtDate(new Date());
    doc.approvedBy = req.user.name;
    doc.approvedAt = new Date();
    await doc.save();
    logSaved("payments (recorded directly as paid)", doc);

    await notifyFlat(doc.flat, {
      type: "System",
      title: `Payment received & confirmed: ₹${doc.amount}`,
      message: `Payment of ₹${doc.amount.toLocaleString("en-IN")} for ${doc.month} was recorded and confirmed via ${method}.`,
      link: "/payments",
      refId: doc.id,
      createdBy: req.user.name,
    });
  }

  res.json(doc);
}));

const queryForId = (idParam) => {
  const reqId = String(idParam || "").trim();
  return {
    $or: [
      { id: reqId },
      { id: idParam },
      ...(reqId.match(/^[0-9a-fA-F]{24}$/) ? [{ _id: reqId }] : []),
    ],
  };
};

router.patch("/:id/approve", requireRole(ADMIN), asyncHandler(async (req, res) => {
  const doc = await Payment.findOne(queryForId(req.params.id));
  if (!doc) throw httpError(404, "Payment record not found");
  if (doc.status === "Paid") throw httpError(409, "Payment is already marked as Paid");

  doc.status = "Paid";
  doc.paidAt = new Date();
  doc.date = fmtDate(new Date());
  doc.approvedBy = req.user.name;
  doc.approvedAt = new Date();
  doc.rejectionReason = undefined;
  await doc.save();
  logSaved("payments (approved by admin)", doc);

  await notifyFlat(doc.flat, {
    type: "System",
    title: `✅ Payment Approved & Received: ₹${doc.amount}`,
    message: `Your maintenance payment of ₹${doc.amount.toLocaleString("en-IN")} for ${doc.month} has been approved and received by ${req.user.name}. Your official receipt is ready!`,
    link: "/payments",
    refId: doc.id,
    createdBy: req.user.name,
  });

  res.json(doc);
}));

router.patch("/:id/reject", requireRole(ADMIN), asyncHandler(async (req, res) => {
  const doc = await Payment.findOne(queryForId(req.params.id));
  if (!doc) throw httpError(404, "Payment record not found");

  const reason = String(req.body.reason || "").trim() || "Payment reference not verified in society bank account";
  doc.status = "Pending";
  doc.rejectionReason = reason;
  await doc.save();
  logSaved("payments (rejected by admin)", doc);

  await notifyFlat(doc.flat, {
    type: "System",
    title: `⚠️ Payment Not Approved: ${doc.month}`,
    message: `Payment submission for ${doc.month} (₹${doc.amount}) was not approved by Admin: ${reason}. Please submit valid payment proof or pay again.`,
    link: "/payments",
    refId: doc.id,
    createdBy: req.user.name,
  });

  res.json(doc);
}));

router.patch("/:id", requireRole(ADMIN), asyncHandler(async (req, res) => {
  const doc = await Payment.findOne(queryForId(req.params.id));
  if (!doc) throw httpError(404, "Payment record not found");

  const fields = pick(req.body, [
    "status",
    "amount",
    "method",
    "date",
    "approvedBy",
    "approvedAt",
    "paidAt",
    "rejectionReason",
    "transactionRef",
  ]);

  Object.assign(doc, fields);

  if (fields.status === "Paid") {
    doc.status = "Paid";
    doc.paidAt = doc.paidAt || new Date();
    doc.date = doc.date || fmtDate(new Date());
    doc.approvedBy = req.user?.name || "Society Admin";
    doc.approvedAt = new Date();
    doc.rejectionReason = undefined;

    await notifyFlat(doc.flat, {
      type: "System",
      title: `✅ Payment Approved & Received: ₹${doc.amount}`,
      message: `Your maintenance payment of ₹${doc.amount.toLocaleString("en-IN")} for ${doc.month} has been approved and received by ${req.user?.name || "Admin"}. Your official receipt is ready!`,
      link: "/payments",
      refId: doc.id,
      createdBy: req.user?.name || "Admin",
    });
  }

  await doc.save();
  logSaved("payments (updated)", doc);
  res.json(doc);
}));

router.post("/:id/remind", requireRole(ADMIN), asyncHandler(async (req, res) => {
  const doc = await Payment.findOne(queryForId(req.params.id));
  if (!doc) throw httpError(404, "Payment record not found");

  await notifyFlat(doc.flat, {
    type: "Billing",
    title: `🔔 Maintenance Reminder: ₹${(doc.amount || 0).toLocaleString("en-IN")}`,
    message: `Gentle reminder: Maintenance payment for ${doc.month} (₹${(doc.amount || 0).toLocaleString("en-IN")}) is currently ${doc.status}. Please clear your dues at your earliest convenience.`,
    link: "/payments",
    refId: doc.id,
    createdBy: req.user?.name || "Society Admin",
  });

  res.json({ success: true, message: `Reminder sent to Flat ${doc.flat}` });
}));

router.delete("/:id", requireRole(ADMIN), asyncHandler(async (req, res) => {
  const doc = await Payment.findOneAndDelete(queryForId(req.params.id));
  if (!doc) throw httpError(404, "Payment record not found");
  res.json({ deleted: req.params.id, id: doc.id });
}));

export default router;
