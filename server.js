const path = require("path");
const fs = require("fs");

// Use Render-safe writable DB path
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "data", "zigaswift.sqlite");

// If DB_PATH is a folder path, ensure its directory exists
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
fs.mkdirSync(dbDir, { recursive: true });
}

console.log("Using DB_PATH:", DB_PATH);

// then open sqlite using DB_PATH
// Example:
// const db = new sqlite3.Database(DB_PATH);
const express = require("express");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const cors = require("cors");
const { z } = require("zod");
const sqlite3 = require("sqlite3").verbose();
const nodemailer = require("nodemailer");

const PORT = process.env.PORT || 3000;
const SITE_URL = process.env.SITE_URL || "http://localhost:" + PORT;

const db = new sqlite3.Database(path.join(__dirname, "data", "verifly.db"));

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS waitlist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    hub TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS courier_applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    route TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`);
});

function nowISO() {
  return new Date().toISOString();
}

function makeTransport() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const port = Number(process.env.SMTP_PORT || 587);
  const from = process.env.MAIL_FROM || "VeriFly <no-reply@verifly.com>";

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
  if (!transport) return;
  await transport.sendMail({ from, to, subject, html });
}

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "200kb" }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

app.use(express.static(path.join(__dirname, "public")));

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

app.post("/api/waitlist", async (req, res) => {
  try {
    const parsed = WaitlistSchema.parse(req.body);
    const result = await insertWaitlist(parsed);

    await sendMail(
      parsed.email,
      "You're on the VeriFly waitlist ✅",
      `
      <div style="font-family:Arial,sans-serif;line-height:1.5">
        <h2>Welcome to VeriFly, ${escapeHtml(parsed.name)}!</h2>
        <p>You're officially on the waitlist for <b>${escapeHtml(parsed.hub)}</b>.</p>
        <p>We’ll email you when VeriFly opens in your area and when early access is available.</p>
        <p style="margin-top:18px">— VeriFly Team</p>
        <hr/>
        <small>You received this because you signed up at ${SITE_URL}.</small>
      </div>
      `
    );

    return res.json({ ok: true, id: result.id });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message || "Invalid request" });
  }
});

app.post("/api/courier", async (req, res) => {
  try {
    const parsed = CourierSchema.parse(req.body);
    const result = await insertCourier(parsed);

    await sendMail(
      parsed.email,
      "VeriFly Courier Application Received ✈️",
      `
      <div style="font-family:Arial,sans-serif;line-height:1.5">
        <h2>Thanks, ${escapeHtml(parsed.name)}!</h2>
        <p>We received your courier application.</p>
        <p><b>Typical route:</b> ${escapeHtml(parsed.route)}</p>
        <p>Next steps: we’ll follow up with verification requirements and onboarding.</p>
        <p style="margin-top:18px">— VeriFly Team</p>
        <hr/>
        <small>You received this because you applied at ${SITE_URL}.</small>
      </div>
      `
    );

    return res.json({ ok: true, id: result.id });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message || "Invalid request" });
  }
});

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

app.listen(PORT, () => {
  console.log(`VeriFly running on ${SITE_URL}`);
});
