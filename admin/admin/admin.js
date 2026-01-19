// admin.js (FULL - SAFE, ASCII-ONLY)

(function () {
"use strict";

var DEFAULT_API_BASE = "https://zigaswift-backend.onrender.com";

function $(id) {
return document.getElementById(id);
}

function setMsg(el, text, type) {
if (!el) return;
el.textContent = text || "";
el.className = "msg" + (type ? " " + type : "");
}

function normalizeBaseUrl(v) {
return (v || "")
.trim()
.replace(/\/+$/, ""); // remove trailing slashes
}

function getConfig() {
var apiBase = normalizeBaseUrl(localStorage.getItem("ZS_ADMIN_API_BASE") || DEFAULT_API_BASE);
var adminKey = (localStorage.getItem("ZS_ADMIN_KEY") || "").trim();
return { apiBase: apiBase, adminKey: adminKey };
}

function saveConfig(apiBase, adminKey) {
localStorage.setItem("ZS_ADMIN_API_BASE", normalizeBaseUrl(apiBase || DEFAULT_API_BASE));
localStorage.setItem("ZS_ADMIN_KEY", (adminKey || "").trim());
}

async function getJSON(path) {
var cfg = getConfig();
var url = cfg.apiBase + path;

var headers = { "Content-Type": "application/json" };
if (cfg.adminKey) headers["x-admin-key"] = cfg.adminKey;

var res = await fetch(url, { headers: headers });
var text = await res.text();

var data;
try {
data = JSON.parse(text);
} catch (e) {
data = { raw: text };
}

if (!res.ok) {
var msg = (data && (data.error || data.message)) || ("Request failed (" + res.status + ")");
throw new Error(msg);
}
return data;
}

function renderRows(tbody, rows, cols) {
if (!tbody) return;

tbody.innerHTML = "";

if (!Array.isArray(rows) || rows.length === 0) {
var tr0 = document.createElement("tr");
var td0 = document.createElement("td");
td0.colSpan = cols.length;
td0.textContent = "No records found.";
td0.style.color = "#9ab0d6";
tr0.appendChild(td0);
tbody.appendChild(tr0);
return;
}

for (var i = 0; i < rows.length; i++) {
var r = rows[i];
var tr = document.createElement("tr");
for (var j = 0; j < cols.length; j++) {
var c = cols[j];
var td = document.createElement("td");
td.textContent = (r && r[c] != null) ? String(r[c]) : "";
tr.appendChild(td);
}
tbody.appendChild(tr);
}
}

async function loadWaitlist(els) {
setMsg(els.waitlistMsg, "Loading waitlist...");
try {
var data = await getJSON("/api/admin/waitlist");
renderRows(els.waitlistBody, data.items, ["id", "name", "email", "city", "created_at"]);
setMsg(els.waitlistMsg, "Loaded " + ((data.items && data.items.length) || 0) + " waitlist records.", "ok");
} catch (e) {
setMsg(els.waitlistMsg, "Error: " + e.message, "bad");
}
}

async function loadCouriers(els) {
setMsg(els.courierMsg, "Loading courier applications...");
try {
var data = await getJSON("/api/admin/couriers");
renderRows(els.courierBody, data.items, ["id", "name", "email", "route", "created_at"]);
setMsg(els.courierMsg, "Loaded " + ((data.items && data.items.length) || 0) + " courier applications.", "ok");
} catch (e) {
setMsg(els.courierMsg, "Error: " + e.message, "bad");
}
}

async function testAPI(els) {
setMsg(els.settingsMsg, "Testing API...");
try {
var cfg = getConfig();
var res = await fetch(cfg.apiBase + "/api/health");
if (!res.ok) throw new Error("Health check failed (" + res.status + ")");
setMsg(els.settingsMsg, "API is reachable.", "ok");
} catch (e) {
setMsg(els.settingsMsg, "Error: " + e.message, "bad");
}
}

function init() {
var els = {
apiBase: $("apiBase"),
adminKey: $("adminKey"),
apiBaseLabel: $("apiBaseLabel"),
saveBtn: $("saveBtn"),
testBtn: $("testBtn"),
settingsMsg: $("settingsMsg"),
refreshWaitlist: $("refreshWaitlist"),
refreshCouriers: $("refreshCouriers"),
waitlistMsg: $("waitlistMsg"),
courierMsg: $("courierMsg"),
waitlistBody: $("waitlistBody"),
courierBody: $("courierBody"),
};

// Hard proof in console that script is loading
console.log("admin.js loaded", els);

// If essential elements missing, show message and stop
if (!els.apiBase || !els.adminKey || !els.saveBtn || !els.settingsMsg) {
setMsg(els.settingsMsg, "Admin UI element IDs mismatch. Check index.html IDs.", "bad");
return;
}

// Load config into inputs
var cfg = getConfig();
els.apiBase.value = cfg.apiBase;
els.adminKey.value = cfg.adminKey;
if (els.apiBaseLabel) els.apiBaseLabel.textContent = cfg.apiBase;

// Save button (localStorage only)
els.saveBtn.addEventListener("click", function () {
var api = normalizeBaseUrl(els.apiBase.value || DEFAULT_API_BASE) || DEFAULT_API_BASE;
var key = (els.adminKey.value || "").trim();
saveConfig(api, key);
if (els.apiBaseLabel) els.apiBaseLabel.textContent = api;
setMsg(els.settingsMsg, "Saved.", "ok");
console.log("Saved config", { apiBase: api, adminKey: key ? "[set]" : "" });
});

if (els.testBtn) els.testBtn.addEventListener("click", function () { testAPI(els); });
if (els.refreshWaitlist) els.refreshWaitlist.addEventListener("click", function () { loadWaitlist(els); });
if (els.refreshCouriers) els.refreshCouriers.addEventListener("click", function () { loadCouriers(els); });

// Auto-load
loadWaitlist(els);
loadCouriers(els);
}

// Wait for DOM
if (document.readyState === "loading") {
document.addEventListener("DOMContentLoaded", init);
} else {
init();
}
})();
