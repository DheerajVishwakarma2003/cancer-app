/* patient-profile.js */
(function () {
  if (!Auth.isLoggedIn()) { window.location.href = '/login'; return; }
  document.getElementById('logout-btn')?.addEventListener('click', e => { e.preventDefault(); Auth.clearSession(); });

  function initials(name) {
    if (!name) return 'PT';
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  }

  async function load() {
    try {
      const [profileRes, userRes] = await Promise.all([
        Auth.apiFetch('/api/patients/profile'),
        Auth.apiFetch('/api/auth/me'),
      ]);
      const p = profileRes ? await profileRes.json() : {};
      const u = userRes    ? await userRes.json()    : {};

      document.getElementById('f-name').value       = p.name       || u.name || '';
      document.getElementById('f-phone').value      = p.phone      || '';
      document.getElementById('f-dob').value        = p.dob        || '';
      document.getElementById('f-blood').value      = p.blood_group|| '';
      document.getElementById('f-gender').value     = p.gender     || '';
      document.getElementById('f-emergency').value  = p.emergency_contact || '';
      document.getElementById('f-address').value    = p.address    || '';
      document.getElementById('f-height').value     = p.height     || '';
      document.getElementById('f-weight').value     = p.weight     || '';
      document.getElementById('f-allergies').value  = (p.allergies||[]).join(', ');
      document.getElementById('f-conditions').value = p.conditions || '';

      const name = p.name || u.name || '';
      document.getElementById('display-name').textContent  = name || 'Your Name';
      document.getElementById('display-email').textContent = u.email || '';
      document.getElementById('avatar-display').childNodes[0].textContent = initials(name);
    } catch { toast.error('Failed to load profile'); }
  }

  window.saveProfile = async () => {
    const btn = document.getElementById('save-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Saving…';

    const allergiesRaw = document.getElementById('f-allergies').value;
    const allergies    = allergiesRaw.split(',').map(s=>s.trim()).filter(Boolean);

    const payload = {
      name:              document.getElementById('f-name').value.trim(),
      phone:             document.getElementById('f-phone').value.trim(),
      dob:               document.getElementById('f-dob').value || null,
      blood_group:       document.getElementById('f-blood').value,
      gender:            document.getElementById('f-gender').value,
      emergency_contact: document.getElementById('f-emergency').value.trim(),
      address:           document.getElementById('f-address').value.trim(),
      height:            parseInt(document.getElementById('f-height').value) || null,
      weight:            parseInt(document.getElementById('f-weight').value) || null,
      allergies,
      conditions:        document.getElementById('f-conditions').value.trim(),
    };

    try {
      const res = await Auth.apiFetch('/api/patients/profile', {
        method: 'PUT', body: JSON.stringify(payload),
      });
      if (res?.ok) {
        toast.success('Profile saved!');
        document.getElementById('display-name').textContent = payload.name || 'Your Name';
        document.getElementById('avatar-display').childNodes[0].textContent = initials(payload.name);
      } else {
        const d = await res.json();
        toast.error(d.error || 'Save failed');
      }
    } catch { toast.error('Network error'); }
    finally { btn.disabled = false; btn.innerHTML = '💾 Save Changes'; }
  };

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
        toast.error(d.error || 'Failed');
      }
    } catch { toast.error('Network error'); }
  };

  load();
})();
