import { Router } from "express";
import MaintenanceStaff from "../models/MaintenanceStaff.js";
import MaintenanceRequest, { REQUEST_STATUSES } from "../models/MaintenanceRequest.js";
import Resident from "../models/Resident.js";
import User from "../models/User.js";
import { createWithId } from "../utils/nextId.js";
import { asyncHandler, httpError } from "../middleware/errors.js";
import { requireRole, ADMIN, MAINTENANCE, RESIDENT, isAdmin, isResident } from "../middleware/auth.js";
import { logSaved } from "../utils/log.js";
import { pick, str } from "../utils/format.js";
import { createLogin, wantsLogin } from "../utils/accounts.js";
import { notifyRoles, notifyResident, notifyUsers } from "../utils/notify.js";

const router = Router();
const STAFF_FIELDS = ["name", "photo", "phone", "jobRole", "category", "workStatus"];
const REQUEST_FIELDS = ["title", "category", "description", "priority"];
const regex = (q) => new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

/** The MaintenanceStaff profile that belongs to the logged-in Maintenance Staff user. */
const myStaffProfile = (user) => MaintenanceStaff.findOne({ username: user.username });

/** Put a staff member back to "Available" when they have no open tasks left. */
async function refreshStaffStatus(staffId) {
  if (!staffId) return;
  const open = await MaintenanceRequest.countDocuments({ assignedTo: staffId, status: { $in: ["Assigned", "In Progress"] } });
  const staff = await MaintenanceStaff.findOne({ id: staffId });
  if (!staff || ["Off Duty", "On Leave"].includes(staff.workStatus)) return;
  const next = open ? "Busy" : "Available";
  if (staff.workStatus !== next) { staff.workStatus = next; await staff.save(); }
}

async function staffUser(staff) {
  return staff?.username ? User.findOne({ username: staff.username }, { _id: 1 }) : null;
}

/* ---------------------------- Maintenance staff ---------------------------- */

router.get("/staff", asyncHandler(async (req, res) => {
  const filter = {};
  for (const k of ["category", "workStatus"]) if (req.query[k]) filter[k] = str(req.query[k]);
  if (req.query.q) filter.$or = [{ name: regex(req.query.q) }, { jobRole: regex(req.query.q) }, { phone: regex(req.query.q) }, { id: regex(req.query.q) }];
  const staff = await MaintenanceStaff.find(filter).sort({ category: 1, name: 1 });
  const counts = await MaintenanceRequest.aggregate([
    { $match: { status: { $in: ["Assigned", "In Progress"] } } },
    { $group: { _id: "$assignedTo", n: { $sum: 1 } } },
  ]);
  const open = Object.fromEntries(counts.map((c) => [c._id, c.n]));
  res.json(staff.map((s) => {
    const j = s.toJSON();
    j.openTasks = open[j.id] || 0;
    if (isResident(req.user)) delete j.username;
    return j;
  }));
}));

router.post("/staff", requireRole(ADMIN), asyncHandler(async (req, res) => {
  const data = pick(req.body, STAFF_FIELDS);
  await new MaintenanceStaff(data).validate();
  if (wantsLogin(req.body)) {
    const user = await createLogin({ ...req.body.login, name: data.name, phone: data.phone, role: MAINTENANCE });
    data.username = user.username;
  } else if (req.body.username) {
    const user = await User.findOne({ username: String(req.body.username).toLowerCase(), role: MAINTENANCE });
    if (!user) throw httpError(400, "No Maintenance Staff login with that username");
    data.username = user.username;
  }
  const doc = await createWithId(MaintenanceStaff, data, "maintenance_staff", "MNT-", 3);
  logSaved("maintenance_staff", doc);
  res.status(201).json(doc);
}));

