/* patient-prescriptions.js */
(function () {
  if (!Auth.isLoggedIn()) { window.location.href = '/login'; return; }
  document.getElementById('logout-btn')?.addEventListener('click', e => { e.preventDefault(); Auth.clearSession(); });

  let allRx = [];

  async function load() {
    try {
      const res = await Auth.apiFetch('/api/patients/prescriptions');
      allRx = res ? await res.json() : [];
      render(allRx);
    } catch { toast.error('Failed to load prescriptions'); }
  }

  function render(list) {
    const el = document.getElementById('rx-list');
    if (!list.length) {
      el.innerHTML = `<div class="empty-state">
        <div class="empty-icon">💊</div>
        <h3>No prescriptions yet</h3>
        <p>Prescriptions written by your doctors will appear here</p>
      </div>`;
      return;
    }
    el.innerHTML = list.map(rx => {
      const meds = Array.isArray(rx.medications) ? rx.medications : [];
      const date = rx.created_at
        ? new Date(rx.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
        : '—';
      return `<div class="rx-card">
        <div class="rx-header" onclick="toggleRx(this)">
          <div>
            <div class="rx-title">👨‍⚕️ Dr. ${rx.doctor_name || rx.doctor_id?.slice(0,8) || '—'}</div>
            <div class="rx-date">${date} · ${meds.length} medication${meds.length !== 1 ? 's' : ''}</div>
          </div>
          <span class="rx-arrow" style="transition:transform .2s;color:var(--text-3)">▾</span>
        </div>
        <div class="rx-body">
          ${rx.notes
            ? `<div style="background:rgba(14,165,233,.08);border-left:3px solid var(--accent);
               padding:10px 14px;border-radius:0 var(--radius-sm) var(--radius-sm) 0;
               font-size:.85rem;color:var(--text-2);margin-bottom:14px">📝 ${rx.notes}</div>`
            : ''}
          <ul class="rx-med-list">
            ${meds.map(m => `
              <li class="rx-med-item">
                <span class="rx-med-icon">💊</span>
                <div style="flex:1">
                  <div class="rx-med-name">${m.name || '—'}</div>
                  <div class="rx-med-dose">${[m.dosage, m.frequency, m.duration].filter(Boolean).join(' · ')}</div>
                </div>
              </li>`).join('')}
          </ul>
          <button class="btn btn-outline"
                  style="margin-top:14px;padding:6px 16px;font-size:.82rem"
                  onclick="downloadRx('${rx.id}')">
            📄 Download Prescription
          </button>
        </div>
      </div>`;
    }).join('');
  }

  window.toggleRx = header => {
    const body  = header.nextElementSibling;
    const arrow = header.querySelector('.rx-arrow');
    const open  = body.classList.toggle('open');
    if (arrow) arrow.style.transform = open ? 'rotate(180deg)' : 'rotate(0deg)';
  };

  window.filterRx = () => {
    const q = document.getElementById('search-input').value.toLowerCase();
    render(allRx.filter(rx => {
      const meds = (rx.medications || []).map(m => (m.name || '').toLowerCase()).join(' ');
      return (rx.doctor_name || rx.doctor_id || '').toLowerCase().includes(q) || meds.includes(q);
    }));
  };

  /* Pass JWT as query param so window.open() works in browser */
  window.downloadRx = id => {
    const token = Auth.getToken();
    const url   = `/api/patients/prescriptions/${id}/download?token=${encodeURIComponent(token)}`;
    window.open(url, '_blank');
  };

  load();
})();
