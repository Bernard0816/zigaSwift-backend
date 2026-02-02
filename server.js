// server.js (FULL — copy/paste)
// Includes: ✅ Admin UI (Basic Auth) + ✅ Admin API key + ✅ Waitlist/Courier DB + ✅ Email notify
// Corrections A–E applied:
// A) DB error handling stays INSIDE db.run callbacks (no stray `if (err)` outside)
// B) Removed duplicate/unused BasicAuth middleware (kept ONE: requireAdminLogin)
// C) Better Zod error messages (clean error text to client)
// D) Render/SQLite hardening: PRAGMA + db.serialize + safe ALTER TABLE (future-proof)
// E) Email transport hardened: optional verify, timeouts; safe skip if not configured

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
const ADMIN_NOTIFY_EMAIL = (process.env.ADMIN_NOTIFY_EMAIL || "").trim();

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
"https://zigaswift-backend-2.onrender.com", // admin UI host
]);

const corsOptions = {
origin: (origin, cb) => {
// E) allow requests without an Origin header (curl/postman/server-to-server)
if (!origin) return cb(null, true);
if (allowedOrigins.has(origin)) return cb(null, true);
return cb(new Error("CORS blocked: " + origin));
},
methods: ["GET", "POST", "OPTIONS", "DELETE", "PATCH"],
allowedHeaders: ["Content-Type", "x-admin-key"],
optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

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

// D) SQLite pragmas + create tables serially
db.serialize(() => {
db.run("PRAGMA journal_mode=WAL;");
db.run("PRAGMA synchronous=NORMAL;");
db.run("PRAGMA foreign_keys=ON;");

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

// D) Optional future-proof columns (won't crash if already exists)
// If you later add accept/reject/delete status, this helps.
db.run(`ALTER TABLE waitlist ADD COLUMN status TEXT DEFAULT 'pending'`, () => {});
db.run(`ALTER TABLE couriers ADD COLUMN status TEXT DEFAULT 'pending'`, () => {});
});

// ✉️ EMAIL (SMTP)
const smtpConfigured =
!!process.env.MAIL_FROM &&
!!process.env.SMTP_HOST &&
!!process.env.SMTP_USER &&
!!process.env.SMTP_PASS;

const transporter = smtpConfigured
? nodemailer.createTransport({
host: process.env.SMTP_HOST,
port: Number(process.env.SMTP_PORT || 587),
secure: Number(process.env.SMTP_PORT) === 465, // true only for 465
auth: {
user: process.env.SMTP_USER,
pass: process.env.SMTP_PASS,
},
connectionTimeout: 15000, // E) reduce hanging
greetingTimeout: 15000,
socketTimeout: 20000,
})
: null;

// E) optional verification (won't crash deploy)
if (transporter) {
transporter.verify((err) => {
if (err) console.warn("⚠️ SMTP verify failed:", err.message);
else console.log("✅ SMTP transporter ready");
});
}

function sendMailSafe({ to, subject, html }) {
if (!transporter) {
console.warn("⚠️ Email not configured (skipping send).");
return;
}
transporter.sendMail(
{ from: process.env.MAIL_FROM, to, subject, html },
(err) => {
if (err) console.warn("⚠️ Email send failed:", err.message);
}
);
}

// C) Clean Zod errors into friendly text
function zodErrorToMessage(err) {
if (err && err.name === "ZodError" && Array.isArray(err.errors)) {
return err.errors
.map((e) => `${e.path?.join(".") || "field"}: ${e.message}`)
.join(" | ");
}
return err?.message || "Invalid request";
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
return res
.status(500)
.json({ ok: false, error: "ADMIN_KEY not set on server" });
}

const got = (req.header("x-admin-key") || "").trim();
if (got && got === expected) return next();

return res.status(401).json({ ok: false, error: "Unauthorized" });
}