// Admin edits any field; a maintenance member may only change their own work status
router.patch("/staff/:id", requireRole(ADMIN, MAINTENANCE), asyncHandler(async (req, res) => {
  const staff = await MaintenanceStaff.findOne({ id: req.params.id });
  if (!staff) throw httpError(404, "Maintenance staff not found");
  if (!isAdmin(req.user) && staff.username !== req.user.username) throw httpError(403, "You can only update your own status");
  staff.set(pick(req.body, isAdmin(req.user) ? STAFF_FIELDS : ["workStatus"]));
  await staff.save();
  logSaved("maintenance_staff (updated)", staff);
  res.json(staff);
}));

router.delete("/staff/:id", requireRole(ADMIN), asyncHandler(async (req, res) => {
  const open = await MaintenanceRequest.countDocuments({ assignedTo: req.params.id, status: { $in: ["Assigned", "In Progress"] } });
  if (open) throw httpError(409, `This staff member still has ${open} open task(s). Reassign them first.`);
  const doc = await MaintenanceStaff.findOneAndDelete({ id: req.params.id });
  if (!doc) throw httpError(404, "Maintenance staff not found");
  res.json({ deleted: req.params.id });
}));

/* --------------------------- Maintenance requests -------------------------- */

router.get("/requests", requireRole(ADMIN, RESIDENT, MAINTENANCE), asyncHandler(async (req, res) => {
  const filter = {};
  for (const k of ["status", "priority", "category", "assignedTo"]) if (req.query[k]) filter[k] = str(req.query[k]);
  if (isResident(req.user)) {
    // A resident sees their own flat's requests only
    filter.flat = req.user.flat || "__none__";
  } else if (req.user.role === MAINTENANCE) {
    // Maintenance staff see only the tasks assigned to them
    const me = await myStaffProfile(req.user);
    filter.assignedTo = me?.id || "__none__";
  } else if (req.query.flat) filter.flat = str(req.query.flat).toUpperCase();
  if (req.query.q) {
    const q = regex(req.query.q);
    filter.$or = [{ title: q }, { description: q }, { flat: q }, { residentName: q }, { id: q }, { assignedToName: q }];
  }
  res.json(await MaintenanceRequest.find(filter).sort({ createdAt: -1 }));
}));

router.get("/requests/:id", requireRole(ADMIN, RESIDENT, MAINTENANCE), asyncHandler(async (req, res) => {
  const doc = await MaintenanceRequest.findOne({ id: req.params.id });
  if (!doc) throw httpError(404, "Request not found");
  await assertCanSee(req.user, doc);
  res.json(doc);
}));

async function assertCanSee(user, doc) {
  if (isResident(user) && doc.flat !== user.flat) throw httpError(404, "Request not found");
  if (user.role === MAINTENANCE) {
    const me = await myStaffProfile(user);
    if (!me || doc.assignedTo !== me.id) throw httpError(404, "Request not found");
  }
}

// Residents submit for their own flat. Admin can log a request for any flat (e.g. phone call).
router.post("/requests", requireRole(ADMIN, RESIDENT), asyncHandler(async (req, res) => {
  const data = pick(req.body, REQUEST_FIELDS);
  if (isResident(req.user)) {
    if (!req.user.flat) throw httpError(400, "Your account has no flat number. Ask the admin to update it.");
    data.flat = req.user.flat;
    data.residentName = req.user.name;
    data.residentUsername = req.user.username;
    data.residentPhone = str(req.body.residentPhone) || req.user.phone;
  } else {
    data.flat = str(req.body.flat);
    data.residentName = str(req.body.residentName);
    data.residentPhone = str(req.body.residentPhone);
    if (data.flat && !data.residentName) {
      const found = await Resident.findOne({ flat: data.flat.trim().toUpperCase() });
      if (found) { data.residentName = found.name; data.residentPhone ||= found.mobile; }
    }
  }
  data.history = [{ status: "Pending", note: "Request submitted", by: req.user.name }];
  const doc = await createWithId(MaintenanceRequest, data, "maintenance_request", "MR-", 3);
  logSaved("maintenance_requests", doc);

  await notifyResident({ username: doc.residentUsername, flat: doc.flat }, {
    type: "Maintenance", title: "Maintenance request submitted",
    message: `Your ${doc.category.toLowerCase()} request "${doc.title}" (${doc.id}) has been received.`,
    link: "/maintenance", refId: doc.id, createdBy: req.user.name,
  });
  const admins = await User.find({ role: ADMIN, _id: { $ne: req.user._id } }, { _id: 1 });
  await notifyUsers(admins, {
    type: "Maintenance", title: `New ${doc.priority.toLowerCase()} priority request`,
    message: `${doc.residentName} (${doc.flat}) reported: ${doc.title}. Assign a team member.`,
    link: "/maintenance", refId: doc.id, createdBy: req.user.name,
  });
  res.status(201).json(doc);
}));

