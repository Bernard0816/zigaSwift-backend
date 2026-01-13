const path = require("path");
const fs = require("fs");

const express = require("express");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const cors = require("cors");
const { z } = require("zod");
const sqlite3 = require("sqlite3").verbose();
const nodemailer = require("nodemailer");

const app = express();

app.set("trust proxy", 1);
const corsOptions = {
origin: [
"https://bernard0816.github.io",
"https://bernard0816.github.io/zigaswift",
"https://bernard0816.github.io/zigaswift/",
"https://zigaswift-backend.onrender.com"
],
methods: ["GET", "POST", "OPTIONS"],
allowedHeaders: ["Content-Type"],
optionsSuccessStatus: 204, 
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions)); // ✅ preflight uses same rules

// =====================
// Config
// =====================
const PORT = process.env.PORT || 3000;

// Frontend URL (GitHub Pages) — set this on Render as SITE_URL
const SITE_URL = process.env.SITE_URL || `http://localhost:${PORT}`;

// DB path (Render-safe). On Render, best is /tmp because it’s writable.
// NOTE: SQLite on Render Free is NOT persistent (it resets on redeploy).
const DEFAULT_DB_PATH = path.join("/tmp", "zigaswift.sqlite");
const DB_PATH = process.env.DB_PATH || DEFAULT_DB_PATH;

// Ensure DB directory exists
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
fs.mkdirSync(dbDir, { recursive: true });
}
console.log("Using DB_PATH:", DB_PATH);
console.log("SITE_URL:", SITE_URL);

// =====================
// DB
// =====================
const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
db.run(`
CREATE TABLE IF NOT EXISTS waitlist (
id INTEGER PRIMARY KEY AUTOINCREMENT,
name TEXT NOT NULL,
email TEXT NOT NULL,
hub TEXT NOT NULL,
created_at TEXT NOT NULL
)
`);

db.run(`
CREATE TABLE IF NOT EXISTS courier_applications (
id INTEGER PRIMARY KEY AUTOINCREMENT,
name TEXT NOT NULL,
email TEXT NOT NULL,
route TEXT NOT NULL,
created_at TEXT NOT NULL
)
`);
});

// =====================
// Mail (optional)
// =====================
function makeTransport() {
const host = process.env.SMTP_HOST;
const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;
const port = Number(process.env.SMTP_PORT || 587);

const from = process.env.MAIL_FROM || "ZigaSwift <no-reply@zigaswift.com>";

// If SMTP not configured, we silently skip email sending
if (!host || !user || !pass) return { transport: null, from };

const transport = nodemailer.createTransport({
host,
port,
secure: port === 465,
auth: { user, pass },
});

return { transport, from };
}

const { transport, from } = makeTransport();

async function sendMail(to, subject, html) {
if (!transport) {
console.log("SMTP not set — skipping email to:", to);
return;
}
await transport.sendMail({ from, to, subject, html });
}

function nowISO() {
return new Date().toISOString();
}

function escapeHtml(str) {
return String(str)
.replaceAll("&", "&amp;")
.replaceAll("<", "&lt;")
.replaceAll(">", "&gt;")
.replaceAll('"', "&quot;")
.replaceAll("'", "&#039;");
}

// =====================
// App
// =====================
const app = express();

app.use(helmet());

// ✅ CORS FIX (GitHub Pages → Render)
// Put your GitHub Pages site here (and localhost for dev).
const allowedOrigins = [
"http://localhost:5500",
"http://localhost:3000",
"http://127.0.0.1:5500",
"http://127.0.0.1:3000",
"https://bernard0816.github.io", // your GitHub Pages domain
SITE_URL, // the one you set on Render
].filter(Boolean);

app.use(
cors({
origin: function (origin, callback) {
// allow requests with no origin (like curl/postman)
if (!origin) return callback(null, true);

if (allowedOrigins.includes(origin)) return callback(null, true);

return callback(new Error("Not allowed by CORS: " + origin));
},
methods: ["GET", "POST", "OPTIONS"],
allowedHeaders: ["Content-Type"],
})
);

// ✅ Preflight handler (this kills many 405 issues)
app.options("*", cors());

