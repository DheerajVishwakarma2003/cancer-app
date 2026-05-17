/* doctor-dashboard.js */
(async function () {
  if (!Auth.isLoggedIn()) {
    window.location.href = "/login";
    return;
  }

  document.getElementById("logout-btn")?.addEventListener("click", (e) => {
    e.preventDefault();
    Auth.clearSession();
  });

  async function loadStats() {
    try {
      const [aptRes, predRes] = await Promise.all([
        Auth.apiFetch("/api/doctors/appointments"),
        Auth.apiFetch("/api/doctors/predict-history"),
      ]);
      const apts  = aptRes  ? await aptRes.json()  : [];
      const preds = predRes ? await predRes.json() : [];

      const detected = preds.filter((p) => p.detected).length;
      const avgConf  = preds.length
        ? (preds.reduce((s, p) => s + (p.confidence || 0), 0) / preds.length).toFixed(1)
        : 0;
      const lastPred = preds[0]
        ? new Date(preds[0].created_at).toLocaleDateString()
        : "Never";

      document.getElementById("stat-appointments").textContent = apts.filter(
        (a) => a.status === "pending"
      ).length;
      document.getElementById("stat-predictions").textContent  = preds.length;
      document.getElementById("stat-detected").textContent     = detected;
      document.getElementById("stat-patients").textContent     = new Set(preds.map(p=>p.patient_id).filter(Boolean)).size;

      document.getElementById("stat-detection-rate").textContent    = preds.length ? `${((detected/preds.length)*100).toFixed(0)}%` : "—";
      document.getElementById("stat-avg-confidence").textContent    = preds.length ? `${avgConf}%` : "—";
      document.getElementById("stat-last-prediction").textContent   = lastPred;

      renderAppointments(apts);
    } catch (e) {
      console.error(e);
    }
  }

  function renderAppointments(apts) {
    const tbody = document.getElementById("appointments-tbody");
    if (!apts.length) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-3)">No appointments</td></tr>`;
      return;
    }
    tbody.innerHTML = apts.slice(0, 8).map((a) => {
      const statusBadge = {
        pending:   `<span class="badge badge-warning">Pending</span>`,
        confirmed: `<span class="badge badge-success">Confirmed</span>`,
        cancelled: `<span class="badge badge-danger">Cancelled</span>`,
        completed: `<span class="badge badge-info">Completed</span>`,
      }[a.status] || `<span class="badge">${a.status}</span>`;
      return `<tr>
        <td>${a.patient_id || "—"}</td>
        <td>${a.slot || "—"}</td>
        <td>${a.reason || "—"}</td>
        <td>${statusBadge}</td>
        <td><button class="btn btn-outline" style="padding:4px 12px;font-size:.78rem"
            onclick="updateApt('${a.id}','confirmed')">✔ Confirm</button></td>
      </tr>`;
    }).join("");
  }

  window.updateApt = async (id, status) => {
    try {
      const res = await Auth.apiFetch(`/api/doctors/appointments/${id}`, {
        method: "PUT",
        body: JSON.stringify({ status }),
      });
      if (res?.ok) { toast.success("Appointment updated"); loadStats(); }
    } catch (_) { toast.error("Update failed"); }
  };

  loadStats();
})();
