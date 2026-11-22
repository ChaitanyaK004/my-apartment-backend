import { Router } from "express";
import mongoose from "mongoose";
import FacilityBooking from "../models/FacilityBooking.js";
import { createWithId } from "../utils/nextId.js";
import { asyncHandler, httpError } from "../middleware/errors.js";
import { logSaved } from "../utils/log.js";
import { pick, str } from "../utils/format.js";
import { requireRole, ADMIN, isResident } from "../middleware/auth.js";
import User from "../models/User.js";
import { notifyFlat, notifyUsers } from "../utils/notify.js";

const router = Router();

function timeToMinutes(tStr) {
  if (!tStr) return null;
  const match = tStr.trim().match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!match) return null;
  let [_, hours, mins, modifier] = match;
  hours = parseInt(hours, 10);
  mins = parseInt(mins, 10);
  if (modifier) {
    if (modifier.toUpperCase() === "PM" && hours < 12) hours += 12;
    if (modifier.toUpperCase() === "AM" && hours === 12) hours = 0;
  }
  return hours * 60 + mins;
}

function parseSlotRange(slotStr) {
  if (!slotStr) return null;
  const parts = slotStr.split(/–|-|to/i).map((s) => s.trim());
  if (parts.length >= 2) {
    const start = timeToMinutes(parts[0]);
    const end = timeToMinutes(parts[1]);
    if (start !== null && end !== null) return { start, end };
  }
  return null;
}

function checkSlotOverlap(slotA, slotB) {
  if (slotA.trim().toLowerCase() === slotB.trim().toLowerCase()) return true;
  const rangeA = parseSlotRange(slotA);
  const rangeB = parseSlotRange(slotB);
  if (!rangeA || !rangeB) return slotA === slotB;
  return rangeA.start < rangeB.end && rangeB.start < rangeA.end;
}

router.get("/bookings", asyncHandler(async (req, res) => {
  const filter = {};
  for (const k of ["facilityId", "status", "date"]) if (req.query[k]) filter[k] = str(req.query[k]);
  if (req.query.mine === "true" && isResident(req.user)) {
    filter.flat = req.user.flat || "__none__";
  }
  res.json(await FacilityBooking.find(filter).sort({ createdAt: -1 }));
}));

router.post("/bookings", asyncHandler(async (req, res) => {
  const data = pick(req.body, ["facilityId", "facilityName", "residentName", "flat", "date", "slot", "fee", "fromTime", "toTime"]);
  const isRes = isResident(req.user);

  if (isRes) {
    if (!req.user.flat) throw httpError(400, "Your account has no flat number assigned");
    data.residentName = req.user.name;
    data.flat = req.user.flat;
    data.status = "Pending"; // Resident bookings require Admin approval
  } else {
    data.residentName = data.residentName || req.user.name;
    data.flat = data.flat || "Management Office";
    data.status = "Confirmed"; // Admin/Management bookings are automatically approved
    data.approvedBy = req.user.name;
  }

  if (!data.facilityId || !data.facilityName || !data.date || !data.slot) {
    throw httpError(400, "Facility, date, and time slot are required");
  }

  // Prevent double booking of active slot with overlap checking
  const existingActive = await FacilityBooking.find({
    facilityId: data.facilityId,
    date: data.date,
    status: { $in: ["Confirmed", "Pending"] },
  });
  const clash = existingActive.find((b) => checkSlotOverlap(b.slot, data.slot));
  if (clash) {
    throw httpError(409, `Time slot "${data.slot}" on ${data.date} overlaps with existing ${clash.status.toLowerCase()} booking (${clash.slot}) for ${clash.facilityName}`);
  }

  const doc = await createWithId(FacilityBooking, data, "facility_booking", "BK-", 3);
  logSaved("facility_bookings", doc);

  if (isRes) {
    // Notify resident that booking is waiting for approval
    await notifyFlat(doc.flat, {
      type: "System",
      title: `Facility booking submitted: ${doc.facilityName}`,
      message: `Your booking for ${doc.facilityName} on ${doc.date} (${doc.slot}) has been submitted and is awaiting Admin approval.`,
      link: "/facilities",
      refId: doc.id,
      createdBy: req.user.name,
    });

    // Instantly notify Admin for approval
    const admins = await User.find({ role: ADMIN, _id: { $ne: req.user._id } }, { _id: 1 });
    await notifyUsers(admins, {
      type: "System",
      title: `🏛️ Booking Request: ${doc.facilityName}`,
      message: `${doc.residentName} (Flat ${doc.flat}) requested ${doc.facilityName} on ${doc.date} (${doc.slot}). Awaiting approval.`,
      link: "/facilities",
      refId: doc.id,
      createdBy: req.user.name,
    });
  } else {
    await notifyFlat(doc.flat, {
      type: "System",
      title: `Facility reserved: ${doc.facilityName}`,
      message: `${doc.facilityName} is confirmed for ${doc.date} at ${doc.slot}.`,
      link: "/facilities",
      refId: doc.id,
      createdBy: req.user.name,
    });
  }

  res.status(201).json(doc);
}));

