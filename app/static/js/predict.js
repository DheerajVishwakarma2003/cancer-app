/* predict.js — OnchoLens AI Cancer Prediction */
(function () {
  if (!Auth.isLoggedIn()) { window.location.href = '/login'; return; }
  document.getElementById('logout-btn')?.addEventListener('click', e => { e.preventDefault(); Auth.clearSession(); });

  /* ── DOM refs ─────────────────────────────────────── */
  const dropZone       = document.getElementById('drop-zone');
  const fileInput      = document.getElementById('file-input');
  const previewWrap    = document.getElementById('preview-wrap');
  const previewImg     = document.getElementById('preview-img');
  const uploadDefault  = document.getElementById('upload-default');
  const fileMeta       = document.getElementById('file-meta');
  const predictBtn     = document.getElementById('predict-btn');
  const loadingOverlay = document.getElementById('predict-loading');
  const resultSection  = document.getElementById('result-section');
  const placeholder    = document.getElementById('result-placeholder');
  const patientSelect  = document.getElementById('patient-select');
  const patientError   = document.getElementById('patient-error');

  let selectedFile     = null;
  let lastResult       = null;   // store for patient-side download

  /* ── Load patients into dropdown ──────────────────── */
  async function loadPatients() {
    try {
      const res = await Auth.apiFetch('/api/doctors/patients');
      if (!res) return;
      const patients = await res.json();

      // Clear existing options except the placeholder
      while (patientSelect.options.length > 1) patientSelect.remove(1);

      if (!patients.length) {
        const opt = document.createElement('option');
        opt.disabled = true;
        opt.textContent = '— No patients found. Book an appointment first. —';
        patientSelect.appendChild(opt);
        return;
      }

      patients.forEach(p => {
        const opt       = document.createElement('option');
        opt.value       = p.user_id || p.id || '';
        // Show name + blood group + DOB if available
        const details   = [
          p.blood_group ? '🩸 ' + p.blood_group : '',
          p.dob         ? new Date(p.dob).getFullYear() + ' born' : '',
          p.phone       ? '📞 ' + p.phone : '',
        ].filter(Boolean).join('  ·  ');
        opt.textContent = `${p.name || 'Unknown'}${details ? '  —  ' + details : ''}`;
        opt.dataset.name  = p.name  || '';
        opt.dataset.email = p.email || '';
        patientSelect.appendChild(opt);
      });

    } catch (e) { console.error('Failed to load patients', e); }
  }

  /* Validate patient selection and show/hide error */
  function validatePatient() {
    if (!patientSelect.value) {
      if (patientError) {
        patientError.style.display = 'block';
        patientError.textContent   = '⚠️ Please select a patient before running the prediction.';
      }
      patientSelect.style.borderColor = 'var(--danger)';
      return false;
    }
    if (patientError) patientError.style.display = 'none';
    patientSelect.style.borderColor = '';
    return true;
  }

  patientSelect.addEventListener('change', () => {
    if (patientSelect.value) {
      if (patientError) patientError.style.display = 'none';
      patientSelect.style.borderColor = 'var(--success)';
    }
    checkReady();
  });

  /* Enable predict button only when BOTH file and patient are chosen */
  function checkReady() {
    predictBtn.disabled = !(selectedFile && patientSelect.value);
  }

  /* ── Drag & Drop ──────────────────────────────────── */
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) loadFile(file);
  });

  dropZone.addEventListener('click', e => {
    if (e.target.closest('.preview-overlay-btn')) return;
    fileInput.click();
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) loadFile(fileInput.files[0]);
  });

  document.getElementById('change-btn')?.addEventListener('click', e => {
    e.stopPropagation();
    fileInput.click();
  });

  function loadFile(file) {
    const allowed = ['image/png','image/jpeg','image/webp','image/bmp','image/tiff'];
    if (!allowed.includes(file.type)) {
      toast.error('Unsupported format. Use PNG, JPG, WEBP, BMP, or TIFF.');
      return;
    }
    if (file.size > 16 * 1024 * 1024) {
      toast.error('File too large. Max 16 MB.');
      return;
    }
    selectedFile = file;
    previewImg.src                = URL.createObjectURL(file);
    previewWrap.style.display     = 'block';
    uploadDefault.style.display   = 'none';
    dropZone.classList.add('has-image');
    fileMeta.textContent          = `${file.name} · ${(file.size / 1024).toFixed(0)} KB`;
    placeholder.style.display     = 'flex';
    resultSection.style.display   = 'none';
    checkReady();
  }

  /* ── Run Prediction ───────────────────────────────── */
  predictBtn.addEventListener('click', runPrediction);

  async function runPrediction() {
    if (!selectedFile)      { toast.error('Please upload an image first.'); return; }
    if (!validatePatient()) { patientSelect.focus(); return; }

    predictBtn.disabled = true;
    loadingOverlay.classList.add('active');

    const formData = new FormData();
    formData.append('image',      selectedFile);
    formData.append('patient_id', patientSelect.value);

    // Also send selected patient name for the report
    const selectedOpt = patientSelect.options[patientSelect.selectedIndex];
    formData.append('patient_name', selectedOpt.dataset.name || selectedOpt.textContent.split('—')[0].trim());

    try {
      const token   = Auth.getToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      const res  = await fetch('/api/doctors/predict-cancer', { method: 'POST', headers, body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Prediction failed');

      lastResult = data;
      renderResult(data, selectedOpt);
      toast.success('Prediction completed successfully!');
    } catch (err) {
      toast.error(err.message || 'Prediction failed. Please try again.');
    } finally {
      predictBtn.disabled = false;
      loadingOverlay.classList.remove('active');
    }
  }

  /* ── Render Result ────────────────────────────────── */
  function renderResult(data, selectedOpt) {
    placeholder.style.display   = 'none';
    resultSection.style.display = 'block';

    const detected    = data.detected;
    const riskColor   = data.risk_color;

    const card = document.getElementById('result-card');
    card.className = `card result-card ${detected ? 'detected' : 'not-detected'}`;

    document.getElementById('res-icon').textContent      = detected ? '🔴' : '🟢';
    document.getElementById('res-icon').className        = `result-icon ${detected ? 'danger' : 'success'}`;
    document.getElementById('res-prediction').textContent = data.prediction;
    document.getElementById('res-subtext').textContent    = detected
      ? 'Malignancy indicators found in the scan.'
      : 'No malignancy indicators detected.';

    // Patient name on result
    const patNameEl = document.getElementById('res-patient-name');
    if (patNameEl && selectedOpt) {
      patNameEl.textContent = '👤 ' + (selectedOpt.dataset.name || selectedOpt.textContent.split('—')[0].trim());
    }

    // Risk badge
    const badge = document.getElementById('res-risk-badge');
    badge.textContent      = data.risk_level;
    badge.style.color      = riskColor;
    badge.style.background = riskColor + '22';

    // Confidence meter
    document.getElementById('res-confidence-pct').textContent = `${data.confidence}%`;
    const fill = document.getElementById('meter-fill');
    fill.style.width      = '0%';
    fill.style.background = detected
      ? 'linear-gradient(90deg, var(--warning), var(--danger))'
      : 'linear-gradient(90deg, #22c55e, #16a34a)';
    setTimeout(() => { fill.style.width = `${data.confidence}%`; }, 80);

    document.getElementById('res-probability').textContent = (data.probability * 100).toFixed(1) + '%';
    document.getElementById('res-risk-tier').textContent   = data.risk_level;
    document.getElementById('res-risk-tier').style.color   = riskColor;

    setupDownload(data, selectedOpt);
    loadHistory();
  }

  /* ── Download report (doctor) ─────────────────────── */
  function setupDownload(data, selectedOpt) {
    const patientName = selectedOpt
      ? (selectedOpt.dataset.name || selectedOpt.textContent.split('—')[0].trim())
      : '—';

    document.getElementById('download-btn').onclick = () => {
      generateAndDownloadReport(data, patientName, 'Doctor');
    };
  }

  function generateAndDownloadReport(data, patientName, reportFor) {
    const now   = new Date();
    const sep   = '='.repeat(62);
    const lines = [
      sep,
      '     OnchoLens AI Cancer Prediction Report',
      '     Powered by OnchoLens CNN (MobileNetV2)',
      sep,
      '',
      `  Report Date  : ${now.toLocaleString()}`,
      `  Record ID    : ${data.record_id || 'N/A'}`,
      `  Patient      : ${patientName}`,
      `  Report For   : ${reportFor}`,
      '',
      '─'.repeat(62),
      '  PREDICTION RESULTS',
      '─'.repeat(62),
      '',
      `  Result       : ${data.prediction}`,
      `  Detected     : ${data.detected ? 'YES ⚠️' : 'NO ✅'}`,
      `  Confidence   : ${data.confidence}%`,
      `  Probability  : ${(data.probability * 100).toFixed(2)}%`,
      `  Risk Level   : ${data.risk_level}`,
      `  Risk Tier    : ${(data.risk_tier || '').toUpperCase()}`,
      '',
      '─'.repeat(62),
      '  MODEL INFORMATION',
      '─'.repeat(62),
      '',
      '  Model        : OnchoLens CNN (MobileNetV2-based)',
      '  Input Size   : 224 × 224 px',
      '  Output       : Sigmoid binary classifier',
      '',
      '─'.repeat(62),
      '  RISK TIERS',
      '─'.repeat(62),
      '',
      '  Benign   (0–29%)   → Routine follow-up',
      '  Low Risk (30–49%)  → Closer monitoring',
      '  Moderate (50–79%)  → Specialist consult',
      '  High Risk(80–100%) → Urgent clinical review',
      '',
      '─'.repeat(62),
      '  ⚠️  DISCLAIMER',
      '─'.repeat(62),
      '',
      '  This AI report is a decision-support tool only.',
      '  Always validate with a qualified medical professional.',
      '',
      sep,
      `  © ${now.getFullYear()} OnchoLens Healthcare AI Platform`,
      sep,
    ];

    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = `oncolens_report_${(data.record_id || Date.now()).toString().slice(0, 8)}.txt`;
    a.click();
  }

  // Expose globally so patient can download from history
  window._generateAndDownloadReport = generateAndDownloadReport;

  /* ── History ──────────────────────────────────────── */
  async function loadHistory() {
    try {
      const res  = await Auth.apiFetch('/api/doctors/predict-history');
      if (!res) return;
      const rows = await res.json();
      renderHistory(rows);
    } catch (_) {}
  }

  function renderHistory(rows) {
    const tbody = document.getElementById('history-tbody');
    if (!tbody) return;
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-3)">No predictions yet</td></tr>`;
      return;
    }
    tbody.innerHTML = rows.slice(0, 10).map(r => {
      const date  = r.created_at ? new Date(r.created_at).toLocaleDateString() : '—';
      const badge = r.detected
        ? `<span class="badge badge-danger">Detected</span>`
        : `<span class="badge badge-success">Clear</span>`;
      return `<tr>
        <td>${date}</td>
        <td style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.patient_name || r.patient_id?.slice(0,8) || '—'}</td>
        <td>${r.prediction || '—'}</td>
        <td>${badge}</td>
        <td>${r.confidence ? r.confidence + '%' : '—'}</td>
        <td>
          <button class="btn btn-outline" style="padding:3px 10px;font-size:.74rem"
                  onclick="downloadHistoryReport(${JSON.stringify(r).replace(/"/g,'&quot;')})">
            📄
          </button>
        </td>
      </tr>`;
    }).join('');
  }

  // Download from history row
  window.downloadHistoryReport = (r) => {
    generateAndDownloadReport(r, r.patient_name || r.patient_id || '—', 'Doctor (History)');
  };

  /* ── Init ─────────────────────────────────────────── */
  loadPatients();
  loadHistory();
})();
