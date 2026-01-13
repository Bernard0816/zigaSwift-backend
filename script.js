// VeriFly Landing — script.js
const navToggle = document.getElementById("navToggle");
const navLinks = document.getElementById("navLinks");

navToggle?.addEventListener("click", () => {
  const isOpen = navLinks.classList.toggle("open");
  navToggle.setAttribute("aria-expanded", String(isOpen));
});

navLinks?.querySelectorAll("a").forEach(a => {
  a.addEventListener("click", () => {
    navLinks.classList.remove("open");
    navToggle.setAttribute("aria-expanded", "false");
  });
});

document.getElementById("year").textContent = new Date().getFullYear();

async function postJSON(url, payload) {
  const res = await fetch(url, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

function handleForm(formId, msgId, endpoint, successText) {
  const form = document.getElementById(formId);
  const msg = document.getElementById(msgId);
  if (!form || !msg) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    msg.textContent = "Submitting...";

    const data = new FormData(form);
    const payload = Object.fromEntries(data.entries());

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

handleForm("waitlistForm", "waitlistMsg", "/api/waitlist", "✅ You’re on the waitlist! Check your email for confirmation.");
handleForm("courierForm", "courierMsg", "/api/courier", "✅ Application received! Check your email for next steps.");
