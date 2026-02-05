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
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();

app.set("trust proxy", 1);

const PORT = process.env.PORT || 10000;
const SITE_URL = process.env.SITE_URL || `http://localhost:${PORT}`;
const ADMIN_NOTIFY_EMAIL = (process.env.ADMIN_NOTIFY_EMAIL || "").trim();
const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret_here"; // Must be set in Render env

// Security, CORS, Rate Limit (unchanged)

// Database setup (add users and shipments tables)
db.serialize(() => {
// ... existing waitlist/couriers tables ...

db.run(`
CREATE TABLE IF NOT EXISTS users (
id INTEGER PRIMARY KEY AUTOINCREMENT,
email TEXT UNIQUE,
password TEXT,
name TEXT,
role TEXT DEFAULT 'sender', // 'sender' or 'courier'
created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
`);

db.run(`
CREATE TABLE IF NOT EXISTS shipments (
id INTEGER PRIMARY KEY AUTOINCREMENT,
sender_id INTEGER,
courier_id INTEGER DEFAULT NULL,
pickup TEXT,
dropoff TEXT,
weight_kg REAL,
priority TEXT,
contents TEXT,
value REAL,
status TEXT DEFAULT 'pending', // 'pending', 'matched', 'accepted', 'paid', 'in_transit', 'delivered'
created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
FOREIGN KEY (sender_id) REFERENCES users(id),
FOREIGN KEY (courier_id) REFERENCES users(id)
)
`);

// Add to couriers table for matching (routes, tier, max_weight)
db.run(`ALTER TABLE couriers ADD COLUMN routes TEXT`, () => {}); // e.g. "USA,UK,Europe"
db.run(`ALTER TABLE couriers ADD COLUMN tier TEXT DEFAULT 'bronze'`, () => {}); // 'bronze', 'silver', 'gold'
db.run(`ALTER TABLE couriers ADD COLUMN max_weight_kg REAL DEFAULT 5`, () => {}); // based on tier
});

// ... existing email transporter, sendMailSafe, zodErrorToMessage, health checks, admin auth, admin UI, waitlist/courier endpoints, admin API, Stripe endpoint ...

// ────────────────────────────────────────────────
// NEW: User Auth Endpoints
// ────────────────────────────────────────────────
app.post("/api/register", async (req, res) => {
try {
const schema = z.object({
name: z.string().min(2).max(80),
email: z.string().email(),
password: z.string().min(6),
role: z.enum(['sender', 'courier']).default('sender'),
});

const data = schema.parse(req.body);

const hashedPassword = await bcrypt.hash(data.password, 10);

db.run(
`INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)`,
[data.name, data.email, hashedPassword, data.role],
function (err) {
if (err) {
return res.status(400).json({ error: 'Email already in use or database error' });
}
const token = jwt.sign({ id: this.lastID, role: data.role }, JWT_SECRET, { expiresIn: '7d' });
res.json({ ok: true, token });
}
);
} catch (err) {
res.status(400).json({ error: zodErrorToMessage(err) });
}
});

app.post("/api/login", (req, res) => {
try {
const schema = z.object({
email: z.string().email(),
password: z.string(),
});

const data = schema.parse(req.body);

db.get(`SELECT * FROM users WHERE email = ?`, [data.email], async (err, user) => {
if (err || !user) return res.status(401).json({ error: 'Invalid email or password' });

const match = await bcrypt.compare(data.password, user.password);
if (!match) return res.status(401).json({ error: 'Invalid email or password' });

const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
res.json({ ok: true, token });
});
} catch (err) {
res.status(400).json({ error: zodErrorToMessage(err) });
}
});

// JWT Middleware for protected routes
function requireAuth(req, res, next) {
const authHeader = req.headers.authorization;
if (!authHeader) return res.status(401).json({ error: 'No token provided' });

const [type, token] = authHeader.split(' ');
if (type !== 'Bearer') return res.status(401).json({ error: 'Invalid token format' });

jwt.verify(token, JWT_SECRET, (err, decoded) => {
if (err) return res.status(401).json({ error: 'Invalid or expired token' });
req.user = decoded;
next();
});
}

// NEW: Profile endpoint (protected)
app.get("/api/user/profile", requireAuth, (req, res) => {
db.get(`SELECT id, name, email, role FROM users WHERE id = ?`, [req.user.id], (err, user) => {
if (err || !user) return res.status(500).json({ error: 'Database error' });
res.json({ ok: true, user });
});
});

