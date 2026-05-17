/* doctor-appointments.js */
(function () {
  if (!Auth.isLoggedIn()) { window.location.href = '/login'; return; }
  document.getElementById('logout-btn')?.addEventListener('click', e => { e.preventDefault(); Auth.clearSession(); });

  let allApts = [];
  let activeFilter = 'all';

  /* ── Load ─────────────────────────────────────────── */
  async function load() {
    try {
      const res  = await Auth.apiFetch('/api/doctors/appointments');
      allApts    = res ? await res.json() : [];
      renderStats();
      renderList();
    } catch (e) { toast.error('Failed to load appointments'); }
  }

  function renderStats() {
    const count = s => allApts.filter(a => a.status === s).length;
    document.getElementById('cnt-pending').textContent   = count('pending');
    document.getElementById('cnt-confirmed').textContent = count('confirmed');
    document.getElementById('cnt-completed').textContent = count('completed');
    document.getElementById('cnt-cancelled').textContent = count('cancelled');
  }

  function renderList() {
    const q    = (document.getElementById('search-input').value || '').toLowerCase();
    const list = allApts.filter(a => {
      const matchStatus = activeFilter === 'all' || a.status === activeFilter;
      const matchQ = !q || (a.patient_name||'').toLowerCase().includes(q) || (a.reason||'').toLowerCase().includes(q);
      return matchStatus && matchQ;
    });

    const el = document.getElementById('apt-list');
    if (!list.length) {
      el.innerHTML = `<div class="empty-state">
        <div class="empty-icon">📅</div>
        <h3>No appointments found</h3>
        <p>Try a different filter or search term</p>
      </div>`;
      return;
    }

    el.innerHTML = list.map(a => {
      const d = a.slot ? new Date(a.slot) : null;
      const day   = d ? d.getDate()                                            : '—';
      const month = d ? d.toLocaleString('default',{month:'short'}).toUpperCase(): '—';
      const time  = d ? d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}): '';
      const pillClass = { pending:'pill-pending', confirmed:'pill-confirmed', completed:'pill-completed', cancelled:'pill-cancelled' }[a.status] || '';

      return `<div class="apt-card" style="margin-bottom:10px">
        <div class="apt-date-box">
          <span class="apt-date-day">${day}</span>
          <span class="apt-date-month">${month}</span>
        </div>
        <div class="apt-info">
          <div class="apt-name">👤 ${a.patient_name || a.patient_id || 'Patient'}</div>
          <div class="apt-reason">${a.reason || 'No reason specified'} ${time ? '· '+time : ''}</div>
        </div>
        <div class="apt-actions">
          <span class="pill ${pillClass}">${a.status}</span>
          ${a.status === 'pending' || a.status === 'confirmed'
            ? `<button class="btn btn-outline" style="padding:5px 12px;font-size:.78rem"
                onclick="openModal('${a.id}')">Manage</button>`
            : ''}
        </div>
      </div>`;
    }).join('');
  }

  /* ── Filter / search ──────────────────────────────── */
  window.setFilter = (btn, status) => {
    activeFilter = status;
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    renderList();
  };
  window.filterApts = () => renderList();

  /* ── Modal ────────────────────────────────────────── */
  window.openModal = aptId => {
    const a = allApts.find(x => x.id === aptId);
    if (!a) return;
    document.getElementById('modal-apt-id').value        = aptId;
    document.getElementById('modal-patient-name').textContent = a.patient_name || a.patient_id || '—';
    document.getElementById('modal-slot').textContent    = a.slot ? new Date(a.slot).toLocaleString() : '—';
    document.getElementById('modal-reason').value        = a.reason || '';
    document.getElementById('modal-notes').value         = a.notes  || '';
    document.getElementById('action-modal').style.display = 'flex';
  };

  window.updateApt = async status => {
    const id    = document.getElementById('modal-apt-id').value;
    const notes = document.getElementById('modal-notes').value;
    try {
      const res = await Auth.apiFetch(`/api/doctors/appointments/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ status, notes }),
      });
      if (res?.ok) {
        toast.success(`Appointment ${status}`);
        document.getElementById('action-modal').style.display = 'none';
        load();
      } else {
        const d = await res.json();
        toast.error(d.error || 'Update failed');
      }
    } catch { toast.error('Network error'); }
  };

  load();
})();
