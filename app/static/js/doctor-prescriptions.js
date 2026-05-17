/* doctor-prescriptions.js */
(function () {
  if (!Auth.isLoggedIn()) { window.location.href = '/login'; return; }
  document.getElementById('logout-btn')?.addEventListener('click', e => { e.preventDefault(); Auth.clearSession(); });

  let allRx = [];
  let medRowCount = 0;

  async function load() {
    try {
      const [rxRes, aptRes] = await Promise.all([
        Auth.apiFetch('/api/doctors/prescriptions'),
        Auth.apiFetch('/api/doctors/appointments'),
      ]);
      allRx = rxRes ? await rxRes.json() : [];
      const apts = aptRes ? await aptRes.json() : [];

      const sel = document.getElementById('rx-apt-id');
      apts.filter(a => a.status !== 'cancelled').forEach(a => {
        const opt = document.createElement('option');
        opt.value = a.id;
        opt.textContent = `${a.patient_name || a.patient_id} · ${a.slot ? new Date(a.slot).toLocaleDateString() : '—'}`;
        sel.appendChild(opt);
      });
      renderRx(allRx);
    } catch { toast.error('Failed to load prescriptions'); }
  }

  function renderRx(list) {
    const el = document.getElementById('rx-list');
    if (!list.length) {
      el.innerHTML = `<div class="empty-state">
        <div class="empty-icon">💊</div>
        <h3>No prescriptions yet</h3>
        <p>Click <strong>New Prescription</strong> to write one</p>
      </div>`;
      return;
    }
    el.innerHTML = list.map(rx => {
      const meds = Array.isArray(rx.medications) ? rx.medications : [];
      return `<div class="rx-card">
        <div class="rx-header" onclick="toggleRx(this)">
          <div>
            <div class="rx-title">💊 ${rx.patient_name || rx.patient_id || 'Patient'}</div>
            <div class="rx-date">${rx.created_at ? new Date(rx.created_at).toLocaleDateString() : '—'} · ${meds.length} medication${meds.length !== 1 ? 's' : ''}</div>
          </div>
          <span class="rx-arrow" style="transition:transform .2s;color:var(--text-3)">▾</span>
        </div>
        <div class="rx-body">
          ${rx.notes ? `<p style="font-size:.85rem;color:var(--text-2);margin-bottom:12px;padding:10px;background:var(--bg-2);border-radius:var(--radius-sm)">📝 ${rx.notes}</p>` : ''}
          <ul class="rx-med-list">
            ${meds.map(m => `<li class="rx-med-item">
              <span class="rx-med-icon">💊</span>
              <span class="rx-med-name">${m.name || '—'}</span>
              <span class="rx-med-dose">${[m.dosage, m.frequency, m.duration].filter(Boolean).join(' · ')}</span>
            </li>`).join('')}
          </ul>
          <div style="margin-top:12px;display:flex;gap:8px">
            <button class="btn btn-outline" style="padding:5px 12px;font-size:.78rem"
                    onclick="downloadRx('${rx.id}')">📄 Download</button>
          </div>
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
    renderRx(allRx.filter(rx => {
      const meds = (rx.medications || []).map(m => (m.name || '').toLowerCase()).join(' ');
      return (rx.patient_name || rx.patient_id || '').toLowerCase().includes(q) || meds.includes(q);
    }));
  };

  window.openWriteModal = () => {
    medRowCount = 0;
    document.getElementById('med-rows').innerHTML = '';
    document.getElementById('rx-patient-id').value = '';
    document.getElementById('rx-notes').value = '';
    addMedRow();
    document.getElementById('write-modal').style.display = 'flex';
  };

  window.addMedRow = () => {
    medRowCount++;
    const row = document.createElement('div');
    row.style.cssText = 'display:grid;grid-template-columns:2fr 1fr 1fr 1fr auto;gap:6px;align-items:start';
    row.innerHTML = `
      <input class="form-input" placeholder="Drug name" data-field="name" style="padding:8px 10px;font-size:.82rem" />
      <input class="form-input" placeholder="Dosage"    data-field="dosage" style="padding:8px 10px;font-size:.82rem" />
      <input class="form-input" placeholder="Frequency" data-field="frequency" style="padding:8px 10px;font-size:.82rem" />
      <input class="form-input" placeholder="Duration"  data-field="duration" style="padding:8px 10px;font-size:.82rem" />
      <button onclick="this.parentElement.remove()" style="background:none;border:none;cursor:pointer;color:var(--danger);font-size:1.1rem;padding:6px">✕</button>`;
    document.getElementById('med-rows').appendChild(row);
  };

  window.savePrescription = async () => {
    const patientId = document.getElementById('rx-patient-id').value.trim();
    const aptId     = document.getElementById('rx-apt-id').value;
    const notes     = document.getElementById('rx-notes').value.trim();
    if (!patientId) { toast.error('Patient ID is required'); return; }

    const meds = [];
    document.querySelectorAll('#med-rows > div').forEach(row => {
      const name = row.querySelector('[data-field="name"]').value.trim();
      if (!name) return;
      meds.push({
        name,
        dosage:    row.querySelector('[data-field="dosage"]').value.trim(),
        frequency: row.querySelector('[data-field="frequency"]').value.trim(),
        duration:  row.querySelector('[data-field="duration"]').value.trim(),
      });
    });
    if (!meds.length) { toast.error('Add at least one medication'); return; }

    try {
      const res  = await Auth.apiFetch('/api/doctors/prescriptions', {
        method: 'POST',
        body:   JSON.stringify({ patient_id: patientId, appointment_id: aptId || null, medications: meds, notes }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to save'); return; }
      toast.success('Prescription saved!');
      document.getElementById('write-modal').style.display = 'none';
      load();
    } catch { toast.error('Network error'); }
  };

  /* Pass JWT as query param for direct browser download */
  window.downloadRx = id => {
    const token = Auth.getToken();
    window.open(`/api/doctors/prescriptions/${id}/download-file?token=${encodeURIComponent(token)}`, '_blank');
  };

  load();
})();