router.patch("/bookings/:id/approve", requireRole(ADMIN, "admin", "Secretary", "secretary"), asyncHandler(async (req, res) => {
  const doc = await FacilityBooking.findOne({
    $or: [
      { id: req.params.id },
      { id: req.params.id.trim() },
      ...(mongoose.isValidObjectId(req.params.id) ? [{ _id: req.params.id }] : []),
    ],
  });
  if (!doc) throw httpError(404, "Booking not found");
  doc.status = "Confirmed";
  doc.approvedBy = req.user.name;
  await doc.save();
  logSaved("facility_bookings (approved)", doc);

  await notifyFlat(doc.flat, {
    type: "System",
    title: `Facility booking Approved: ${doc.facilityName}`,
    message: `Your booking for ${doc.facilityName} on ${doc.date} (${doc.slot}) has been APPROVED by ${req.user.name}!`,
    link: "/facilities",
    refId: doc.id,
    createdBy: req.user.name,
  });

  res.json(doc);
}));

router.patch("/bookings/:id/reject", requireRole(ADMIN, "admin", "Secretary", "secretary"), asyncHandler(async (req, res) => {
  const doc = await FacilityBooking.findOne({
    $or: [
      { id: req.params.id },
      { id: req.params.id.trim() },
      ...(mongoose.isValidObjectId(req.params.id) ? [{ _id: req.params.id }] : []),
    ],
  });
  if (!doc) throw httpError(404, "Booking not found");
  doc.status = "Rejected";
  doc.approvedBy = req.user.name;
  if (req.body.reason) doc.rejectionReason = str(req.body.reason);
  await doc.save();
  logSaved("facility_bookings (rejected)", doc);

  await notifyFlat(doc.flat, {
    type: "System",
    title: `Facility booking Rejected: ${doc.facilityName}`,
    message: `Your booking for ${doc.facilityName} on ${doc.date} (${doc.slot}) was not approved${req.body.reason ? `: ${req.body.reason}` : "."}`,
    link: "/facilities",
    refId: doc.id,
    createdBy: req.user.name,
  });

  res.json(doc);
}));

router.patch("/bookings/:id", requireRole(ADMIN, "admin", "Secretary", "secretary"), asyncHandler(async (req, res) => {
  const doc = await FacilityBooking.findOne({
    $or: [
      { id: req.params.id },
      { id: req.params.id.trim() },
      ...(mongoose.isValidObjectId(req.params.id) ? [{ _id: req.params.id }] : []),
    ],
  });
  if (!doc) throw httpError(404, "Booking not found");
  if (req.body.status) doc.status = req.body.status;
  if (req.body.status === "Confirmed") doc.approvedBy = req.user.name;
  if (req.body.status === "Rejected") {
    doc.approvedBy = req.user.name;
    if (req.body.reason) doc.rejectionReason = str(req.body.reason);
  }
  await doc.save();
  logSaved("facility_bookings (status updated)", doc);
  res.json(doc);
}));

router.patch("/bookings/:id/cancel", asyncHandler(async (req, res) => {
  const doc = await FacilityBooking.findOne({ id: req.params.id });
  if (!doc) throw httpError(404, "Booking not found");
  if (isResident(req.user) && doc.flat !== req.user.flat) {
    throw httpError(403, "You can only cancel your own bookings");
  }
  doc.status = "Cancelled";
  await doc.save();
  logSaved("facility_bookings (cancelled)", doc);

  await notifyFlat(doc.flat, {
    type: "System",
    title: `Facility booking cancelled: ${doc.facilityName}`,
    message: `Booking for ${doc.facilityName} on ${doc.date} (${doc.slot}) has been cancelled.`,
    link: "/facilities",
    refId: doc.id,
    createdBy: req.user.name,
  });

  res.json(doc);
}));

router.delete("/bookings/:id", requireRole(ADMIN), asyncHandler(async (req, res) => {
  const doc = await FacilityBooking.findOneAndDelete({ id: req.params.id });
  if (!doc) throw httpError(404, "Booking not found");
  res.json({ deleted: req.params.id });
}));

export default router;