// Edit details: Admin any time, the resident only while it is still Pending.
router.patch("/requests/:id", requireRole(ADMIN, RESIDENT), asyncHandler(async (req, res) => {
  const doc = await MaintenanceRequest.findOne({ id: req.params.id });
  if (!doc) throw httpError(404, "Request not found");
  await assertCanSee(req.user, doc);
  if (isResident(req.user) && doc.status !== "Pending") throw httpError(409, "This request is already being handled and can no longer be edited");
  doc.set(pick(req.body, REQUEST_FIELDS));
  await doc.save();
  res.json(doc);
}));

// PATCH /requests/:id/assign  { staffId: "MNT-002", note? }   (Admin)
router.patch("/requests/:id/assign", requireRole(ADMIN), asyncHandler(async (req, res) => {
  const doc = await MaintenanceRequest.findOne({ id: req.params.id });
  if (!doc) throw httpError(404, "Request not found");
  if (doc.status === "Completed") throw httpError(409, "This request is already completed");
  const staff = await MaintenanceStaff.findOne({ id: str(req.body.staffId) });
  if (!staff) throw httpError(400, "Pick a maintenance staff member to assign");
  if (staff.workStatus === "On Leave") throw httpError(409, `${staff.name} is on leave`);

  const previous = doc.assignedTo;
  doc.assignedTo = staff.id;
  doc.assignedToName = staff.name;
  doc.assignedAt = new Date();
  if (doc.status === "Pending") doc.status = "Assigned";
  doc.history.push({ status: doc.status, note: `Assigned to ${staff.name}${req.body.note ? ` – ${String(req.body.note).trim()}` : ""}`, by: req.user.name });
  await doc.save();
  logSaved("maintenance_requests (assigned)", doc);
  await Promise.all([refreshStaffStatus(staff.id), previous !== staff.id && refreshStaffStatus(previous)]);

  await notifyResident({ username: doc.residentUsername, flat: doc.flat }, {
    type: "Maintenance", title: "Maintenance request assigned",
    message: `${staff.name} (${staff.jobRole}) has been assigned to "${doc.title}" (${doc.id}).`,
    link: "/maintenance", refId: doc.id, createdBy: req.user.name,
  });
  const worker = await staffUser(staff);
  if (worker) {
    await notifyUsers([worker], {
      type: "Maintenance", title: `New task: ${doc.title}`,
      message: `${doc.priority} priority · Flat ${doc.flat} · ${doc.residentName}. ${doc.description}`.slice(0, 300),
      link: "/maintenance", refId: doc.id, createdBy: req.user.name,
    });
  }
  res.json(doc);
}));

