// ZigaSwift Landing — script.js

// ✅ IMPORTANT: point the STATIC SITE to the REAL BACKEND (Web Service)
const API_BASE = "https://zigaswift-backend-1.onrender.com"; // <-- change only if backend changes

const navToggle = document.getElementById("navToggle");
const navLinks = document.getElementById("navLinks");

navToggle?.addEventListener("click", () => {
const isOpen = navLinks.classList.toggle("open");
navToggle.setAttribute("aria-expanded", String(isOpen));
});

navLinks?.querySelectorAll("a").forEach((a) => {
a.addEventListener("click", () => {
navLinks.classList.remove("open");
navToggle?.setAttribute("aria-expanded", "false");
});
});

// Year (safe)
const yearEl = document.getElementById("year");
if (yearEl) yearEl.textContent = String(new Date().getFullYear());

// --- Helpers ---
function setMsg(el, text, type = "") {
if (!el) return;
el.textContent = text || "";
el.className = type ? `msg ${type}` : "msg";
}

function isValidEmail(email) {
// simple + safe check
return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

function buildUrl(path) {
const base = String(API_BASE || "").trim().replace(/\/$/, "");
const p = String(path || "").trim();
if (!base) throw new Error("API_BASE is missing.");
if (!p.startsWith("/")) return `${base}/${p}`;
return `${base}${p}`;
}

async function postJSON(path, payload) {
const url = buildUrl(path);

const res = await fetch(url, {
method: "POST",
headers: { "Content-Type": "application/json" },
body: JSON.stringify(payload),
});

const text = await res.text();
let data = {};
try {
data = text ? JSON.parse(text) : {};
} catch {
data = { raw: text };
}

if (!res.ok) {
const msg = data?.error || data?.message || `Request failed (${res.status})`;
throw new Error(msg);
}

return data;
}

function lockForm(form, isLocked) {
if (!form) return;
[...form.querySelectorAll("input, button, textarea, select")].forEach((el) => {
el.disabled = !!isLocked;
});
}

// --- Generic form handler ---
function handleForm({ formId, msgId, path, successText, validate }) {
const form = document.getElementById(formId);
const msg = document.getElementById(msgId);
if (!form || !msg) return;

form.addEventListener("submit", async (e) => {
e.preventDefault();

setMsg(msg, "Submitting…");
lockForm(form, true);

const fd = new FormData(form);
const payload = Object.fromEntries(fd.entries());

// normalize common fields
payload.name = String(payload.name || "").trim();
payload.email = String(payload.email || "").trim();

try {
// run custom validation per form
if (typeof validate === "function") validate(payload);

await postJSON(path, payload);

setMsg(msg, successText, "ok");
form.reset();
} catch (err) {
setMsg(msg, `❌ ${err.message}`, "bad");
} finally {
lockForm(form, false);
}
});
}

// ✅ Waitlist: expects { name, email, city }
handleForm({
formId: "waitlistForm",
msgId: "waitlistMsg",
path: "/api/waitlist",
successText: "✅ You’re on the waitlist! Check your email for confirmation.",
validate: (payload) => {
payload.city = String(payload.city || "").trim();

if (!payload.name || payload.name.length < 2) {
throw new Error("Please enter your full name.");
}
if (!isValidEmail(payload.email)) {
throw new Error("Please enter a valid email address.");
}
if (!payload.city || payload.city.length < 2) {
throw new Error("Please enter your city.");
}
},
});

// ✅ Courier: expects { name, email, route }
handleForm({
formId: "courierForm",
msgId: "courierMsg",
path: "/api/courier",
successText: "✅ Application received! Check your email for next steps.",
validate: (payload) => {
payload.route = String(payload.route || "").trim();

if (!payload.name || payload.name.length < 2) {
throw new Error("Please enter your full name.");
}
if (!isValidEmail(payload.email)) {
throw new Error("Please enter a valid email address.");
}
if (!payload.route || payload.route.length < 2) {
throw new Error("Please enter your typical route.");
}
},
});
