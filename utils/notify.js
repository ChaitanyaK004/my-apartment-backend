import { EventEmitter } from "node:events";
import Notification from "../models/Notification.js";
import User from "../models/User.js";

// In-process event bus: every open /api/notifications/stream connection listens for its own user id.
// (Single server process - matches the existing architecture. See README for scaling notes.)
export const bus = new EventEmitter();
bus.setMaxListeners(0);

const ids = (users) => [...new Set(users.map((u) => String(u._id || u)))];

/**
 * Save one notification per recipient and push it live to anyone connected.
 * Never throws: a failed notification must not undo the action that triggered it.
 */
export async function notifyUsers(users, { type = "System", title, message, link, refId, createdBy, isEmergency = false, location = "" }) {
  try {
    const recipients = ids(users);
    if (!recipients.length) return [];
    const isEmerg = Boolean(isEmergency || type === "Emergency");
    const docs = await Notification.insertMany(
      recipients.map((recipient) => ({
        recipient,
        type,
        title,
        message,
        link,
        refId,
        createdBy,
        isEmergency: isEmerg,
        location: location || "",
      }))
    );
    for (const doc of docs) bus.emit(`user:${doc.recipient}`, doc.toJSON());
    console.log(`🔔 Notification "${title}" → ${docs.length} user(s) (isEmergency: ${isEmerg})`);
    return docs;
  } catch (err) {
    console.error("⚠️  Could not create notification:", err.message);
    return [];
  }
}

export const usersWithRole = (...roles) => User.find({ role: { $in: roles } }, { _id: 1 });

/** Notify every user in the entire society (Admin, Guard, Resident, Maintenance). */
export async function notifyAllUsers(data) {
  const users = await User.find({}, { _id: 1 });
  return notifyUsers(users, data);
}

/** Residents (login accounts) living in a flat. */
export async function notifyFlat(flat, data) {
  if (!flat) return [];
  const users = await User.find({ role: "Resident", flat: String(flat).trim().toUpperCase() }, { _id: 1 });
  return notifyUsers(users, data);
}

export async function notifyRoles(roles, data) {
  return notifyUsers(await usersWithRole(...roles), data);
}

/** Notify a resident by username (preferred) and fall back to the flat. */
export async function notifyResident({ username, flat }, data) {
  if (username) {
    const user = await User.findOne({ username }, { _id: 1, role: 1 });
    if (user) return notifyUsers([user], data);
  }
  return notifyFlat(flat, data);
}
