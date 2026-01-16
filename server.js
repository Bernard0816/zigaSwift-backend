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
allowedHeaders: ["Content-Type"],
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

// Ensure data folder exists
if (!fs.existsSync(dataDir)) {
fs.mkdirSync(dataDir);
}

// Create / open database safely
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
secure: false, // true only if you use port 465
auth: {
user: process.env.SMTP_USER,
pass: process.env.SMTP_PASS,
},
});

function sendMailSafe({ to, subject, html }) {
// Don’t crash requests if email creds aren’t set yet
if (!process.env.MAIL_FROM || !process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
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

// 🚚 COURIER API
app.post("/api/courier", async (req, res) => {
try {
const schema = z.object({
name: z.string().min(2),
email: z.string().email(),
route: z.string().min(2),
});

const data = schema.parse(req.body);

res.json({
ok: true,
message: "Courier application received",
data,
});
} catch (err) {
res.status(400).json({ ok: false, error: err.message });
}
});

// 📁 FRONTEND FALLBACK (OPTIONAL)
app.get("*", (req, res) => {
const indexPath = path.join(__dirname, "public", "index.html");
if (fs.existsSync(indexPath)) return res.sendFile(indexPath);
return res.status(404).send("Not Found");
});

// 🚀 START SERVER
app.listen(PORT, () => {
console.log(`ZigaSwift backend running on ${SITE_URL} (PORT ${PORT})`);
});