/* patient-appointments.js */
(function () {
  if (!Auth.isLoggedIn()) { window.location.href = '/login'; return; }
  document.getElementById('logout-btn')?.addEventListener('click', e => { e.preventDefault(); Auth.clearSession(); });

  let allApts = [];
  let activeFilter = 'all';

  async function load() {
    try {
      const res = await Auth.apiFetch('/api/patients/appointments');
      allApts   = res ? await res.json() : [];
      renderStats();
      render();
    } catch { toast.error('Failed to load appointments'); }
  }

  function renderStats() {
    const c = s => allApts.filter(a => a.status === s).length;
    document.getElementById('cnt-pending').textContent   = c('pending');
    document.getElementById('cnt-confirmed').textContent = c('confirmed');
    document.getElementById('cnt-completed').textContent = c('completed');
    document.getElementById('cnt-cancelled').textContent = c('cancelled');
  }

  function render() {
    const list = activeFilter === 'all' ? allApts : allApts.filter(a => a.status === activeFilter);
    const el   = document.getElementById('apt-list');

    if (!list.length) {
      el.innerHTML = `<div class="empty-state">
        <div class="empty-icon">📅</div>
        <h3>No appointments${activeFilter !== 'all' ? ' with status "'+activeFilter+'"' : ''}</h3>
        <p><a href="/patient/doctors" style="color:var(--accent)">Book your first appointment →</a></p>
      </div>`;
      return;
    }

    el.innerHTML = list.map(a => {
      const d     = a.slot ? new Date(a.slot) : null;
      const day   = d ? d.getDate() : '—';
      const month = d ? d.toLocaleString('default',{month:'short'}).toUpperCase() : '—';
      const time  = d ? d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : '';
      const pill  = { pending:'pill-pending', confirmed:'pill-confirmed', completed:'pill-completed', cancelled:'pill-cancelled' }[a.status] || '';

      return `<div class="apt-card" style="margin-bottom:10px">
        <div class="apt-date-box">
          <span class="apt-date-day">${day}</span>
          <span class="apt-date-month">${month}</span>
        </div>
        <div class="apt-info">
          <div class="apt-name">👨‍⚕️ ${a.doctor_name || 'Dr. ' + (a.doctor_id || '').slice(0,8)}</div>
          <div class="apt-reason">${a.reason || 'General consultation'} ${time ? '· '+time : ''}</div>
          ${a.notes ? `<div style="font-size:.75rem;color:var(--text-3);margin-top:2px">📝 ${a.notes}</div>` : ''}
        </div>
        <div class="apt-actions">
          <span class="pill ${pill}">${a.status}</span>
          ${a.status === 'pending'
            ? `<button class="btn btn-danger" style="padding:4px 10px;font-size:.76rem"
                onclick="openCancel('${a.id}')">Cancel</button>`
            : ''}
        </div>
      </div>`;
    }).join('');
  }

  window.setFilter = (btn, status) => {
    activeFilter = status;
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    render();
  };

  window.openCancel = id => {
    document.getElementById('cancel-apt-id').value = id;
    document.getElementById('cancel-modal').style.display = 'flex';
  };

  window.cancelApt = async () => {
    const id = document.getElementById('cancel-apt-id').value;
    try {
      const res = await Auth.apiFetch(`/api/patients/appointments/${id}/cancel`, { method: 'PUT' });
      if (res?.ok) {
        toast.success('Appointment cancelled');
        document.getElementById('cancel-modal').style.display = 'none';
        load();
      } else {
        const d = await res.json();
        toast.error(d.error || 'Cancel failed');
      }
    } catch { toast.error('Network error'); }
  };

  load();
})();
