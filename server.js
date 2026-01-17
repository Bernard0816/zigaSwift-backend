// server.js (FULL — copy/paste)
require("dotenv").config();

const express = require("express");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const cors = require("cors");
const { z } = require("zod");
const sqlite3 = require("sqlite3").verbose();
const nodemailer = require("nodemailer");
const path = require("path");
const fs = require("fs");

const app = express();

// 🔒 TRUST PROXY (REQUIRED FOR RENDER)
app.set("trust proxy", 1);

// 🌐 ENV
const PORT = process.env.PORT || 10000;
const SITE_URL = process.env.SITE_URL || `http://localhost:${PORT}`;

// 🛡️ SECURITY
app.use(helmet());
app.use(express.json({ limit: "200kb" }));

// 🌍 CORS
const corsOptions = {
origin: [
"https://bernard0816.github.io",
"https://bernard0816.github.io/ZigaSwift",
"https://bernard0816.github.io/ZigaSwift/",
// allow both backends (you have -backend and -backend-1)
"https://zigaswift-backend.onrender.com",
"https://zigaswift-backend-1.onrender.com",
],
methods: ["GET", "POST", "OPTIONS"],
allowedHeaders: ["Content-Type", "x-admin-key"],
optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

// 🚦 RATE LIMIT
const limiter = rateLimit({
windowMs: 15 * 60 * 1000,
max: 100,
standardHeaders: true,
legacyHeaders: false,
});
app.use(limiter);

// 🗄️ DATABASE
const dataDir = path.join(__dirname, "data");
const dbPath = path.join(dataDir, "zigaswift.db");

if (!fs.existsSync(dataDir)) {
fs.mkdirSync(dataDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath, (err) => {
if (err) {
console.error("❌ Failed to open database:", err.message);
} else {
console.log("✅ SQLite database connected at:", dbPath);
}
});

// Create tables
db.run(`
CREATE TABLE IF NOT EXISTS waitlist (
id INTEGER PRIMARY KEY AUTOINCREMENT,
name TEXT,
email TEXT,
city TEXT,
created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
`);

db.run(`
CREATE TABLE IF NOT EXISTS couriers (
id INTEGER PRIMARY KEY AUTOINCREMENT,
name TEXT,
email TEXT,
route TEXT,
created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
`);

// ✉️ EMAIL
const transporter = nodemailer.createTransport({
host: process.env.SMTP_HOST,
port: Number(process.env.SMTP_PORT || 587),
secure: false,
auth: {
user: process.env.SMTP_USER,
pass: process.env.SMTP_PASS,
},
});

function sendMailSafe({ to, subject, html }) {
if (
!process.env.MAIL_FROM ||
!process.env.SMTP_HOST ||
!process.env.SMTP_USER ||
!process.env.SMTP_PASS
) {
console.warn("⚠️ Email not configured (skipping send).");
return;
}

transporter.sendMail(
{
from: process.env.MAIL_FROM,
to,
subject,
html,
},
(err) => {
if (err) console.warn("⚠️ Email send failed:", err.message);
}
);
}

// ✅ HEALTH CHECK
app.get("/", (req, res) => {
res.json({ ok: true, message: "ZigaSwift backend is running 🚀" });
});

app.get("/api/health", (req, res) => {
res.json({ ok: true });
});

// ===============================
// 🔐 Admin Dashboard (STATIC UI)
// Folder structure you said:
// /admin/admin/index.html
// /admin/admin/admin.js
// ===============================
const adminDir = path.join(__dirname, "admin", "admin");

// serve static files (index.html, admin.js, css, etc.)
app.use("/admin", express.static(adminDir));

// visiting /admin should return the admin dashboard page
app.get("/admin", (req, res) => {
const adminIndex = path.join(adminDir, "index.html");
if (fs.existsSync(adminIndex)) return res.sendFile(adminIndex);
return res.status(404).send("Admin index.html not found");
});

// (Optional) support /admin/ as well
app.get("/admin/", (req, res) => {
const adminIndex = path.join(adminDir, "index.html");
if (fs.existsSync(adminIndex)) return res.sendFile(adminIndex);
return res.status(404).send("Admin index.html not found");
});

// 📩 WAITLIST API
app.post("/api/waitlist", (req, res) => {
try {
const schema = z.object({
name: z.string().min(2).max(80),
email: z.string().email().max(120),
city: z.string().min(2).max(120),
});

const data = schema.parse(req.body);

db.run(
`INSERT INTO waitlist (name, email, city) VALUES (?, ?, ?)`,
[data.name, data.email, data.city],
function (err) {
if (err) {
console.error("❌ Waitlist insert failed:", err.message);
return res.status(500).json({ ok: false, error: "Database error" });
}

sendMailSafe({
to: data.email,
subject: "Welcome to ZigaSwift 🚀",
html: `<p>Hi ${data.name}, thanks for joining the ZigaSwift waitlist!</p>`,
});

return res.json({ ok: true, id: this.lastID });
}
);
} catch (err) {
return res.status(400).json({ ok: false, error: err.message });
}
});

// 🚚 COURIER API (store in DB too)
app.post("/api/courier", (req, res) => {
try {
const schema = z.object({
name: z.string().min(2).max(80),
email: z.string().email().max(120),
route: z.string().min(2).max(200),
});

const data = schema.parse(req.body);

db.run(
`INSERT INTO couriers (name, email, route) VALUES (?, ?, ?)`,
[data.name, data.email, data.route],
function (err) {
if (err) {
console.error("❌ Courier insert failed:", err.message);
return res.status(500).json({ ok: false, error: "Database error" });
}

sendMailSafe({
to: data.email,
subject: "ZigaSwift Courier Application Received 🚚",
html: `<p>Hi ${data.name}, we received your courier application. We'll reach out with next steps soon.</p>`,
});

return res.json({ ok: true, id: this.lastID });
}
);
} catch (err) {
return res.status(400).json({ ok: false, error: err.message });
}
});

// ===============================
// 🔐 Admin API endpoints
// These are what your admin.js calls:
// GET /api/admin/waitlist
// GET /api/admin/couriers
// Add a simple key check via x-admin-key header
// ===============================
function requireAdminKey(req, res, next) {
const expected = (process.env.ADMIN_KEY || "").trim();
if (!expected) {
return res
.status(500)
.json({ ok: false, error: "ADMIN_KEY not set on server" });
}

const got = (req.header("x-admin-key") || "").trim();
if (got !== expected) {
return res.status(401).json({ ok: false, error: "Unauthorized" });
}
next();
}

app.get("/api/admin/waitlist", requireAdminKey, (req, res) => {
db.all(
`SELECT id, name, email, city, created_at FROM waitlist ORDER BY id DESC LIMIT 500`,
[],
(err, rows) => {
if (err) {
console.error("❌ Admin waitlist query failed:", err.message);
return res.status(500).json({ ok: false, error: "Database error" });
}
return res.json({ ok: true, items: rows });
}
);
});

app.get("/api/admin/couriers", requireAdminKey, (req, res) => {
db.all(
`SELECT id, name, email, route, created_at FROM couriers ORDER BY id DESC LIMIT 500`,
[],
(err, rows) => {
if (err) {
console.error("❌ Admin couriers query failed:", err.message);
return res.status(500).json({ ok: false, error: "Database error" });
}
return res.json({ ok: true, items: rows });
}
);
});

// ✅ Default 404 (KEEP LAST)
app.use((req, res) => {
res.status(404).json({ ok: false, error: "Not Found" });
});

// 🚀 START SERVER
app.listen(PORT, () => {
console.log(`ZigaSwift backend running on ${SITE_URL} (PORT ${PORT})`);
});
