/* doctor-profile.js */
(function () {
  if (!Auth.isLoggedIn()) { window.location.href = '/login'; return; }
  document.getElementById('logout-btn')?.addEventListener('click', e => { e.preventDefault(); Auth.clearSession(); });

  const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

  /* ── Load profile ─────────────────────────────────── */
  async function load() {
    try {
      const res  = await Auth.apiFetch('/api/doctors/profile');
      const data = res ? await res.json() : {};
      populate(data);
    } catch { toast.error('Failed to load profile'); }
  }

  function initials(name) {
    if (!name) return 'DR';
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  }

  function populate(d) {
    document.getElementById('f-name').value           = d.name           || '';
    document.getElementById('f-phone').value          = d.phone          || '';
    document.getElementById('f-specialization').value = d.specialization || '';
    document.getElementById('f-experience').value     = d.experience     || '';
    document.getElementById('f-fee').value            = d.fee            || '';
    document.getElementById('f-languages').value      = d.languages      || '';
    document.getElementById('f-bio').value            = d.bio            || '';
    document.getElementById('f-address').value        = d.address        || '';

    document.getElementById('display-name').textContent  = d.name  || 'Your Name';
    document.getElementById('display-email').textContent = d.email || '';
    document.getElementById('avatar-display').childNodes[0].textContent = initials(d.name);

    renderSchedule(d.schedule || {});
  }

  function renderSchedule(schedule) {
    const grid = document.getElementById('schedule-grid');
    grid.innerHTML = DAYS.map(day => {
      const s = schedule[day] || { enabled: false, start: '09:00', end: '17:00' };
      return `<div style="background:var(--bg-2);border-radius:var(--radius-sm);padding:14px;border:1px solid var(--card-border)">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <span style="font-weight:600;font-size:.88rem">${day}</span>
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:.8rem">
            <input type="checkbox" id="sched-${day}" ${s.enabled?'checked':''} onchange="toggleDay('${day}')" />
            Active
          </label>
        </div>
        <div id="sched-times-${day}" style="${s.enabled?'':'opacity:.4;pointer-events:none'}">
          <div style="display:flex;gap:6px;align-items:center;font-size:.78rem">
            <input type="time" id="sched-start-${day}" value="${s.start||'09:00'}"
              class="form-input" style="padding:5px 8px;font-size:.78rem;flex:1" />
            <span style="color:var(--text-3)">–</span>
            <input type="time" id="sched-end-${day}" value="${s.end||'17:00'}"
              class="form-input" style="padding:5px 8px;font-size:.78rem;flex:1" />
          </div>
        </div>
      </div>`;
    }).join('');
  }

  window.toggleDay = day => {
    const enabled = document.getElementById(`sched-${day}`).checked;
    const times   = document.getElementById(`sched-times-${day}`);
    times.style.opacity        = enabled ? '1' : '.4';
    times.style.pointerEvents  = enabled ? 'auto' : 'none';
  };

  /* ── Save ─────────────────────────────────────────── */
  window.saveProfile = async () => {
    const btn = document.getElementById('save-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Saving…';

    const schedule = {};
    DAYS.forEach(day => {
      schedule[day] = {
        enabled: document.getElementById(`sched-${day}`)?.checked || false,
        start:   document.getElementById(`sched-start-${day}`)?.value || '09:00',
        end:     document.getElementById(`sched-end-${day}`)?.value   || '17:00',
      };
    });

    const payload = {
      name:           document.getElementById('f-name').value.trim(),
      phone:          document.getElementById('f-phone').value.trim(),
      specialization: document.getElementById('f-specialization').value.trim(),
      experience:     parseInt(document.getElementById('f-experience').value) || 0,
      fee:            parseInt(document.getElementById('f-fee').value) || 0,
      languages:      document.getElementById('f-languages').value.trim(),
      bio:            document.getElementById('f-bio').value.trim(),
      address:        document.getElementById('f-address').value.trim(),
      schedule,
    };

    try {
      const res = await Auth.apiFetch('/api/doctors/profile', {
        method: 'PUT', body: JSON.stringify(payload),
      });
      if (res?.ok) {
        toast.success('Profile saved!');
        document.getElementById('display-name').textContent     = payload.name || 'Your Name';
        document.getElementById('avatar-display').childNodes[0].textContent = initials(payload.name);
      } else {
        const d = await res.json();
        toast.error(d.error || 'Save failed');
      }
    } catch { toast.error('Network error'); }
    finally { btn.disabled = false; btn.innerHTML = '💾 Save Changes'; }
  };

  /* ── Password ─────────────────────────────────────── */
  window.changePassword = async () => {
    const np = document.getElementById('new-pw').value;
    const cp = document.getElementById('confirm-pw').value;
    if (np.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    if (np !== cp)     { toast.error('Passwords do not match'); return; }
    try {
      const res = await Auth.apiFetch('/api/auth/reset-password', {
        method: 'POST', body: JSON.stringify({ new_password: np }),
      });
      if (res?.ok) {
        toast.success('Password updated!');
        document.getElementById('new-pw').value = '';
        document.getElementById('confirm-pw').value = '';
      } else {
        const d = await res.json();
        toast.error(d.error || 'Update failed');
      }
    } catch { toast.error('Network error'); }
  };

  load();
})();
