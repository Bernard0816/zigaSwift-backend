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
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY); // ← Stripe added

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
"https://zigaswift-backend-2.onrender.com",
]);

const corsOptions = {
origin: (origin, cb) => {
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
status TEXT DEFAULT 'pending',
created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
`);

db.run(`
CREATE TABLE IF NOT EXISTS couriers (
id INTEGER PRIMARY KEY AUTOINCREMENT,
name TEXT,
email TEXT,
route TEXT,
status TEXT DEFAULT 'pending',
created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
`);

// Optional future-proof columns
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
secure: Number(process.env.SMTP_PORT) === 465,
auth: {
user: process.env.SMTP_USER,
pass: process.env.SMTP_PASS,
},
connectionTimeout: 15000,
greetingTimeout: 15000,
socketTimeout: 20000,
})
: null;

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

// C) Clean Zod errors
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

// 🔐 ADMIN API AUTH (x-admin-key)
function requireAdminKey(req, res, next) {
const expected = (process.env.ADMIN_KEY || "").trim();
if (!expected) {
return res.status(500).json({ ok: false, error: "ADMIN_KEY not set on server" });
}

const got = (req.header("x-admin-key") || "").trim();
if (got && got === expected) return next();

return res.status(401).json({ ok: false, error: "Unauthorized" });
}

// 🔐 ADMIN UI LOGIN (Basic Auth)
function requireAdminLogin(req, res, next) {
const user = (process.env.ADMIN_USER || "").trim();
const pass = (process.env.ADMIN_PASS || "").trim();

if (!user || !pass) {
return res.status(500).send("Admin UI not configured (set ADMIN_USER and ADMIN_PASS)");
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

// ✅ ADMIN UI (STATIC + LOGIN)
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
// WAITLIST & COURIER ENDPOINTS (unchanged)
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
if (err) {
console.error("❌ Waitlist insert failed:", err.message);
return res.status(500).json({ ok: false, error: "Database error" });
}

sendMailSafe({
to: data.email,
subject: "Welcome to ZigaSwift 🚀",
html: `<p>Hi ${data.name}, thanks for joining the ZigaSwift waitlist!</p>`,
});

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
if (err) {
console.error("❌ Courier insert failed:", err.message);
return res.status(500).json({ ok: false, error: "Database error" });
}

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
// ADMIN API endpoints
// ------------------------------
app.get("/api/admin/waitlist", requireAdminKey, (req, res) => {
db.all(
`SELECT id, name, email, city, status, created_at FROM waitlist ORDER BY id DESC LIMIT 200`,
[],
(err, rows) => {
if (err) return res.status(500).json({ ok: false, error: "Database error" });
return res.json({ ok: true, items: rows });
}
);
});

app.get("/api/admin/couriers", requireAdminKey, (req, res) => {
db.all(
`SELECT id, name, email, route, status, created_at FROM couriers ORDER BY id DESC LIMIT 200`,
[],
(err, rows) => {
if (err) return res.status(500).json({ ok: false, error: "Database error" });
return res.json({ ok: true, items: rows });
}
);
});

// Admin actions (accept/reject/delete) for waitlist
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

// Admin actions for couriers (accept/reject/delete)
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

// ────────────────────────────────────────────────
// NEW: STRIPE PAYMENT ENDPOINT FOR SENDERS
// ────────────────────────────────────────────────
app.post("/api/create-shipment-payment", async (req, res) => {
try {
const {
pickup, // e.g. "Houston, TX"
dropoff, // e.g. "Dallas, TX"
weightKg, // number
priority = "standard", // "standard" | "express" | "rush"
senderEmail,
} = req.body;

// Basic validation
if (!pickup || !dropoff || !weightKg || weightKg <= 0) {
return res.status(400).json({ error: "Missing or invalid shipment details" });
}

// ────────────────────────────────────────────────
// REPLACE THIS WITH YOUR REAL PRICE CALCULATION LOGIC
// (e.g. use Google Maps Distance Matrix API, ZIP code table, etc.)
// ────────────────────────────────────────────────
const distanceKm = 150; // ← PLACEHOLDER — CHANGE THIS!

const basePricePerKm = 1.20; // $1.20 per km
const weightPricePerKg = 0.90; // $0.90 per kg
const priorityMultiplier =
priority === "rush" ? 1.75 :
priority === "express" ? 1.40 :
1.00;

const subtotalUsd = (
distanceKm * basePricePerKm +
weightKg * weightPricePerKg
) * priorityMultiplier;

const amountCents = Math.round(subtotalUsd * 100);

if (amountCents < 2000) { // minimum $20
return res.status(400).json({ error: "Calculated amount too low" });
}

const session = await stripe.checkout.sessions.create({
payment_method_types: ["card"],
mode: "payment",
line_items: [
{
price_data: {
currency: "usd",
product_data: {
name: `Shipment: ${pickup} → ${dropoff}`,
description: `Weight: ${weightKg} kg | Priority: ${priority} | Est. distance: ${distanceKm} km`,
},
unit_amount: amountCents,
},
quantity: 1,
},
],
customer_email: senderEmail || undefined,
success_url: "https://yourdomain.com/shipment/success?session_id={CHECKOUT_SESSION_ID}",
cancel_url: "https://yourdomain.com/shipment/new",
metadata: {
pickup,
dropoff,
weight_kg: weightKg,
priority,
calculated_amount_cents: amountCents,
},
});

res.json({ url: session.url, sessionId: session.id });
} catch (error) {
console.error("Stripe error:", error);
res.status(500).json({ error: error.message || "Failed to create payment session" });
}
});

// 404 fallback
app.get("*", (req, res) => {
res.status(404).send("Not Found");
});

// Start server
app.listen(PORT, () => {
console.log(`ZigaSwift backend running on ${SITE_URL} (PORT ${PORT})`);
if (ADMIN_NOTIFY_EMAIL) console.log("Admin notify email:", ADMIN_NOTIFY_EMAIL);
if (!smtpConfigured) console.log("SMTP not configured — emails skipped.");
if (process.env.STRIPE_SECRET_KEY) console.log("Stripe initialized (test mode assumed)");
});
