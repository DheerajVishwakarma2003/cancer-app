/* patient-history.js */
(function () {
  if (!Auth.isLoggedIn()) { window.location.href = '/login'; return; }
  document.getElementById('logout-btn')?.addEventListener('click', e => { e.preventDefault(); Auth.clearSession(); });

  let allEvents = [];
  let activeTab = 'all';

  const TYPE_META = {
    appointment:  { icon: '📅', dot: '#0ea5e9' },
    prescription: { icon: '💊', dot: '#7c3aed' },
    scan:         { icon: '🔬', dot: '#ef4444' },
  };

  async function load() {
    try {
      const [aptRes, rxRes, scanRes] = await Promise.all([
        Auth.apiFetch('/api/patients/appointments'),
        Auth.apiFetch('/api/patients/prescriptions'),
        Auth.apiFetch('/api/patients/predictions'),
      ]);
      const apts  = aptRes  ? await aptRes.json()  : [];
      const rxs   = rxRes   ? await rxRes.json()   : [];
      const scans = scanRes ? await scanRes.json() : [];

      document.getElementById('stat-apts').textContent  = apts.length;
      document.getElementById('stat-rx').textContent    = rxs.length;
      document.getElementById('stat-scans').textContent = scans.length;

      const aptEvents = apts.map(a => ({
        type:   'appointment',
        date:   a.slot || a.created_at,
        title:  `Appointment with Dr. ${a.doctor_name || (a.doctor_id || '').slice(0, 8)}`,
        detail: a.reason || 'General consultation',
        extra:  `Status: ${a.status}`,
        id:     a.id,
        data:   a,
      }));

      const rxEvents = rxs.map(r => ({
        type:   'prescription',
        date:   r.created_at,
        title:  `Prescription from Dr. ${r.doctor_name || (r.doctor_id || '').slice(0, 8)}`,
        detail: (r.medications || []).map(m => m.name).filter(Boolean).join(', ') || 'Medications prescribed',
        extra:  r.notes || '',
        id:     r.id,
        data:   r,
      }));

      const scanEvents = scans.map(s => ({
        type:    'scan',
        date:    s.created_at,
        title:   `AI Cancer Scan — ${s.prediction || '—'}`,
        detail:  `Confidence: ${s.confidence || 0}% · Risk: ${s.risk_level || '—'}`,
        extra:   s.detected ? '⚠️ Cancer Detected' : '✅ No Cancer Detected',
        id:      s.id,
        data:    s,
        detected: s.detected,
      }));

      allEvents = [...aptEvents, ...rxEvents, ...scanEvents]
        .sort((a, b) => new Date(b.date) - new Date(a.date));

      renderTimeline();
    } catch (e) { console.error(e); toast.error('Failed to load history'); }
  }

  function renderTimeline() {
    const list = activeTab === 'all' ? allEvents : allEvents.filter(e => e.type === activeTab);
    const el   = document.getElementById('history-timeline');

    if (!list.length) {
      el.innerHTML = `<div class="empty-state">
        <div class="empty-icon">📁</div>
        <h3>No history yet</h3>
        <p>Your medical events will appear here</p>
      </div>`;
      return;
    }

    el.innerHTML = list.map(ev => {
      const meta = TYPE_META[ev.type] || { icon: '📌', dot: '#94a3b8' };
      const date = ev.date
        ? new Date(ev.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
        : '—';

      // Determine download button based on type
      let downloadBtn = '';
      if (ev.type === 'scan') {
        const token = Auth.getToken();
        const url   = `/api/patients/predictions/${ev.id}/download?token=${encodeURIComponent(token)}`;
        downloadBtn = `<a href="${url}" target="_blank" class="btn btn-outline"
                          style="padding:4px 12px;font-size:.76rem;margin-top:10px;display:inline-flex;
                                 align-items:center;gap:5px;text-decoration:none">
                         📄 Download Scan Report
                       </a>`;
      } else if (ev.type === 'prescription') {
        const token = Auth.getToken();
        const url   = `/api/patients/prescriptions/${ev.id}/download?token=${encodeURIComponent(token)}`;
        downloadBtn = `<a href="${url}" target="_blank" class="btn btn-outline"
                          style="padding:4px 12px;font-size:.76rem;margin-top:10px;display:inline-flex;
                                 align-items:center;gap:5px;text-decoration:none">
                         📄 Download Prescription
                       </a>`;
      }

      return `<div class="timeline-item">
        <div class="timeline-dot" style="background:${meta.dot}"></div>
        <div class="timeline-card">
          <div class="timeline-date">${meta.icon} ${date}</div>
          <div class="timeline-title">${ev.title}</div>
          <div class="timeline-detail">${ev.detail}</div>
          ${ev.extra
            ? `<div style="margin-top:6px">
                 <span class="badge ${ev.type === 'scan' && ev.detected ? 'badge-danger' : ev.type === 'scan' ? 'badge-success' : 'badge-info'}"
                       style="font-size:.72rem">${ev.extra}</span>
               </div>`
            : ''}
          ${downloadBtn}
        </div>
      </div>`;
    }).join('');
  }

  window.setTab = (btn, tab) => {
    activeTab = tab;
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    renderTimeline();
  };

  window.exportHistory = () => {
    const lines = allEvents.map(e => {
      const d = e.date ? new Date(e.date).toLocaleString() : '—';
      return `[${e.type.toUpperCase()}] ${d} — ${e.title}: ${e.detail} ${e.extra}`;
    });
    const blob = new Blob(['OnchoLens Medical History Export\n\n' + lines.join('\n')], { type: 'text/plain' });
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = `oncolens_history_${Date.now()}.txt`;
    a.click();
  };

  load();
})();