// ------------------------------
// 🔐 ADMIN UI LOGIN (Basic Auth)
// env: ADMIN_USER, ADMIN_PASS
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
res.set("WWW-Authenticate", 'Basic realm="Admin Area"');
return res.status(401).send("Authentication required");
}

const decoded = Buffer.from(encoded, "base64").toString("utf8");
const [u, p] = decoded.split(":");

if (u === user && p === pass) return next();

res.set("WWW-Authenticate", 'Basic realm="Admin Area"');
return res.status(401).send("Invalid credentials");
}

// ------------------------------
// ✅ ADMIN UI (STATIC + LOGIN)
// ------------------------------
function pickAdminDir() {
const candidates = [
path.resolve(__dirname, "admin", "admin"),
path.resolve(__dirname, "admin"),
];

for (const dir of candidates) {
const indexFile = path.join(dir, "index.html");
if (fs.existsSync(indexFile)) return dir;
}
return null;
}

const adminDir = pickAdminDir();

if (adminDir) {
console.log("✅ Admin directory:", adminDir);
console.log("✅ Admin dir files:", fs.readdirSync(adminDir));

app.use("/admin", requireAdminLogin, express.static(adminDir));
app.get(["/admin", "/admin/"], requireAdminLogin, (req, res) => {
return res.sendFile(path.join(adminDir, "index.html"));
});
} else {
console.warn("⚠️ Admin UI directory not found.");
app.get(["/admin", "/admin/"], (req, res) => {
return res.status(404).send("Admin UI not found");
});
}

// ------------------------------
// ✅ WAITLIST API (+ admin email notify)
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
`INSERT INTO waitlist (name, email, city, status) VALUES (?, ?, ?, 'pending')`,
[data.name, data.email, data.city],
function (err) {
// A) Error handling must be inside callback
if (err) {
console.error("❌ Waitlist insert failed:", err.message);
return res.status(500).json({ ok: false, error: "Database error" });
}

// email user (optional; will skip if SMTP not configured)
sendMailSafe({
to: data.email,
subject: "Welcome to ZigaSwift 🚀",
html: `<p>Hi ${data.name}, thanks for joining the ZigaSwift waitlist!</p>`,
});

// admin notify
if (ADMIN_NOTIFY_EMAIL) {
sendMailSafe({
to: ADMIN_NOTIFY_EMAIL,
subject: "🟢 New Waitlist Signup — ZigaSwift",
html: `
<h3>New Waitlist Signup</h3>
<p><b>Name:</b> ${data.name}</p>
<p><b>Email:</b> ${data.email}</p>
<p><b>City:</b> ${data.city}</p>
<p><b>ID:</b> ${this.lastID}</p>
<p><b>Time:</b> ${new Date().toISOString()}</p>
`,
});
}

return res.json({ ok: true, id: this.lastID });
}
);
} catch (err) {
return res.status(400).json({ ok: false, error: zodErrorToMessage(err) });
}
});

// ------------------------------
// ✅ COURIER API (+ admin email notify)
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
`INSERT INTO couriers (name, email, route, status) VALUES (?, ?, ?, 'pending')`,
[data.name, data.email, data.route],
function (err) {
// A) Error handling must be inside callback
if (err) {
console.error("❌ Courier insert failed:", err.message);
return res.status(500).json({ ok: false, error: "Database error" });
}

// admin notify
if (ADMIN_NOTIFY_EMAIL) {
sendMailSafe({
to: ADMIN_NOTIFY_EMAIL,
subject: "🟣 New Courier Application — ZigaSwift",
html: `
<h3>New Courier Application</h3>
<p><b>Name:</b> ${data.name}</p>
<p><b>Email:</b> ${data.email}</p>
<p><b>Route:</b> ${data.route}</p>
<p><b>ID:</b> ${this.lastID}</p>
<p><b>Time:</b> ${new Date().toISOString()}</p>
`,
});
}

return res.json({ ok: true, id: this.lastID });
}
);
} catch (err) {
return res.status(400).json({ ok: false, error: zodErrorToMessage(err) });
}
});

