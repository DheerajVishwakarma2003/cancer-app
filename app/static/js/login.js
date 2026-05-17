/* login.js */
(function () {
  // Redirect if already logged in
  if (Auth.isLoggedIn()) {
    const role = Auth.getRole();
    window.location.href = role === "doctor" ? "/doctor/dashboard"
                         : role === "admin"  ? "/admin/dashboard"
                         : "/patient/dashboard";
    return;
  }

  const form      = document.getElementById("login-form");
  const submitBtn = document.getElementById("submit-btn");
  const errBanner = document.getElementById("error-banner");

  function showError(msg) {
    errBanner.textContent = msg;
    errBanner.style.display = "block";
  }
  function clearError() { errBanner.style.display = "none"; }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearError();

    const email    = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    if (!email || !password) {
      showError("Please fill in all fields.");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner"></span> Signing in…';

    try {
      const res  = await fetch("/api/auth/login", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        showError(data.error || "Login failed. Please try again.");
        return;
      }

      Auth.setSession(data.token, data.role);
      toast.success("Logged in successfully!");

      setTimeout(() => {
        window.location.href = data.role === "doctor" ? "/doctor/dashboard"
                             : data.role === "admin"  ? "/admin/dashboard"
                             : "/patient/dashboard";
      }, 800);
    } catch (_) {
      showError("Network error. Please check your connection.");
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = "Sign In";
    }
  });
})();
