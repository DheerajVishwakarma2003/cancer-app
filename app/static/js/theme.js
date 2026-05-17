/* theme.js — OnchoLens theme system */
(function () {
  const STORAGE_KEY = "oncolens-theme";

  function getPreferred() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function apply(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(STORAGE_KEY, theme);
    document.querySelectorAll(".theme-toggle").forEach((btn) => {
      btn.textContent = theme === "dark" ? "☀️" : "🌙";
      btn.title = theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode";
    });
  }

  function toggle() {
    const current = document.documentElement.getAttribute("data-theme") || "light";
    apply(current === "dark" ? "light" : "dark");
  }

  // Init immediately to avoid flash
  apply(getPreferred());

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".theme-toggle").forEach((btn) => {
      btn.addEventListener("click", toggle);
    });
  });

  window.ThemeManager = { toggle, apply, getPreferred };
})();

/* ── Toast notifications ──────────────────────────── */
window.toast = (function () {
  function show(message, type = "info", duration = 4000) {
    let container = document.getElementById("toast-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "toast-container";
      document.body.appendChild(container);
    }
    const icons = { success: "✅", error: "❌", info: "ℹ️", warning: "⚠️" };
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    el.innerHTML = `<span>${icons[type] || "ℹ️"}</span><span>${message}</span>`;
    container.appendChild(el);
    setTimeout(() => {
      el.style.opacity = "0";
      el.style.transform = "translateX(40px)";
      el.style.transition = ".3s ease";
      setTimeout(() => el.remove(), 300);
    }, duration);
  }
  return {
    success: (m, d) => show(m, "success", d),
    error:   (m, d) => show(m, "error",   d),
    info:    (m, d) => show(m, "info",    d),
    warning: (m, d) => show(m, "warning", d),
  };
})();

/* ── Auth helpers ────────────────────────────────── */
window.Auth = (function () {
  const TOKEN_KEY = "oncolens_token";
  const ROLE_KEY  = "oncolens_role";

  function getToken()  { return localStorage.getItem(TOKEN_KEY); }
  function getRole()   { return localStorage.getItem(ROLE_KEY);  }
  function isLoggedIn(){ return !!getToken(); }

  function setSession(token, role) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(ROLE_KEY, role);
  }

  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ROLE_KEY);
    window.location.href = "/login";
  }

  async function apiFetch(url, options = {}) {
    const token = getToken();
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(url, { ...options, headers });
    if (res.status === 401) { clearSession(); return; }
    return res;
  }

  return { getToken, getRole, isLoggedIn, setSession, clearSession, apiFetch };
})();
