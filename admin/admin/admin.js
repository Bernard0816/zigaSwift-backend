// ZigaSwift Admin Dashboard (static)
// Stores API base + optional admin key in localStorage
// Adds: Accept / Reject / Delete actions

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
localStorage.setItem("ZS_ADMIN_API_BASE", apiBase);
localStorage.setItem("ZS_ADMIN_KEY", adminKey);
}

function buildHeaders() {
const { adminKey } = getConfig();
const headers = { "Content-Type": "application/json" };
if (adminKey) headers["x-admin-key"] = adminKey;
return headers;
}

async function getJSON(path) {
const { apiBase, adminKey } = getConfig();
const url = `${apiBase}${path}`;

const headers = { "Content-Type": "application/json" };
if (adminKey) headers["x-admin-key"] = adminKey;

let res;
try {
res = await fetch(url, { headers });
} catch (e) {
throw new Error("Network error: " + e.message);
}

const text = await res.text();
let data;
try {
data = JSON.parse(text);
} catch {
data = { raw: text };
}

if (!res.ok) {
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

async function callAdminAction(method, path) {
const { apiBase } = getConfig();
const url = `${apiBase}${path}`;

let res;
try {
res = await fetch(url, {
method,
headers: buildHeaders(),
});
} catch (e) {
throw new Error("Network error: " + e.message);
}

const text = await res.text();
let data;
try {
data = JSON.parse(text);
} catch {
data = { raw: text };
}

if (!res.ok) {
if (res.status === 401) {
throw new Error("Unauthorized (401). Check ADMIN_KEY.");
}
throw new Error(data?.error || `Request failed (${res.status})`);
}

return data;
}

function makeBtn(label, className, onClick) {
const b = document.createElement("button");
b.type = "button";
b.className = className;
b.textContent = label;
b.addEventListener("click", onClick);
return b;
}

function renderWaitlistRows(tbody, rows) {
tbody.innerHTML = "";

if (!Array.isArray(rows) || rows.length === 0) {
const tr = document.createElement("tr");
const td = document.createElement("td");
td.colSpan = 6; // 5 columns + Actions
td.textContent = "No records found.";
td.style.color = "#9ab0d6";
tr.appendChild(td);
tbody.appendChild(tr);
return;
}

for (const r of rows) {
const tr = document.createElement("tr");

// columns
const cols = ["id", "name", "email", "city", "created_at"];
for (const c of cols) {
const td = document.createElement("td");
td.textContent = r?.[c] ?? "";
tr.appendChild(td);
}

// Actions column
const actionsTd = document.createElement("td");
actionsTd.className = "actions-col";
const wrap = document.createElement("div");
wrap.className = "actions";

const id = r.id;

const acceptBtn = makeBtn("Accept", "btn-sm btn-accept", async () => {
acceptBtn.disabled = rejectBtn.disabled = delBtn.disabled = true;
try {
await callAdminAction("POST", `/api/admin/waitlist/${id}/accept`);
await loadWaitlist();
} catch (e) {
alert(e.message);
} finally {
acceptBtn.disabled = rejectBtn.disabled = delBtn.disabled = false;
}
});

const rejectBtn = makeBtn("Reject", "btn-sm btn-reject", async () => {
rejectBtn.disabled = acceptBtn.disabled = delBtn.disabled = true;
try {
await callAdminAction("POST", `/api/admin/waitlist/${id}/reject`);
await loadWaitlist();
} catch (e) {
alert(e.message);
} finally {
rejectBtn.disabled = acceptBtn.disabled = delBtn.disabled = false;
}
});

const delBtn = makeBtn("Delete", "btn-sm btn-delete", async () => {
const ok = confirm(`Delete waitlist record #${id}? This cannot be undone.`);
if (!ok) return;

delBtn.disabled = acceptBtn.disabled = rejectBtn.disabled = true;
try {
await callAdminAction("DELETE", `/api/admin/waitlist/${id}`);
await loadWaitlist();
} catch (e) {
alert(e.message);
} finally {
delBtn.disabled = acceptBtn.disabled = rejectBtn.disabled = false;
}
});

wrap.appendChild(acceptBtn);
wrap.appendChild(rejectBtn);
wrap.appendChild(delBtn);
actionsTd.appendChild(wrap);
tr.appendChild(actionsTd);

tbody.appendChild(tr);
}
}

function renderCourierRows(tbody, rows) {
tbody.innerHTML = "";

if (!Array.isArray(rows) || rows.length === 0) {
const tr = document.createElement("tr");
const td = document.createElement("td");
td.colSpan = 6; // 5 columns + Actions
td.textContent = "No records found.";
td.style.color = "#9ab0d6";
tr.appendChild(td);
tbody.appendChild(tr);
return;
}

for (const r of rows) {
const tr = document.createElement("tr");

const cols = ["id", "name", "email", "route", "created_at"];
for (const c of cols) {
const td = document.createElement("td");
td.textContent = r?.[c] ?? "";
tr.appendChild(td);
}

const actionsTd = document.createElement("td");
actionsTd.className = "actions-col";
const wrap = document.createElement("div");
wrap.className = "actions";

const id = r.id;

const acceptBtn = makeBtn("Accept", "btn-sm btn-accept", async () => {
acceptBtn.disabled = rejectBtn.disabled = delBtn.disabled = true;
try {
await callAdminAction("POST", `/api/admin/couriers/${id}/accept`);
await loadCouriers();
} catch (e) {
alert(e.message);
} finally {
acceptBtn.disabled = rejectBtn.disabled = delBtn.disabled = false;
}
});

const rejectBtn = makeBtn("Reject", "btn-sm btn-reject", async () => {
rejectBtn.disabled = acceptBtn.disabled = delBtn.disabled = true;
try {
await callAdminAction("POST", `/api/admin/couriers/${id}/reject`);
await loadCouriers();
} catch (e) {
alert(e.message);
} finally {
rejectBtn.disabled = acceptBtn.disabled = delBtn.disabled = false;
}
});

const delBtn = makeBtn("Delete", "btn-sm btn-delete", async () => {
const ok = confirm(`Delete courier application #${id}? This cannot be undone.`);
if (!ok) return;

delBtn.disabled = acceptBtn.disabled = rejectBtn.disabled = true;
try {
await callAdminAction("DELETE", `/api/admin/couriers/${id}`);
await loadCouriers();
} catch (e) {
alert(e.message);
} finally {
delBtn.disabled = acceptBtn.disabled = rejectBtn.disabled = false;
}
});

wrap.appendChild(acceptBtn);
wrap.appendChild(rejectBtn);
wrap.appendChild(delBtn);
actionsTd.appendChild(wrap);
tr.appendChild(actionsTd);

tbody.appendChild(tr);
}
}

async function loadWaitlist() {
setMsg(els.waitlistMsg, "Loading waitlist…");
try {
const data = await getJSON("/api/admin/waitlist");
renderWaitlistRows(els.waitlistBody, data.items || []);
setMsg(els.waitlistMsg, `Loaded ${data.items?.length ?? 0} waitlist records.`, "ok");
} catch (e) {
setMsg(els.waitlistMsg, `❌ ${e.message}`, "bad");
}
}

async function loadCouriers() {
setMsg(els.courierMsg, "Loading courier applications…");
try {
const data = await getJSON("/api/admin/couriers");
renderCourierRows(els.courierBody, data.items || []);
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

const healthRes = await fetch(`${apiBase}/api/health`);
if (!healthRes.ok) throw new Error(`Health check failed (${healthRes.status})`);

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

if (!adminRes.ok) throw new Error(`Admin endpoint failed (${adminRes.status})`);

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
let api = els.apiBase.value.trim().replace(/\/$/, "");
if (!api.startsWith("http://") && !api.startsWith("https://")) api = "https://" + api;
if (!api) api = DEFAULT_API_BASE;

const key = els.adminKey.value.trim();
saveConfig(api, key);

els.apiBase.value = api;
els.adminKey.value = key;
els.apiBaseLabel.textContent = api;

setMsg(els.settingsMsg, "✅ Saved.", "ok");
loadWaitlist();
loadCouriers();
});

els.testBtn.addEventListener("click", testAPI);
els.refreshWaitlist.addEventListener("click", loadWaitlist);
els.refreshCouriers.addEventListener("click", loadCouriers);

loadWaitlist();
loadCouriers();
})();
