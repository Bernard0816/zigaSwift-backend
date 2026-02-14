// ZigaSwift Landing — script.js

// ✅ CHANGE THIS to your real backend (Node/Express) service:
const API_BASE = "https://zigaswift-backend-1.onrender.com";

document.addEventListener("DOMContentLoaded", () => {
/* =========================
NAV + YEAR
========================= */
const navToggle = document.getElementById("navToggle");
const navLinks = document.getElementById("navLinks");

navToggle?.addEventListener("click", () => {
const isOpen = navLinks.classList.toggle("open");
navToggle.setAttribute("aria-expanded", String(isOpen));
});

navLinks?.querySelectorAll("a").forEach((a) => {
a.addEventListener("click", () => {
navLinks.classList.remove("open");
navToggle.setAttribute("aria-expanded", "false");
});
});

const yearEl = document.getElementById("year");
if (yearEl) yearEl.textContent = String(new Date().getFullYear());

/* =========================
HELPERS
========================= */
async function postJSON(pathOrUrl, payload) {
const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${API_BASE}${pathOrUrl}`;

const res = await fetch(url, {
method: "POST",
headers: { "Content-Type": "application/json" },
body: JSON.stringify(payload),
});

const data = await res.json().catch(() => ({}));

if (!res.ok) {
const msg = data?.error || `Request failed (${res.status})`;
throw new Error(msg);
}
return data;
}

function handleForm(formId, msgId, endpoint, successText, transformPayload) {
const form = document.getElementById(formId);
const msg = document.getElementById(msgId);
if (!form || !msg) return;

form.addEventListener("submit", async (e) => {
e.preventDefault();
msg.textContent = "Submitting...";

const data = new FormData(form);
const raw = Object.fromEntries(data.entries());

const payload = transformPayload ? transformPayload(raw) : raw;

const name = String(payload.name || "").trim();
const email = String(payload.email || "").trim();

if (!name || !email || !email.includes("@")) {
msg.textContent = "Please enter a valid name and email.";
return;
}

try {
await postJSON(endpoint, payload);
msg.textContent = successText;
form.reset();
} catch (err) {
msg.textContent = `❌ ${err.message}`;
}
});
}

/* =========================
WAITLIST
========================= */
handleForm(
"waitlistForm",
"waitlistMsg",
"/api/waitlist",
"✅ You’re on the waitlist! Check your email for confirmation.",
(raw) => ({
name: String(raw.name || "").trim(),
email: String(raw.email || "").trim(),
city: String(raw.city || raw.hub || "").trim(),
})
);

/* =========================
COURIER FORM (optional: only if you still have it)
NOTE: Your HTML you shared uses registerForm, not courierForm.
This is safe: if courierForm doesn't exist, it does nothing.
========================= */
handleForm(
"courierForm",
"courierMsg",
"/api/courier",
"✅ Application received! Check your email for next steps.",
(raw) => ({
name: String(raw.name || "").trim(),
email: String(raw.email || "").trim(),
route: String(raw.route || "").trim(),
})
);

/* =========================
AUTH MODAL (ONE LOGIN) — FIXED
Requires in HTML:
- nav button id="LoginLink"
- modal id="authModal"
- close button id="closeModal"
- form id="authForm"
- email input id="authEmail"
- password input id="authPassword"
- message p id="authMessage"
- link id="goRegisterLink" href="#courier"
========================= */
const loginBtn = document.getElementById("LoginLink");
const modal = document.getElementById("authModal");
const closeBtn = document.getElementById("closeModal");
const authForm = document.getElementById("authForm");
const authMessage = document.getElementById("authMessage");
const goRegisterLink = document.getElementById("goRegisterLink");

function openModal() {
if (!modal) return;
if (authMessage) authMessage.textContent = "";
modal.classList.add("open");
modal.style.display = "flex";
modal.setAttribute("aria-hidden", "false");
}

function closeModal() {
if (!modal) return;
modal.classList.remove("open");
modal.style.display = "none";
modal.setAttribute("aria-hidden", "true");
authForm?.reset();
if (authMessage) authMessage.textContent = "";
}

loginBtn?.addEventListener("click", (e) => {
e.preventDefault();
openModal();
});

closeBtn?.addEventListener("click", closeModal);

modal?.addEventListener("click", (e) => {
if (e.target === modal) closeModal();
});

document.addEventListener("keydown", (e) => {
if (e.key === "Escape" && modal?.classList.contains("open")) closeModal();
});

goRegisterLink?.addEventListener("click", (e) => {
e.preventDefault();
closeModal();
document.getElementById("courier")?.scrollIntoView({ behavior: "smooth" });
});

// ✅ TEMP login (frontend only). Swap to real backend auth later.
authForm?.addEventListener("submit", (e) => {
e.preventDefault();
if (authMessage) {
authMessage.style.color = "#3ddc97";
authMessage.textContent = "✅ Signed in! Redirecting...";
}
setTimeout(() => {
window.location.href = "./sender-dashboard.html";
}, 700);
});
});