// ------------------------------
// ✅ ADMIN API endpoints used by admin.js (LOCKED)
// ------------------------------
app.get("/api/admin/waitlist", requireAdminKey, (req, res) => {
db.all(
`SELECT id, name, email, city, status, created_at
FROM waitlist
ORDER BY id DESC
LIMIT 200`,
[],
(err, rows) => {
if (err)
return res.status(500).json({ ok: false, error: "Database error" });
return res.json({ ok: true, items: rows });
}
);
});

app.get("/api/admin/couriers", requireAdminKey, (req, res) => {
db.all(
`SELECT id, name, email, route, status, created_at
FROM couriers
ORDER BY id DESC
LIMIT 200`,
[],
(err, rows) => {
if (err)
return res.status(500).json({ ok: false, error: "Database error" });
return res.json({ ok: true, items: rows });
}
);
});

// ------------------------------
// (Optional) Admin actions — accept/reject/delete (ready for your dashboard buttons)
// These are locked with x-admin-key
// ------------------------------
app.patch("/api/admin/waitlist/:id/accept", requireAdminKey, (req, res) => {
const id = Number(req.params.id);
db.run(`UPDATE waitlist SET status='accepted' WHERE id=?`, [id], function (err) {
if (err) return res.status(500).json({ ok: false, error: "Database error" });
return res.json({ ok: true, updated: this.changes });
});
});

app.patch("/api/admin/waitlist/:id/reject", requireAdminKey, (req, res) => {
const id = Number(req.params.id);
db.run(`UPDATE waitlist SET status='rejected' WHERE id=?`, [id], function (err) {
if (err) return res.status(500).json({ ok: false, error: "Database error" });
return res.json({ ok: true, updated: this.changes });
});
});

app.delete("/api/admin/waitlist/:id", requireAdminKey, (req, res) => {
const id = Number(req.params.id);
db.run(`DELETE FROM waitlist WHERE id=?`, [id], function (err) {
if (err) return res.status(500).json({ ok: false, error: "Database error" });
return res.json({ ok: true, deleted: this.changes });
});
});

app.patch("/api/admin/couriers/:id/accept", requireAdminKey, (req, res) => {
const id = Number(req.params.id);
db.run(`UPDATE couriers SET status='accepted' WHERE id=?`, [id], function (err) {
if (err) return res.status(500).json({ ok: false, error: "Database error" });
return res.json({ ok: true, updated: this.changes });
});
});

app.patch("/api/admin/couriers/:id/reject", requireAdminKey, (req, res) => {
const id = Number(req.params.id);
db.run(`UPDATE couriers SET status='rejected' WHERE id=?`, [id], function (err) {
if (err) return res.status(500).json({ ok: false, error: "Database error" });
return res.json({ ok: true, updated: this.changes });
});
});

app.delete("/api/admin/couriers/:id", requireAdminKey, (req, res) => {
const id = Number(req.params.id);
db.run(`DELETE FROM couriers WHERE id=?`, [id], function (err) {
if (err) return res.status(500).json({ ok: false, error: "Database error" });
return res.json({ ok: true, deleted: this.changes });
});
});

// 📁 FALLBACK
app.get("*", (req, res) => {
return res.status(404).send("Not Found");
});

// 🚀 START SERVER
app.listen(PORT, () => {
console.log(`ZigaSwift backend running on ${SITE_URL} (PORT ${PORT})`);
if (ADMIN_NOTIFY_EMAIL)
console.log("✅ Admin notify email enabled:", ADMIN_NOTIFY_EMAIL);
else console.log("ℹ️ Admin notify email disabled (set ADMIN_NOTIFY_EMAIL to enable).");

if (!smtpConfigured) {
console.log("ℹ️ SMTP not configured — emails will be skipped safely.");
} else {
console.log("✅ SMTP configured:", process.env.SMTP_HOST, "port", process.env.SMTP_PORT || 587);
}
});
