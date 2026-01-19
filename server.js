​You​
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

// 🌍 CORS (allow x-admin-key)
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
if (!origin) return cb(null, true);
if (allowedOrigins.has(origin)) return cb(null, true);
return cb(new Error("CORS blocked: " + origin));
},
methods: ["GET", "POST", "OPTIONS"],
allowedHeaders: ["Content-Type", "x-admin-key"],
optionsSuccessStatus: 204,
})
);
app.options("*", cors());

// 🚦 RATE LIMIT
app.use(
rateLimit({
windowMs: 15 * 60 * 1000,
max: 100,
standardHeaders: true,
legacyHeaders: false,
})
);

// 🗄️ DATABASE (Render-safe)
const DEFAULT_DB_PATH = path.join("/tmp", "zigaswift.sqlite");
const DB_PATH = (process.env.DB_PATH || DEFAULT_DB_PATH).trim();

const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new sqlite3.Database(DB_PATH, (err) => {
if (err) console.error("❌ Failed to open database:", err.message);
else console.log("✅ SQLite database connected at:", DB_PATH);
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

transporter.sendMail({ from: process.env.MAIL_FROM, to, subject, html }, (err) => {
if (err) console.warn("⚠️ Email send failed:", err.message);
});
}

// ✅ HEALTH CHECK
app.get("/", (req, res) => {
res.json({ ok: true, message: "ZigaSwift backend is running 🚀" });
});
app.get("/api/health", (req, res) => {
res.json({ ok: true });
});

// ------------------------------
// 🔐 ADMIN API AUTH (x-admin-key)
// ------------------------------
function requireAdminKey(req, res, next) {
const expected = (process.env.ADMIN_KEY || "").trim();

if (!expected) {
return res.status(500).json({ ok: false, error: "ADMIN_KEY not set on server" });
}

const got = (req.header("x-admin-key") || "").trim();
if (got && got === expected) return next();

return res.status(401).json({ ok: false, error: "Unauthorized" });
}

// ------------------------------
// 🔐 ADMIN UI LOCK (Basic Auth)
// Env vars required: ADMIN_USER, ADMIN_PASS
// ------------------------------
function requireAdminLogin(req, res, next) {
const user = (process.env.ADMIN_USER || "").trim();
const pass = (process.env.ADMIN_PASS || "").trim();

if (!user || !pass) {
return res
.status(500)
.send("Admin UI not configured (set ADMIN_USER and ADMIN_PASS)");
}

const auth = req.headers.authorization || "";
const [type, encoded] = auth.split(" ");

if (type !== "Basic" || !encoded) {
res.set("WWW-Authenticate", 'Basic realm="ZigaSwift Admin"');
return res.status(401).send("Authentication required");
}

const decoded = Buffer.from(encoded, "base64").toString("utf8");
const [u, p] = decoded.split(":");

if (u === user && p === pass) return next();

res.set("WWW-Authenticate", 'Basic realm="ZigaSwift Admin"');
return res.status(401).send("Invalid credentials");
}

// ------------------------------
// ✅ ADMIN UI (STATIC + LOGIN)
// Robust directory detection
// ------------------------------
function resolveAdminUi() {
const candidates = [
path.resolve(__dirname, "admin", "admin"), // your current structure
path.resolve(__dirname, "admin"), // fallback
];

for (const dir of candidates) {
const indexFile = path.join(dir, "index.html");
const jsFile = path.join(dir, "admin.js");

const indexOk = fs.existsSync(indexFile);
const jsOk = fs.existsSync(jsFile);

console.log("🔎 Checking admin dir:", dir);
console.log(" - index.html exists:", indexOk);
console.log(" - admin.js exists:", jsOk);

// We require index.html for the dashboard to load
if (indexOk) return { dir, indexFile };
}

return null;
}

const adminUi = resolveAdminUi();

if (adminUi) {
console.log("✅ Admin UI directory selected:", adminUi.dir);

// IMPORTANT: protect BOTH the HTML and static assets with Basic Auth
app.use("/admin", requireAdminLogin, express.static(adminUi.dir));

// Ensure /admin and /admin/ always return index.html
app.get(["/admin", "/admin/"], requireAdminLogin, (req, res) => {
return res.sendFile(adminUi.indexFile);
});
} else {
console.warn("⚠️ Admin UI not found on server.");
app.get(["/admin", "/admin/"], (req, res) => {
return res.status(404).send("Admin UI not found");
});
}

// ------------------------------
// ✅ WAITLIST API
// ------------------------------
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

// ------------------------------
// ✅ COURIER API
// ------------------------------
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
return res.json({ ok: true, id: this.lastID });
}
);
} catch (err) {
return res.status(400).json({ ok: false, error: err.message });
}
});

// ------------------------------
// ✅ ADMIN API endpoints (LOCKED)
// ------------------------------
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

// 📁 FALLBACK
app.get("*", (req, res) => {
return res.status(404).send("Not Found");
});

// 🚀 START SERVER
app.listen(PORT, () => {
console.log(`ZigaSwift backend running on ${SITE_URL} (PORT ${PORT})`);
});
