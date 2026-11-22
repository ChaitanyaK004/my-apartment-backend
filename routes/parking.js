import { Router } from "express";
import ParkingReservation from "../models/ParkingReservation.js";
import { createWithId } from "../utils/nextId.js";
import { asyncHandler, httpError } from "../middleware/errors.js";
import { logSaved } from "../utils/log.js";
import { pick, str } from "../utils/format.js";
import { requireRole, ADMIN, GUARD, isResident, isAdmin } from "../middleware/auth.js";
import User from "../models/User.js";
import { notifyUsers } from "../utils/notify.js";

const router = Router();

router.get("/", asyncHandler(async (req, res) => {
  const isStaff = isAdmin(req.user) || req.user?.role === GUARD;
  const filter = {};
  for (const k of ["slot", "flat", "status", "type"]) if (req.query[k]) filter[k] = str(req.query[k]);

  if (isStaff) {
    // Only Admin and Security Guard can see all parking details:
    // who books parking (resident name, flat), vehicle number, timings, and status
    const all = await ParkingReservation.find(filter).sort({ fromTime: -1 });
    return res.json(all);
  }

  // Residents & other non-staff users:
  // Can only see their OWN booking details.
  // For other residents' bookings, names, flat numbers, vehicle numbers, and timings are completely protected.
  const userFlat = req.user?.flat ? req.user.flat.trim().toLowerCase() : "";
  const userName = req.user?.name ? req.user.name.trim().toLowerCase() : "";

  const all = await ParkingReservation.find(filter).sort({ fromTime: -1 });
  const sanitized = all.map((r) => {
    const isOwn = Boolean(
      (userFlat && r.flat && r.flat.trim().toLowerCase() === userFlat) ||
      (userName && r.residentName && r.residentName.trim().toLowerCase() === userName)
    );

    if (isOwn) {
      return {
        ...r.toObject(),
        isOwn: true,
      };
    }

    // Protect privacy: mask resident name, vehicle, flat, and timing of other bookings.
    // For slot map: if status is Active and not expired, mark as occupied so the slot turns RED.
    const isStillActive = r.status === "Active" && (!r.toTime || new Date(r.toTime) >= Date.now());
    return {
      id: r.id,
      slot: String(r.slot || "").trim().split(" ")[0].toUpperCase(),
      status: r.status,
      isOwn: false,
      isRestricted: true,
      residentName: "Resident",
      flat: "Private",
      vehicleNumber: "••••••••",
      type: r.type,
      isCurrentlyOccupied: isStillActive,
      fromTime: null,
      toTime: null,
      createdAt: null,
      updatedAt: null,
    };
  });

  res.json(sanitized);
}));

router.post("/", asyncHandler(async (req, res) => {
  const data = pick(req.body, ["type", "residentName", "flat", "vehicleNumber", "slot", "fromTime", "toTime"]);
  if (data.slot) {
    data.slot = String(data.slot).trim().split(" ")[0].toUpperCase();
  }
  if (isResident(req.user)) {
    if (!req.user.flat) throw httpError(400, "Your account has no flat number. Please contact admin.");
    data.flat = req.user.flat;
    data.residentName = req.user.name;
  } else {
    data.residentName = req.user?.name || "Society Admin";
    if (!data.flat) data.flat = req.user?.flat || "Management";
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
  if (clash) {
    if (isAdmin(req.user) || req.user?.role === GUARD) {
      throw httpError(409, `Slot ${probe.slot} is already reserved for ${clash.residentName} (${clash.flat}) during that time`);
    } else {
      throw httpError(409, `Slot ${probe.slot} is already reserved during that time. Please pick another slot or timing.`);
    }
  }

  const doc = await createWithId(ParkingReservation, data, "parking", "PRK-", 3);
  logSaved("parking", doc);

  // Instantly alert Admins and Security Guards so parking requests appear immediately
  if (isResident(req.user)) {
    const staff = await User.find({ role: { $in: [ADMIN, GUARD] }, _id: { $ne: req.user._id } }, { _id: 1 });
    await notifyUsers(staff, {
      type: "System",
      title: `🚗 Parking slot booked: Slot ${doc.slot}`,
      message: `${doc.residentName} (Flat ${doc.flat}) booked slot ${doc.slot} for ${doc.vehicleNumber || "vehicle"}.`,
      link: "/parking",
      refId: doc.id,
      createdBy: req.user.name,
    });
  }

  res.status(201).json(doc);
}));

router.patch("/:id", asyncHandler(async (req, res) => {
  // Residents can only change their own flat's reservations; Admin and Security Guard can update any
  const isStaff = isAdmin(req.user) || req.user?.role === GUARD;
  const own = !isStaff ? { flat: req.user.flat || "__none__" } : {};
  const doc = await ParkingReservation.findOneAndUpdate({ id: req.params.id, ...own }, { $set: pick(req.body, ["status"]) }, { new: true, runValidators: true });
  if (!doc) throw httpError(404, "Reservation not found");
  logSaved("parking (updated)", doc);
  res.json(doc);
}));

router.delete("/:id", requireRole(ADMIN, GUARD), asyncHandler(async (req, res) => {
  const doc = await ParkingReservation.findOneAndDelete({ id: req.params.id });
  if (!doc) throw httpError(404, "Reservation not found");
  res.json({ deleted: req.params.id });
}));

export default router;
