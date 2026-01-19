// server.js (FULL - clean copy/paste, no hidden chars)
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

// Required for Render / proxies
app.set("trust proxy", 1);

// ENV
const PORT = process.env.PORT || 10000;
const SITE_URL = process.env.SITE_URL || `http://localhost:${PORT}`;

// Security
app.use(helmet());
app.use(express.json({ limit: "200kb" }));

// CORS
const allowedOrigins = new Set([
"https://bernard0816.github.io",
"https://bernard0816.github.io/ZigaSwift",
"https://bernard0816.github.io/ZigaSwift/",
"https://zigaswift-backend.onrender.com",
"https://zigaswift-backend-1.onrender.com",
]);

app.use(
cors({
origin: (origin, cb) => {
if (!origin) return cb(null, true); // allow curl/postman
if (allowedOrigins.has(origin)) return cb(null, true);
return cb(new Error("CORS blocked: " + origin));
},
methods: ["GET", "POST", "OPTIONS"],
allowedHeaders: ["Content-Type", "x-admin-key"],
optionsSuccessStatus: 204,
})
);
app.options("*", cors());

// Rate limit
app.use(
rateLimit({
windowMs: 15 * 60 * 1000,
max: 100,
standardHeaders: true,
legacyHeaders: false,
})
);

// Database (Render-safe)
const DEFAULT_DB_PATH = path.join("/tmp", "zigaswift.sqlite");
const DB_PATH = (process.env.DB_PATH || DEFAULT_DB_PATH).trim();

const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new sqlite3.Database(DB_PATH, (err) => {
if (err) console.error("Failed to open database:", err.message);
else console.log("SQLite database connected at:", DB_PATH);
});

db.run(`
CREATE TABLE IF NOT EXISTS waitlist (
id INTEGER PRIMARY KEY AUTOINCREMENT,
name TEXT,
email TEXT,
city TEXT,
created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

db.run(`
CREATE TABLE IF NOT EXISTS couriers (
id INTEGER PRIMARY KEY AUTOINCREMENT,
name TEXT,
email TEXT,
route TEXT,
created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// Email
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
console.warn("Email not configured (skipping send).");
return;
}

transporter.sendMail({ from: process.env.MAIL_FROM, to, subject, html }, (err) => {
if (err) console.warn("Email send failed:", err.message);
});
}

// Health
app.get("/", (req, res) => {
res.json({ ok: true, message: "ZigaSwift backend is running" });
});
app.get("/api/health", (req, res) => {
res.json({ ok: true });
});

// Admin API Auth (x-admin-key)
function requireAdminKey(req, res, next) {
const expected = (process.env.ADMIN_KEY || "").trim();
if (!expected) {
return res.status(500).json({ ok: false, error: "ADMIN_KEY not set on server" });
}

const got = (req.header("x-admin-key") || "").trim();
if (got && got === expected) return next();

return res.status(401).json({ ok: false, error: "Unauthorized" });
}

// Admin UI Basic Auth
function requireAdminLogin(req, res, next) {
const user = (process.env.ADMIN_USER || "").trim();
const pass = (process.env.ADMIN_PASS || "").trim();

if (!user || !pass) {
return res
.status(500)
.send("Admin UI not configured (set ADMIN_USER and ADMIN_PASS)");
}

const header = req.headers.authorization || "";
if (!header.startsWith("Basic ")) {
res.setHeader("WWW-Authenticate", 'Basic realm="ZigaSwift Admin"');
return res.status(401).send("Authentication required");
}

const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
const idx = decoded.indexOf(":");
const u = idx >= 0 ? decoded.slice(0, idx) : "";
const p = idx >= 0 ? decoded.slice(idx + 1) : "";

if (u === user && p === pass) return next();

res.setHeader("WWW-Authenticate", 'Basic realm="ZigaSwift Admin"');
return res.status(401).send("Invalid credentials");
}

// Admin UI (serve whichever folder actually exists)
function resolveAdminDir() {
const candidates = [
path.join(__dirname, "admin", "admin"), // admin/admin/index.html
path.join(__dirname, "admin"), // admin/index.html
];

for (const dir of candidates) {
const indexFile = path.join(dir, "index.html");
const jsFile = path.join(dir, "admin.js");
if (fs.existsSync(indexFile) && fs.existsSync(jsFile)) {
return dir;
}
}
return null;
}

const adminDir = resolveAdminDir();

if (adminDir) {
console.log("Admin directory:", adminDir);

app.use("/admin", requireAdminLogin, express.static(adminDir, { index: false }));

app.get(["/admin", "/admin/"], requireAdminLogin, (req, res) => {
return res.sendFile(path.join(adminDir, "index.html"));
});
} else {
console.warn("Admin UI not found on server. Checked admin/admin and admin/");
app.get(["/admin", "/admin/"], (req, res) => {
return res.status(404).send("Admin UI not found");
});
}

// Waitlist API
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
console.error("Waitlist insert failed:", err.message);
return res.status(500).json({ ok: false, error: "Database error" });
}

sendMailSafe({
to: data.email,
subject: "Welcome to ZigaSwift",
html: `<p>Hi ${data.name}, thanks for joining the ZigaSwift waitlist!</p>`,
});

return res.json({ ok: true, id: this.lastID });
}
);
} catch (err) {
return res.status(400).json({ ok: false, error: err.message });
}
});

// Courier API
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
console.error("Courier insert failed:", err.message);
return res.status(500).json({ ok: false, error: "Database error" });
}
return res.json({ ok: true, id: this.lastID });
}
);
} catch (err) {
return res.status(400).json({ ok: false, error: err.message });
}
});

// Admin API endpoints (locked)
app.get("/api/admin/waitlist", requireAdminKey, (req, res) => {
db.all(
`SELECT id, name, email, city, created_at FROM waitlist ORDER BY id DESC LIMIT 200`,
[],
(err, rows) => {
if (err) return res.status(500).json({ ok: false, error: "Database error" });
return res.json({ ok: true, items: rows });
}
);
});

app.get("/api/admin/couriers", requireAdminKey, (req, res) => {
db.all(
`SELECT id, name, email, route, created_at FROM couriers ORDER BY id DESC LIMIT 200`,
[],
(err, rows) => {
if (err) return res.status(500).json({ ok: false, error: "Database error" });
return res.json({ ok: true, items: rows });
}
);
});

// Fallback
app.get("*", (req, res) => res.status(404).send("Not Found"));

app.listen(PORT, () => {
console.log(`ZigaSwift backend running on ${SITE_URL} (PORT ${PORT})`);
});
