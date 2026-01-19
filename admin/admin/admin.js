// admin.js — ZigaSwift Admin Dashboard
// Saves API base + optional admin key in localStorage

console.log("✅ admin.js loaded");

const DEFAULT_API_BASE = "https://zigaswift-backend.onrender.com";

function setMsg(el, text, type = "") {
if (!el) return;
el.textContent = text || "";
el.className = "msg" + (type ? " " + type : "");
}

function normalizeBase(url) {
return (url || "").trim().replace(/\/+$/, "");
}

function getConfig() {
const apiBase = normalizeBase(localStorage.getItem("ZS_ADMIN_API_BASE")) || DEFAULT_API_BASE;
const adminKey = (localStorage.getItem("ZS_ADMIN_KEY") || "").trim();
return { apiBase, adminKey };
}

function saveConfig(apiBase, adminKey) {
localStorage.setItem("ZS_ADMIN_API_BASE", normalizeBase(apiBase));
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

document.addEventListener("DOMContentLoaded", () => {
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

// Quick sanity check
if (!els.saveBtn || !els.testBtn || !els.apiBase || !els.adminKey) {
setMsg(els.settingsMsg, "❌ IDs mismatch: check index.html element ids.", "bad");
console.log("❌ Missing elements:", els);
return;
}

// Init values
const cfg = getConfig();
els.apiBase.value = cfg.apiBase;
els.adminKey.value = cfg.adminKey;
if (els.apiBaseLabel) els.apiBaseLabel.textContent = cfg.apiBase;

// Save
els.saveBtn.addEventListener("click", () => {
const api = normalizeBase(els.apiBase.value) || DEFAULT_API_BASE;
const key = (els.adminKey.value || "").trim();
saveConfig(api, key);
if (els.apiBaseLabel) els.apiBaseLabel.textContent = api;
setMsg(els.settingsMsg, "✅ Saved to browser storage.", "ok");
console.log("✅ Saved config:", { api, key });
});

// Test API
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

// Auto-load (will show Unauthorized until you put correct x-admin-key)
loadWaitlist();
loadCouriers();
});
