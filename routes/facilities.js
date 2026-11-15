import { Router } from "express";
import FacilityBooking from "../models/FacilityBooking.js";
import { createWithId } from "../utils/nextId.js";
import { asyncHandler, httpError } from "../middleware/errors.js";
import { logSaved } from "../utils/log.js";
import { pick, str } from "../utils/format.js";
import { requireRole, ADMIN, isResident } from "../middleware/auth.js";
import { notifyFlat } from "../utils/notify.js";

const router = Router();

router.get("/bookings", asyncHandler(async (req, res) => {
  const filter = {};
  for (const k of ["facilityId", "status", "date"]) if (req.query[k]) filter[k] = str(req.query[k]);
  if (req.query.mine === "true" && isResident(req.user)) {
    filter.flat = req.user.flat || "__none__";
  }
  res.json(await FacilityBooking.find(filter).sort({ createdAt: -1 }));
}));

router.post("/bookings", asyncHandler(async (req, res) => {
  const data = pick(req.body, ["facilityId", "facilityName", "residentName", "flat", "date", "slot", "fee"]);
  if (isResident(req.user)) {
    if (!req.user.flat) throw httpError(400, "Your account has no flat number assigned");
    data.residentName = req.user.name;
    data.flat = req.user.flat;
  }
  if (!data.facilityId || !data.facilityName || !data.date || !data.slot) {
    throw httpError(400, "Facility, date, and time slot are required");
  }

  // Prevent double booking of same facility slot
  const clash = await FacilityBooking.findOne({
    facilityId: data.facilityId,
    date: data.date,
    slot: data.slot,
    status: "Confirmed",
  });
  if (clash) {
    throw httpError(409, `Slot "${data.slot}" on ${data.date} is already booked for ${clash.facilityName}`);
  }

  const doc = await createWithId(FacilityBooking, data, "facility_booking", "BK-", 3);
  logSaved("facility_bookings", doc);

  await notifyFlat(doc.flat, {
    type: "System",
    title: `Facility reserved: ${doc.facilityName}`,
    message: `${doc.facilityName} is confirmed for ${doc.date} at ${doc.slot}.`,
    link: "/facilities",
    refId: doc.id,
    createdBy: req.user.name,
  });

  res.status(201).json(doc);
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
  res.json(doc);
}));

router.delete("/bookings/:id", requireRole(ADMIN), asyncHandler(async (req, res) => {
  const doc = await FacilityBooking.findOneAndDelete({ id: req.params.id });
  if (!doc) throw httpError(404, "Booking not found");
  res.json({ deleted: req.params.id });
}));

export default router;
