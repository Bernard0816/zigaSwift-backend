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

// =========================
// Auth Modal (Sign In/Register) — paste at bottom of script.js
// =========================

const signInBtn = document.getElementById("signInBtn");
const authModal = document.getElementById("authModal");
const closeModal = document.getElementById("closeModal");
const toggleRegister = document.getElementById("toggleRegister");

const authForm = document.getElementById("authForm");
const modalTitle = document.getElementById("modalTitle");
const authSubmit = document.getElementById("authSubmit");
const authMessage = document.getElementById("authMessage");

const nameInput = document.getElementById("name");
const emailInput = document.getElementById("email");
const passInput = document.getElementById("password");
const roleSelect = document.getElementById("role");

// If you haven't added the Sign In button / modal HTML yet, these will be null.
// This guard prevents errors on pages that don't include the auth section.
if (signInBtn && authModal && closeModal && authForm && modalTitle && authSubmit && authMessage) {
let isRegister = false;

function setRegisterMode(on) {
isRegister = !!on;

modalTitle.textContent = isRegister ? "Register" : "Sign In";
authSubmit.textContent = isRegister ? "Create account" : "Sign In";

// Show extra fields only for register
if (nameInput) nameInput.style.display = isRegister ? "" : "none";
if (roleSelect) roleSelect.style.display = isRegister ? "" : "none";

// Labels (optional: your HTML labels are always visible; this keeps UI consistent)
const nameLabel = nameInput?.previousElementSibling;
const roleLabel = roleSelect?.previousElementSibling;
if (nameLabel) nameLabel.style.display = isRegister ? "" : "none";
if (roleLabel) roleLabel.style.display = isRegister ? "" : "none";

authMessage.textContent = "";
}

function openModal() {
authModal.classList.add("open");
authMessage.textContent = "";
setRegisterMode(false);
// focus email
setTimeout(() => emailInput?.focus(), 0);
}

function closeAuthModal() {
authModal.classList.remove("open");
authForm.reset();
authMessage.textContent = "";
}

signInBtn.addEventListener("click", openModal);
closeModal.addEventListener("click", closeAuthModal);

// Click outside modal-content closes
authModal.addEventListener("click", (e) => {
if (e.target === authModal) closeAuthModal();
});

// ESC closes
document.addEventListener("keydown", (e) => {
if (e.key === "Escape" && authModal.classList.contains("open")) {
closeAuthModal();
}
});

toggleRegister?.addEventListener("click", () => {
setRegisterMode(!isRegister);
});

authForm.addEventListener("submit", async (e) => {
e.preventDefault();
authMessage.textContent = "Working...";

const email = String(emailInput?.value || "").trim();
const password = String(passInput?.value || "").trim();
const fullName = String(nameInput?.value || "").trim();
const role = String(roleSelect?.value || "sender").trim();

if (!email || !email.includes("@")) {
authMessage.textContent = "❌ Enter a valid email.";
return;
}
if (!password || password.length < 6) {
authMessage.textContent = "❌ Password must be at least 6 characters.";
return;
}
if (isRegister && fullName.length < 2) {
authMessage.textContent = "❌ Enter your full name.";
return;
}

try {
// IMPORTANT: You must create these endpoints on the backend later.
// For now this will show a clean error if not built yet.
const endpoint = isRegister ? "/api/auth/register" : "/api/auth/login";
const payload = isRegister
? { name: fullName, email, password, role }
: { email, password };

const result = await postJSON(endpoint, payload);

// Save token if backend returns one
if (result?.token) localStorage.setItem("ZS_TOKEN", result.token);
if (result?.user) localStorage.setItem("ZS_USER", JSON.stringify(result.user));

authMessage.textContent = "✅ Success!";
setTimeout(() => closeAuthModal(), 600);
} catch (err) {
authMessage.textContent = `❌ ${err.message}`;
}
});

// initialize hidden fields for Sign In mode
setRegisterMode(false);
}

// ------------------------------
// Auth modal open + role routing
// ------------------------------
const authModal = document.getElementById("authModal");
const closeModalBtn = document.getElementById("closeModal");

const senderLoginLink = document.getElementById("senderLoginLink");
const courierLoginLink = document.getElementById("courierLoginLink");

// (Optional) if you still keep the old Sign In button somewhere
const signInBtn = document.getElementById("signInBtn");

const authRole = document.getElementById("authRole");
const authForm = document.getElementById("authForm");

let selectedRole = "sender"; // default

function openAuthModal(role) {
selectedRole = role || "sender";

// If you later want to show the dropdown during register,
// we still keep the value synced:
if (authRole) authRole.value = selectedRole;

authModal?.classList.add("open");
authModal?.setAttribute("aria-hidden", "false");
}

function closeAuthModal() {
authModal?.classList.remove("open");
authModal?.setAttribute("aria-hidden", "true");
}

senderLoginLink?.addEventListener("click", () => openAuthModal("sender"));
courierLoginLink?.addEventListener("click", () => openAuthModal("courier"));

// If you still have single Sign In button, it opens as sender by default
signInBtn?.addEventListener("click", () => openAuthModal("sender"));

closeModalBtn?.addEventListener("click", closeAuthModal);

// close when clicking outside modal-content
authModal?.addEventListener("click", (e) => {
if (e.target === authModal) closeAuthModal();
});

// ESC closes modal
document.addEventListener("keydown", (e) => {
if (e.key === "Escape") closeAuthModal();
});

// TEMP login behavior: redirect by role
// Later we replace this with real backend auth (JWT)
authForm?.addEventListener("submit", (e) => {
e.preventDefault();

// Example: you can read values if you want
// const email = document.getElementById("authEmail")?.value.trim();
// const pass = document.getElementById("authPassword")?.value;

if (selectedRole === "courier") {
window.location.href = "./courier-dashboard.html";
} else {
window.location.href = "./sender-dashboard.html";
}
});

// ✅ Live password match check (Register form)
const passwordInput = document.getElementById("regPassword");
const confirmInput = document.getElementById("regConfirmPassword");

confirmInput?.addEventListener("input", () => {
if (!passwordInput) return;

if (confirmInput.value === passwordInput.value) {
confirmInput.style.borderColor = "#3ddc97";
} else {
confirmInput.style.borderColor = "#ff6b6b";
}
});
