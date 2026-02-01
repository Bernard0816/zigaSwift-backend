// admin.js - ZigaSwift Admin Dashboard
// Last synced with improved HTML layout (Feb 2025)

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
let apiBase = (localStorage.getItem("ZS_ADMIN_API_BASE") || DEFAULT_API_BASE).trim();
apiBase = apiBase.replace(/\/$/, '');
const adminKey = (localStorage.getItem("ZS_ADMIN_KEY") || "").trim();
return { apiBase, adminKey };
}

function saveConfig(apiBase, adminKey) {
localStorage.setItem("ZS_ADMIN_API_BASE", apiBase);
localStorage.setItem("ZS_ADMIN_KEY", adminKey);
}

function buildHeaders() {
const { adminKey } = getConfig();
const headers = { "Content-Type": "application/json" };
if (adminKey) headers["x-admin-key"] = adminKey;
return headers;
}

async function requestJSON(method, path) {
const { apiBase } = getConfig();
const url = `${apiBase}${path}`;

let res;
try {
res = await fetch(url, {
method,
headers: buildHeaders(),
});
} catch (err) {
throw new Error(`Network error: ${err.message}`);
}

let data;
try {
data = await res.json();
} catch {
throw new Error(`Invalid JSON response (status ${res.status})`);
}

if (!res.ok) {
if (res.status === 401) {
throw new Error(
getConfig().adminKey
? "Admin key rejected (401). Please check/correct the ADMIN_KEY."
: "Admin key required (401). Please provide ADMIN_KEY."
);
}
throw new Error(data?.error || data?.message || `Request failed (${res.status})`);
}

return data;
}

function makeBtn(label, extraClass, onClick) {
const btn = document.createElement("button");
btn.type = "button";
btn.className = `btn-sm ${extraClass}`;
btn.textContent = label;
btn.addEventListener("click", onClick);
return btn;
}

function renderEmptyRow(tbody, colSpan) {
tbody.innerHTML = "";
const tr = document.createElement("tr");
const td = document.createElement("td");
td.colSpan = colSpan;
td.textContent = "No records found.";
td.style.color = "#9ab0d6";
td.style.padding = "16px";
td.style.textAlign = "center";
tr.appendChild(td);
tbody.appendChild(tr);
}

function renderWaitlistRows(tbody, rows) {
tbody.innerHTML = "";

if (!Array.isArray(rows) || rows.length === 0) {
return renderEmptyRow(tbody, 6);
}

for (const r of rows) {
const tr = document.createElement("tr");

["id", "name", "email", "city", "created_at"].forEach(key => {
const td = document.createElement("td");
td.textContent = r[key] ?? "";
tr.appendChild(td);
});

// Actions column
const tdActions = document.createElement("td");
tdActions.className = "actions-cell";

const wrap = document.createElement("div");
wrap.className = "actions";

const id = r.id;

const acceptBtn = makeBtn("Accept", "btn-accept", async () => {
acceptBtn.disabled = true;
try {
await requestJSON("PATCH", `/api/admin/waitlist/${id}/accept`);
await loadWaitlist();
} catch (err) {
alert(err.message);
} finally {
acceptBtn.disabled = false;
}
});

const rejectBtn = makeBtn("Reject", "btn-reject", async () => {
rejectBtn.disabled = true;
try {
await requestJSON("PATCH", `/api/admin/waitlist/${id}/reject`);
await loadWaitlist();
} catch (err) {
alert(err.message);
} finally {
rejectBtn.disabled = false;
}
});

const deleteBtn = makeBtn("Delete", "btn-delete", async () => {
if (!confirm(`Delete waitlist entry #${id}? This action cannot be undone.`)) return;
deleteBtn.disabled = true;
try {
await requestJSON("DELETE", `/api/admin/waitlist/${id}`);
await loadWaitlist();
} catch (err) {
alert(err.message);
} finally {
deleteBtn.disabled = false;
}
});

wrap.append(acceptBtn, rejectBtn, deleteBtn);
tdActions.appendChild(wrap);
tr.appendChild(tdActions);

tbody.appendChild(tr);
}
}