app.use(express.json({ limit: "200kb" }));

const limiter = rateLimit({
windowMs: 15 * 60 * 1000,
limit: 100,
standardHeaders: true,
legacyHeaders: false,
});
app.use(limiter);

// If you have a /public folder in backend, this will serve it:
app.use(express.static(path.join(__dirname, "public")));

// =====================
// Validation
// =====================
const WaitlistSchema = z.object({
name: z.string().min(2).max(80),
email: z.string().email().max(120),
hub: z.string().min(2).max(120),
});

const CourierSchema = z.object({
name: z.string().min(2).max(80),
email: z.string().email().max(120),
route: z.string().min(2).max(120),
});

// =====================
// DB helpers
// =====================
function insertWaitlist({ name, email, hub }) {
return new Promise((resolve, reject) => {
db.run(
"INSERT INTO waitlist(name,email,hub,created_at) VALUES(?,?,?,?)",
[name, email.toLowerCase(), hub, nowISO()],
function (err) {
if (err) return reject(err);
resolve({ id: this.lastID });
}
);
});
}

function insertCourier({ name, email, route }) {
return new Promise((resolve, reject) => {
db.run(
"INSERT INTO courier_applications(name,email,route,created_at) VALUES(?,?,?,?)",
[name, email.toLowerCase(), route, nowISO()],
function (err) {
if (err) return reject(err);
resolve({ id: this.lastID });
}
);
});
}

// =====================
// Routes
// =====================

// Health
app.get("/api/health", (req, res) => res.json({ ok: true }));

// ✅ Helpful GET routes so typing in browser doesn’t confuse you
app.get("/api/waitlist", (req, res) => {
res.status(200).send("OK (Use POST /api/waitlist to submit)");
});
app.get("/api/courier", (req, res) => {
res.status(200).send("OK (Use POST /api/courier to submit)");
});

// Waitlist submit
app.post("/api/waitlist", async (req, res) => {
try {
const parsed = WaitlistSchema.parse(req.body);
const result = await insertWaitlist(parsed);

await sendMail(
parsed.email,
"You're on the ZigaSwift waitlist ✅",
`
<div style="font-family:Arial,sans-serif;line-height:1.5">
<h2>Welcome, ${escapeHtml(parsed.name)}!</h2>
<p>You’re officially on the waitlist for <b>${escapeHtml(parsed.hub)}</b>.</p>
<p>We’ll email you when ZigaSwift opens in your area and when early access is available.</p>
<p style="margin-top:18px">— ZigaSwift Team</p>
<hr/>
<small>You received this because you signed up at ${escapeHtml(SITE_URL)}.</small>
</div>
`
);

return res.json({ ok: true, id: result.id });
} catch (err) {
return res.status(400).json({ ok: false, error: err.message || "Invalid request" });
}
});

// Courier submit
app.post("/api/courier", async (req, res) => {
try {
const parsed = CourierSchema.parse(req.body);
const result = await insertCourier(parsed);

await sendMail(
parsed.email,
"ZigaSwift Courier Application Received 📨",
`
<div style="font-family:Arial,sans-serif;line-height:1.5">
<h2>Thanks, ${escapeHtml(parsed.name)}!</h2>
<p>We received your courier application.</p>
<p><b>Typical route:</b> ${escapeHtml(parsed.route)}</p>
<p>Next steps: we’ll follow up with verification requirements and onboarding.</p>
<p style="margin-top:18px">— ZigaSwift Team</p>
<hr/>
<small>You received this because you applied at ${escapeHtml(SITE_URL)}.</small>
</div>
`
);

return res.json({ ok: true, id: result.id });
} catch (err) {
return res.status(400).json({ ok: false, error: err.message || "Invalid request" });
}
});

// Fallback to frontend page if you serve one from backend
app.get("*", (req, res) => {
const indexPath = path.join(__dirname, "public", "index.html");
if (fs.existsSync(indexPath)) return res.sendFile(indexPath);
return res.status(404).send("Not Found");
});

app.listen(PORT, () => {
console.log(`ZigaSwift backend running on ${SITE_URL} (PORT ${PORT})`);
});