// NEW: Sender create shipment request (protected)
app.post("/api/shipment/request", requireAuth, (req, res) => {
if (req.user.role !== 'sender') return res.status(403).json({ error: 'Only senders can create shipments' });

try {
const schema = z.object({
pickup: z.string().min(2),
dropoff: z.string().min(2),
weight_kg: z.number().positive(),
priority: z.enum(['standard', 'express', 'rush']),
contents: z.string().min(10),
value: z.number().positive(),
});

const data = schema.parse(req.body);

db.run(
`INSERT INTO shipments (sender_id, pickup, dropoff, weight_kg, priority, contents, value) VALUES (?, ?, ?, ?, ?, ?, ?)`,
[req.user.id, data.pickup, data.dropoff, data.weight_kg, data.priority, data.contents, data.value],
function (err) {
if (err) return res.status(500).json({ error: "Database error" });
res.json({ ok: true, id: this.lastID });
}
);
} catch (err) {
res.status(400).json({ error: zodErrorToMessage(err) });
}
});

// NEW: Get matches for a shipment (for sender)
app.get("/api/shipment/:id/matches", requireAuth, (req, res) => {
const shipmentId = Number(req.params.id);

db.get(`SELECT * FROM shipments WHERE id = ? AND sender_id = ?`, [shipmentId, req.user.id], (err, shipment) => {
if (err || !shipment) return res.status(404).json({ error: 'Shipment not found or not yours' });

// Simple matching logic (replace with advanced fuzzy match later)
db.all(`
SELECT * FROM couriers
WHERE status = 'accepted' AND routes LIKE ? AND max_weight_kg >= ?
ORDER BY tier DESC LIMIT 10
`, [`%${shipment.dropoff}%`, shipment.weight_kg], (err, couriers) => {
if (err) return res.status(500).json({ error: "Database error" });
res.json({ ok: true, matches: couriers });
});
});
});

// NEW: Sender pick courier for shipment (triggers payment)
app.patch("/api/shipment/:id/pick-courier", requireAuth, (req, res) => {
try {
const schema = z.object({
courierId: z.number(),
});

const data = schema.parse(req.body);
const shipmentId = Number(req.params.id);

db.run(`UPDATE shipments SET courier_id = ? WHERE id = ? AND sender_id = ? AND status = 'pending'`, [data.courierId, shipmentId, req.user.id], function (err) {
if (err) return res.status(500).json({ error: "Database error" });
if (this.changes === 0) return res.status(404).json({ error: 'Shipment not found or not pending' });
res.json({ ok: true });
// Next step: trigger payment flow here or on frontend
});
} catch (err) {
res.status(400).json({ error: zodErrorToMessage(err) });
}
});

// NEW: Courier get available shipments (matching their routes)
app.get("/api/courier/available-shipments", requireAuth, (req, res) => {
if (req.user.role !== 'courier') return res.status(403).json({ error: 'Only couriers can view available shipments' });

db.get(`SELECT routes, max_weight_kg FROM couriers WHERE id = ?`, [req.user.id], (err, profile) => {
if (err || !profile) return res.status(404).json({ error: 'Courier profile not found' });

db.all(`
SELECT * FROM shipments
WHERE status = 'pending' AND courier_id IS NULL AND dropoff LIKE ? AND weight_kg <= ?
ORDER BY created_at DESC LIMIT 20
`, [`%${profile.routes}%`, profile.max_weight_kg], (err, shipments) => {
if (err) return res.status(500).json({ error: "Database error" });
res.json({ ok: true, shipments });
});
});
});

// NEW: Courier accept shipment
app.patch("/api/courier/accept-shipment/:id", requireAuth, (req, res) => {
if (req.user.role !== 'courier') return res.status(403).json({ error: 'Only couriers can accept shipments' });

const shipmentId = Number(req.params.id);

db.run(`UPDATE shipments SET courier_id = ?, status = 'accepted' WHERE id = ? AND status = 'pending' AND courier_id IS NULL`, [req.user.id, shipmentId], function (err) {
if (err) return res.status(500).json({ error: "Database error" });
if (this.changes === 0) return res.status(404).json({ error: 'Shipment not found or not available' });
res.json({ ok: true });
});
});

// ... 404 fallback, app.listen ...
