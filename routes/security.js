import { Router } from "express";
import SecurityStaff from "../models/SecurityStaff.js";
import Incident from "../models/Incident.js";
import Visitor from "../models/Visitor.js";
import User from "../models/User.js";
import { createWithId } from "../utils/nextId.js";
import { asyncHandler, httpError } from "../middleware/errors.js";
import { requireRole, ADMIN, GUARD, RESIDENT, MAINTENANCE, isResident } from "../middleware/auth.js";
import { logSaved } from "../utils/log.js";
import { pick, str } from "../utils/format.js";
import { createLogin, wantsLogin } from "../utils/accounts.js";
import { bus, notifyRoles, notifyUsers, notifyResident, notifyAllUsers } from "../utils/notify.js";

const router = Router();
const STAFF_FIELDS = ["name", "photo", "phone", "post", "shift", "shiftStart", "shiftEnd", "dutyStatus"];
const INCIDENT_FIELDS = ["title", "type", "description", "location", "severity", "occurredAt"];
const regex = (q) => new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

/* ---------------------------- Security staff ---------------------------- */

// Every logged-in user can see who is guarding the society (residents need the contact numbers).
router.get("/staff", asyncHandler(async (req, res) => {
  const filter = {};
  for (const k of ["shift", "dutyStatus", "post"]) if (req.query[k]) filter[k] = str(req.query[k]);
  if (req.query.q) filter.$or = [{ name: regex(req.query.q) }, { phone: regex(req.query.q) }, { post: regex(req.query.q) }, { id: regex(req.query.q) }];
  const staff = await SecurityStaff.find(filter).sort({ dutyStatus: 1, name: 1 });
  // Residents don't need to know which login a guard uses
  res.json(isResident(req.user) ? staff.map((s) => { const j = s.toJSON(); delete j.username; return j; }) : staff);
}));

// Admin adds a guard, optionally with a login account (role "Security Guard")
router.post("/staff", requireRole(ADMIN), asyncHandler(async (req, res) => {
  const data = pick(req.body, STAFF_FIELDS);
  const probe = new SecurityStaff(data);
  await probe.validate(); // check the profile before creating any login
  if (wantsLogin(req.body)) {
    const user = await createLogin({ ...req.body.login, name: data.name, phone: data.phone, role: GUARD });
    data.username = user.username;
  } else if (req.body.username) {
    const user = await User.findOne({ username: String(req.body.username).toLowerCase(), role: GUARD });
    if (!user) throw httpError(400, "No Security Guard login with that username");
    data.username = user.username;
  }
  const doc = await createWithId(SecurityStaff, data, "security_staff", "SEC-", 3);
  logSaved("security_staff", doc);
  res.status(201).json(doc);
}));

// Admin edits anything; a guard may only change their own duty status
router.patch("/staff/:id", requireRole(ADMIN, GUARD), asyncHandler(async (req, res) => {
  const staff = await SecurityStaff.findOne({ id: req.params.id });
  if (!staff) throw httpError(404, "Security staff not found");
  let update;
  if (req.user.role === ADMIN) update = pick(req.body, STAFF_FIELDS);
  else {
    if (staff.username !== req.user.username) throw httpError(403, "You can only update your own duty status");
    update = pick(req.body, ["dutyStatus"]);
  }
  staff.set(update);
  await staff.save();
  logSaved("security_staff (updated)", staff);
  res.json(staff);
}));

router.delete("/staff/:id", requireRole(ADMIN), asyncHandler(async (req, res) => {
  const doc = await SecurityStaff.findOneAndDelete({ id: req.params.id });
  if (!doc) throw httpError(404, "Security staff not found");
  res.json({ deleted: req.params.id });
}));

/* ------------------------------ Incidents ------------------------------- */

router.get("/incidents", requireRole(ADMIN, GUARD, RESIDENT, MAINTENANCE, "Maintenance Staff"), asyncHandler(async (req, res) => {
  const filter = {};
  for (const k of ["status", "severity", "type"]) if (req.query[k]) filter[k] = str(req.query[k]);
  const and = [];
  // Residents only see incidents they reported (or for their flat), PLUS all emergency / high-severity society alerts
  if (isResident(req.user)) {
    and.push({
      $or: [
        { reporterUsername: req.user.username },
        ...(req.user.flat ? [{ flat: req.user.flat }] : []),
        { type: "Emergency" },
        { severity: "High" },
        { title: { $regex: /emergency|sos|fire/i } },
      ],
    });
  }
  if (req.query.q) {
    const q = regex(req.query.q);
    and.push({ $or: [{ title: q }, { description: q }, { location: q }, { id: q }] });
  }
  if (and.length) filter.$and = and;
  res.json(await Incident.find(filter).sort({ occurredAt: -1 }));
}));

