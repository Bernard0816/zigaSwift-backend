// ZigaSwift Admin Dashboard (static)
// Stores API base + optional admin key in localStorage

console.log("✅ admin.js loaded");

const DEFAULT_API_BASE = "https://zigaswift-backend.onrender.com";

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

function setMsg(el, text, type = "") {
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
localStorage.setItem("ZS_ADMIN_API_BASE", apiBase.trim());
localStorage.setItem("ZS_ADMIN_KEY", adminKey.trim());
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
// Clearer admin auth errors
if (res.status === 401) {
throw new Error(
adminKey
? "Admin key rejected (401). Paste the correct ADMIN_KEY and click Save."
: "Admin key required (401). Paste ADMIN_KEY and click Save."
);
}

const msg = data?.error || data?.message || `Request failed (${res.status})`;
throw new Error(msg);
}

return data;
}

function renderRows(tbody, rows, cols) {
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

// UPDATED: Test API now validates the admin key too
async function testAPI() {
setMsg(els.settingsMsg, "Testing API…");
try {
const { apiBase, adminKey } = getConfig();

// 1) Basic health check
const healthRes = await fetch(`${apiBase}/api/health`);
if (!healthRes.ok) throw new Error(`Health check failed (${healthRes.status})`);

// 2) Admin auth check (validates x-admin-key)
const headers = {};
if (adminKey) headers["x-admin-key"] = adminKey;

const adminRes = await fetch(`${apiBase}/api/admin/waitlist`, { headers });

if (adminRes.status === 401) {
throw new Error(
adminKey
? "Admin key rejected (401 Unauthorized). Paste the correct ADMIN_KEY and click Save."
: "Admin key required (401 Unauthorized). Paste ADMIN_KEY and click Save."
);
}

if (!adminRes.ok) {
throw new Error(`Admin endpoint failed (${adminRes.status})`);
}

setMsg(els.settingsMsg, "✅ API reachable + Admin key OK.", "ok");
} catch (e) {
setMsg(els.settingsMsg, `❌ ${e.message}`, "bad");
}
}

// Init
(function init() {
const { apiBase, adminKey } = getConfig();
els.apiBase.value = apiBase;
els.adminKey.value = adminKey;
els.apiBaseLabel.textContent = apiBase;

els.saveBtn.addEventListener("click", () => {
const api = els.apiBase.value.trim().replace(/\/$/, "") || DEFAULT_API_BASE;
const key = els.adminKey.value.trim();
saveConfig(api, key);
els.apiBaseLabel.textContent = api;
setMsg(els.settingsMsg, "✅ Saved.", "ok");
});

els.testBtn.addEventListener("click", testAPI);

els.refreshWaitlist.addEventListener("click", loadWaitlist);
els.refreshCouriers.addEventListener("click", loadCouriers);

// Try loading immediately
loadWaitlist();
loadCouriers();
})();
