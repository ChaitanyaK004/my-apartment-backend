import bcrypt from "bcryptjs";
import User, { ROLES } from "../models/User.js";
import { httpError } from "../middleware/errors.js";

/**
 * Create a login account (used when Admin adds a resident / guard / maintenance member
 * and ticks "create login"). Returns the saved user. Passwords are stored only as bcrypt hashes.
 */
export async function createLogin({ username, password, email, name, role, flat, phone }) {
  const cleanUsername = String(username || "").trim().toLowerCase();
  const cleanEmail = String(email || "").trim().toLowerCase() || `${cleanUsername}@myapartment.local`;
  if (!/^[a-z0-9._-]{3,30}$/.test(cleanUsername)) throw httpError(400, "Username must be 3-30 letters, numbers, dots, dashes or underscores");
  if (String(password || "").length < 8) throw httpError(400, "Password must be at least 8 characters");
  if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) throw httpError(400, "Enter a valid email for the login account");
  if (!ROLES.includes(role)) throw httpError(400, "Invalid role");
  if (await User.exists({ $or: [{ username: cleanUsername }, { email: cleanEmail }] })) {
    throw httpError(409, "That username or email already has a login account");
  }
  return User.create({
    username: cleanUsername, email: cleanEmail, name, role, flat, phone,
    passwordHash: await bcrypt.hash(String(password), 10),
  });
}

/** True when the request body asks for a login to be created alongside a profile. */
export const wantsLogin = (body) => Boolean(body?.login?.username || body?.login?.password);
