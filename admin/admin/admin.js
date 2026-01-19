// ZigaSwift Admin Dashboard (static)
// Stores API base + optional admin key in localStorage

const DEFAULT_API_BASE = "https://zigaswift-backend.onrender.com";

console.log("✅ admin.js loaded");

function setMsg(el, text, type = "") {
if (!el) return;
el.textContent = text || "";
el.className = "msg" + (type ? " " + type : "");
}

function getConfig() {
const apiBase = (localStorage.getItem("ZS_ADMIN_API_BASE") || DEFAULT_API_BASE)
.trim()
.replace(/\/$/, "");
const adminKey = (localStorage.getItem("ZS_ADMIN_KEY") || "").trim();
return { apiBase, adminKey };
}

function saveConfig(apiBase, adminKey) {
localStorage.setItem("ZS_ADMIN_API_BASE", (apiBase || "").trim());
localStorage.setItem("ZS_ADMIN_KEY", (adminKey || "").trim());
}

async function getJSON(path) {
const { apiBase, adminKey } = getConfig();
const url = `${apiBase}${path}`;

const headers = { "Content-Type": "application/json" };
if (adminKey) headers["x-admin-key"] = adminKey;

const res = await fetch(url, { headers });
const text = await res.text();

let data;
try {
data = JSON.parse(text);
} catch {
data = { raw: text };
}

if (!res.ok) {
const msg = data?.error || data?.message || `Request failed (${res.status})`;
throw new Error(msg);
}
return data;
}

function renderRows(tbody, rows, cols) {
if (!tbody) return;

tbody.innerHTML = "";
if (!Array.isArray(rows) || rows.length === 0) {
const tr = document.createElement("tr");
const td = document.createElement("td");
td.colSpan = cols.length;
td.textContent = "No records found.";
td.style.color = "#9ab0d6";
tr.appendChild(td);
tbody.appendChild(tr);
return;
}

for (const r of rows) {
const tr = document.createElement("tr");
for (const c of cols) {
const td = document.createElement("td");
td.textContent = r?.[c] ?? "";
tr.appendChild(td);
}
tbody.appendChild(tr);
}
}

window.addEventListener("DOMContentLoaded", () => {
const els = {
apiBase: document.getElementById("apiBase"),
adminKey: document.getElementById("adminKey"),
apiBaseLabel: document.getElementById("apiBaseLabel"),

saveBtn: document.getElementById("saveBtn"),
testBtn: document.getElementById("testBtn"),
settingsMsg: document.getElementById("settingsMsg"),

refreshWaitlist: document.getElementById("refreshWaitlist"),
refreshCouriers: document.getElementById("refreshCouriers"),

waitlistMsg: document.getElementById("waitlistMsg"),
courierMsg: document.getElementById("courierMsg"),

waitlistBody: document.getElementById("waitlistBody"),
courierBody: document.getElementById("courierBody"),
};

console.log("🔎 Elements:", els);

// If key elements are missing, show message and stop
if (!els.apiBase || !els.adminKey || !els.saveBtn || !els.testBtn) {
setMsg(els.settingsMsg, "❌ Admin UI IDs mismatch. Check index.html element ids.", "bad");
return;
}

// Init values
const cfg = getConfig();
els.apiBase.value = cfg.apiBase;
els.adminKey.value = cfg.adminKey;
if (els.apiBaseLabel) els.apiBaseLabel.textContent = cfg.apiBase;

// Save button
els.saveBtn.addEventListener("click", () => {
const api = (els.apiBase.value || DEFAULT_API_BASE).trim().replace(/\/$/, "");
const key = (els.adminKey.value || "").trim();

saveConfig(api, key);

if (els.apiBaseLabel) els.apiBaseLabel.textContent = api;
setMsg(els.settingsMsg, "✅ Saved to browser localStorage.", "ok");

console.log("✅ Saved config:", { api, key });
});

// Test API button
els.testBtn.addEventListener("click", async () => {
setMsg(els.settingsMsg, "Testing API…");
try {
const { apiBase } = getConfig();
const res = await fetch(`${apiBase}/api/health`);
if (!res.ok) throw new Error(`Health check failed (${res.status})`);
setMsg(els.settingsMsg, "✅ API is reachable.", "ok");
} catch (e) {
setMsg(els.settingsMsg, `❌ ${e.message}`, "bad");
}
});

async function loadWaitlist() {
setMsg(els.waitlistMsg, "Loading waitlist…");
try {
const data = await getJSON("/api/admin/waitlist");
renderRows(els.waitlistBody, data.items, ["id", "name", "email", "city", "created_at"]);
setMsg(els.waitlistMsg, `Loaded ${data.items?.length ?? 0} waitlist records.`, "ok");
} catch (e) {
setMsg(els.waitlistMsg, `❌ ${e.message}`, "bad");
}
}

async function loadCouriers() {
setMsg(els.courierMsg, "Loading courier applications…");
try {
const data = await getJSON("/api/admin/couriers");
renderRows(els.courierBody, data.items, ["id", "name", "email", "route", "created_at"]);
setMsg(els.courierMsg, `Loaded ${data.items?.length ?? 0} courier applications.`, "ok");
} catch (e) {
setMsg(els.courierMsg, `❌ ${e.message}`, "bad");
}
}

if (els.refreshWaitlist) els.refreshWaitlist.addEventListener("click", loadWaitlist);
if (els.refreshCouriers) els.refreshCouriers.addEventListener("click", loadCouriers);

// Auto load
loadWaitlist();
loadCouriers();
});
