import { Router } from "express";
import ParkingReservation from "../models/ParkingReservation.js";
import { createWithId } from "../utils/nextId.js";
import { asyncHandler, httpError } from "../middleware/errors.js";
import { logSaved } from "../utils/log.js";
import { pick, str } from "../utils/format.js";
import { requireRole, ADMIN, isResident } from "../middleware/auth.js";

const router = Router();

router.get("/", asyncHandler(async (req, res) => {
  const filter = {};
  for (const k of ["slot", "flat", "status", "type"]) if (req.query[k]) filter[k] = str(req.query[k]);
  res.json(await ParkingReservation.find(filter).sort({ fromTime: -1 }));
}));

router.post("/", asyncHandler(async (req, res) => {
  const data = pick(req.body, ["type", "residentName", "flat", "vehicleNumber", "slot", "fromTime", "toTime"]);
  if (isResident(req.user)) {
    if (!req.user.flat) throw httpError(400, "Your account has no flat number. Please contact admin.");
    data.flat = req.user.flat;
    data.residentName = req.user.name;
  }
  if (!data.fromTime || !data.toTime) throw httpError(400, "Start and end times are required");
  if (new Date(data.fromTime) >= new Date(data.toTime)) throw httpError(400, "End time must be after start time");

  const probe = new ParkingReservation(data);
  await probe.validate(); // friendly errors before we look for clashes

  // Same slot cannot be reserved twice for overlapping times
  const clash = await ParkingReservation.findOne({
    slot: probe.slot,
    status: "Active",
    fromTime: { $lt: probe.toTime },
    toTime: { $gt: probe.fromTime },
  });
  if (clash) throw httpError(409, `Slot ${probe.slot} is already reserved for ${clash.residentName} during that time`);

  const doc = await createWithId(ParkingReservation, data, "parking", "PRK-", 3);
  logSaved("parking", doc);
  res.status(201).json(doc);
}));

router.patch("/:id", asyncHandler(async (req, res) => {
  // Residents can only change their own flat's reservations
  const own = isResident(req.user) ? { flat: req.user.flat || "__none__" } : {};
  const doc = await ParkingReservation.findOneAndUpdate({ id: req.params.id, ...own }, { $set: pick(req.body, ["status"]) }, { new: true, runValidators: true });
  if (!doc) throw httpError(404, "Reservation not found");
  logSaved("parking (updated)", doc);
  res.json(doc);
}));

router.delete("/:id", requireRole(ADMIN), asyncHandler(async (req, res) => {
  const doc = await ParkingReservation.findOneAndDelete({ id: req.params.id });
  if (!doc) throw httpError(404, "Reservation not found");
  res.json({ deleted: req.params.id });
}));

export default router;