router.post("/incidents", requireRole(ADMIN, GUARD, RESIDENT, MAINTENANCE, "Maintenance Staff"), asyncHandler(async (req, res) => {
  const data = pick(req.body, INCIDENT_FIELDS);
  data.reportedBy = req.user.name;
  data.reporterUsername = req.user.username;
  data.reporterRole = req.user.role;
  data.flat = isResident(req.user) ? req.user.flat : str(req.body.flat);
  if (isResident(req.user)) data.status = "Open";
  const doc = await createWithId(Incident, data, "incident", "INC-", 3);
  logSaved("incidents", doc);

  const isUrgent =
    doc.type === "Emergency" ||
    doc.severity === "High" ||
    /emergency|sos|fire/i.test(doc.title || "") ||
    /emergency|sos|fire/i.test(doc.type || "") ||
    /emergency|sos|fire/i.test(doc.description || "");

  if (isUrgent) {
    // Society-wide emergency broadcast to EVERY user in the society (Admin, Guard, Resident, Maintenance)
    const allUsers = await User.find({}, { _id: 1, role: 1, name: 1, flat: 1 });
    console.log(`🚨 Incident emergency broadcast by ${req.user.role} (${req.user.name}) -> Dispatching to ${allUsers.length} user(s) across roles: [${[...new Set(allUsers.map((u) => u.role))].join(", ")}]`);
    await notifyUsers(allUsers, {
      type: "Emergency",
      isEmergency: true,
      location: doc.location || "Society Premises",
      title: `🚨 EMERGENCY ALERT: ${doc.title.toUpperCase()}`,
      message: `${doc.description || "Emergency alert reported"} Location: ${doc.location || "Society Premises"}. Respond immediately.`,
      link: "/security",
      refId: doc.id,
      createdBy: req.user.name,
    });
    bus.emit("emergency:broadcast", {
      id: doc.id,
      incidentId: doc.id,
      emergencyType: doc.title,
      title: `🚨 EMERGENCY ALERT: ${doc.title.toUpperCase()}`,
      message: `${doc.description || "Emergency alert reported"} Location: ${doc.location || "Society Premises"}.`,
      location: doc.location || "Society Premises",
      reportedBy: req.user.name,
      flat: doc.flat,
      severity: "High",
      isEmergency: true,
      timestamp: new Date().toISOString(),
    });
  } else {
    // Admin + guards + maintenance staff hear about it (except the person who reported it)
    const staff = await User.find({ role: { $in: [ADMIN, GUARD, MAINTENANCE, "Maintenance Staff"] }, _id: { $ne: req.user._id } }, { _id: 1 });
    await notifyUsers(staff, {
      type: "Security",
      title: `${doc.severity === "High" ? "🚨 " : ""}Incident reported: ${doc.title}`,
      message: `${doc.type} at ${doc.location}. Reported by ${doc.reportedBy}${doc.flat ? ` (${doc.flat})` : ""}.`,
      link: "/security", refId: doc.id, createdBy: req.user.name,
    });
    if (isResident(req.user)) {
      await notifyUsers([req.user], {
        type: "Security", title: "Incident report received",
        message: `Your report "${doc.title}" (${doc.id}) was sent to the security team.`,
        link: "/security", refId: doc.id, createdBy: "Security Desk",
      });
    }
  }
  res.status(201).json(doc);
}));

router.patch("/incidents/:id", requireRole(ADMIN, GUARD), asyncHandler(async (req, res) => {
  const doc = await Incident.findOne({ id: req.params.id });
  if (!doc) throw httpError(404, "Incident not found");
  const before = doc.status;
  doc.set(pick(req.body, [...INCIDENT_FIELDS, "status", "actionTaken"]));
  if (doc.status === "Resolved" && before !== "Resolved") doc.resolvedAt = new Date();
  if (doc.status !== "Resolved") doc.resolvedAt = undefined;
  await doc.save();
  logSaved("incidents (updated)", doc);
  if (before !== doc.status && doc.reporterRole === RESIDENT) {
    await notifyResident({ username: doc.reporterUsername, flat: doc.flat }, {
      type: "Security", title: `Incident ${doc.status.toLowerCase()}: ${doc.title}`,
      message: doc.actionTaken ? `Security update: ${doc.actionTaken}` : `Your incident report ${doc.id} is now ${doc.status}.`,
      link: "/security", refId: doc.id, createdBy: req.user.name,
    });
  }
  res.json(doc);
}));

router.delete("/incidents/:id", requireRole(ADMIN), asyncHandler(async (req, res) => {
  const doc = await Incident.findOneAndDelete({ id: req.params.id });
  if (!doc) throw httpError(404, "Incident not found");
  res.json({ deleted: req.params.id });
}));

/* -------------------------- Emergency + summary ------------------------- */

