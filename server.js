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
"https://zigaswift-backend.onrender.com",
],
methods: ["GET", "POST", "OPTIONS"],
allowedHeaders: ["Content-Type", "x-admin-key"],
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

// 🚦 RATE LIMIT
const limiter = rateLimit({
windowMs: 15 * 60 * 1000,
max: 100,
});
app.use(limiter);

// 🗄️ DATABASE
const dataDir = path.join(__dirname, "data");
const dbPath = path.join(dataDir, "zigaswift.db");

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

const db = new sqlite3.Database(dbPath);

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
if (!process.env.MAIL_FROM) return;
transporter.sendMail({
from: process.env.MAIL_FROM,
to,
subject,
html,
});
}

// ✅ HEALTH
app.get("/", (req, res) => {
res.json({ ok: true, message: "ZigaSwift backend is running 🚀" });
});

app.get("/api/health", (req, res) => {
res.json({ ok: true });
});

// 📩 WAITLIST
app.post("/api/waitlist", (req, res) => {
try {
const schema = z.object({
name: z.string().min(2),
email: z.string().email(),
city: z.string().min(2),
});

const data = schema.parse(req.body);

db.run(
`INSERT INTO waitlist (name, email, city) VALUES (?, ?, ?)`,
[data.name, data.email, data.city],
function (err) {
if (err) return res.status(500).json({ ok: false });

sendMailSafe({
to: data.email,
subject: "Welcome to ZigaSwift 🚀",
html: `<p>Hi ${data.name}, welcome!</p>`,
});

res.json({ ok: true, id: this.lastID });
}
);
} catch (err) {
res.status(400).json({ ok: false, error: err.message });
}
});

// 🚚 COURIER
app.post("/api/courier", (req, res) => {
try {
const schema = z.object({
name: z.string().min(2),
email: z.string().email(),
route: z.string().min(2),
});

const data = schema.parse(req.body);
res.json({ ok: true, data });
} catch (err) {
res.status(400).json({ ok: false, error: err.message });
}
});

// 🔐 ADMIN API
const ADMIN_KEY = process.env.ADMIN_KEY || "dev123";

function requireAdmin(req, res, next) {
if (req.headers["x-admin-key"] !== ADMIN_KEY) {
return res.status(401).json({ error: "Unauthorized" });
}
next();
}

app.get("/api/admin/waitlist", requireAdmin, (req, res) => {
db.all(`SELECT * FROM waitlist ORDER BY created_at DESC`, [], (err, rows) => {
if (err) return res.status(500).json({ error: "DB error" });
res.json({ items: rows });
});
});

app.get("/api/admin/couriers", requireAdmin, (req, res) => {
db.all(`SELECT * FROM couriers ORDER BY created_at DESC`, [], (err, rows) => {
if (err) return res.status(500).json({ error: "DB error" });
res.json({ items: rows });
});
});

// 📁 SERVE ADMIN DASHBOARD
app.use("/admin", express.static(path.join(__dirname, "admin/admin")));

// 🚀 START
app.listen(PORT, () => {
console.log(`ZigaSwift backend running on ${SITE_URL}`);
});
