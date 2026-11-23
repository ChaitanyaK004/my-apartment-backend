import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { requestLogger, errorHandler } from "./middleware/errors.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
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
import { responseCache } from "./middleware/cache.js";

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

      // 4. Cloud deployment origins (Render, Vercel, Netlify)
      if (
        origin.endsWith(".onrender.com") ||
        origin.endsWith(".vercel.app") ||
        origin.endsWith(".netlify.app")
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
    !req.url.startsWith("/assets") &&
    !req.url.includes(".") &&
    req.url !== "/" &&
    req.url !== "/favicon.ico"
  ) {
    if (!fs.existsSync(frontendDist)) {
      req.url = `/api${req.url}`;
    }
  }
  next();
});

app.get("/", (req, res) => {
  if (fs.existsSync(frontendDist)) {
    return res.sendFile(path.join(frontendDist, "index.html"));
  }
  res.json({ app: "My Apartment API", docs: "See backend/README.md", health: "/api/health" });
});
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
  path.join(__dirname, "downloads", "MyApartment.apk"),
  path.join(process.cwd(), "downloads", "MyApartment.apk"),
  path.join(__dirname, "MyApartment.apk"),
  "C:\\Users\\ASUS\\OneDrive\\Desktop\\MyApartment.apk",
  "C:\\Users\\ASUS\\OneDrive\\Desktop\\Chaitanya\\Mini Project\\My-Apartment-with-backend (1)\\smart-society\\frontend\\android\\app\\build\\outputs\\apk\\debug\\app-debug.apk",
  "D:\\New folder\\My-Apartment-upgraded-v2\\My-Apartment-with-backend\\smart-society\\frontend\\android\\app\\build\\outputs\\apk\\debug\\app-debug.apk",
];

app.get("/download/apk", (req, res) => {
  const found = apkCandidates.find((p) => fs.existsSync(p));
  if (found) {
    return res.download(found, "MyApartment.apk");
  }
  res.status(404).send("APK file not found on server. Please build the APK first.");
});

app.get("/download", (req, res) => {
  const found = apkCandidates.find((p) => fs.existsSync(p));
  if (req.query.direct === "1" || req.headers.accept?.includes("application/octet-stream")) {
    if (found) return res.download(found, "MyApartment.apk");
    return res.status(404).send("APK file not found on server.");
  }

  const stat = found ? fs.statSync(found) : null;
  const sizeMb = stat ? (stat.size / (1024 * 1024)).toFixed(1) : "21.0";

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Download My Apartment App</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: radial-gradient(circle at top, #0f233d 0%, #070c18 100%);
      color: #f1f5f9;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .card {
      background: rgba(17, 29, 51, 0.85);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(56, 189, 248, 0.25);
      border-radius: 24px;
      padding: 36px 28px;
      max-width: 440px;
      width: 100%;
      text-align: center;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6);
    }
    .icon-box {
      width: 80px;
      height: 80px;
      margin: 0 auto 18px;
      border-radius: 20px;
      background: linear-gradient(135deg, #0284c7, #6366f1);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 38px;
      box-shadow: 0 0 25px rgba(99, 102, 241, 0.45);
    }
    h1 {
      font-size: 26px;
      font-weight: 800;
      color: #fff;
      margin-bottom: 6px;
      letter-spacing: -0.5px;
    }
    .subtitle {
      color: #38bdf8;
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 16px;
    }
    .description {
      color: #94a3b8;
      font-size: 14px;
      line-height: 1.5;
      margin-bottom: 24px;
    }
    .download-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      width: 100%;
      padding: 16px;
      background: linear-gradient(135deg, #0284c7 0%, #0ea5e9 100%);
      border: none;
      border-radius: 14px;
      color: #fff;
      font-size: 16px;
      font-weight: 800;
      text-decoration: none;
      box-shadow: 0 0 25px rgba(14, 165, 233, 0.45);
      transition: all 0.2s ease;
      cursor: pointer;
    }
    .download-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 0 35px rgba(14, 165, 233, 0.65);
    }
    .meta {
      display: flex;
      justify-content: space-around;
      margin-top: 24px;
      padding-top: 20px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      font-size: 12px;
      color: #64748b;
    }
    .meta strong {
      display: block;
      color: #cbd5e1;
      font-size: 13px;
      margin-top: 3px;
    }
    .desktop-path {
      margin-top: 20px;
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 10px;
      padding: 10px;
      font-size: 11px;
      color: #94a3b8;
      word-break: break-all;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon-box">🏢</div>
    <h1>My Apartment</h1>
    <div class="subtitle">Smart Society Management System</div>
    <p class="description">
      Download the official Android application (.apk) to manage your society, residents, maintenance dues, visitors, and security.
    </p>
    <a class="download-btn" href="/download/apk">
      <span>⬇️</span> Download Android APK
    </a>
    <div class="meta">
      <div>Package<strong>MyApartment.apk</strong></div>
      <div>Size<strong>${sizeMb} MB</strong></div>
      <div>Platform<strong>Android 8.0+</strong></div>
    </div>
    <div class="desktop-path">
      💻 Desktop location: <b>C:\\Users\\ASUS\\OneDrive\\Desktop\\MyApartment.apk</b>
    </div>
  </div>
</body>
</html>`);
});

app.use("/api", responseCache(3000));

app.use("/api/auth", auth); // login + handoff are public, the rest checks the token itself
// Everything below needs a logged-in user. Each router then checks the role.
app.use("/api/residents", requireAuth, residents);
app.use("/api/complaints", requireAuth, complaints);
app.use("/api/visitors", requireAuth, visitors);
app.use("/api/notices", requireAuth, notices);
app.use("/api/parking", requireAuth, parking);
app.use("/api/security", requireAuth, security);
app.use("/api/incidents", requireAuth, (req, res, next) => {
  req.url = req.url === "/" ? "/incidents" : `/incidents${req.url}`;
  return security(req, res, next);
});
app.use("/api/maintenance", requireAuth, maintenance);
app.use("/api/notifications", requireAuth, notifications);
app.use("/api/payments", requireAuth, payments);
app.use("/api/facilities", requireAuth, facilities);
app.use("/api/community", requireAuth, community);

// Serve frontend static files if built
const frontendDist = path.join(__dirname, "../frontend/dist");
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/download")) return next();
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

app.use((req, res) => res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` }));
app.use(errorHandler);

export default app;