// PATCH /requests/:id/status  { status, note? }
// Admin: any status. Maintenance Staff: only their own tasks, and only "In Progress" / "Completed".
router.patch("/requests/:id/status", requireRole(ADMIN, MAINTENANCE), asyncHandler(async (req, res) => {
  const doc = await MaintenanceRequest.findOne({ id: req.params.id });
  if (!doc) throw httpError(404, "Request not found");
  await assertCanSee(req.user, doc);
  const status = str(req.body.status);
  if (!REQUEST_STATUSES.includes(status)) throw httpError(400, `Status must be one of: ${REQUEST_STATUSES.join(", ")}`);
  if (!isAdmin(req.user) && !["In Progress", "Completed"].includes(status)) throw httpError(403, "You can mark tasks In Progress or Completed only");
  if (["Assigned", "In Progress", "Completed"].includes(status) && !doc.assignedTo) throw httpError(409, "Assign a staff member first");
  const progressNote = String(req.body.note || "").trim();
  if (status === doc.status) {
    // Same status + a note = a progress update (e.g. "waiting for spare part")
    if (!progressNote || status === "Completed") throw httpError(409, `Request is already ${status}`);
    doc.history.push({ status, note: progressNote, by: req.user.name });
    await doc.save();
    await notifyResident({ username: doc.residentUsername, flat: doc.flat }, {
      type: "Maintenance", title: "Maintenance progress update",
      message: `"${doc.title}" (${doc.id}): ${progressNote}`.slice(0, 300),
      link: "/maintenance", refId: doc.id, createdBy: req.user.name,
    });
    return res.json(doc);
  }

  doc.status = status;
  doc.completedAt = status === "Completed" ? new Date() : undefined;
  const note = String(req.body.note || "").trim();
  doc.history.push({ status, note: note || `Status changed to ${status}`, by: req.user.name });
  await doc.save();
  logSaved("maintenance_requests (status)", doc);
  await refreshStaffStatus(doc.assignedTo);

  const done = status === "Completed";
  await notifyResident({ username: doc.residentUsername, flat: doc.flat }, {
    type: "Maintenance",
    title: done ? "Maintenance request completed ✅" : `Maintenance request ${status.toLowerCase()}`,
    message: done
      ? `"${doc.title}" (${doc.id}) was completed by ${doc.assignedToName || "the maintenance team"}.${note ? ` Note: ${note}` : ""}`
      : `"${doc.title}" (${doc.id}) is now ${status}.${note ? ` Note: ${note}` : ""}`,
    link: "/maintenance", refId: doc.id, createdBy: req.user.name,
  });
  if (!isAdmin(req.user)) {
    await notifyRoles([ADMIN], {
      type: "Maintenance", title: `${doc.id} ${status.toLowerCase()}`,
      message: `${req.user.name} marked "${doc.title}" (${doc.flat}) as ${status}.`,
      link: "/maintenance", refId: doc.id, createdBy: req.user.name,
    });
  }
  res.json(doc);
}));

// Admin deletes; a resident may cancel their own request while it is still Pending.
router.delete("/requests/:id", requireRole(ADMIN, RESIDENT), asyncHandler(async (req, res) => {
  const doc = await MaintenanceRequest.findOne({ id: req.params.id });
  if (!doc) throw httpError(404, "Request not found");
  await assertCanSee(req.user, doc);
  if (isResident(req.user) && doc.status !== "Pending") throw httpError(409, "Only pending requests can be cancelled");
  await doc.deleteOne();
  await refreshStaffStatus(doc.assignedTo);
  res.json({ deleted: req.params.id });
}));

router.get("/summary", asyncHandler(async (req, res) => {
  let scope = {};
  if (isResident(req.user)) scope = { flat: req.user.flat || "__none__" };
  if (req.user.role === MAINTENANCE) scope = { assignedTo: (await myStaffProfile(req.user))?.id || "__none__" };
  const rows = await MaintenanceRequest.aggregate([{ $match: scope }, { $group: { _id: "$status", n: { $sum: 1 } } }]);
  const byStatus = Object.fromEntries(REQUEST_STATUSES.map((s) => [s, 0]));
  for (const r of rows) byStatus[r._id] = r.n;
  const [staff, available, highOpen] = await Promise.all([
    MaintenanceStaff.countDocuments(),
    MaintenanceStaff.countDocuments({ workStatus: "Available" }),
    MaintenanceRequest.countDocuments({ ...scope, priority: "High", status: { $ne: "Completed" } }),
  ]);
  res.json({ byStatus, open: byStatus.Pending + byStatus.Assigned + byStatus["In Progress"], highOpen, staff, availableStaff: available });
}));

export default router;
