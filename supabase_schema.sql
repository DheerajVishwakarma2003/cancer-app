-- ════════════════════════════════════════════════════════════════════════════
--  OnchoLens — Supabase PostgreSQL Schema  (Full Updated Version)
--  Run in Supabase SQL Editor  ·  Idempotent (safe to re-run)
-- ════════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── users ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin','doctor','patient')),
  name          TEXT,
  is_active     BOOLEAN DEFAULT TRUE,
  is_verified   BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── doctors ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS doctors (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  name            TEXT,
  email           TEXT,
  phone           TEXT,
  specialization  TEXT,
  bio             TEXT,
  address         TEXT,
  experience      INTEGER DEFAULT 0,
  fee             INTEGER DEFAULT 0,           -- in rupees
  languages       TEXT,
  schedule        JSONB DEFAULT '{}',
  is_approved     BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── patients ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS patients (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  name              TEXT,
  email             TEXT,
  phone             TEXT,
  dob               DATE,
  address           TEXT,
  blood_group       TEXT,
  gender            TEXT,
  height            INTEGER,                  -- cm
  weight            INTEGER,                  -- kg
  allergies         TEXT[] DEFAULT '{}',
  conditions        TEXT,
  emergency_contact TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ── appointments ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS appointments (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  doctor_id     UUID REFERENCES users(id),
  patient_id    UUID REFERENCES users(id),
  doctor_name   TEXT,
  patient_name  TEXT,
  slot          TIMESTAMPTZ,
  reason        TEXT,
  notes         TEXT,
  status        TEXT DEFAULT 'pending'
                CHECK (status IN ('pending','confirmed','cancelled','completed')),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── prescriptions ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS prescriptions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  doctor_id       UUID REFERENCES users(id),
  patient_id      UUID REFERENCES users(id),
  doctor_name     TEXT,
  patient_name    TEXT,
  appointment_id  UUID REFERENCES appointments(id) ON DELETE SET NULL,
  medications     JSONB DEFAULT '[]',
  -- Each medication object: { name, dosage, frequency, duration }
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── ai_predictions ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_predictions (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  doctor_id    UUID REFERENCES users(id),
  patient_id   UUID REFERENCES users(id),
  image_url    TEXT,
  prediction   TEXT,
  confidence   FLOAT,
  probability  FLOAT,
  risk_level   TEXT,
  risk_tier    TEXT,
  detected     BOOLEAN,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── subscriptions ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscriptions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES users(id),
  plan_id     TEXT,
  order_id    TEXT,
  payment_id  TEXT,
  status      TEXT DEFAULT 'active' CHECK (status IN ('active','expired','cancelled')),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  expires_at  TIMESTAMPTZ
);

-- ── notifications ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID REFERENCES users(id),
  title      TEXT,
  message    TEXT,
  type       TEXT DEFAULT 'info',
  read       BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ════════════════════════════════════════════════════════════════════════════
--  Indexes
-- ════════════════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_users_email         ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role          ON users(role);
CREATE INDEX IF NOT EXISTS idx_doctors_user        ON doctors(user_id);
CREATE INDEX IF NOT EXISTS idx_doctors_approved    ON doctors(is_approved);
CREATE INDEX IF NOT EXISTS idx_patients_user       ON patients(user_id);
CREATE INDEX IF NOT EXISTS idx_apts_doctor         ON appointments(doctor_id);
CREATE INDEX IF NOT EXISTS idx_apts_patient        ON appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_apts_status         ON appointments(status);
CREATE INDEX IF NOT EXISTS idx_apts_slot           ON appointments(slot);
CREATE INDEX IF NOT EXISTS idx_rx_doctor           ON prescriptions(doctor_id);
CREATE INDEX IF NOT EXISTS idx_rx_patient          ON prescriptions(patient_id);
CREATE INDEX IF NOT EXISTS idx_preds_doctor        ON ai_predictions(doctor_id);
CREATE INDEX IF NOT EXISTS idx_preds_patient       ON ai_predictions(patient_id);
CREATE INDEX IF NOT EXISTS idx_preds_detected      ON ai_predictions(detected);
CREATE INDEX IF NOT EXISTS idx_subs_user           ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subs_status         ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_notif_user          ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notif_read          ON notifications(user_id, read);

-- ════════════════════════════════════════════════════════════════════════════
--  Row-Level Security
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE users           ENABLE ROW LEVEL SECURITY;
ALTER TABLE doctors         ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients        ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE prescriptions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_predictions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications   ENABLE ROW LEVEL SECURITY;

-- Users see only their own row
DROP POLICY IF EXISTS "users_self"    ON users;
CREATE POLICY "users_self" ON users FOR SELECT USING (id = auth.uid());

-- Doctors: own profile
DROP POLICY IF EXISTS "doctors_own"   ON doctors;
CREATE POLICY "doctors_own" ON doctors FOR ALL USING (user_id = auth.uid());

-- Patients: own profile
DROP POLICY IF EXISTS "patients_own"  ON patients;
CREATE POLICY "patients_own" ON patients FOR ALL USING (user_id = auth.uid());

-- Appointments: either party
DROP POLICY IF EXISTS "apts_doctor"   ON appointments;
DROP POLICY IF EXISTS "apts_patient"  ON appointments;
CREATE POLICY "apts_doctor"  ON appointments FOR ALL USING (doctor_id  = auth.uid());
CREATE POLICY "apts_patient" ON appointments FOR ALL USING (patient_id = auth.uid());

-- Prescriptions: either party
DROP POLICY IF EXISTS "rx_doctor"     ON prescriptions;
DROP POLICY IF EXISTS "rx_patient"    ON prescriptions;
CREATE POLICY "rx_doctor"  ON prescriptions FOR ALL USING (doctor_id  = auth.uid());
CREATE POLICY "rx_patient" ON prescriptions FOR SELECT USING (patient_id = auth.uid());

-- AI predictions: either party
DROP POLICY IF EXISTS "preds_doctor"  ON ai_predictions;
DROP POLICY IF EXISTS "preds_patient" ON ai_predictions;
CREATE POLICY "preds_doctor"  ON ai_predictions FOR ALL    USING (doctor_id  = auth.uid());
CREATE POLICY "preds_patient" ON ai_predictions FOR SELECT USING (patient_id = auth.uid());

-- Subscriptions: own only
DROP POLICY IF EXISTS "subs_own"      ON subscriptions;
CREATE POLICY "subs_own" ON subscriptions FOR ALL USING (user_id = auth.uid());

-- Notifications: own only
DROP POLICY IF EXISTS "notif_own"     ON notifications;
CREATE POLICY "notif_own" ON notifications FOR ALL USING (user_id = auth.uid());

-- ════════════════════════════════════════════════════════════════════════════
--  updated_at auto-trigger
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated     ON users;
DROP TRIGGER IF EXISTS trg_doctors_updated   ON doctors;
DROP TRIGGER IF EXISTS trg_patients_updated  ON patients;
DROP TRIGGER IF EXISTS trg_apts_updated      ON appointments;

CREATE TRIGGER trg_users_updated    BEFORE UPDATE ON users        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_doctors_updated  BEFORE UPDATE ON doctors      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_patients_updated BEFORE UPDATE ON patients     FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_apts_updated     BEFORE UPDATE ON appointments FOR EACH ROW EXECUTE FUNCTION set_updated_at();
