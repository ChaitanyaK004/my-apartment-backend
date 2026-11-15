import { Router } from "express";
import Resident from "../models/Resident.js";
import { createWithId } from "../utils/nextId.js";
import { asyncHandler, httpError } from "../middleware/errors.js";
import { logSaved } from "../utils/log.js";
import { pick, str } from "../utils/format.js";
import { requireRole, ADMIN, GUARD } from "../middleware/auth.js";
import { createLogin, wantsLogin } from "../utils/accounts.js";

const router = Router();
const FIELDS = ["name", "flat", "residenceName", "wing", "mobile", "email", "type", "status", "moveInDate", "username"];

// The resident directory is for the society admin
router.get("/", requireRole(ADMIN), asyncHandler(async (req, res) => {
  const filter = {};
  for (const k of ["flat", "type", "status", "wing"]) if (req.query[k]) filter[k] = str(req.query[k]);
  res.json(await Resident.find(filter).sort({ createdAt: -1 }));
}));

router.post("/", requireRole(ADMIN), asyncHandler(async (req, res) => {
  const data = pick(req.body, FIELDS);
  const probe = new Resident(data);
  await probe.validate();
  // Optional: also create the resident's login so they receive notifications
  let login;
  if (wantsLogin(req.body)) {
    login = await createLogin({ ...req.body.login, email: req.body.login.email || data.email, name: probe.name, flat: probe.flat, phone: probe.mobile, role: "Resident" });
    data.username = login.username;
  }
  const doc = await createWithId(Resident, data, "resident", "RES-", 3);
  logSaved("residents", doc);
  res.status(201).json(login ? { ...doc.toJSON(), username: login.username } : doc);
}));

router.patch("/:id", requireRole(ADMIN), asyncHandler(async (req, res) => {
  const doc = await Resident.findOneAndUpdate({ id: req.params.id }, { $set: pick(req.body, FIELDS) }, { new: true, runValidators: true });
  if (!doc) throw httpError(404, "Resident not found");
  logSaved("residents (updated)", doc);
  res.json(doc);
}));

router.delete("/:id", requireRole(ADMIN), asyncHandler(async (req, res) => {
  const doc = await Resident.findOneAndDelete({ id: req.params.id });
  if (!doc) throw httpError(404, "Resident not found");
  res.json({ deleted: req.params.id });
}));

export default router;