function renderCourierRows(tbody, rows) {
tbody.innerHTML = "";

if (!Array.isArray(rows) || rows.length === 0) {
return renderEmptyRow(tbody, 6);
}

for (const r of rows) {
const tr = document.createElement("tr");

["id", "name", "email", "route", "created_at"].forEach(key => {
const td = document.createElement("td");
td.textContent = r[key] ?? "";
tr.appendChild(td);
});

const tdActions = document.createElement("td");
tdActions.className = "actions-cell";

const wrap = document.createElement("div");
wrap.className = "actions";

const id = r.id;

const acceptBtn = makeBtn("Accept", "btn-accept", async () => {
acceptBtn.disabled = true;
try {
await requestJSON("PATCH", `/api/admin/couriers/${id}/accept`);
await loadCouriers();
} catch (err) {
alert(err.message);
} finally {
acceptBtn.disabled = false;
}
});

const rejectBtn = makeBtn("Reject", "btn-reject", async () => {
rejectBtn.disabled = true;
try {
await requestJSON("PATCH", `/api/admin/couriers/${id}/reject`);
await loadCouriers();
} catch (err) {
alert(err.message);
} finally {
rejectBtn.disabled = false;
}
});

const deleteBtn = makeBtn("Delete", "btn-delete", async () => {
if (!confirm(`Delete courier application #${id}? This action cannot be undone.`)) return;
deleteBtn.disabled = true;
try {
await requestJSON("DELETE", `/api/admin/couriers/${id}`);
await loadCouriers();
} catch (err) {
alert(err.message);
} finally {
deleteBtn.disabled = false;
}
});

wrap.append(acceptBtn, rejectBtn, deleteBtn);
tdActions.appendChild(wrap);
tr.appendChild(tdActions);

tbody.appendChild(tr);
}
}

async function loadWaitlist() {
setMsg(els.waitlistMsg, "Loading waitlist…");
try {
const data = await requestJSON("GET", "/api/admin/waitlist");
renderWaitlistRows(els.waitlistBody, data.items || data || []);
setMsg(els.waitlistMsg, `Loaded ${data.items?.length ?? data.length ?? 0} waitlist records.`, "ok");
} catch (err) {
setMsg(els.waitlistMsg, `❌ ${err.message}`, "bad");
}
}

async function loadCouriers() {
setMsg(els.courierMsg, "Loading courier applications…");
try {
const data = await requestJSON("GET", "/api/admin/couriers");
renderCourierRows(els.courierBody, data.items || data || []);
setMsg(els.courierMsg, `Loaded ${data.items?.length ?? data.length ?? 0} courier applications.`, "ok");
} catch (err) {
setMsg(els.courierMsg, `❌ ${err.message}`, "bad");
}
}

async function testAPI() {
setMsg(els.settingsMsg, "Testing API…");
try {
const { apiBase, adminKey } = getConfig();

// Basic health check
const health = await fetch(`${apiBase}/api/health`);
if (!health.ok) throw new Error(`Health check failed (${health.status})`);

// Admin endpoint check
const headers = adminKey ? { "x-admin-key": adminKey } : {};
const adminTest = await fetch(`${apiBase}/api/admin/waitlist`, { headers });
if (adminTest.status === 401) {
throw new Error(
adminKey
? "Admin key rejected (401 Unauthorized)."
: "Admin key required (401 Unauthorized)."
);
}
if (!adminTest.ok) throw new Error(`Admin endpoint check failed (${adminTest.status})`);

setMsg(els.settingsMsg, "✅ API reachable + Admin key OK.", "ok");
} catch (err) {
setMsg(els.settingsMsg, `❌ ${err.message}`, "bad");
}
}

// ────────────────────────────────────────────────
// Initialization
// ────────────────────────────────────────────────
(function init() {
const { apiBase, adminKey } = getConfig();
els.apiBase.value = apiBase;
els.adminKey.value = adminKey;
els.apiBaseLabel.textContent = apiBase;

els.saveBtn.addEventListener("click", () => {
let api = els.apiBase.value.trim().replace(/\/$/, '');
if (!api.match(/^https?:\/\//)) api = "https://" + api;
if (!api) api = DEFAULT_API_BASE;

const key = els.adminKey.value.trim();

saveConfig(api, key);
els.apiBase.value = api;
els.adminKey.value = key;
els.apiBaseLabel.textContent = api;

setMsg(els.settingsMsg, "✅ Settings saved.", "ok");

loadWaitlist();
loadCouriers();
});

els.testBtn.addEventListener("click", testAPI);
els.refreshWaitlist.addEventListener("click", loadWaitlist);
els.refreshCouriers.addEventListener("click", loadCouriers);

// Initial load
loadWaitlist();
loadCouriers();
})();
