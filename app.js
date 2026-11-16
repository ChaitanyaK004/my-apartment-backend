import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import fs from "fs";
import { requestLogger, errorHandler } from "./middleware/errors.js";
import residents from "./routes/residents.js";
import complaints from "./routes/complaints.js";
import visitors from "./routes/visitors.js";
import notices from "./routes/notices.js";
import parking from "./routes/parking.js";
import auth from "./routes/auth.js";
import security from "./routes/security.js";
import maintenance from "./routes/maintenance.js";
import notifications from "./routes/notifications.js";
import payments from "./routes/payments.js";
import facilities from "./routes/facilities.js";
import community from "./routes/community.js";
import { requireAuth } from "./middleware/auth.js";

const app = express();
app.set("trust proxy", 1);

const allowed = (process.env.CLIENT_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      // 1. Mobile apps, Postman, curl, and native non-browser clients have no origin header
      if (!origin) return cb(null, true);

      // 2. Mobile app wrappers (Capacitor, Ionic, Android/iOS webview) and local loopback
      if (
        origin.startsWith("capacitor://") ||
        origin.startsWith("ionic://") ||
        origin.startsWith("http://localhost") ||
        origin.startsWith("https://localhost") ||
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
      ) {
        return cb(null, true);
      }

      // 3. Local/private network IPs (phones, tablets, PCs on same Wi-Fi)
      if (
        /^https?:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$/.test(
          origin
        )
      ) {
        return cb(null, true);
      }

      // 4. Configured explicit origins
      if (allowed.includes(origin) || allowed.includes("*")) {
        return cb(null, true);
      }

      // 5. Fallback in development
      if (process.env.NODE_ENV !== "production") {
        return cb(null, true);
      }

      return cb(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" })); // staff photos are sent as small data URLs
app.use(requestLogger);

// Convenience alias: automatically prefix /api if omitted by client (e.g. /auth/login -> /api/auth/login)
app.use((req, res, next) => {
  if (
    !req.url.startsWith("/api") &&
    !req.url.startsWith("/download") &&
    req.url !== "/" &&
    req.url !== "/favicon.ico"
  ) {
    req.url = `/api${req.url}`;
  }
  next();
});

app.get("/", (req, res) => res.json({ app: "My Apartment API", docs: "See backend/README.md", health: "/api/health" }));
app.get("/api/health", (req, res) => {
  const states = ["disconnected", "connected", "connecting", "disconnecting"];
  res.json({
    ok: true,
    service: "My Apartment API",
    version: "2.0.0",
    database: mongoose.connection.name || null,
    db: states[mongoose.connection.readyState],
    timestamp: new Date().toISOString(),
  });
});

const apkCandidates = [
  "C:\\Users\\ASUS\\OneDrive\\Desktop\\MyApartment.apk",
  "C:\\Users\\ASUS\\OneDrive\\Desktop\\Chaitanya\\Mini Project\\My-Apartment-with-backend (1)\\smart-society\\frontend\\android\\app\\build\\outputs\\apk\\debug\\app-debug.apk",
  "D:\\New folder\\My-Apartment-upgraded-v2\\My-Apartment-with-backend\\smart-society\\frontend\\android\\app\\build\\outputs\\apk\\debug\\app-debug.apk",
];

app.get("/download", (req, res) => {
  const found = apkCandidates.find((p) => fs.existsSync(p));
  if (found) {
    res.download(found, "MyApartment.apk");
  } else {
    res.status(404).send("APK file not found on server.");
  }
});

app.use("/api/auth", auth); // login + handoff are public, the rest checks the token itself
// Everything below needs a logged-in user. Each router then checks the role.
app.use("/api/residents", requireAuth, residents);
app.use("/api/complaints", requireAuth, complaints);
app.use("/api/visitors", requireAuth, visitors);
app.use("/api/notices", requireAuth, notices);
app.use("/api/parking", requireAuth, parking);
app.use("/api/security", requireAuth, security);
app.use("/api/maintenance", requireAuth, maintenance);
app.use("/api/notifications", requireAuth, notifications);
app.use("/api/payments", requireAuth, payments);
app.use("/api/facilities", requireAuth, facilities);
app.use("/api/community", requireAuth, community);

app.use((req, res) => res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` }));
app.use(errorHandler);

export default app;
