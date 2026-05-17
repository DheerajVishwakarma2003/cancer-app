/* billing.js — Billing & Subscription dashboard */
(function () {
  if (!Auth.isLoggedIn()) { window.location.href = '/login'; return; }

  document.getElementById('logout-btn')?.addEventListener('click', e => {
    e.preventDefault(); Auth.clearSession();
  });

  const PLAN_NAMES = {
    doctor_basic:  'Doctor Basic',
    doctor_pro:    'Doctor Pro',
    patient_basic: 'Patient Basic',
    patient_pro:   'Patient Pro',
  };
  const PLAN_PRICES = {
    doctor_basic: 99900, doctor_pro: 249900,
    patient_basic: 29900, patient_pro: 79900,
  };
  const PLAN_FEATURES = {
    doctor_basic:  ['50 AI Predictions/mo','Patient Management','Appointment Scheduling','Report Downloads'],
    doctor_pro:    ['Unlimited AI Predictions','Patient Management','Appointment Scheduling','Report Downloads','Priority Support','Advanced Analytics'],
    patient_basic: ['Book Appointments','View Prescriptions','Medical History'],
    patient_pro:   ['Book Appointments','View Prescriptions','Medical History','AI Scan Access','Priority Booking'],
  };

  async function load() {
    try {
      const [subRes, userRes] = await Promise.all([
        Auth.apiFetch('/api/subscription/history'),
        Auth.apiFetch('/api/auth/me'),
      ]);
      const subs = subRes ? await subRes.json() : [];
      const user = userRes ? await userRes.json() : {};

      // ── Active plan card ──────────────────────────────────
      const active = subs.find(s => s.status === 'active');
      const planCard = document.getElementById('active-plan-card');

      if (active) {
        const features = PLAN_FEATURES[active.plan_id] || [];
        document.getElementById('current-plan-name').textContent   = PLAN_NAMES[active.plan_id] || active.plan_id;
        document.getElementById('current-plan-expiry').textContent = active.expires_at
          ? `Renews on ${new Date(active.expires_at).toLocaleDateString('en-IN', {day:'numeric',month:'long',year:'numeric'})}`
          : '';
        document.getElementById('plan-status-badge').textContent   = 'Active';
        document.getElementById('plan-status-badge').className     = 'badge badge-success';

        // Feature list
        const featEl = document.getElementById('plan-features');
        if (featEl) {
          featEl.innerHTML = features.map(f =>
            `<div style="display:flex;align-items:center;gap:8px;font-size:.85rem;padding:4px 0">
               <span style="color:var(--success)">✓</span> ${f}
             </div>`
          ).join('');
        }
      } else {
        document.getElementById('current-plan-name').textContent   = 'No Active Plan';
        document.getElementById('current-plan-expiry').textContent = 'Subscribe to unlock features';
        document.getElementById('plan-status-badge').textContent   = 'Inactive';
        document.getElementById('plan-status-badge').className     = 'badge badge-danger';
        const featEl = document.getElementById('plan-features');
        if (featEl) featEl.innerHTML = `<a href="/pricing" style="color:var(--accent);font-size:.85rem">View plans →</a>`;
      }

      // ── Stats ─────────────────────────────────────────────
      const activeSubs  = subs.filter(s => s.status === 'active').length;
      const totalSpent  = subs.reduce((sum, s) => sum + (PLAN_PRICES[s.plan_id] || 0), 0);
      document.getElementById('stat-total-subs').textContent  = subs.length;
      document.getElementById('stat-active-subs').textContent = activeSubs;
      document.getElementById('stat-total-spent').textContent =
        '₹' + (totalSpent / 100).toLocaleString('en-IN');

      // ── Activity feed ─────────────────────────────────────
      await loadActivity(user, subs);

      // ── Billing history table ─────────────────────────────
      const tbody = document.getElementById('billing-tbody');
      if (!subs.length) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-3);padding:20px">
          No billing history yet.
          <a href="/pricing" style="color:var(--accent)">Browse plans →</a>
        </td></tr>`;
        return;
      }
      tbody.innerHTML = subs.map(s => {
        const statusBadge = {
          active:    `<span class="badge badge-success">Active</span>`,
          expired:   `<span class="badge badge-warning">Expired</span>`,
          cancelled: `<span class="badge badge-danger">Cancelled</span>`,
        }[s.status] || `<span class="badge">${s.status}</span>`;

        return `<tr>
          <td style="font-size:.82rem">
            ${s.created_at ? new Date(s.created_at).toLocaleDateString('en-IN', {day:'numeric',month:'short',year:'numeric'}) : '—'}
          </td>
          <td><strong>${PLAN_NAMES[s.plan_id] || s.plan_id}</strong></td>
          <td style="font-family:monospace;font-size:.76rem;color:var(--text-3);max-width:140px;overflow:hidden;text-overflow:ellipsis">
            ${s.order_id || '—'}
          </td>
          <td style="font-family:monospace;font-size:.76rem;color:var(--text-3);max-width:140px;overflow:hidden;text-overflow:ellipsis">
            ${s.payment_id || '—'}
          </td>
          <td>${statusBadge}</td>
          <td style="font-size:.82rem">
            ${s.expires_at ? new Date(s.expires_at).toLocaleDateString('en-IN', {day:'numeric',month:'short',year:'numeric'}) : '—'}
          </td>
        </tr>`;
      }).join('');
    } catch (e) {
      console.error(e);
      toast.error('Failed to load billing data');
    }
  }

  /* ── Activity feed: merges subscriptions + appointments + prescriptions ── */
  async function loadActivity(user, subs) {
    const actEl = document.getElementById('activity-feed');
    if (!actEl) return;

    try {
      const role = Auth.getRole();
      const [aptRes, rxRes] = await Promise.all([
        Auth.apiFetch(role === 'doctor' ? '/api/doctors/appointments' : '/api/patients/appointments'),
        Auth.apiFetch(role === 'doctor' ? '/api/doctors/prescriptions' : '/api/patients/prescriptions'),
      ]);
      const apts = aptRes ? await aptRes.json() : [];
      const rxs  = rxRes  ? await rxRes.json()  : [];

      const events = [
        ...subs.map(s => ({
          icon: '💳', color: '#7c3aed',
          date: s.created_at,
          title: `Subscribed to ${PLAN_NAMES[s.plan_id] || s.plan_id}`,
          detail: `₹${((PLAN_PRICES[s.plan_id]||0)/100).toLocaleString('en-IN')} · ${s.status}`,
          link: '/billing',
        })),
        ...apts.slice(0, 5).map(a => ({
          icon: '📅', color: '#0ea5e9',
          date: a.created_at,
          title: `Appointment ${role === 'doctor' ? 'with ' + (a.patient_name || 'patient') : 'booked with Dr. ' + (a.doctor_name || '—')}`,
          detail: a.reason || 'General consultation',
          link: role === 'doctor' ? '/doctor/appointments' : '/patient/appointments',
        })),
        ...rxs.slice(0, 3).map(r => ({
          icon: '💊', color: '#059669',
          date: r.created_at,
          title: role === 'doctor'
            ? `Prescription written for ${r.patient_name || 'patient'}`
            : `Prescription from Dr. ${r.doctor_name || '—'}`,
          detail: `${(r.medications||[]).length} medication(s)`,
          link: role === 'doctor' ? '/doctor/prescriptions' : '/patient/prescriptions',
        })),
      ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 8);

      if (!events.length) {
        actEl.innerHTML = `<p style="color:var(--text-3);font-size:.85rem;text-align:center;padding:20px">
          No activity yet</p>`;
        return;
      }

      actEl.innerHTML = events.map(ev => {
        const date = ev.date
          ? new Date(ev.date).toLocaleDateString('en-IN', {day:'numeric',month:'short',year:'numeric'})
          : '—';
        return `<a href="${ev.link}" style="text-decoration:none;display:flex;align-items:center;
                  gap:12px;padding:12px;border-radius:var(--radius-sm);
                  transition:background var(--t);border-bottom:1px solid var(--card-border)"
                  onmouseover="this.style.background='var(--bg-2)'"
                  onmouseout="this.style.background='transparent'">
          <div style="width:36px;height:36px;border-radius:50%;flex-shrink:0;
                      background:${ev.color}22;display:grid;place-items:center;font-size:1rem">
            ${ev.icon}
          </div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:600;font-size:.85rem;color:var(--text)">${ev.title}</div>
            <div style="font-size:.76rem;color:var(--text-3);margin-top:2px">${ev.detail}</div>
          </div>
          <div style="font-size:.74rem;color:var(--text-3);flex-shrink:0">${date}</div>
        </a>`;
      }).join('');
    } catch (e) { console.error('Activity load failed', e); }
  }

  load();
})();
