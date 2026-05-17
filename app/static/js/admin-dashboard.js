/* admin-dashboard.js */
(function () {
  if (!Auth.isLoggedIn()) { window.location.href = '/login'; return; }
  if (Auth.getRole() !== 'admin') { window.location.href = '/'; return; }

  document.getElementById('logout-btn')?.addEventListener('click', e => {
    e.preventDefault(); Auth.clearSession();
  });

  let allUsers = [];

  // ── Navigation tabs ──────────────────────────────────────────────────────────
  const sections = {
    'nav-dashboard':     'section-dashboard',
    'nav-users':         'section-users',
    'nav-doctors':       'section-doctors',
    'nav-subscriptions': 'section-subscriptions',
    'nav-ai':            'section-ai',
  };

  function showSection(navId) {
    // Hide all sections
    Object.values(sections).forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    // Show target
    const target = sections[navId];
    if (target) {
      const el = document.getElementById(target);
      if (el) el.style.display = 'block';
    }
    // Update nav active state
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const navEl = document.getElementById(navId);
    if (navEl) navEl.classList.add('active');

    // Lazy-load section data
    if (navId === 'nav-subscriptions') loadSubscriptions();
    if (navId === 'nav-ai')            loadPredictions();
    if (navId === 'nav-doctors')       renderPendingSection();
  }

  // Wire up nav items
  Object.keys(sections).forEach(navId => {
    const el = document.getElementById(navId);
    if (el) el.addEventListener('click', e => { e.preventDefault(); showSection(navId); });
  });

  // ── Stats ────────────────────────────────────────────────────────────────────
  async function loadStats() {
    try {
      const res  = await Auth.apiFetch('/api/admin/stats');
      if (!res) return;
      const data = await res.json();
      document.getElementById('stat-users').textContent        = data.total_users        ?? '—';
      document.getElementById('stat-doctors').textContent      = data.total_doctors      ?? '—';
      document.getElementById('stat-patients').textContent     = data.total_patients     ?? '—';
      document.getElementById('stat-preds').textContent        = data.total_predictions  ?? '—';
      document.getElementById('stat-apts').textContent         = data.total_appointments ?? '—';
    } catch (e) { console.error(e); }
  }

  // ── Users ────────────────────────────────────────────────────────────────────
  async function loadUsers() {
    try {
      const res = await Auth.apiFetch('/api/admin/users');
      if (!res) return;
      allUsers = await res.json();
      renderUsers(allUsers);
      renderRecentUsers(allUsers);
      renderPendingDoctors(allUsers);
    } catch (e) { console.error(e); }
  }

  function renderUsers(users) {
    const tbody = document.getElementById('users-tbody');
    if (!tbody) return;
    if (!users.length) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-3)">No users found</td></tr>`;
      return;
    }
    tbody.innerHTML = users.map(u => {
      const roleBadge = {
        admin:   `<span class="badge" style="background:rgba(239,68,68,.15);color:var(--danger)">Admin</span>`,
        doctor:  `<span class="badge badge-info">Doctor</span>`,
        patient: `<span class="badge badge-success">Patient</span>`,
      }[u.role] || `<span class="badge">${u.role}</span>`;

      const isSelf = u.id === getSelfId();

      return `<tr>
        <td>
          <div style="font-weight:600;font-size:.88rem">${u.name || '—'}</div>
        </td>
        <td style="font-size:.82rem;color:var(--text-2)">${u.email}</td>
        <td>${roleBadge}</td>
        <td>${u.is_verified
          ? `<span class="badge badge-success" style="font-size:.72rem">✓ Verified</span>`
          : `<span class="badge badge-warning" style="font-size:.72rem">Pending</span>`}</td>
        <td>${u.is_active
          ? `<span class="badge badge-success" style="font-size:.72rem">Active</span>`
          : `<span class="badge badge-danger" style="font-size:.72rem">Suspended</span>`}</td>
        <td style="display:flex;gap:6px;flex-wrap:wrap">
          ${u.role === 'doctor' && !u.is_verified
            ? `<button class="btn btn-primary"
                style="padding:4px 10px;font-size:.74rem;background:#7c3aed"
                onclick="approveDoctor('${u.id}')">✔ Approve</button>`
            : ''}
          ${!isSelf && u.is_active
            ? `<button class="btn btn-danger"
                style="padding:4px 10px;font-size:.74rem"
                onclick="suspendUser('${u.id}')">🚫 Suspend</button>`
            : ''}
          ${!isSelf && !u.is_active
            ? `<button class="btn btn-primary"
                style="padding:4px 10px;font-size:.74rem;background:var(--success)"
                onclick="unsuspendUser('${u.id}')">✅ Unsuspend</button>`
            : ''}
          ${isSelf ? `<span style="font-size:.75rem;color:var(--text-3)">You</span>` : ''}
        </td>
      </tr>`;
    }).join('');
  }

  function getSelfId() {
    try {
      const token = Auth.getToken();
      if (!token) return '';
      const payload = JSON.parse(atob(token.split('.')[1]));
      const sub = payload.sub;
      const parsed = typeof sub === 'string' ? JSON.parse(sub) : sub;
      return parsed.id || '';
    } catch { return ''; }
  }

  function renderRecentUsers(users) {
    const el = document.getElementById('recent-users');
    if (!el) return;
    const recent = [...users].reverse().slice(0, 6);
    if (!recent.length) { el.innerHTML = `<p style="color:var(--text-3);font-size:.85rem">No users yet</p>`; return; }
    el.innerHTML = recent.map(u => `
      <div class="approval-item">
        <div>
          <div class="approval-name">${u.name || 'Anonymous'}</div>
          <div class="approval-email">${u.email} · ${u.role}</div>
        </div>
        <span class="badge ${u.role === 'doctor' ? 'badge-info' : u.role === 'admin' ? '' : 'badge-success'}"
              style="${u.role === 'admin' ? 'background:rgba(239,68,68,.15);color:var(--danger)' : ''}">
          ${u.role}
        </span>
      </div>`).join('');
  }

  function renderPendingDoctors(users) {
    const pending = users.filter(u => u.role === 'doctor' && !u.is_verified);
    const countEl = document.getElementById('pending-count');
    if (countEl) countEl.textContent = pending.length;

    const el = document.getElementById('pending-doctors');
    if (!el) return;
    if (!pending.length) {
      el.innerHTML = `<p style="color:var(--text-3);font-size:.85rem;text-align:center;padding:20px">
        ✅ No pending approvals</p>`;
      return;
    }
    el.innerHTML = pending.map(u => `
      <div class="approval-item">
        <div>
          <div class="approval-name">${u.name || '—'}</div>
          <div class="approval-email">${u.email}</div>
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn btn-primary" style="padding:5px 12px;font-size:.76rem"
                  onclick="approveDoctor('${u.id}')">✔ Approve</button>
          <button class="btn btn-danger" style="padding:5px 10px;font-size:.76rem"
                  onclick="rejectDoctor('${u.id}')">✕</button>
        </div>
      </div>`).join('');
  }

  function renderPendingSection() {
    if (allUsers.length) renderPendingDoctors(allUsers);
  }

  // ── Subscriptions ────────────────────────────────────────────────────────────
  async function loadSubscriptions() {
    const tbody = document.getElementById('subs-tbody');
    if (!tbody) return;
    try {
      const res  = await Auth.apiFetch('/api/admin/subscriptions');
      const subs = res ? await res.json() : [];

      // Update sub stats
      const totalEl  = document.getElementById('sub-total');
      const activeEl = document.getElementById('sub-active');
      const revenueEl= document.getElementById('sub-revenue');
      if (totalEl)   totalEl.textContent  = subs.length;
      if (activeEl)  activeEl.textContent = subs.filter(s => s.status === 'active').length;
      if (revenueEl) revenueEl.textContent = '₹' + (
        subs.reduce((sum, s) => sum + (s.amount || 0), 0) / 100
      ).toLocaleString('en-IN');

      if (!subs.length) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-3);padding:24px">
          No subscriptions yet</td></tr>`;
        return;
      }

      tbody.innerHTML = subs.map(s => {
        const statusBadge = {
          active:    `<span class="badge badge-success">Active</span>`,
          expired:   `<span class="badge badge-warning">Expired</span>`,
          cancelled: `<span class="badge badge-danger">Cancelled</span>`,
        }[s.status] || `<span class="badge">${s.status}</span>`;

        const roleBadge = s.user_role === 'doctor'
          ? `<span class="badge badge-info" style="font-size:.7rem">Doctor</span>`
          : `<span class="badge badge-success" style="font-size:.7rem">Patient</span>`;

        return `<tr>
          <td style="font-size:.82rem">${s.created_at ? new Date(s.created_at).toLocaleDateString() : '—'}</td>
          <td>
            <div style="font-weight:600;font-size:.88rem">${s.user_name || '—'}</div>
            <div style="font-size:.76rem;color:var(--text-3)">${s.user_email || ''}</div>
          </td>
          <td>${roleBadge}</td>
          <td><strong>${s.plan_name || s.plan_id || '—'}</strong></td>
          <td style="font-weight:600">₹${((s.amount || 0) / 100).toLocaleString('en-IN')}</td>
          <td>${statusBadge}</td>
          <td>
            ${s.status === 'active'
              ? `<button class="btn btn-danger" style="padding:4px 10px;font-size:.74rem"
                         onclick="cancelSub('${s.id}')">Cancel</button>`
              : `<span style="color:var(--text-3);font-size:.8rem">${s.expires_at ? new Date(s.expires_at).toLocaleDateString() : '—'}</span>`}
          </td>
        </tr>`;
      }).join('');
    } catch (e) { console.error(e); tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--danger)">Failed to load</td></tr>`; }
  }

  // ── AI Predictions ────────────────────────────────────────────────────────────
  async function loadPredictions() {
    const tbody = document.getElementById('ai-tbody');
    if (!tbody) return;
    try {
      const res   = await Auth.apiFetch('/api/admin/predictions');
      const preds = res ? await res.json() : [];

      if (!preds.length) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-3);padding:24px">No AI predictions yet</td></tr>`;
        return;
      }
      tbody.innerHTML = preds.slice(0, 50).map(p => `<tr>
        <td style="font-size:.82rem">${p.created_at ? new Date(p.created_at).toLocaleDateString() : '—'}</td>
        <td style="font-size:.8rem;color:var(--text-2)">${(p.doctor_id || '').slice(0,8)}…</td>
        <td>${p.detected
          ? `<span class="badge badge-danger">Cancer Detected</span>`
          : `<span class="badge badge-success">Clear</span>`}</td>
        <td>${p.confidence ? p.confidence + '%' : '—'}</td>
        <td><span class="badge ${p.risk_tier === 'high' ? 'badge-danger' : p.risk_tier === 'moderate' ? 'badge-warning' : 'badge-success'}">${p.risk_level || '—'}</span></td>
      </tr>`).join('');
    } catch (e) { console.error(e); }
  }

  // ── Actions ──────────────────────────────────────────────────────────────────
  window.approveDoctor = async uid => {
    try {
      const res = await Auth.apiFetch(`/api/admin/doctors/${uid}/approve`, { method: 'PUT' });
      if (res?.ok) { toast.success('Doctor approved!'); reload(); }
      else { const d = await res.json(); toast.error(d.error || 'Failed'); }
    } catch { toast.error('Network error'); }
  };

  window.rejectDoctor = async uid => {
    if (!confirm('Reject this doctor application?')) return;
    try {
      const res = await Auth.apiFetch(`/api/admin/doctors/${uid}/reject`, { method: 'PUT' });
      if (res?.ok) { toast.success('Doctor rejected'); reload(); }
      else toast.error('Failed');
    } catch { toast.error('Network error'); }
  };

  window.suspendUser = async uid => {
    if (!confirm('Suspend this user? They will lose access immediately.')) return;
    try {
      const res = await Auth.apiFetch(`/api/admin/users/${uid}/suspend`, { method: 'PUT' });
      if (res?.ok) { toast.success('User suspended'); reload(); }
      else { const d = await res.json(); toast.error(d.error || 'Failed'); }
    } catch { toast.error('Network error'); }
  };

  window.unsuspendUser = async uid => {
    if (!confirm('Restore access for this user?')) return;
    try {
      const res = await Auth.apiFetch(`/api/admin/users/${uid}/unsuspend`, { method: 'PUT' });
      if (res?.ok) { toast.success('User unsuspended'); reload(); }
      else { const d = await res.json(); toast.error(d.error || 'Failed'); }
    } catch { toast.error('Network error'); }
  };

  window.cancelSub = async subId => {
    if (!confirm('Cancel this subscription?')) return;
    try {
      const res = await Auth.apiFetch(`/api/admin/subscriptions/${subId}/cancel`, { method: 'PUT' });
      if (res?.ok) { toast.success('Subscription cancelled'); loadSubscriptions(); }
      else toast.error('Failed');
    } catch { toast.error('Network error'); }
  };

  window.filterUsers = q => {
    const query    = q.toLowerCase();
    const filtered = allUsers.filter(u =>
      (u.name || '').toLowerCase().includes(query) ||
      (u.email || '').toLowerCase().includes(query) ||
      (u.role  || '').toLowerCase().includes(query)
    );
    renderUsers(filtered);
  };

  function reload() { loadStats(); loadUsers(); }
  window.loadStats = loadStats;

  // ── Init ─────────────────────────────────────────────────────────────────────
  loadStats();
  loadUsers();
})();
