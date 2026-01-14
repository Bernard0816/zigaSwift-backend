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

const app = express(); // ✅ ONLY DECLARED ONCE

// 🔒 TRUST PROXY (REQUIRED FOR RENDER)
app.set("trust proxy", 1);

// 🌐 ENV
const PORT = process.env.PORT || 10000;
const SITE_URL = process.env.SITE_URL || "http://localhost:10000";

// 🛡️ SECURITY
app.use(helmet());
app.use(express.json());

// 🌍 CORS
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
app.options("*", cors(corsOptions));

// 🚦 RATE LIMIT
const limiter = rateLimit({
windowMs: 15 * 60 * 1000,
max: 100,
});
app.use(limiter);

// 🗄️ DATABASE
const dbPath = path.join(__dirname, "data", "zigaswift.db");

// Ensure data folder exists
if (!fs.existsSync(path.join(__dirname, "data"))) {
fs.mkdirSync(path.join(__dirname, "data"));
}

// Create / open database safely
const db = new sqlite3.Database(dbPath, (err) => {
if (err) {
console.error("❌ Failed to open database:", err.message);
} else {
console.log("✅ SQLite database connected at:", dbPath);
}
});

db.run(`
CREATE TABLE IF NOT EXISTS waitlist (
id INTEGER PRIMARY KEY AUTOINCREMENT,
name TEXT,
email TEXT,
city TEXT,
created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
`);

// ✉️ EMAIL
const transporter = nodemailer.createTransport({
host: process.env.SMTP_HOST,
port: process.env.SMTP_PORT,
secure: false,
auth: {
user: process.env.SMTP_USER,
pass: process.env.SMTP_PASS,
},
});

// ✅ HEALTH CHECK
app.get("/", (req, res) => {
res.json({ ok: true, message: "ZigaSwift backend is running 🚀" });
});

// 📩 WAITLIST API
app.post("/api/waitlist", async (req, res) => {
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
if (err) throw err;

transporter.sendMail({
from: process.env.MAIL_FROM,
to: data.email,
subject: "Welcome to ZigaSwift 🚀",
html: `<p>Hi ${data.name}, thanks for joining the ZigaSwift waitlist!</p>`,
});

res.json({ ok: true, id: this.lastID });
}
);
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