// The SOS / Emergency alert: logs a High incident and instantly alerts EVERY user in the society + triggers emergency siren broadcast
// Authority: Admins and Security Guards (and residents) have permission to broadcast emergency SOS
router.post("/emergency", requireRole(ADMIN, GUARD, RESIDENT, "admin", "Security Guard", "Resident", "guard", "secretary"), asyncHandler(async (req, res) => {
  const location = String(req.body.location || "").trim() || (req.user.flat ? `Flat ${req.user.flat}` : "Society Premises");
  const emergencyType = String(req.body.emergencyType || "Emergency Alert").trim();
  const description = String(req.body.message || "").trim() || `Emergency alert raised by ${req.user.name}${req.user.flat ? ` (Flat ${req.user.flat})` : ""}.`;

  const doc = await createWithId(Incident, {
    title: emergencyType,
    type: "Emergency",
    severity: "High",
    location,
    description,
    reportedBy: req.user.name,
    reporterUsername: req.user.username,
    reporterRole: req.user.role,
    flat: req.user.flat,
    status: "Open",
  }, "incident", "INC-", 3);
  logSaved("incidents (emergency)", doc);

  // 1. Notify EVERY SINGLE USER in the entire society (Admins, Guards, Residents, Maintenance)
  const allUsers = await User.find({}, { _id: 1, role: 1, name: 1, flat: 1 });
  console.log(`🚨 Emergency SOS broadcast by ${req.user.role} (${req.user.name}) -> Dispatching to ${allUsers.length} user(s) across roles: [${[...new Set(allUsers.map((u) => u.role))].join(", ")}]`);
  await notifyUsers(allUsers, {
    type: "Emergency",
    isEmergency: true,
    location,
    title: `🚨 EMERGENCY ALERT: ${emergencyType.toUpperCase()}`,
    message: `${description} Location: ${location}. Respond immediately.`,
    link: "/security",
    refId: doc.id,
    createdBy: req.user.name,
  });

  // 2. Broadcast on the event bus so SSE stream pushes it to all connected users in real time
  bus.emit("emergency:broadcast", {
    id: doc.id,
    incidentId: doc.id,
    emergencyType,
    title: `🚨 EMERGENCY ALERT: ${emergencyType.toUpperCase()}`,
    message: `${description} Location: ${location}.`,
    location,
    reportedBy: req.user.name,
    flat: req.user.flat,
    severity: "High",
    isEmergency: true,
    timestamp: new Date().toISOString(),
  });

  res.status(201).json({ ...doc.toJSON(), broadcastedTo: allUsers.length });
}));

// Check if there is an active emergency (unresolved)
router.get("/emergency/active", asyncHandler(async (req, res) => {
  const active = await Incident.findOne({
    status: { $ne: "Resolved" },
    $or: [
      { type: "Emergency" },
      { severity: "High" },
      { title: { $regex: /emergency|sos|fire/i } },
    ],
  }).sort({ occurredAt: -1, createdAt: -1 });

  res.json({ active: active || null });
}));

// Resolve an active emergency
router.patch("/emergency/:id/resolve", requireRole(ADMIN, GUARD), asyncHandler(async (req, res) => {
  const doc = await Incident.findOne({ id: req.params.id });
  if (!doc) throw httpError(404, "Emergency incident not found");
  doc.status = "Resolved";
  doc.resolvedAt = new Date();
  doc.actionTaken = String(req.body.actionTaken || "Emergency cleared and resolved by security response team.").trim();
  await doc.save();
  logSaved("incidents (emergency resolved)", doc);

  // Notify everyone of all-clear
  const allUsers = await User.find({}, { _id: 1 });
  await notifyUsers(allUsers, {
    type: "Security",
    title: "✅ EMERGENCY RESOLVED: ALL CLEAR",
    message: `The emergency at ${doc.location} has been addressed and cleared by ${req.user.name}. Normal operations resumed.`,
    link: "/security",
    refId: doc.id,
    createdBy: req.user.name,
  });

  bus.emit("emergency:resolved", { id: doc.id });

  res.json(doc);
}));

router.get("/summary", asyncHandler(async (req, res) => {
  const visitorScope = isResident(req.user) ? { flat: req.user.flat || "__none__" } : {};
  const incidentScope = isResident(req.user) ? { reporterUsername: req.user.username } : {};
  const [totalStaff, onDuty, openIncidents, inside, pendingVisitors] = await Promise.all([
    SecurityStaff.countDocuments(),
    SecurityStaff.countDocuments({ dutyStatus: "On Duty" }),
    Incident.countDocuments({ ...incidentScope, status: { $ne: "Resolved" } }),
    Visitor.countDocuments({ ...visitorScope, status: "Checked In" }),
    Visitor.countDocuments({ ...visitorScope, status: "Pending" }),
  ]);
  res.json({ totalStaff, onDuty, openIncidents, visitorsInside: inside, pendingVisitors });
}));

export default router;
