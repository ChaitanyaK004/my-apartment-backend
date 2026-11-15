import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { asyncHandler, httpError } from "./errors.js";

export const jwtSecret = () => process.env.JWT_SECRET || "dev-only-secret-change-me";

export const signToken = (user) =>
  jwt.sign({ id: user._id.toString(), role: user.role }, jwtSecret(), { expiresIn: "7d" });

export const requireAuth = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) throw httpError(401, "Please log in first");
  let payload;
  try {
    payload = jwt.verify(token, jwtSecret());
  } catch {
    throw httpError(401, "Session expired. Please log in again");
  }
  const user = await User.findById(payload.id);
  if (!user) throw httpError(401, "Account no longer exists");
  req.user = user;
  next();
});

export const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user?.role)) return next(httpError(403, "You do not have permission for this"));
  next();
};

// Shorthand role groups used by the routes
export const ADMIN = "Admin";
export const RESIDENT = "Resident";
export const GUARD = "Security Guard";
export const MAINTENANCE = "Maintenance Staff";
export const isAdmin = (user) => user?.role === ADMIN;
export const isResident = (user) => user?.role === RESIDENT;
