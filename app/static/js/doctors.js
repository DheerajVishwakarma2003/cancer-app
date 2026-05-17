/* doctors.js — Find Doctors page */
(function () {
  if (!Auth.isLoggedIn()) { window.location.href = '/login'; return; }

  document.getElementById('logout-btn')?.addEventListener('click', e => {
    e.preventDefault(); Auth.clearSession();
  });

  let allDoctors    = [];
  let activeSpec    = 'all';
  const COLORS      = ['#0ea5e9','#7c3aed','#059669','#dc2626','#d97706','#0891b2'];

  /* ── Helpers ────────────────────────────────────── */
  function initials(name) {
    if (!name) return 'DR';
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  }
  function avatarColor(id) {
    const str = id || '';
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return COLORS[Math.abs(hash) % COLORS.length];
  }

  /* ── Load doctors ───────────────────────────────── */
  async function loadDoctors() {
    const grid = document.getElementById('doctors-grid');
    try {
      const res  = await fetch('/api/doctors');
      const data = await res.json();
      allDoctors = Array.isArray(data) ? data : [];
      buildSpecChips();
      renderDoctors(allDoctors);
    } catch (e) {
      console.error(e);
      grid.innerHTML = `<div class="no-doctors">
        <div class="nd-icon">⚠️</div>
        <h3>Could not load doctors</h3>
        <p>Please check your connection and try again.</p>
      </div>`;
    }
  }

  /* ── Spec filter chips ──────────────────────────── */
  function buildSpecChips() {
    const specs = ['all', ...new Set(allDoctors
      .map(d => d.specialization)
      .filter(Boolean)
    )];
    const container = document.getElementById('spec-chips');
    if (!container) return;
    container.innerHTML = specs.map(s => `
      <button class="spec-chip ${s === 'all' ? 'active' : ''}"
              onclick="setSpec(this, '${s}')">
        ${s === 'all' ? 'All Specializations' : s}
      </button>`).join('');
  }

  window.setSpec = (btn, spec) => {
    activeSpec = spec;
    document.querySelectorAll('.spec-chip').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    applyFilters();
  };

  /* ── Search ─────────────────────────────────────── */
  window.filterDoctors = value => {
    applyFilters(value);
  };

  function applyFilters(searchVal) {
    const q = (searchVal ?? document.getElementById('search-input').value ?? '').toLowerCase();
    const filtered = allDoctors.filter(d => {
      const matchSpec = activeSpec === 'all' || (d.specialization || '') === activeSpec;
      const matchQ    = !q
        || (d.name           || '').toLowerCase().includes(q)
        || (d.specialization || '').toLowerCase().includes(q)
        || (d.bio            || '').toLowerCase().includes(q);
      return matchSpec && matchQ;
    });
    renderDoctors(filtered);
  }

  /* ── Render doctor cards ────────────────────────── */
  function renderDoctors(list) {
    const grid = document.getElementById('doctors-grid');

    if (!list.length) {
      grid.innerHTML = `<div class="no-doctors">
        <div class="nd-icon">🔍</div>
        <h3>No doctors found</h3>
        <p>Try a different search term or specialization filter.</p>
      </div>`;
      return;
    }

    grid.innerHTML = list.map(d => {
      const id    = d.user_id || d.id || '';
      const color = avatarColor(id);
      const fee   = d.fee   ? `<span class="fee-badge">₹${d.fee}/visit</span>` : '';
      const exp   = d.experience ? `<span class="doctor-detail-row">🎓 ${d.experience} yrs exp</span>` : '';
      const lang  = d.languages  ? `<span class="doctor-detail-row">🗣 ${d.languages}</span>` : '';

      return `
      <div class="doctor-card">
        <div style="display:flex;align-items:center;gap:12px">
          <div class="doctor-avatar" style="background:linear-gradient(135deg,${color},${color}cc)">
            ${initials(d.name)}
          </div>
          <div class="doctor-info">
            <div class="doctor-name">Dr. ${d.name || '—'}</div>
            <div class="doctor-spec">${d.specialization || 'General Physician'}</div>
          </div>
        </div>

        ${d.bio ? `<p class="doctor-bio">${d.bio}</p>` : ''}

        <div style="display:flex;gap:12px;flex-wrap:wrap">
          ${exp}${lang}
        </div>

        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:auto">
          <div style="display:flex;align-items:center;gap:8px">
            <span class="badge badge-success" style="font-size:.7rem">
              <span class="avail-dot"></span>Available
            </span>
            ${fee}
          </div>
          <button class="btn btn-primary" style="padding:7px 18px;font-size:.82rem"
                  onclick="openBookModal('${id}','${(d.name||'').replace(/'/g,"\\'")}','${d.specialization||''}')">
            📅 Book
          </button>
        </div>
      </div>`;
    }).join('');
  }

  /* ── Book modal ─────────────────────────────────── */
  window.openBookModal = (doctorId, doctorName, doctorSpec) => {
    document.getElementById('modal-doctor-id').value       = doctorId;
    document.getElementById('modal-doctor-name').textContent = `Dr. ${doctorName}`;
    document.getElementById('modal-doctor-spec').textContent = doctorSpec || 'General Physician';
    document.getElementById('modal-initials').textContent    = initials(doctorName);

    // Set minimum datetime to now
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    document.getElementById('modal-slot').min   = now.toISOString().slice(0,16);
    document.getElementById('modal-slot').value = '';
    document.getElementById('modal-reason').value = '';

    // Clear previous error
    const err = document.getElementById('modal-error');
    if (err) err.style.display = 'none';

    document.getElementById('book-modal').style.display = 'flex';
  };

  window.closeBookModal = e => {
    // close on backdrop click or explicit call
    if (!e || e.target.id === 'book-modal') {
      document.getElementById('book-modal').style.display = 'none';
    }
  };

  window.confirmBooking = async () => {
    const doctorId = document.getElementById('modal-doctor-id').value;
    const slot     = document.getElementById('modal-slot').value;
    const reason   = document.getElementById('modal-reason').value.trim();
    const errEl    = document.getElementById('modal-error');
    const btn      = document.getElementById('confirm-book-btn');

    // Validate
    if (!slot) {
      errEl.textContent    = 'Please select a date and time.';
      errEl.style.display  = 'block';
      return;
    }
    if (!doctorId) {
      errEl.textContent   = 'Doctor ID missing. Please re-open the booking form.';
      errEl.style.display = 'block';
      return;
    }

    btn.disabled     = true;
    btn.innerHTML    = '<span class="spinner"></span> Booking…';
    errEl.style.display = 'none';

    try {
      const res  = await Auth.apiFetch('/api/patients/appointments', {
        method: 'POST',
        body:   JSON.stringify({ doctor_id: doctorId, slot, reason }),
      });
      const data = await res.json();

      if (!res.ok) {
        errEl.textContent   = data.error || 'Booking failed. Please try again.';
        errEl.style.display = 'block';
        return;
      }

      toast.success('✅ Appointment booked successfully!');
      document.getElementById('book-modal').style.display = 'none';

      // Optionally redirect to appointments page
      setTimeout(() => { window.location.href = '/patient/appointments'; }, 1200);

    } catch {
      errEl.textContent   = 'Network error. Please try again.';
      errEl.style.display = 'block';
    } finally {
      btn.disabled  = false;
      btn.innerHTML = '📅 Confirm Booking';
    }
  };

  /* ── Init ───────────────────────────────────────── */
  loadDoctors();
})();
