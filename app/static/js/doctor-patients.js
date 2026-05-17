/* doctor-patients.js */
(function () {
  if (!Auth.isLoggedIn()) { window.location.href = '/login'; return; }
  document.getElementById('logout-btn')?.addEventListener('click', e => { e.preventDefault(); Auth.clearSession(); });

  let allPatients = [];
  const COLORS = ['#0ea5e9','#7c3aed','#059669','#dc2626','#d97706','#0891b2'];

  function initials(name) {
    if (!name) return '?';
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  }
  function color(id) { return COLORS[(id||'').charCodeAt(0) % COLORS.length]; }

  async function load() {
    try {
      const res     = await Auth.apiFetch('/api/doctors/patients');
      allPatients   = res ? await res.json() : [];
      document.getElementById('patient-count').textContent = `${allPatients.length} patient${allPatients.length !== 1 ? 's' : ''}`;
      render(allPatients);
    } catch { toast.error('Failed to load patients'); }
  }

  function render(list) {
    const grid = document.getElementById('patients-grid');
    if (!list.length) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
        <div class="empty-icon">👥</div>
        <h3>No patients yet</h3>
        <p>Patients will appear here after their first appointment</p>
      </div>`;
      return;
    }
    grid.innerHTML = list.map(p => `
      <div class="patient-card" onclick="showDetail('${p.user_id || p.id}')">
        <div class="patient-avatar" style="background:${color(p.user_id||p.id)}">${initials(p.name)}</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;font-size:.9rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.name || 'Unknown'}</div>
          <div style="font-size:.78rem;color:var(--text-3);margin-top:2px">${p.email || ''}</div>
          <div style="font-size:.75rem;color:var(--text-3);margin-top:2px">${p.blood_group ? '🩸 '+p.blood_group : ''} ${p.dob ? '· '+new Date(p.dob).getFullYear() : ''}</div>
        </div>
        <span style="font-size:1rem;color:var(--text-3)">›</span>
      </div>`).join('');
  }

  window.filterPatients = () => {
    const q = document.getElementById('search-input').value.toLowerCase();
    render(allPatients.filter(p =>
      (p.name||'').toLowerCase().includes(q) || (p.email||'').toLowerCase().includes(q)
    ));
  };

  window.showDetail = async uid => {
    const p = allPatients.find(x => (x.user_id || x.id) === uid);
    if (!p) return;
    const body = document.getElementById('patient-detail-body');
    body.innerHTML = `
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:4px">
        <div class="patient-avatar" style="background:${color(uid)};width:56px;height:56px;font-size:1.3rem">${initials(p.name)}</div>
        <div>
          <div style="font-size:1.1rem;font-weight:700">${p.name || 'Unknown'}</div>
          <div style="font-size:.82rem;color:var(--text-3)">${p.email || ''}</div>
        </div>
      </div>
      ${detail('📞 Phone',   p.phone      || '—')}
      ${detail('🩸 Blood',   p.blood_group|| '—')}
      ${detail('📅 DOB',     p.dob ? new Date(p.dob).toLocaleDateString() : '—')}
      ${detail('🏠 Address', p.address    || '—')}
      <a href="/doctor/prescriptions?patient=${uid}" class="btn btn-primary" style="width:100%;justify-content:center;margin-top:8px">
        💊 View Prescriptions
      </a>`;
    document.getElementById('patient-modal').style.display = 'flex';
  };

  function detail(label, value) {
    return `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--card-border);font-size:.85rem">
      <span style="color:var(--text-3)">${label}</span>
      <span style="font-weight:500">${value}</span>
    </div>`;
  }

  load();
})();
