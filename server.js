// server.js (FULL — copy/paste)
// Includes: ✅ Admin UI (Basic Auth) + ✅ Admin API key + ✅ Waitlist/Courier DB + ✅ Email notify
// + ✅ Stripe for SENDERS (Checkout + Webhook + DB tracking)
// Corrections A–E applied.

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

// ✅ STRIPE (2) — init
const Stripe = require("stripe");
const STRIPE_SECRET_KEY = (process.env.STRIPE_SECRET_KEY || "").trim();
const STRIPE_WEBHOOK_SECRET = (process.env.STRIPE_WEBHOOK_SECRET || "").trim();
const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;

const app = express();

// 🔒 TRUST PROXY (REQUIRED FOR RENDER)
app.set("trust proxy", 1);

// 🌐 ENV
const PORT = process.env.PORT || 10000;
const SITE_URL = (process.env.SITE_URL || `http://localhost:${PORT}`).trim();
const FRONTEND_URL = (process.env.FRONTEND_URL || SITE_URL).trim(); // ✅ where Stripe redirects after payment
const ADMIN_NOTIFY_EMAIL = (process.env.ADMIN_NOTIFY_EMAIL || "").trim();

// ------------------------------
// ✅ STRIPE WEBHOOK must use RAW body
// Put webhook route BEFORE express.json()
// ------------------------------
app.post(
"/api/stripe/webhook",
express.raw({ type: "application/json" }),
(req, res) => {
if (!stripe) return res.status(500).send("Stripe not configured");
if (!STRIPE_WEBHOOK_SECRET) return res.status(500).send("Webhook secret not configured");

let event;
try {
const sig = req.headers["stripe-signature"];
event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
} catch (err) {
console.warn("⚠️ Stripe webhook signature verify failed:", err.message);
return res.status(400).send(`Webhook Error: ${err.message}`);
}

// ✅ (3) Webhook handling: mark payment status in DB
try {
const type = event.type;

if (type === "checkout.session.completed") {
const session = event.data.object;

const paymentId = session.id;
const status = session.payment_status || "unknown";
const amount = session.amount_total || 0;
const currency = session.currency || "usd";
const email = session.customer_details?.email || session.customer_email || null;

// Upsert-ish update
db.run(
`UPDATE payments SET status=?, updated_at=CURRENT_TIMESTAMP WHERE stripe_session_id=?`,
[status, paymentId],
function () {
// If row didn't exist, insert it
if (this.changes === 0) {
db.run(
`INSERT INTO payments (stripe_session_id, status, amount_cents, currency, sender_email)
VALUES (?, ?, ?, ?, ?)`,
[paymentId, status, amount, currency, email]
);
}
}
);
}

// You can also handle failures/refunds if you want:
// if (type === "checkout.session.async_payment_failed") { ... }
// if (type === "charge.refunded") { ... }

return res.json({ received: true });
} catch (err) {
console.error("❌ Stripe webhook handler error:", err.message);
return res.status(500).send("Webhook handler error");
}
}
);

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
"https://zigaswift-backend-2.onrender.com", // admin UI host + frontend
]);

