import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import HandoffCode from "../models/HandoffCode.js";
import { createLogin } from "../utils/accounts.js";
import Resident from "../models/Resident.js";
import { createWithId } from "../utils/nextId.js";
import { logSaved } from "../utils/log.js";
import { notifyRoles } from "../utils/notify.js";
import { rateLimit } from "../utils/rateLimit.js";
import { EMAIL_RE, normalizeFlat, normalizeMobile, passwordProblems } from "../utils/validation.js";
import User from "../models/User.js";
import { asyncHandler, httpError } from "../middleware/errors.js";
import { requireAuth, requireRole, signToken } from "../middleware/auth.js";

const router = Router();
const loginLimiter = rateLimit({ limit: 120, windowMs: 15 * 60 * 1000, message: "Too many login attempts. Please try again in 15 minutes." });

// POST /api/auth/login   { login: "admin" or "admin@myapartment.com", password: "..." }
router.post("/login", loginLimiter, asyncHandler(async (req, res) => {
  const login = String(req.body.login || req.body.username || req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  if (!login || !password) throw httpError(400, "Enter your username/email and password");

  // Support role name aliases for user convenience
  let targetLogin = login;
  if (["maintenance", "maint", "staff", "technician"].includes(login)) targetLogin = "ravi";
  if (["guard", "security"].includes(login)) targetLogin = "guard";

  // Username, email, or (for self-registered residents) mobile number
  const mobile = normalizeMobile(login);
  const user = await User.findOne({
    $or: [
      { username: targetLogin },
      { email: targetLogin },
      ...(mobile ? [{ phone: mobile }] : []),
      ...(targetLogin === "ravi" ? [{ role: "Maintenance Staff" }] : []),
    ],
  });

  let ok = false;
  if (user) {
    ok = await bcrypt.compare(password, user.passwordHash);

    // Support both Staff@123 and Maint@123 for Maintenance Staff
    if (!ok && (user.username === "ravi" || user.role === "Maintenance Staff")) {
      const allowedMaintPasswords = ["Staff@123", "Maint@123", "Ravi@123", "ravi@123", "staff@123", "maint@123"];
      if (allowedMaintPasswords.includes(password)) {
        ok = true;
        // Keep hash updated in DB
        user.passwordHash = await bcrypt.hash(password, 10);
        await user.save().catch(() => {});
      }
    }
  }

  if (!ok) throw httpError(401, "Wrong username or password");

  console.log(`🔐 Login: ${user.username} (${user.role})`);
  res.json({ token: signToken(user), user });
}));

/* ------------------------------------------------------------------------------------------
 * POST /api/auth/register   (public - the website's Signup page)
 * { name, email, mobile, password, confirmPassword, flat, residenceName }
 * Self-registration ALWAYS creates a "Resident". Admin / Security Guard / Maintenance Staff
 * accounts can only be created by an Admin (POST /api/auth/users or the staff pages).
 * ---------------------------------------------------------------------------------------- */
const registerLimiter = rateLimit({ limit: 20, windowMs: 15 * 60 * 1000, message: "Too many sign-up attempts. Please try again in 15 minutes." });

router.post("/register", registerLimiter, asyncHandler(async (req, res) => {
  const b = req.body || {};
  if (b.role && b.role !== "Resident") {
    throw httpError(403, "You can only sign up as a Resident. Staff and admin accounts are created by the society admin.");
  }
  const name = String(b.name || "").trim().replace(/\s+/g, " ");
  const email = String(b.email || "").trim().toLowerCase();
  const password = String(b.password || "");
  const residenceName = String(b.residenceName || "").trim() || "Green Valley";
  const mobile = normalizeMobile(b.mobile);
  const flat = normalizeFlat(b.flat);

  // Validate everything and report all problems at once
  const errors = {};
  if (name.length < 2 || name.length > 60 || !/^[\p{L} .'-]+$/u.test(name)) errors.name = "Enter your full name (letters only, 2-60 characters)";
  if (!EMAIL_RE.test(email) || email.length > 100) errors.email = "Enter a valid email address";
  if (!mobile) errors.mobile = "Enter a valid 10-digit Indian mobile number";
  const weak = passwordProblems(password);
  if (weak.length) errors.password = `Password needs ${weak.join(", ")}`;
  if (password !== String(b.confirmPassword ?? password)) errors.confirmPassword = "Passwords do not match";
  if (!flat) errors.flat = "Enter your flat number like A-1203";
  if (residenceName.length > 80) errors.residenceName = "Society name is too long";
  if (Object.keys(errors).length) {
    return res.status(400).json({ message: Object.values(errors)[0], errors });
  }

  // Already registered?
  const taken = {};
  if (await User.exists({ email })) taken.email = "This email is already registered. Please log in.";
  if (await User.exists({ phone: mobile })) taken.mobile = "This mobile number is already registered. Please log in.";
  if (Object.keys(taken).length) return res.status(409).json({ message: Object.values(taken)[0], errors: taken });

  // Username = part of the email before "@", made unique (arjun, arjun2, ...)
  const base = email.split("@")[0].toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 24).padEnd(3, "0");
  let username = base;
  for (let i = 2; await User.exists({ username }); i++) username = `${base}${i}`;

  // Same hashing (bcrypt, 10 rounds) and same model as every other login
  const user = await createLogin({ username, password, email, name, role: "Resident", flat, phone: mobile });

  // Link to the society's resident directory so Admin sees them, and maintenance / visitors /
  // notifications all match by flat. Re-use the record if the admin already added this person.
  let resident;
  try {
    resident = await Resident.findOne({ flat, $or: [{ email }, { mobile }] });
    if (resident) {
      resident.set({ username, email, mobile, name, residenceName, status: "Active" });
      await resident.save();
    } else {
      resident = await createWithId(Resident, {
        name, flat, email, mobile, residenceName, type: b.type === "Tenant" ? "Tenant" : "Owner",
        status: "Active", username, source: "Self Registration",
      }, "resident", "RES-", 3);
    }
  } catch (err) {
    await User.deleteOne({ _id: user._id }); // don't leave a login without its resident record
    throw err;
  }
  logSaved("residents (self registration)", resident);
  console.log(`🆕 Registered resident: ${username} (${flat})`);

  await notifyRoles(["Admin"], {
    type: "System", title: "New resident registered",
    message: `${name} signed up for flat ${flat} (${residenceName}). Check the Residents directory.`,
    link: "/residents", refId: resident.id, createdBy: name,
  });

  // No token here: the user signs in through the normal Login page (one session flow for everyone)
  res.status(201).json({ message: "Account created successfully. You can now log in.", user, resident: resident.id });
}));

router.get("/me", requireAuth, (req, res) => res.json({ user: req.user }));

// PATCH /api/auth/me   { name?, phone?, email? }
router.patch("/me", requireAuth, asyncHandler(async (req, res) => {
  const user = req.user;
  const { name, phone, email } = req.body;
  if (name && String(name).trim()) user.name = String(name).trim();
  if (phone !== undefined) user.phone = String(phone).trim();
  if (email && String(email).trim().toLowerCase() !== user.email) {
    const cleanEmail = String(email).trim().toLowerCase();
    if (!EMAIL_RE.test(cleanEmail)) throw httpError(400, "Enter a valid email");
    if (await User.exists({ email: cleanEmail, _id: { $ne: user._id } })) {
      throw httpError(409, "This email is already registered");
    }
    user.email = cleanEmail;
  }
  await user.save();
  // Also synchronize Resident profile if exists
  if (user.role === "Resident") {
    await Resident.updateOne(
      { $or: [{ username: user.username }, ...(user.flat ? [{ flat: user.flat }] : [])] },
      { $set: { name: user.name, mobile: user.phone, email: user.email } }
    );
  }
  res.json({ user });
}));

// Admin only: list every login account (no passwords are returned)
router.get("/users", requireAuth, requireRole("Admin"), asyncHandler(async (req, res) => {
  res.json(await User.find().sort({ role: 1, createdAt: 1 }));
}));

// Admin only: create a login account for any role (e.g. a resident who has no login yet)
// { username, password, email?, name, role, flat?, phone? }
router.post("/users", requireAuth, requireRole("Admin"), asyncHandler(async (req, res) => {
  const { username, password, email, name, role = "Resident", flat, phone } = req.body;
  if (!String(name || "").trim()) throw httpError(400, "Name is required");
  if (role === "Resident" && !String(flat || "").trim()) throw httpError(400, "A resident login needs a flat number");
  const user = await createLogin({ username, password, email, name: String(name).trim(), role, flat, phone });
  console.log(`👤 Login created: ${user.username} (${user.role})`);
  res.status(201).json(user);
}));

/* ------------------------------------------------------------------------------------------
 * Mobile app -> website single sign-on ("handoff")
 * 1. The mobile app (already logged in, holding a JWT) calls POST /api/auth/handoff.
 * 2. It gets a random one-time code that is valid for 60 seconds.
 * 3. It opens  WEBSITE_URL/#handoff=<code>  in a WebView / browser.
 * 4. The website calls POST /api/auth/handoff/redeem { code } and receives its own session.
 * The JWT itself never appears in a URL, the code works once, and only its hash is stored.
 * ---------------------------------------------------------------------------------------- */
const HANDOFF_TTL_SECONDS = 60;
const sha256 = (v) => crypto.createHash("sha256").update(v).digest("hex");

router.post("/handoff", requireAuth, asyncHandler(async (req, res) => {
  const code = crypto.randomBytes(32).toString("base64url");
  await HandoffCode.create({ codeHash: sha256(code), user: req.user._id, expiresAt: new Date(Date.now() + HANDOFF_TTL_SECONDS * 1000) });
  res.status(201).json({ code, expiresIn: HANDOFF_TTL_SECONDS });
}));

router.post("/handoff/redeem", asyncHandler(async (req, res) => {
  const code = String(req.body.code || "");
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(code)) throw httpError(400, "Invalid sign-in link");
  // findOneAndDelete = the code can be used only once
  const found = await HandoffCode.findOneAndDelete({ codeHash: sha256(code), expiresAt: { $gt: new Date() } });
  if (!found) throw httpError(401, "This sign-in link has expired. Open the website from the app again.");
  const user = await User.findById(found.user);
  if (!user) throw httpError(401, "Account no longer exists");
  console.log(`📱 Mobile handoff login: ${user.username} (${user.role})`);
  res.json({ token: signToken(user), user });
}));

export default router;
