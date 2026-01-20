// ZigaSwift Landing — script.js

// ✅ CHANGE THIS to your real backend (Node/Express) service:
const API_BASE = "https://zigaswift-backend-1.onrender.com";

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

async function postJSON(pathOrUrl, payload) {
const url = pathOrUrl.startsWith("http")
? pathOrUrl
: `${API_BASE}${pathOrUrl}`;

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

// optional payload transform (fix field names, trim, etc.)
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

// ✅ Waitlist: your backend expects { name, email, city }
// but your form uses name="hub" -> map hub => city
handleForm(
"waitlistForm",
"waitlistMsg",
"/api/waitlist",
"✅ You’re on the waitlist! Check your email for confirmation.",
(raw) => ({
name: String(raw.name || "").trim(),
email: String(raw.email || "").trim(),
city: String(raw.city || raw.hub || "").trim(), // supports either input name
})
);

// ✅ Courier: backend expects { name, email, route }
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