const corsOptions = {
origin: (origin, cb) => {
if (!origin) return cb(null, true); // allow curl/postman/server-to-server
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

// status columns (future-proof)
db.run(`ALTER TABLE waitlist ADD COLUMN status TEXT DEFAULT 'pending'`, () => {});
db.run(`ALTER TABLE couriers ADD COLUMN status TEXT DEFAULT 'pending'`, () => {});

// ✅ (4) payments table for sender Stripe payments
db.run(`
CREATE TABLE IF NOT EXISTS payments (
id INTEGER PRIMARY KEY AUTOINCREMENT,
stripe_session_id TEXT UNIQUE,
status TEXT,
amount_cents INTEGER,
currency TEXT,
sender_email TEXT,
created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
`);
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
transporter.sendMail({ from: process.env.MAIL_FROM, to, subject, html }, (err) => {
if (err) console.warn("⚠️ Email send failed:", err.message);
});
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
return res.status(500).json({ ok: false, error: "ADMIN_KEY not set on server" });
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

// ------------------------------
// ✅ ADMIN UI (STATIC + LOGIN)
// ------------------------------
function pickAdminDir() {
const candidates = [path.resolve(__dirname, "admin", "admin"), path.resolve(__dirname, "admin")];
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
// ✅ STRIPE (2) Create Checkout Session — SENDERS ONLY
// ------------------------------
app.post("/api/payments/create-checkout-session", async (req, res) => {
try {
if (!stripe) {
return res.status(500).json({ ok: false, error: "Stripe not configured (missing STRIPE_SECRET_KEY)" });
}

// ⚠️ Do NOT trust the client for final pricing in production.
// For now, we validate basic bounds.
const schema = z.object({
senderEmail: z.string().email().max(120).optional(),
amountCents: z.number().int().min(100).max(200000), // $1.00 to $2000.00
currency: z.string().min(3).max(3).default("usd"),
description: z.string().min(3).max(120).default("ZigaSwift delivery payment"),
});

const data = schema.parse(req.body);

const session = await stripe.checkout.sessions.create({
mode: "payment",
payment_method_types: ["card"],
customer_email: data.senderEmail,
line_items: [
{
price_data: {
currency: data.currency,
product_data: { name: data.description },
unit_amount: data.amountCents,
},
quantity: 1,
},
],
success_url: `${FRONTEND_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
cancel_url: `${FRONTEND_URL}/payment-cancel`,
});

// ✅ (4) Track session in DB as "created"
db.run(
`INSERT INTO payments (stripe_session_id, status, amount_cents, currency, sender_email)
VALUES (?, ?, ?, ?, ?)`,
[session.id, "created", data.amountCents, data.currency, data.senderEmail || null],
() => {}
);

return res.json({ ok: true, url: session.url, sessionId: session.id });
} catch (err) {
return res.status(400).json({ ok: false, error: zodErrorToMessage(err) });
}
});

// ------------------------------
// ✅ ADMIN API (LOCKED): view waitlist/couriers
// ------------------------------
app.get("/api/admin/waitlist", requireAdminKey, (req, res) => {
db.all(
`SELECT id, name, email, city, status, created_at
FROM waitlist
ORDER BY id DESC
LIMIT 200`,
[],
(err, rows) => {
if (err) return res.status(500).json({ ok: false, error: "Database error" });
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
if (err) return res.status(500).json({ ok: false, error: "Database error" });
return res.json({ ok: true, items: rows });
}
);
});

// ✅ optional: admin can view payments
app.get("/api/admin/payments", requireAdminKey, (req, res) => {
db.all(
`SELECT id, stripe_session_id, status, amount_cents, currency, sender_email, created_at, updated_at
FROM payments
ORDER BY id DESC
LIMIT 200`,
[],
(err, rows) => {
if (err) return res.status(500).json({ ok: false, error: "Database error" });
return res.json({ ok: true, items: rows });
}
);
});

// ------------------------------
// Admin actions — accept/reject/delete
// NOTE: your UI might call POST or PATCH; we support BOTH.
// ------------------------------
function acceptRejectDeleteRoutes(entity) {
const table = entity;

const accept = (req, res) => {
const id = Number(req.params.id);
db.run(`UPDATE ${table} SET status='accepted' WHERE id=?`, [id], function (err) {
if (err) return res.status(500).json({ ok: false, error: "Database error" });
return res.json({ ok: true, updated: this.changes });
});
};

const reject = (req, res) => {
const id = Number(req.params.id);
db.run(`UPDATE ${table} SET status='rejected' WHERE id=?`, [id], function (err) {
if (err) return res.status(500).json({ ok: false, error: "Database error" });
return res.json({ ok: true, updated: this.changes });
});
};

const del = (req, res) => {
const id = Number(req.params.id);
db.run(`DELETE FROM ${table} WHERE id=?`, [id], function (err) {
if (err) return res.status(500).json({ ok: false, error: "Database error" });
return res.json({ ok: true, deleted: this.changes });
});
};

app.patch(`/api/admin/${table}/:id/accept`, requireAdminKey, accept);
app.post(`/api/admin/${table}/:id/accept`, requireAdminKey, accept);

app.patch(`/api/admin/${table}/:id/reject`, requireAdminKey, reject);
app.post(`/api/admin/${table}/:id/reject`, requireAdminKey, reject);

app.delete(`/api/admin/${table}/:id`, requireAdminKey, del);
}

acceptRejectDeleteRoutes("waitlist");
acceptRejectDeleteRoutes("couriers");

// 📁 FALLBACK
app.get("*", (req, res) => {
return res.status(404).send("Not Found");
});

// 🚀 START SERVER
app.listen(PORT, () => {
console.log(`ZigaSwift backend running on ${SITE_URL} (PORT ${PORT})`);
console.log(`FRONTEND_URL: ${FRONTEND_URL}`);

if (ADMIN_NOTIFY_EMAIL) console.log("✅ Admin notify email enabled:", ADMIN_NOTIFY_EMAIL);
else console.log("ℹ️ Admin notify email disabled (set ADMIN_NOTIFY_EMAIL to enable).");

if (!smtpConfigured) console.log("ℹ️ SMTP not configured — emails will be skipped safely.");
else console.log("✅ SMTP configured:", process.env.SMTP_HOST, "port", process.env.SMTP_PORT || 587);

if (!STRIPE_SECRET_KEY) console.log("ℹ️ Stripe not configured — set STRIPE_SECRET_KEY to enable payments.");
else console.log("✅ Stripe enabled (secret key loaded).");

if (!STRIPE_WEBHOOK_SECRET) console.log("ℹ️ Stripe webhook not configured — set STRIPE_WEBHOOK_SECRET to verify events.");
else console.log("✅ Stripe webhook secret loaded.");
});
