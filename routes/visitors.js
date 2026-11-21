import { Router } from "express";
import Visitor from "../models/Visitor.js";
import Resident from "../models/Resident.js";
import { createWithId } from "../utils/nextId.js";
import { asyncHandler, httpError } from "../middleware/errors.js";
import { requireRole, ADMIN, GUARD, RESIDENT, isResident } from "../middleware/auth.js";
import { logSaved } from "../utils/log.js";
import { fmtDateTime, pick, str } from "../utils/format.js";
import { notifyFlat, notifyRoles } from "../utils/notify.js";

const router = Router();
// Maintenance staff have no reason to see the visitor register
router.use(requireRole(ADMIN, GUARD, RESIDENT));

const EDITABLE = ["name", "purpose", "phone", "vehicle", "visitTime", "resident"];
const regex = (q) => new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

router.get("/", asyncHandler(async (req, res) => {
  const filter = {};
  for (const k of ["status", "flat", "purpose"]) if (req.query[k]) filter[k] = str(req.query[k]);
  // Residents only ever see visitors for their own flat
  if (isResident(req.user)) filter.flat = req.user.flat || "__none__";
  if (req.query.q) {
    const q = regex(req.query.q);
    filter.$or = [{ name: q }, { id: q }, { flat: q }, { resident: q }, { phone: q }];
  }
  if (req.query.from || req.query.to) {
    filter.visitTime = {};
    if (req.query.from) filter.visitTime.$gte = new Date(str(req.query.from));
    if (req.query.to) filter.visitTime.$lte = new Date(str(req.query.to));
  }
  res.json(await Visitor.find(filter).sort({ visitTime: -1 }));
}));

router.post("/", asyncHandler(async (req, res) => {
  const { name, purpose, flat, phone, vehicle, visitTime, resident, status } = req.body;
  // A resident can only pre-approve guests for their own flat
  const cleanFlat = isResident(req.user) ? req.user.flat : String(flat || "").trim().toUpperCase();
  if (isResident(req.user) && !cleanFlat) throw httpError(400, "Your account has no flat number. Ask the admin to update it.");

  // "Who is calling the visitor": if the guard did not type the resident's name, look it up from the flat number.
  let visiting = isResident(req.user) ? req.user.name : String(resident || "").trim();
  if (!visiting && cleanFlat) {
    const found = await Resident.findOne({ flat: cleanFlat });
    if (found) visiting = found.name;
  }
  // Residents pre-approve; guards may log a walk-in as "Pending" so the resident approves it.
  const allowed = isResident(req.user) ? ["Approved"] : ["Pending", "Approved", "Checked In"];
  const finalStatus = allowed.includes(status) ? status : "Approved";

  const doc = await createWithId(
    Visitor,
    {
      name, purpose, flat: cleanFlat, phone, vehicle: vehicle || undefined,
      visitTime: visitTime || undefined,
      resident: visiting || undefined,
      status: finalStatus,
      checkedInAt: finalStatus === "Checked In" ? new Date() : undefined,
      createdBy: req.user.name,
    },
    "visitor", "VIS-", 3
  );
  logSaved("visitors", doc);

  if (isResident(req.user)) {
    await notifyRoles([ADMIN, GUARD], {
      type: "Visitor", title: "Guest pre-approved",
      message: `${doc.resident} (${doc.flat}) pre-approved ${doc.name} – ${doc.purpose}, ${fmtDateTime(doc.visitTime)}.`,
      link: "/visitors", refId: doc.id, createdBy: req.user.name,
    });
  } else {
    const waiting = doc.status === "Pending";
    await notifyFlat(doc.flat, {
      type: "Visitor",
      title: waiting ? "Visitor waiting for your approval" : doc.status === "Checked In" ? "Visitor checked in" : "Visitor registered",
      message: waiting
        ? `${doc.name} (${doc.purpose}) is at the gate for ${doc.flat}. Please approve or reject.`
        : `${doc.name} (${doc.purpose}) was ${doc.status === "Checked In" ? "checked in" : "registered"} for ${doc.flat} at ${fmtDateTime(doc.visitTime)}.`,
      link: "/security", refId: doc.id, createdBy: req.user.name,
    });
  }
  res.status(201).json(doc);
}));

router.patch("/:id", asyncHandler(async (req, res) => {
  const doc = await Visitor.findOne({ id: req.params.id });
  if (!doc) throw httpError(404, "Visitor not found");
  const { status } = req.body;
  const before = doc.status;

  if (isResident(req.user)) {
    // Residents can only approve / reject a pending visitor for their own flat
    if (doc.flat !== req.user.flat) throw httpError(404, "Visitor not found");
    if (!["Approved", "Rejected"].includes(status)) throw httpError(403, "You can only approve or reject visitors");
    if (doc.status !== "Pending") throw httpError(409, `This visitor is already ${doc.status}`);
  } else {
    // Guard / Admin can correct the entry details too
    doc.set(pick(req.body, EDITABLE));
    if (req.body.flat) doc.flat = String(req.body.flat);
  }

  if (status) {
    doc.status = status;
    if (status === "Checked In") doc.checkedInAt = new Date();
    if (status === "Checked Out") {
      doc.checkedOutAt = new Date();
      if (!doc.checkedInAt) doc.checkedInAt = doc.visitTime;
    }
    if (["Approved", "Rejected"].includes(status)) doc.decidedBy = req.user.name;
  }
  await doc.save();
  logSaved("visitors (updated)", doc);

  if (status && status !== before) {
    if (isResident(req.user)) {
      await notifyRoles([ADMIN, GUARD], {
        type: "Visitor", title: `Visitor ${status.toLowerCase()} by resident`,
        message: `${req.user.name} (${doc.flat}) ${status.toLowerCase()} ${doc.name}.`,
        link: "/visitors", refId: doc.id, createdBy: req.user.name,
      });
    } else {
      const words = { Approved: "was approved at the gate", Rejected: "was denied entry", "Checked In": "has checked in", "Checked Out": "has checked out" };
      await notifyFlat(doc.flat, {
        type: "Visitor", title: `Visitor ${status.toLowerCase()}`,
        message: `${doc.name} ${words[status] || `is now ${status}`}${status === "Checked In" ? ` at ${fmtDateTime(doc.checkedInAt)}` : ""}.`,
        link: "/security", refId: doc.id, createdBy: req.user.name,
      });
    }
  }
  res.json(doc);
}));

router.delete("/:id", requireRole(ADMIN), asyncHandler(async (req, res) => {
  const doc = await Visitor.findOneAndDelete({ id: req.params.id });
  if (!doc) throw httpError(404, "Visitor not found");
  res.json({ deleted: req.params.id });
}));

export default router;
