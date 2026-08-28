-- SMS-MEDCO clinical production baseline
-- Single idempotent backend baseline for clean installs and controlled re-runs.
-- Target: PostgreSQL/Supabase.

BEGIN;

-- ============================================================
-- Extensions
-- ============================================================

-- ============================================================
-- Enumerated domains
-- ============================================================

-- ============================================================
-- Core tables
-- ============================================================
CREATE TABLE IF NOT EXISTS institutions (
  id TEXT PRIMARY KEY DEFAULT gen_random_TEXT(),
  name text NOT NULL,
  cnpj text UNIQUE,
  email text,
  phone text,
  address text,
  city text,
  state text,
  is_active INTEGER NOT NULL DEFAULT true,
  deleted_at DATETIME,
  deleted_by TEXT,
  created_at DATETEXT NOT NULL DEFAULT now(),
  updated_at DATETEXT NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY DEFAULT gen_random_TEXT(),
  auth_user_id TEXT UNIQUE  ON DELETE SET NULL,
  email text NOT NULL UNIQUE,
  full_name text NOT NULL,
  phone text,
  primary_institution_id TEXT REFERENCES institutions(id) ON DELETE SET NULL,
  is_active INTEGER NOT NULL DEFAULT true,
  auth_status text NOT NULL DEFAULT 'pending_auth' CHECK (auth_status IN ('pending_auth', 'active', 'disabled')),
  metadata TEXT NOT NULL DEFAULT '{}'::TEXT,
  deleted_at DATETIME,
  deleted_by TEXT,
  created_by TEXT,
  updated_by TEXT,
  created_at DATETEXT NOT NULL DEFAULT now(),
  updated_at DATETEXT NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY  ON DELETE CASCADE,
  email text NOT NULL,
  first_name text NOT NULL,
  last_name text NOT NULL DEFAULT '',
  full_name text GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED,
  role TEXT NOT NULL DEFAULT 'paciente',
  phone text,
  cpf text UNIQUE,
  avatar_url text,
  institution_id TEXT REFERENCES institutions(id) ON DELETE SET NULL,
  is_active INTEGER NOT NULL DEFAULT true,
  preferences TEXT NOT NULL DEFAULT '{}'::TEXT,
  deleted_at DATETIME,
  deleted_by TEXT,
  created_at DATETEXT NOT NULL DEFAULT now(),
  updated_at DATETEXT NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY DEFAULT gen_random_TEXT(),
  institution_id TEXT REFERENCES institutions(id) ON DELETE CASCADE,
  key text NOT NULL,
  name text NOT NULL,
  description text,
  is_system INTEGER NOT NULL DEFAULT false,
  is_active INTEGER NOT NULL DEFAULT true,
  deleted_at DATETIME,
  deleted_by TEXT,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at DATETEXT NOT NULL DEFAULT now(),
  updated_at DATETEXT NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS permissions (
  id TEXT PRIMARY KEY DEFAULT gen_random_TEXT(),
  institution_id TEXT REFERENCES institutions(id) ON DELETE CASCADE,
  resource text NOT NULL,
  action text NOT NULL CHECK (action IN (
    'create', 'read', 'update', 'delete', 'manage',
    'append', 'execute', 'approve', 'export',
    'cancel', 'reschedule', 'start', 'finalize',
    'send', 'configure'
  )),
  description text,
  is_active INTEGER NOT NULL DEFAULT true,
  deleted_at DATETIME,
  deleted_by TEXT,
  created_at DATETEXT NOT NULL DEFAULT now(),
  updated_at DATETEXT NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS role_permissions (
  id TEXT DEFAULT (lower(hex(randomblob(16)))),
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id TEXT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  institution_id TEXT REFERENCES institutions(id) ON DELETE CASCADE,
  granted_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  granted_at DATETEXT NOT NULL DEFAULT now(),
  revoked_at DATETIME,
  revoked_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS user_permissions (
  id TEXT DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission_id TEXT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  institution_id TEXT REFERENCES institutions(id) ON DELETE CASCADE,
  granted_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  granted_at DATETEXT NOT NULL DEFAULT now(),
  revoked_at DATETIME,
  revoked_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS TEXTs (
  id TEXT PRIMARY KEY DEFAULT gen_random_TEXT(),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id TEXT REFERENCES roles(id) ON DELETE RESTRICT,
  role TEXT,
  institution_id TEXT REFERENCES institutions(id) ON DELETE CASCADE,
  granted_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  granted_at DATETEXT NOT NULL DEFAULT now(),
  revoked_at DATETIME,
  revoked_by TEXT REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS user_institutions (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  created_at DATETEXT NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  revoked_at DATETIME,
  revoked_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (user_id, institution_id)
);

CREATE TABLE IF NOT EXISTS specialties (
  id TEXT PRIMARY KEY DEFAULT gen_random_TEXT(),
  name text NOT NULL UNIQUE,
  description text,
  icon text,
  color text,
  is_active INTEGER NOT NULL DEFAULT true,
  deleted_at DATETIME,
  deleted_by TEXT,
  created_at DATETEXT NOT NULL DEFAULT now(),
  updated_at DATETEXT NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS doctors (
  id TEXT PRIMARY KEY DEFAULT gen_random_TEXT(),
  user_id TEXT NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  professional_council text NOT NULL DEFAULT 'CRM',
  crm text NOT NULL,
  specialty_id TEXT REFERENCES specialties(id) ON DELETE SET NULL,
  is_active INTEGER NOT NULL DEFAULT true,
  deleted_at DATETIME,
  deleted_by TEXT,
  created_at DATETEXT NOT NULL DEFAULT now(),
  updated_at DATETEXT NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS doctor_availability (
  id TEXT PRIMARY KEY DEFAULT gen_random_TEXT(),
  doctor_id TEXT NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  weekday integer NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  slot_minutes integer NOT NULL DEFAULT 5 CHECK (slot_minutes > 0 AND slot_minutes <= 480),
  is_active INTEGER NOT NULL DEFAULT true,
  deleted_at DATETIME,
  deleted_by TEXT,
  created_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  created_at DATETEXT NOT NULL DEFAULT now(),
  updated_at DATETEXT NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

CREATE TABLE IF NOT EXISTS schedule_blocks (
  id TEXT PRIMARY KEY DEFAULT gen_random_TEXT(),
  doctor_id TEXT REFERENCES doctors(id) ON DELETE CASCADE,
  block_range tstzrange NOT NULL,
  reason text NOT NULL,
  deleted_at DATETIME,
  deleted_by TEXT,
  created_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  created_at DATETEXT NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS patients (
  id TEXT PRIMARY KEY DEFAULT gen_random_TEXT(),
  patient_code text UNIQUE,
  user_id TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  institution_id TEXT REFERENCES institutions(id) ON DELETE RESTRICT,
  full_name text NOT NULL,
  email text,
  phone text,
  cpf text NOT NULL,
  birth_date date NOT NULL,
  gender TEXT,
  address text,
  city text,
  state text,
  zip_code text,
  emergency_contact text,
  emergency_phone text,
  blood_type text,
  allergies text,
  chronic_diseases text,
  observations text,
  is_active INTEGER NOT NULL DEFAULT true,
  deleted_at DATETIME,
  deleted_by TEXT,
  created_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  created_at DATETEXT NOT NULL DEFAULT now(),
  updated_at DATETEXT NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY DEFAULT gen_random_TEXT(),
  appointment_code text UNIQUE,
  institution_id TEXT REFERENCES institutions(id) ON DELETE RESTRICT,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  doctor_id TEXT NOT NULL REFERENCES doctors(id) ON DELETE RESTRICT,
  scheduled_doctor_id TEXT REFERENCES doctors(id) ON DELETE RESTRICT,
  specialty_id TEXT REFERENCES specialties(id) ON DELETE RESTRICT,
  appointment_date DATETEXT NOT NULL,
  end_date DATETEXT NOT NULL,
  actual_start_at DATETIME,
  actual_end_at DATETIME,
  type TEXT NOT NULL DEFAULT 'consulta',
  status TEXT NOT NULL DEFAULT 'agendado',
  reason text NOT NULL,
  cancel_reason text,
  no_show_reason text,
  ticket_number text,
  idempotency_key text,
  diagnosis text,
  symptoms text,
  prescription text,
  notes text,
  blood_pressure text,
  weight REAL,
  height REAL,
  temperature REAL,
  deleted_at DATETIME,
  deleted_by TEXT,
  created_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  created_at DATETEXT NOT NULL DEFAULT now(),
  updated_at DATETEXT NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS encounters (
  id TEXT PRIMARY KEY DEFAULT gen_random_TEXT(),
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  appointment_id TEXT NOT NULL UNIQUE REFERENCES appointments(id) ON DELETE RESTRICT,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  doctor_id TEXT NOT NULL REFERENCES doctors(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'em_atendimento',
  started_at DATETEXT NOT NULL DEFAULT now(),
  finalized_at DATETIME,
  canceled_at DATETIME,
  started_by TEXT NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  finalized_by TEXT REFERENCES profiles(id) ON DELETE RESTRICT,
  canceled_by TEXT REFERENCES profiles(id) ON DELETE RESTRICT,
  idempotency_key text,
  deleted_at DATETIME,
  deleted_by TEXT,
  created_at DATETEXT NOT NULL DEFAULT now(),
  updated_at DATETEXT NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS medical_record_entries (
  id TEXT PRIMARY KEY DEFAULT gen_random_TEXT(),
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  encounter_id TEXT NOT NULL REFERENCES encounters(id) ON DELETE RESTRICT,
  version integer NOT NULL,
  entry_type TEXT NOT NULL,
  clinical_data TEXT NOT NULL DEFAULT '{}'::TEXT,
  content_hash text NOT NULL,
  idempotency_key text,
  created_by TEXT NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  created_at DATETEXT NOT NULL DEFAULT now(),
  UNIQUE (encounter_id, version),
  UNIQUE (encounter_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS clinical_events (
  id TEXT PRIMARY KEY DEFAULT gen_random_TEXT(),
  institution_id TEXT REFERENCES institutions(id) ON DELETE CASCADE,
  aggregate_table text NOT NULL,
  aggregate_id TEXT NOT NULL,
  event_type text NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}'::TEXT,
  idempotency_key text,
  created_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  created_at DATETEXT NOT NULL DEFAULT now(),
  UNIQUE (institution_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY DEFAULT gen_random_TEXT(),
  institution_id TEXT,
  user_id TEXT REFERENCES profiles(id),
  user_name text,
  action text NOT NULL,
  table_name text NOT NULL,
  record_id TEXT,
  old_data TEXT,
  new_data TEXT,
  ip_address text,
  user_agent text,
  txid INTEGER NOT NULL DEFAULT txid_current(),
  request_id text DEFAULT current_setting('request.headers', true),
  created_at DATETEXT NOT NULL DEFAULT now()
);

-- ============================================================
-- Compatibility hardening for databases upgraded from legacy migrations
-- ============================================================
ALTER TABLE institutions ADD COLUMN IF NOT EXISTS deleted_at DATETIME;
ALTER TABLE institutions ADD COLUMN IF NOT EXISTS deleted_by TEXT;

ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_user_id TEXT UNIQUE  ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS primary_institution_id TEXT REFERENCES institutions(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_status text NOT NULL DEFAULT 'pending_auth';
ALTER TABLE users ADD COLUMN IF NOT EXISTS metadata TEXT NOT NULL DEFAULT '{}'::TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at DATETIME;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_by TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_by TEXT;

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS institution_id TEXT REFERENCES institutions(id) ON DELETE SET NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS deleted_at DATETIME;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS deleted_by TEXT;

ALTER TABLE roles ADD COLUMN IF NOT EXISTS institution_id TEXT REFERENCES institutions(id) ON DELETE CASCADE;
ALTER TABLE roles ADD COLUMN IF NOT EXISTS is_system INTEGER NOT NULL DEFAULT false;
ALTER TABLE roles ADD COLUMN IF NOT EXISTS is_active INTEGER NOT NULL DEFAULT true;
ALTER TABLE roles ADD COLUMN IF NOT EXISTS deleted_at DATETIME;
ALTER TABLE roles ADD COLUMN IF NOT EXISTS deleted_by TEXT;

ALTER TABLE permissions ADD COLUMN IF NOT EXISTS institution_id TEXT REFERENCES institutions(id) ON DELETE CASCADE;
ALTER TABLE permissions ADD COLUMN IF NOT EXISTS is_active INTEGER NOT NULL DEFAULT true;
ALTER TABLE permissions ADD COLUMN IF NOT EXISTS deleted_at DATETIME;
ALTER TABLE permissions ADD COLUMN IF NOT EXISTS deleted_by TEXT;

ALTER TABLE role_permissions ADD COLUMN IF NOT EXISTS id TEXT DEFAULT (lower(hex(randomblob(16))));
ALTER TABLE role_permissions ADD COLUMN IF NOT EXISTS institution_id TEXT REFERENCES institutions(id) ON DELETE CASCADE;
ALTER TABLE role_permissions ADD COLUMN IF NOT EXISTS 
ALTER TABLE role_permissions ADD COLUMN IF NOT EXISTS 
UPDATE role_permissions SET id = gen_random_TEXT() WHERE id IS NULL;
ALTER TABLE role_permissions ALTER COLUMN id SET DEFAULT gen_random_TEXT();
ALTER TABLE role_permissions ALTER COLUMN id SET NOT NULL;

ALTER TABLE user_permissions ADD COLUMN IF NOT EXISTS id TEXT DEFAULT (lower(hex(randomblob(16))));
ALTER TABLE user_permissions ADD COLUMN IF NOT EXISTS institution_id TEXT REFERENCES institutions(id) ON DELETE CASCADE;
ALTER TABLE user_permissions ADD COLUMN IF NOT EXISTS 
ALTER TABLE user_permissions ADD COLUMN IF NOT EXISTS 
ALTER TABLE user_permissions ADD COLUMN IF NOT EXISTS 
ALTER TABLE user_permissions ADD COLUMN IF NOT EXISTS 
UPDATE user_permissions SET id = gen_random_TEXT() WHERE id IS NULL;
ALTER TABLE user_permissions ALTER COLUMN id SET DEFAULT gen_random_TEXT();
ALTER TABLE user_permissions ALTER COLUMN id SET NOT NULL;

ALTER TABLE TEXTs ADD COLUMN IF NOT EXISTS role_id TEXT REFERENCES roles(id) ON DELETE RESTRICT;
ALTER TABLE TEXTs ADD COLUMN IF NOT EXISTS 
ALTER TABLE TEXTs ALTER COLUMN role DROP NOT NULL;

ALTER TABLE user_institutions ADD COLUMN IF NOT EXISTS 
ALTER TABLE user_institutions ADD COLUMN IF NOT EXISTS 

ALTER TABLE specialties ADD COLUMN IF NOT EXISTS deleted_at DATETIME;
ALTER TABLE specialties ADD COLUMN IF NOT EXISTS deleted_by TEXT;

ALTER TABLE doctors ADD COLUMN IF NOT EXISTS is_active INTEGER DEFAULT true;
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS professional_council text NOT NULL DEFAULT 'CRM';
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS deleted_at DATETIME;
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS deleted_by TEXT;

UPDATE doctors
SET professional_council = 'CRM'
WHERE professional_council IS NULL OR btrim(professional_council) = '';

ALTER TABLE doctors DROP CONSTRAINT IF EXISTS doctors_crm_key;

ALTER TABLE doctor_availability ADD COLUMN IF NOT EXISTS deleted_at DATETIME;
ALTER TABLE doctor_availability ADD COLUMN IF NOT EXISTS deleted_by TEXT;
ALTER TABLE doctor_availability ADD COLUMN IF NOT EXISTS created_by TEXT REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE schedule_blocks ADD COLUMN IF NOT EXISTS deleted_at DATETIME;
ALTER TABLE schedule_blocks ADD COLUMN IF NOT EXISTS deleted_by TEXT;
ALTER TABLE schedule_blocks ADD COLUMN IF NOT EXISTS created_by TEXT REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE patients ADD COLUMN IF NOT EXISTS patient_code text;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS institution_id TEXT REFERENCES institutions(id) ON DELETE RESTRICT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS full_name text;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS deleted_at DATETIME;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS deleted_by TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS created_by TEXT REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS updated_by TEXT REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE patients DROP CONSTRAINT IF EXISTS patients_cpf_key;
DROP INDEX IF EXISTS idx_patients_cpf_unique;
DROP INDEX IF EXISTS idx_patients_cpf_normalized_unique;

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS appointment_code text;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS institution_id TEXT REFERENCES institutions(id) ON DELETE RESTRICT;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS scheduled_doctor_id TEXT REFERENCES doctors(id) ON DELETE RESTRICT;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS actual_start_at DATETIME;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS actual_end_at DATETIME;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS ticket_number text;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS cancel_reason text;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS no_show_reason text;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS deleted_at DATETIME;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS deleted_by TEXT;

ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS institution_id TEXT;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS txid INTEGER NOT NULL DEFAULT txid_current();
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS request_id text DEFAULT current_setting('request.headers', true);

-- Legacy backfill safety. These statements are safe no-ops on clean installs.
UPDATE patients
SET full_name = COALESCE(NULLIF(full_name, ''), 'Paciente sem nome')
WHERE full_name IS NULL;

UPDATE patients p
SET institution_id = COALESCE(
  p.institution_id,
  (SELECT pr.institution_id FROM profiles pr WHERE pr.id = p.created_by),
  (SELECT pr.institution_id FROM profiles pr WHERE pr.id = p.user_id)
)
WHERE p.institution_id IS NULL;

-- ============================================================
-- Sequences and indexes
-- ============================================================
CREATE SEQUENCE IF NOT EXISTS patient_code_seq START 1;
CREATE SEQUENCE IF NOT EXISTS appointment_code_seq START 1;
CREATE SEQUENCE IF NOT EXISTS ticket_seq START 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_patients_patient_code_unique ON patients(patient_code) WHERE patient_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_code_unique ON appointments(appointment_code) WHERE appointment_code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_idempotency_unique
  ON appointments(created_by, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users(lower(email)) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_primary_institution_active ON users(primary_institution_id, is_active) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_roles_key_institution_unique
  ON roles(key, institution_id) 
  WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_permissions_resource_action_institution_unique
  ON permissions(resource, action, institution_id) 
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission ON role_permissions(permission_id) WHERE 
CREATE UNIQUE INDEX IF NOT EXISTS idx_role_permissions_role_permission_institution_unique
  ON role_permissions(role_id, permission_id, institution_id) ;
CREATE INDEX IF NOT EXISTS idx_user_permissions_user ON user_permissions(user_id) WHERE 
CREATE INDEX IF NOT EXISTS idx_user_permissions_permission ON user_permissions(permission_id) WHERE 
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_permissions_user_permission_institution_unique
  ON user_permissions(user_id, permission_id, institution_id) ;
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_roles_unique_assignment
  ON TEXTs(user_id, role, institution_id) ;
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_roles_role_id_unique_assignment
  ON TEXTs(user_id, role_id, institution_id) 
  WHERE role_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_institution_role_active ON profiles(institution_id, role, is_active);
CREATE INDEX IF NOT EXISTS idx_user_roles_role_institution ON TEXTs(role, institution_id) WHERE 
CREATE INDEX IF NOT EXISTS idx_user_institutions_institution ON user_institutions(institution_id);
CREATE INDEX IF NOT EXISTS idx_patients_institution_active_name ON patients(institution_id, is_active, full_name) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_patients_cpf ON patients(cpf);
CREATE INDEX IF NOT EXISTS idx_doctors_user_id ON doctors(user_id);
CREATE INDEX IF NOT EXISTS idx_doctors_specialty_active ON doctors(specialty_id, is_active) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_doctors_council_registration_unique
  ON doctors(upper(professional_council), upper(crm))
  WHERE deleted_at IS NULL AND upper(professional_council) <> 'NAO_INFORMADO';
CREATE UNIQUE INDEX IF NOT EXISTS idx_doctor_availability_unique
  ON doctor_availability(doctor_id, weekday, starts_at, ends_at)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_schedule_blocks_range
  ON schedule_blocks 
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_schedule_blocks_doctor_range
  ON schedule_blocks 
  WHERE deleted_at IS NULL AND doctor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_appointments_inst_status_date ON appointments(institution_id, status, appointment_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_appointments_doctor_date ON appointments(doctor_id, appointment_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_appointments_scheduled_doctor_date ON appointments(scheduled_doctor_id, appointment_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_appointments_patient_date ON appointments(patient_id, appointment_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_encounters_appointment ON encounters(appointment_id);
CREATE INDEX IF NOT EXISTS idx_encounters_doctor_status ON encounters(doctor_id, status, started_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_medical_record_entries_encounter_version ON medical_record_entries(encounter_id, version DESC);

CREATE INDEX IF NOT EXISTS idx_clinical_events_aggregate ON clinical_events(aggregate_table, aggregate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_table_record ON audit_log(table_name, record_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_institution_created ON audit_log(institution_id, created_at DESC);

-- Functional CPF uniqueness for new and corrected data.
CREATE OR REPLACE FUNCTION normalize_cpf(value text)
RETURNS text
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT regexp_replace(COALESCE(value, ''), '\D', '', 'g');
$$;

DROP INDEX IF EXISTS idx_patients_cpf_normalized_active_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_patients_institution_cpf_normalized_active_unique
  ON patients(institution_id, normalize_cpf(cpf))
  WHERE deleted_at IS NULL;

-- Backend-owned RBAC catalog. Frontend reads effective permissions; it does not define them.
INSERT INTO roles (key, name, description, is_system)
VALUES
  ('superadmin', 'Superadmin', 'Acesso estrutural/desenvolvedor e controle de seguranca do sistema', true),
  ('admin', 'Administrador', 'Gestao operacional global sem alteracao estrutural do sistema', true),
  ('medico', 'Profissional de saude', 'Atendimento clinico', true),
  ('recepcao', 'Recepcao', 'Agenda e cadastro administrativo', true),
  ('auditor', 'Auditor', 'Leitura de auditoria e conformidade', true),
  ('paciente', 'Paciente', 'Acesso restrito do paciente', true)
ON CONFLICT DO NOTHING;

UPDATE roles
SET description = CASE key
  WHEN 'superadmin' THEN 'Acesso estrutural/desenvolvedor e controle de seguranca do sistema'
  WHEN 'admin' THEN 'Gestao operacional global sem alteracao estrutural do sistema'
  WHEN 'auditor' THEN 'Leitura global estritamente sem escrita'
  ELSE description
END
WHERE key IN ('superadmin', 'admin', 'auditor')
  AND institution_id IS NULL;

INSERT INTO permissions (resource, action, description)
SELECT resource, action, initcap(resource) || ' / ' || action
FROM (
  VALUES
    ('users'),
    ('profiles'),
    ('institutions'),
    ('specialties'),
    ('roles'),
    ('permissions'),
    ('user_roles'),
    ('user_institutions'),
    ('appointments'),
    ('patients'),
    ('doctors'),
    ('doctor_availability'),
    ('schedules'),
    ('schedule_blocks'),
    ('encounters'),
    ('medical_records'),
    ('clinical_corrections'),
    ('reports'),
    ('notifications'),
    ('notification_templates'),
    ('notification_outbox'),
    ('audit'),
    ('audit_exports'),
    ('data_exports'),
    ('settings'),
    ('system'),
    ('security')
) AS resources(resource)
CROSS JOIN (
  VALUES
    ('create'),
    ('read'),
    ('update'),
    ('delete'),
    ('manage'),
    ('append'),
    ('execute'),
    ('approve'),
    ('export'),
    ('cancel'),
    ('reschedule'),
    ('start'),
    ('finalize'),
    ('send'),
    ('configure')
) AS actions(action)
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON true
WHERE r.key = 'superadmin'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON (
  (
    p.resource IN ('users', 'profiles', 'institutions', 'user_roles', 'user_institutions', 'specialties', 'doctors')
    AND p.action IN ('create', 'read', 'update', 'delete')
  )
  OR (
    p.resource IN ('doctor_availability', 'schedule_blocks')
    AND p.action IN ('create', 'read', 'update', 'delete')
  )
  OR (
    p.resource = 'schedules'
    AND p.action = 'read'
  )
  OR (
    p.resource = 'patients'
    AND p.action IN ('create', 'read', 'update')
  )
  OR (
    p.resource = 'appointments'
    AND p.action IN ('create', 'read', 'update', 'cancel', 'reschedule')
  )
  OR (
    p.resource IN ('reports', 'audit', 'data_exports')
    AND p.action IN ('read', 'export')
  )
  OR (
    p.resource = 'notifications'
    AND p.action = 'send'
  )
  OR (
    p.resource = '___deleted___' AND p.action = 'read'
  )
  OR (
    false
    AND p.action = 'read'
  )
)
WHERE r.key = 'admin'
ON CONFLICT DO NOTHING;

DELETE FROM role_permissions rp
USING roles r, permissions p
WHERE rp.role_id = r.id
  AND rp.permission_id = p.id
  AND r.key = 'admin'
  AND p.resource = '___deleted___' AND p.action IN ('send', 'update');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON (
  (p.resource = 'appointments' AND p.action IN ('read', 'start', 'finalize'))
  OR (p.resource = 'encounters' AND p.action IN ('create', 'read', 'update', 'start', 'finalize'))
  OR (p.resource = 'medical_records' AND p.action IN ('create', 'read', 'append'))
 
  OR (p.resource = 'patients' AND p.action = 'read')
  OR (p.resource IN ('doctors', 'institutions', 'schedules', 'doctor_availability', 'schedule_blocks', 'specialties') AND p.action = 'read')
  OR (p.resource = 'reports' AND p.action IN ('read', 'export'))
)
WHERE r.key = 'medico'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON (
  (p.resource = 'patients' AND p.action IN ('create', 'read', 'update'))
  OR (p.resource = 'appointments' AND p.action IN ('create', 'read', 'update', 'cancel', 'reschedule'))
  OR (p.resource IN ('schedules', 'doctor_availability', 'schedule_blocks') AND p.action = 'read')
  OR (p.resource IN ('doctors', 'institutions', 'specialties') AND p.action = 'read')
 
)
WHERE r.key = 'recepcao'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON (
  (
    p.resource IN ('reports', 'audit')
    AND p.action IN ('read', 'export')
  )
  OR (
    p.resource = 'institutions'
    AND p.action = 'read'
  )
  OR (
    false
    AND p.action = 'read'
  )
)
WHERE r.key = 'auditor'
ON CONFLICT DO NOTHING;

UPDATE role_permissions rp
SET revoked_at = COALESCE(rp.revoked_at, now())
FROM roles r, permissions p
WHERE rp.role_id = r.id
  AND rp.permission_id = p.id
  AND r.key = 'admin'
  AND NOT (
    (
      p.resource IN ('users', 'profiles', 'institutions', 'user_roles', 'user_institutions', 'specialties', 'doctors')
      AND p.action IN ('create', 'read', 'update', 'delete')
    )
    OR (
      p.resource IN ('doctor_availability', 'schedule_blocks')
      AND p.action IN ('create', 'read', 'update', 'delete')
    )
    OR (
    p.resource = 'schedules'
    AND p.action = 'read'
  )
  OR (
    p.resource = 'patients'
    AND p.action IN ('create', 'read', 'update')
  )
  OR (
    p.resource = 'appointments'
      AND p.action IN ('create', 'read', 'update', 'cancel', 'reschedule')
    )
    OR (
      p.resource IN ('reports', 'audit', 'data_exports')
      AND p.action IN ('read', 'export')
    )
    OR (
      p.resource = 'notifications'
      AND p.action = 'send'
    )
    OR (
      p.resource = '___deleted___' AND p.action = 'read'
    )
    OR (
      false
      AND p.action = 'read'
    )
  );

UPDATE role_permissions rp
SET revoked_at = COALESCE(rp.revoked_at, now())
FROM roles r, permissions p
WHERE rp.role_id = r.id
  AND rp.permission_id = p.id
  AND (
    (r.key = 'medico' AND (
      (p.resource = 'patients' AND p.action <> 'read')
      OR (p.resource = 'appointments' AND p.action IN ('create', 'update'))
      OR (p.resource IN ('medical_records') AND p.action IN ('update', 'delete', 'manage'))
    ))
    OR (r.key = 'recepcao' AND (
      p.resource IN ('medical_records', 'encounters')
     
      OR (p.resource IN ('schedules', 'doctor_availability', 'schedule_blocks') AND p.action <> 'read')
      OR (p.resource IN ('users', 'roles', 'permissions', 'user_roles', 'user_institutions', 'settings', 'system', 'security'))
    ))
    OR (r.key = 'auditor' AND NOT (
      (p.resource IN ('reports', 'audit') AND p.action IN ('read', 'export'))
      OR (p.resource = 'institutions' AND p.action = 'read')
     
    ))
  );

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
  ON false
 AND p.action = 'read'
WHERE r.key IN ('admin', 'recepcao', 'auditor', 'medico', 'paciente')
ON CONFLICT DO NOTHING;

-- ============================================================
-- Security helper functions
-- ============================================================
CREATE OR REPLACE FUNCTION current_user_role()
RETURNS text
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT COALESCE(r.key, ur.role::text)
      FROM TEXTs ur
      LEFT JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid()
        AND ur.revoked_at IS NULL
        AND COALESCE(r.is_active, true) = true
        AND COALESCE(r.deleted_at, NULL) IS NULL
      ORDER BY
        CASE COALESCE(r.key, ur.role::text)
          WHEN 'superadmin' THEN 1
          WHEN 'admin' THEN 2
          WHEN 'auditor' THEN 3
          WHEN 'medico' THEN 4
          WHEN 'recepcao' THEN 5
          ELSE 6
        END
      LIMIT 1
    ),
    (
      SELECT p.role::text
      FROM profiles p
      WHERE p.id = auth.uid()
        AND p.is_active = true
        AND p.deleted_at IS NULL
      LIMIT 1
    )
  );
$$;

CREATE OR REPLACE FUNCTION current_user_is_active()
RETURNS INTEGER
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT u.is_active = true AND u.deleted_at IS NULL
      FROM users u
      WHERE u.id = auth.uid()
      LIMIT 1
    ),
    (
      SELECT p.is_active = true AND p.deleted_at IS NULL
      FROM profiles p
      WHERE p.id = auth.uid()
      LIMIT 1
    ),
    false
  );
$$;

CREATE OR REPLACE FUNCTION current_user_primary_institution()
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT u.primary_institution_id FROM users u WHERE u.id = auth.uid()),
    (SELECT p.institution_id FROM profiles p WHERE p.id = auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION current_user_institution_ids()
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    ARRAY(
      SELECT DISTINCT x.institution_id
      FROM (
        SELECT p.institution_id
        FROM profiles p
        WHERE p.id = auth.uid()
          AND p.institution_id IS NOT NULL
        UNION
        SELECT u.primary_institution_id
        FROM users u
        WHERE u.id = auth.uid()
          AND u.primary_institution_id IS NOT NULL
        UNION
        SELECT ui.institution_id
        FROM user_institutions ui
        WHERE ui.user_id = auth.uid()
          AND ui.revoked_at IS NULL
        UNION
        SELECT ur.institution_id
        FROM TEXTs ur
        WHERE ur.user_id = auth.uid()
          AND ur.revoked_at IS NULL
          AND ur.institution_id IS NOT NULL
      ) x
    ),
    ARRAY[]::TEXT
  );
$$;

CREATE OR REPLACE FUNCTION user_has_institution_access(target_institution TEXT)
RETURNS INTEGER
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN target_institution IS NULL THEN false
    WHEN current_user_is_active() IS NOT TRUE THEN false
    WHEN current_user_role() IN ('superadmin', 'admin', 'auditor') THEN true
    ELSE target_institution = ANY(current_user_institution_ids())
  END;
$$;

CREATE OR REPLACE FUNCTION user_has_role(required_roles TEXT)
RETURNS INTEGER
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT current_user_is_active()
    AND current_user_role() = ANY(required_roles);
$$;

CREATE OR REPLACE FUNCTION permission_resource_label(
  p_resource text
)
RETURNS text
LANGUAGE SQL
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE lower(COALESCE(p_resource, ''))
    WHEN 'users' THEN 'Usuarios'
    WHEN 'profiles' THEN 'Perfis de usuario'
    WHEN 'institutions' THEN 'Instituicoes e unidades'
    WHEN 'specialties' THEN 'Especialidades'
    WHEN 'roles' THEN 'Perfis'
    WHEN 'permissions' THEN 'Permissoes'
    WHEN 'user_roles' THEN 'Perfis por usuario'
    WHEN 'user_institutions' THEN 'Vinculos institucionais'
    WHEN 'appointments' THEN 'Consultas'
    WHEN 'patients' THEN 'Pacientes'
    WHEN 'doctors' THEN 'Profissionais'
    WHEN 'doctor_availability' THEN 'Disponibilidade profissional'
    WHEN 'schedules' THEN 'Agendas'
    WHEN 'schedule_blocks' THEN 'Bloqueios de agenda'
    WHEN 'encounters' THEN 'Atendimentos'
    WHEN 'medical_records' THEN 'Prontuario'
    WHEN 'clinical_corrections' THEN 'Correcoes clinicas'
    WHEN 'reports' THEN 'Relatorios'
    WHEN 'report_email_deliveries' THEN 'Envios oficiais'
    WHEN 'notifications' THEN 'Notificacoes'
    WHEN 'notification_templates' THEN 'Modelos de notificacao'
    WHEN 'notification_outbox' THEN 'Fila de notificacoes'
    WHEN 'audit' THEN 'Auditoria'
    WHEN 'audit_exports' THEN 'Exportacoes de auditoria'
    WHEN 'data_exports' THEN 'Exportacoes de dados'
    WHEN 'settings' THEN 'Configuracoes'
    WHEN 'system' THEN 'Sistema'
    WHEN 'security' THEN 'Seguranca'
    ELSE initcap(replace(COALESCE(p_resource, ''), '_', ' '))
  END;
$$;

CREATE OR REPLACE FUNCTION permission_action_label(
  p_action text
)
RETURNS text
LANGUAGE SQL
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE lower(COALESCE(p_action, ''))
    WHEN 'create' THEN 'Criar'
    WHEN 'read' THEN 'Visualizar'
    WHEN 'update' THEN 'Editar'
    WHEN 'delete' THEN 'Excluir'
    WHEN 'manage' THEN 'Gerenciar'
    WHEN 'append' THEN 'Registrar'
    WHEN 'execute' THEN 'Executar'
    WHEN 'approve' THEN 'Aprovar'
    WHEN 'export' THEN 'Exportar'
    WHEN 'cancel' THEN 'Cancelar'
    WHEN 'reschedule' THEN 'Reagendar'
    WHEN 'start' THEN 'Iniciar'
    WHEN 'finalize' THEN 'Finalizar'
    WHEN 'send' THEN 'Enviar'
    WHEN 'configure' THEN 'Configurar'
    ELSE initcap(replace(COALESCE(p_action, ''), '_', ' '))
  END;
$$;

CREATE OR REPLACE FUNCTION permission_scope_label(
  p_scope text
)
RETURNS text
LANGUAGE SQL
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE lower(COALESCE(p_scope, ''))
    WHEN 'global' THEN 'Global'
    WHEN 'institution' THEN 'Por instituicao'
    WHEN 'owner' THEN 'Responsavel direto'
    WHEN 'own' THEN 'Proprio usuario'
    ELSE initcap(replace(COALESCE(p_scope, ''), '_', ' '))
  END;
$$;

CREATE OR REPLACE FUNCTION role_operational_summary(
  p_role_key text
)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE lower(COALESCE(p_role_key, ''))
    WHEN 'superadmin' THEN TEXT_build_object(
      'purpose', 'Controle tecnico e estrutural do sistema',
      'scope', 'Global irrestrito, controlado por baseline e auditoria',
      'risk_level', 'Critico',
      'allowed_summary', TEXT_build_array('Governanca completa', 'Permissoes granulares', 'Configuracoes estruturais', 'Auditoria completa'),
      'blocked_summary', TEXT_build_array('Nao editavel pela tela operacional', 'Uso restrito ao usuario estrutural autorizado')
    )
    WHEN 'admin' THEN TEXT_build_object(
      'purpose', 'Administracao operacional sem acesso clinico',
      'scope', 'Global administrativo, sem prontuario e sem acoes medicas',
      'risk_level', 'Alto',
      'allowed_summary', TEXT_build_array('Usuarios', 'Instituicoes', 'Profissionais', 'Bloqueios de agenda', 'Relatorios e auditoria autorizados'),
      'blocked_summary', TEXT_build_array('Prontuario', 'Atendimento clinico', 'Seguranca estrutural')
    )
    WHEN 'recepcao' THEN TEXT_build_object(
      'purpose', 'Operacao de agenda e cadastro administrativo',
      'scope', 'Somente instituicao vinculada',
      'risk_level', 'Medio',
      'allowed_summary', TEXT_build_array('Pacientes administrativos', 'Consultas', 'Agenda da unidade', 'Cancelamento e reagendamento'),
      'blocked_summary', TEXT_build_array('Prontuario completo', 'Permissoes', 'Configuracoes')
    )
    WHEN 'medico' THEN TEXT_build_object(
      'purpose', 'Atendimento clinico controlado',
      'scope', 'Instituicoes vinculadas e agenda/atendimento atribuido',
      'risk_level', 'Alto',
      'allowed_summary', TEXT_build_array('Agenda propria', 'Iniciar atendimento', 'Registrar prontuario append-only', 'Finalizar atendimento'),
      'blocked_summary', TEXT_build_array('Criar agenda administrativa', 'Editar cadastro sensivel', 'Alterar permissoes', 'Apagar prontuario')
    )
    WHEN 'auditor' THEN TEXT_build_object(
      'purpose', 'Governanca e conformidade somente leitura',
      'scope', 'Global sanitizado para metricas, auditoria e instituicoes',
      'risk_level', 'Alto',
      'allowed_summary', TEXT_build_array('Relatorios agregados', 'Auditoria sanitizada', 'Instituicoes'),
      'blocked_summary', TEXT_build_array('Qualquer escrita', 'Dados clinicos identificaveis', 'Prontuario', 'Usuarios operacionais')
    )
    WHEN 'paciente' THEN TEXT_build_object(
      'purpose', 'Acesso restrito do paciente',
      'scope', 'Proprio cadastro explicitamente liberado',
      'risk_level', 'Baixo',
      'allowed_summary', TEXT_build_array('Dados proprios quando liberados'),
      'blocked_summary', TEXT_build_array('Dados de terceiros', 'Operacao interna', 'Prontuario de outros pacientes')
    )
    ELSE TEXT_build_object(
      'purpose', 'Perfil customizado',
      'scope', 'Definido por vinculo e permissoes granulares',
      'risk_level', 'Indefinido',
      'allowed_summary', TEXT_build_array(),
      'blocked_summary', TEXT_build_array('Sem regra operacional documentada')
    )
  END;
$$;

CREATE OR REPLACE FUNCTION permission_semantic_state(
  p_resource text,
  p_action text
)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN lower(COALESCE(p_resource, '')) IN ('users', 'profiles', 'institutions', 'user_roles', 'user_institutions', 'specialties', 'doctors')
      AND lower(COALESCE(p_action, '')) IN ('create', 'read', 'update', 'delete') THEN
      TEXT_build_object('applicable', true, 'reason', NULL)
    WHEN lower(COALESCE(p_resource, '')) = 'patients'
      AND lower(COALESCE(p_action, '')) IN ('create', 'read', 'update', 'export') THEN
      TEXT_build_object('applicable', true, 'reason', NULL)
    WHEN lower(COALESCE(p_resource, '')) = 'appointments'
      AND lower(COALESCE(p_action, '')) IN ('create', 'read', 'update', 'cancel', 'reschedule', 'start', 'finalize', 'export') THEN
      TEXT_build_object('applicable', true, 'reason', NULL)
    WHEN lower(COALESCE(p_resource, '')) = 'encounters'
      AND lower(COALESCE(p_action, '')) IN ('create', 'read', 'update', 'start', 'finalize') THEN
      TEXT_build_object('applicable', true, 'reason', NULL)
    WHEN lower(COALESCE(p_resource, '')) = 'medical_records'
      AND lower(COALESCE(p_action, '')) IN ('create', 'read', 'append') THEN
      TEXT_build_object('applicable', true, 'reason', NULL)
    WHEN lower(COALESCE(p_resource, '')) = 'clinical_corrections'
      AND lower(COALESCE(p_action, '')) IN ('create', 'read', 'approve') THEN
      TEXT_build_object('applicable', true, 'reason', NULL)
    WHEN false
      AND lower(COALESCE(p_action, '')) IN ('create', 'read', 'export', 'send') THEN
      TEXT_build_object('applicable', true, 'reason', NULL)
    WHEN lower(COALESCE(p_resource, '')) IN ('reports', 'audit', 'data_exports')
      AND lower(COALESCE(p_action, '')) IN ('read', 'export') THEN
      TEXT_build_object('applicable', true, 'reason', NULL)
    WHEN lower(COALESCE(p_resource, '')) = '___deleted___' AND lower(COALESCE(p_action, '')) IN ('read', 'send', 'update') THEN
      TEXT_build_object('applicable', true, 'reason', NULL)
    WHEN lower(COALESCE(p_resource, '')) = 'notifications'
      AND lower(COALESCE(p_action, '')) IN ('read', 'send') THEN
      TEXT_build_object('applicable', true, 'reason', NULL)
    WHEN lower(COALESCE(p_resource, '')) = 'notification_templates'
      AND lower(COALESCE(p_action, '')) IN ('create', 'read', 'update', 'delete') THEN
      TEXT_build_object('applicable', true, 'reason', NULL)
    WHEN lower(COALESCE(p_resource, '')) = 'notification_outbox'
      AND lower(COALESCE(p_action, '')) IN ('read', 'update', 'send') THEN
      TEXT_build_object('applicable', true, 'reason', NULL)
    WHEN lower(COALESCE(p_resource, '')) = 'doctor_availability'
      AND lower(COALESCE(p_action, '')) IN ('create', 'read', 'update', 'delete') THEN
      TEXT_build_object('applicable', true, 'reason', NULL)
    WHEN lower(COALESCE(p_resource, '')) = 'schedules'
      AND lower(COALESCE(p_action, '')) = 'read' THEN
      TEXT_build_object('applicable', true, 'reason', NULL)
    WHEN lower(COALESCE(p_resource, '')) = 'schedule_blocks'
      AND lower(COALESCE(p_action, '')) IN ('create', 'read', 'update', 'delete') THEN
      TEXT_build_object('applicable', true, 'reason', NULL)
    WHEN lower(COALESCE(p_resource, '')) IN ('roles', 'permissions')
      AND lower(COALESCE(p_action, '')) IN ('read', 'manage') THEN
      TEXT_build_object('applicable', true, 'reason', NULL)
    WHEN lower(COALESCE(p_resource, '')) IN ('settings', 'system', 'security')
      AND lower(COALESCE(p_action, '')) IN ('read', 'update', 'manage', 'configure') THEN
      TEXT_build_object('applicable', true, 'reason', NULL)
    ELSE
      TEXT_build_object(
        'applicable', false,
        'reason', 'Combinacao sem uso operacional definido para este recurso'
      )
  END;
$$;

CREATE OR REPLACE FUNCTION permission_guardrail_state(
  p_role_key text,
  p_resource text,
  p_action text
)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN lower(COALESCE(p_role_key, '')) = 'superadmin' THEN
      TEXT_build_object(
        'denied', false,
        'locked', true,
        'editable', false,
        'reason', 'Perfil estrutural: permissoes efetivas sao controladas pela baseline'
      )
    WHEN lower(COALESCE(p_role_key, '')) = 'auditor'
      AND lower(COALESCE(p_action, '')) NOT IN ('read', 'export') THEN
      TEXT_build_object(
        'denied', true,
        'locked', true,
        'editable', false,
        'reason', 'Auditor e leitura/exportacao apenas'
      )
    WHEN lower(COALESCE(p_role_key, '')) = 'auditor'
      AND NOT (
        (
          lower(COALESCE(p_resource, '')) IN ('reports', 'audit')
          AND lower(COALESCE(p_action, '')) IN ('read', 'export')
        )
        OR (
          lower(COALESCE(p_resource, '')) = 'institutions'
          AND lower(COALESCE(p_action, '')) = 'read'
        )
      ) THEN
      TEXT_build_object(
        'denied', true,
        'locked', true,
        'editable', false,
        'reason', 'Auditor acessa somente metricas, auditoria sanitizada e instituicoes'
      )
    WHEN lower(COALESCE(p_role_key, '')) = 'auditor'
      AND lower(COALESCE(p_resource, '')) IN ('patients', 'appointments', 'encounters', 'medical_records', 'clinical_corrections') THEN
      TEXT_build_object(
        'denied', true,
        'locked', true,
        'editable', false,
        'reason', 'Auditor acessa apenas metricas e relatorios agregados, sem dados clinicos ou identificaveis'
      )
    WHEN lower(COALESCE(p_role_key, '')) = 'recepcao'
      AND lower(COALESCE(p_resource, '')) IN ('encounters', 'medical_records', 'clinical_corrections') THEN
      TEXT_build_object(
        'denied', true,
        'locked', true,
        'editable', false,
        'reason', 'Recepcao nao acessa atendimento clinico ou prontuario'
      )
    WHEN lower(COALESCE(p_role_key, '')) = 'recepcao'
      AND lower(COALESCE(p_resource, '')) IN ('roles', 'permissions', 'user_roles', 'settings', 'system', 'security') THEN
      TEXT_build_object(
        'denied', true,
        'locked', true,
        'editable', false,
        'reason', 'Recepcao nao altera governanca, seguranca ou configuracao do sistema'
      )
    WHEN lower(COALESCE(p_role_key, '')) = 'medico'
      AND lower(COALESCE(p_resource, '')) = 'patients'
      AND lower(COALESCE(p_action, '')) <> 'read' THEN
      TEXT_build_object(
        'denied', true,
        'locked', true,
        'editable', false,
        'reason', 'Medico nao altera cadastro administrativo sensivel de pacientes'
      )
    WHEN lower(COALESCE(p_role_key, '')) = 'medico'
      AND lower(COALESCE(p_resource, '')) = 'appointments'
      AND lower(COALESCE(p_action, '')) IN ('create', 'update') THEN
      TEXT_build_object(
        'denied', true,
        'locked', true,
        'editable', false,
        'reason', 'Medico nao cria nem edita agendamentos; atua no fluxo clinico atribuido'
      )
    WHEN lower(COALESCE(p_role_key, '')) = 'medico'
      AND lower(COALESCE(p_resource, '')) IN ('medical_records')
      AND lower(COALESCE(p_action, '')) IN ('update', 'delete', 'manage') THEN
      TEXT_build_object(
        'denied', true,
        'locked', true,
        'editable', false,
        'reason', 'Prontuario e operacoes clinicas sao append-only/imutaveis'
      )
    WHEN lower(COALESCE(p_role_key, '')) = 'medico'
      AND lower(COALESCE(p_resource, '')) IN ('users', 'roles', 'permissions', 'user_roles', 'user_institutions', 'settings', 'system', 'security') THEN
      TEXT_build_object(
        'denied', true,
        'locked', true,
        'editable', false,
        'reason', 'Medico nao altera acesso, seguranca ou configuracao'
      )
    WHEN lower(COALESCE(p_role_key, '')) = 'admin'
      AND lower(COALESCE(p_resource, '')) IN ('system', 'security') THEN
      TEXT_build_object(
        'denied', true,
        'locked', true,
        'editable', false,
        'reason', 'Admin operacional nao altera sistema ou seguranca'
      )
    WHEN lower(COALESCE(p_role_key, '')) = 'admin'
      AND lower(COALESCE(p_resource, '')) IN ('encounters', 'medical_records', 'clinical_corrections') THEN
      TEXT_build_object(
        'denied', true,
        'locked', true,
        'editable', false,
        'reason', 'Admin operacional nao acessa dominio clinico, prontuario ou correcoes clinicas'
      )
    WHEN lower(COALESCE(p_role_key, '')) = 'admin'
      AND NOT (
        (
          lower(COALESCE(p_resource, '')) IN ('users', 'profiles', 'institutions', 'user_roles', 'user_institutions', 'specialties', 'doctors')
          AND lower(COALESCE(p_action, '')) IN ('create', 'read', 'update', 'delete')
        )
        OR (
          lower(COALESCE(p_resource, '')) IN ('doctor_availability', 'schedule_blocks')
          AND lower(COALESCE(p_action, '')) IN ('create', 'read', 'update', 'delete')
        )
        OR (
          lower(COALESCE(p_resource, '')) = 'schedules'
          AND lower(COALESCE(p_action, '')) = 'read'
        )
        OR (
          lower(COALESCE(p_resource, '')) = 'patients'
          AND lower(COALESCE(p_action, '')) IN ('create', 'read', 'update')
        )
        OR (
          lower(COALESCE(p_resource, '')) = 'appointments'
          AND lower(COALESCE(p_action, '')) IN ('create', 'read', 'update', 'cancel', 'reschedule')
        )
        OR (
          lower(COALESCE(p_resource, '')) IN ('reports', 'audit', 'data_exports')
          AND lower(COALESCE(p_action, '')) IN ('read', 'export')
        )
        OR (
          lower(COALESCE(p_resource, '')) = 'notifications'
          AND lower(COALESCE(p_action, '')) = 'send'
        )
        OR (
          lower(COALESCE(p_resource, '')) = '___deleted___' AND lower(COALESCE(p_action, '')) = 'read'
        )
      ) THEN
      TEXT_build_object(
        'denied', true,
        'locked', true,
        'editable', false,
        'reason', 'Admin administra cadastros e estrutura operacional; nao executa workflow nem configuracao estrutural'
      )
    WHEN lower(COALESCE(p_role_key, '')) = 'admin'
      AND lower(COALESCE(p_resource, '')) IN ('settings', 'roles', 'permissions')
      AND lower(COALESCE(p_action, '')) <> 'read' THEN
      TEXT_build_object(
        'denied', true,
        'locked', true,
        'editable', false,
        'reason', 'Superadmin controla permissoes e configuracoes estruturais'
      )
    WHEN lower(COALESCE(p_role_key, '')) = 'admin'
      AND lower(COALESCE(p_resource, '')) IN ('medical_records')
      AND lower(COALESCE(p_action, '')) IN ('update', 'delete', 'manage') THEN
      TEXT_build_object(
        'denied', true,
        'locked', true,
        'editable', false,
        'reason', 'Admin pode corrigir por trilha append-only, nao alterar/apagar historico clinico'
      )
    ELSE
      TEXT_build_object(
        'denied', false,
        'locked', false,
        'editable', true,
        'reason', NULL
      )
  END;
$$;

CREATE OR REPLACE FUNCTION user_has_permission(
  target_resource text,
  target_action text,
  target_institution TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN current_user_is_active() IS NOT TRUE THEN false
    WHEN current_user_role() = 'superadmin' THEN true
    ELSE (
    EXISTS (
      SELECT 1
      FROM TEXTs ur
      JOIN roles r ON r.id = ur.role_id OR r.key = ur.role::text
      JOIN role_permissions rp ON rp.role_id = r.id AND rp.revoked_at IS NULL
      JOIN permissions p ON p.id = rp.permission_id
      WHERE ur.user_id = auth.uid()
        AND ur.revoked_at IS NULL
        AND r.is_active = true
        AND r.deleted_at IS NULL
        AND p.is_active = true
        AND p.deleted_at IS NULL
        AND p.resource = target_resource
        AND (p.action = target_action OR p.action = 'manage')
        AND COALESCE((permission_guardrail_state(r.key, p.resource, p.action)->>'denied')::INTEGER, false) = false
        AND (
          target_institution IS NULL
          OR ur.institution_id IS NULL
          OR ur.institution_id = target_institution
        )
        AND (
          target_institution IS NULL
          OR r.institution_id IS NULL
          OR r.institution_id = target_institution
        )
        AND (
          target_institution IS NULL
          OR p.institution_id IS NULL
          OR p.institution_id = target_institution
        )
    )
    OR EXISTS (
      SELECT 1
      FROM user_permissions up
      JOIN permissions p ON p.id = up.permission_id
      WHERE up.user_id = auth.uid()
        AND up.revoked_at IS NULL
        AND p.is_active = true
        AND p.deleted_at IS NULL
        AND p.resource = target_resource
        AND (p.action = target_action OR p.action = 'manage')
        AND COALESCE((permission_guardrail_state(current_user_role(), p.resource, p.action)->>'denied')::INTEGER, false) = false
        AND (
          target_institution IS NULL
          OR up.institution_id IS NULL
          OR up.institution_id = target_institution
        )
        AND (
          target_institution IS NULL
          OR p.institution_id IS NULL
          OR p.institution_id = target_institution
        )
    )
    )
  END;
$$;

CREATE OR REPLACE FUNCTION user_has_permission_for(
  p_user_id TEXT,
  target_resource text,
  target_action text,
  target_institution TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_user_id IS NULL THEN false
    WHEN NOT EXISTS (
      SELECT 1
      FROM users u
      WHERE u.id = p_user_id
        AND u.is_active = true
        AND u.deleted_at IS NULL
    ) AND NOT EXISTS (
      SELECT 1
      FROM profiles pr
      WHERE pr.id = p_user_id
        AND pr.is_active = true
        AND pr.deleted_at IS NULL
    ) THEN false
    WHEN EXISTS (
      SELECT 1
      FROM TEXTs ur
      JOIN roles r ON r.id = ur.role_id OR r.key = ur.role::text
      WHERE ur.user_id = p_user_id
        AND ur.revoked_at IS NULL
        AND r.key = 'superadmin'
        AND r.is_active = true
        AND r.deleted_at IS NULL
    ) THEN true
    ELSE (
    EXISTS (
      SELECT 1
      FROM TEXTs ur
      JOIN roles r ON r.id = ur.role_id OR r.key = ur.role::text
      JOIN role_permissions rp ON rp.role_id = r.id AND rp.revoked_at IS NULL
      JOIN permissions p ON p.id = rp.permission_id
      WHERE ur.user_id = p_user_id
        AND ur.revoked_at IS NULL
        AND r.is_active = true
        AND r.deleted_at IS NULL
        AND p.is_active = true
        AND p.deleted_at IS NULL
        AND p.resource = target_resource
        AND (p.action = target_action OR p.action = 'manage')
        AND COALESCE((permission_guardrail_state(r.key, p.resource, p.action)->>'denied')::INTEGER, false) = false
        AND (
          target_institution IS NULL
          OR ur.institution_id IS NULL
          OR ur.institution_id = target_institution
        )
        AND (
          target_institution IS NULL
          OR r.institution_id IS NULL
          OR r.institution_id = target_institution
        )
        AND (
          target_institution IS NULL
          OR p.institution_id IS NULL
          OR p.institution_id = target_institution
        )
    )
    OR EXISTS (
      SELECT 1
      FROM user_permissions up
      JOIN permissions p ON p.id = up.permission_id
      WHERE up.user_id = p_user_id
        AND up.revoked_at IS NULL
        AND p.is_active = true
        AND p.deleted_at IS NULL
        AND p.resource = target_resource
        AND (p.action = target_action OR p.action = 'manage')
        AND COALESCE((permission_guardrail_state(COALESCE((
          SELECT r.key
          FROM TEXTs ur
          JOIN roles r ON r.id = ur.role_id OR r.key = ur.role::text
          WHERE ur.user_id = p_user_id
            AND ur.revoked_at IS NULL
            AND r.is_active = true
            AND r.deleted_at IS NULL
          ORDER BY
            CASE r.key
              WHEN 'superadmin' THEN 1
              WHEN 'admin' THEN 2
              WHEN 'medico' THEN 3
              WHEN 'recepcao' THEN 4
              WHEN 'auditor' THEN 5
              WHEN 'paciente' THEN 6
              ELSE 99
            END
          LIMIT 1
        ), 'paciente'), p.resource, p.action)->>'denied')::INTEGER, false) = false
        AND (
          target_institution IS NULL
          OR up.institution_id IS NULL
          OR up.institution_id = target_institution
        )
        AND (
          target_institution IS NULL
          OR p.institution_id IS NULL
          OR p.institution_id = target_institution
        )
    )
    )
END;
$$;

-- ============================================================
-- Technical modules governance (root-superadmin controlled)
-- ============================================================

CREATE OR REPLACE FUNCTION current_user_is_root_superadmin()
RETURNS INTEGER
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() = 'e1610477-7e32-4dc7-88dc-39c84db49ede'::TEXT;
$$;

CREATE OR REPLACE FUNCTION allowed_routes_for_current_user()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_scope TEXT;
  v_doctor_id TEXT;
BEGIN
  v_scope := current_user_primary_institution();

  IF current_user_role() = 'medico' THEN
    SELECT d.id
    INTO v_doctor_id
    FROM doctors d
    WHERE d.user_id = auth.uid()
      AND d.deleted_at IS NULL
      AND d.is_active = true
    LIMIT 1;
  ELSE
    v_doctor_id := NULL;
  END IF;

  RETURN ARRAY(
    SELECT route
    FROM unnest(ARRAY[
      CASE WHEN current_user_is_active() THEN '/dashboard' END,
      CASE WHEN can_access('schedules', 'read', v_scope, NULL, v_doctor_id) OR can_access('appointments', 'read', v_scope, NULL, v_doctor_id) THEN '/agenda' END,
      CASE WHEN can_access('doctor_availability', 'create', v_scope) OR can_access('doctor_availability', 'update', v_scope) OR can_access('schedule_blocks', 'create', v_scope) OR can_access('schedule_blocks', 'update', v_scope) THEN '/schedule-management' END,
      CASE WHEN can_access('appointments', 'read', v_scope, NULL, v_doctor_id) THEN '/appointments' END,
      CASE WHEN can_access('patients', 'read', v_scope, NULL, v_doctor_id) THEN '/patients' END,
      CASE WHEN can_access('doctors', 'update', v_scope) OR can_access('doctors', 'manage', v_scope) THEN '/doctors' END,
      CASE WHEN can_access('appointments', 'read', v_scope, NULL, v_doctor_id) OR can_access('medical_records', 'read', v_scope, NULL, v_doctor_id) THEN '/history' END,
      CASE WHEN can_access('reports', 'read', v_scope, NULL, v_doctor_id) THEN '/reports' END,
      CASE WHEN can_access('institutions', 'read', v_scope) OR can_access('institutions', 'update', v_scope) THEN '/institutions' END,
      CASE WHEN can_access('users', 'read', v_scope) THEN '/users' END,
      CASE WHEN can_access('specialties', 'read', v_scope) OR can_access('specialties', 'update', v_scope) THEN '/specialties' END,
      CASE WHEN can_access('settings', 'manage', v_scope) THEN '/settings' END,
      CASE WHEN can_access('audit', 'read', v_scope) THEN '/auditor' END,
      CASE WHEN can_access('audit', 'read', v_scope) THEN '/audit-log' END,

      CASE WHEN current_user_is_active() AND false THEN '/odontology' END
    ]) AS route
    WHERE route IS NOT NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION enforce_role_permission_guardrails()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role_key text;
  v_resource text;
  v_action text;
  v_guardrail TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF current_setting('app.access_operation', true) NOT IN ('update_permissions', 'grant_permission', 'revoke_permission') THEN
    RAISE EXCEPTION 'Permissoes devem ser alteradas exclusivamente por RPC auditada';
  END IF;

  SELECT r.key, p.resource, p.action
  INTO v_role_key, v_resource, v_action
  FROM roles r
  JOIN permissions p ON p.id = NEW.permission_id
  WHERE r.id = NEW.role_id
    AND r.deleted_at IS NULL
    AND p.deleted_at IS NULL
  LIMIT 1;

  IF v_role_key IS NULL THEN
    RAISE EXCEPTION 'Vinculo de permissao invalido';
  END IF;

  IF v_role_key = 'superadmin' THEN
    RAISE EXCEPTION 'Permissoes de superadmin sao estruturais e controladas pela baseline';
  END IF;

  v_guardrail := permission_guardrail_state(v_role_key, v_resource, v_action);
  IF NEW.revoked_at IS NULL
     AND COALESCE((v_guardrail->>'denied')::INTEGER, false) THEN
    RAISE EXCEPTION 'Permissao bloqueada por regra estrutural: %', v_guardrail->>'reason';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_user_permission_guardrails()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_resource text;
  v_action text;
  v_role_key text;
  v_guardrail TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF current_setting('app.access_operation', true) NOT IN ('grant_user_permission', 'revoke_user_permission') THEN
    RAISE EXCEPTION 'Permissoes individuais devem ser alteradas exclusivamente por RPC auditada';
  END IF;

  SELECT p.resource, p.action
  INTO v_resource, v_action
  FROM permissions p
  WHERE p.id = NEW.permission_id
    AND p.deleted_at IS NULL
  LIMIT 1;

  IF v_resource IS NULL THEN
    RAISE EXCEPTION 'Permissao individual invalida';
  END IF;

  SELECT r.key
  INTO v_role_key
  FROM TEXTs ur
  JOIN roles r ON r.id = ur.role_id OR r.key = ur.role::text
  WHERE ur.user_id = NEW.user_id
    AND ur.revoked_at IS NULL
    AND r.deleted_at IS NULL
    AND r.is_active = true
  ORDER BY
    CASE r.key
      WHEN 'superadmin' THEN 1
      WHEN 'admin' THEN 2
      WHEN 'medico' THEN 3
      WHEN 'recepcao' THEN 4
      WHEN 'auditor' THEN 5
      WHEN 'paciente' THEN 6
      ELSE 99
    END
  LIMIT 1;

  IF v_role_key IS NULL THEN
    RAISE EXCEPTION 'Usuario sem perfil ativo para permissao individual';
  END IF;

  IF v_role_key = 'superadmin' THEN
    RAISE EXCEPTION 'Permissoes de superadmin sao estruturais e controladas pela baseline';
  END IF;

  v_guardrail := permission_guardrail_state(v_role_key, v_resource, v_action);
  IF NEW.revoked_at IS NULL
     AND COALESCE((v_guardrail->>'denied')::INTEGER, false) THEN
    RAISE EXCEPTION 'Permissao individual bloqueada por regra estrutural: %', v_guardrail->>'reason';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION require_permission(
  target_resource text,
  target_action text,
  target_institution TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM assert_can_access(
    target_resource,
    target_action,
    TEXT_build_object('institution_id', target_institution, 'source', 'require_permission')
  );
END;
$$;

CREATE OR REPLACE FUNCTION assert_authenticated()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user TEXT;
BEGIN
  v_user := auth.uid();
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Usuario autenticado obrigatorio';
  END IF;

  IF current_user_is_active() IS NOT TRUE THEN
    RAISE EXCEPTION 'Usuario inativo ou inexistente';
  END IF;

  RETURN v_user;
END;
$$;

CREATE OR REPLACE FUNCTION is_doctor_owner(target_doctor TEXT)
RETURNS INTEGER
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM doctors d
    WHERE d.id = target_doctor
      AND d.user_id = auth.uid()
      AND d.deleted_at IS NULL
      AND d.is_active = true
  );
$$;

-- ============================================================
-- Code generation and invariant triggers
-- ============================================================
CREATE OR REPLACE FUNCTION generate_patient_code()
RETURNS text
LANGUAGE SQL
VOLATILE
AS $$
  SELECT 'PAT-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('patient_code_seq')::text, 8, '0');
$$;

CREATE OR REPLACE FUNCTION generate_appointment_code()
RETURNS text
LANGUAGE SQL
VOLATILE
AS $$
  SELECT 'APT-' || to_char(now(), 'YYYYMM') || '-' || lpad(nextval('appointment_code_seq')::text, 8, '0');
$$;

CREATE OR REPLACE FUNCTION generate_ticket_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.ticket_number IS NULL OR btrim(NEW.ticket_number) = '' THEN
    NEW.ticket_number := to_char(now(), 'YYMM') || '-' || lpad(nextval('ticket_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION prevent_hard_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Hard delete bloqueado para %. Use soft delete com deleted_at.', TG_TABLE_NAME;
END;
$$;

CREATE OR REPLACE FUNCTION prevent_update_delete_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION '% e imutavel e append-only', TG_TABLE_NAME;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_profile_sensitive_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_operation text;
BEGIN
  v_operation := current_setting('app.access_operation', true);

  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NULL THEN
      RETURN NEW;
    END IF;

    IF v_operation IN ('create_user', 'set_user_active', 'sync_user_profile', 'auth_signup') THEN
      RETURN NEW;
    END IF;

    IF NEW.role = 'paciente'::TEXT AND NEW.is_active IS NOT TRUE THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'profiles deve ser criado por RPC administrativa auditada';
  END IF;

  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_operation IN ('create_user', 'set_user_active', 'sync_user_profile') THEN
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role
    OR NEW.institution_id IS DISTINCT FROM OLD.institution_id
    OR NEW.is_active IS DISTINCT FROM OLD.is_active
    OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
  THEN
    RAISE EXCEPTION 'Campos sensiveis de profiles so podem ser alterados por RPC administrativa';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_patient_invariants()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_user := auth.uid();

    IF NEW.patient_code IS NULL OR btrim(NEW.patient_code) = '' THEN
      NEW.patient_code := generate_patient_code();
    END IF;

    NEW.cpf := normalize_cpf(NEW.cpf);

    IF length(NEW.cpf) <> 11 THEN
      RAISE EXCEPTION 'CPF invalido';
    END IF;

    IF NEW.institution_id IS NULL THEN
      NEW.institution_id := current_user_primary_institution();
    END IF;

    IF NEW.institution_id IS NULL THEN
      RAISE EXCEPTION 'institution_id do paciente e obrigatorio';
    END IF;

    IF user_has_institution_access(NEW.institution_id) IS NOT TRUE THEN
      RAISE EXCEPTION 'Usuario sem acesso a instituicao do paciente';
    END IF;

    NEW.created_by := COALESCE(NEW.created_by, v_user);
    NEW.updated_by := COALESCE(NEW.updated_by, v_user);
    RETURN NEW;
  END IF;

  IF NEW.patient_code IS DISTINCT FROM OLD.patient_code THEN
    RAISE EXCEPTION 'patient_code e imutavel';
  END IF;

  IF normalize_cpf(NEW.cpf) IS DISTINCT FROM normalize_cpf(OLD.cpf) THEN
    RAISE EXCEPTION 'CPF do paciente e imutavel';
  END IF;

  IF NEW.institution_id IS DISTINCT FROM OLD.institution_id THEN
    IF current_setting('app.admin_operation', true) <> 'upsert_patient'
       AND user_has_institution_access(NEW.institution_id) IS NOT TRUE THEN
      RAISE EXCEPTION 'Usuario sem acesso a nova instituicao do paciente';
    END IF;
  END IF;

  NEW.cpf := normalize_cpf(OLD.cpf);
  NEW.updated_by := COALESCE(auth.uid(), NEW.updated_by);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_doctor_availability_invariants()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user TEXT;
  v_role text;
  v_doctor_user TEXT;
  v_doctor_active INTEGER;
BEGIN
  v_user := auth.uid();
  v_role := current_user_role();

  IF v_role NOT IN ('superadmin', 'admin') THEN
    RAISE EXCEPTION 'Perfil sem permissao para configurar disponibilidade medica';
  END IF;

  IF user_has_institution_access(NEW.institution_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Usuario sem acesso a instituicao da disponibilidade';
  END IF;

  IF NEW.ends_at <= NEW.starts_at THEN
    RAISE EXCEPTION 'Horario final deve ser maior que horario inicial';
  END IF;

  SELECT d.user_id, d.is_active
  INTO v_doctor_user, v_doctor_active
  FROM doctors d
  WHERE d.id = NEW.doctor_id
    AND d.deleted_at IS NULL;

  IF v_doctor_user IS NULL OR v_doctor_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Profissional invalido ou inativo para disponibilidade';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM user_institutions ui
    WHERE ui.user_id = v_doctor_user
      AND ui.institution_id = NEW.institution_id
  ) THEN
    RAISE EXCEPTION 'Profissional nao esta vinculado a instituicao da disponibilidade';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.institution_id IS DISTINCT FROM OLD.institution_id
      OR NEW.doctor_id IS DISTINCT FROM OLD.doctor_id
    THEN
      RAISE EXCEPTION 'Instituicao e profissional da disponibilidade sao imutaveis';
    END IF;
  ELSE
    NEW.created_by := COALESCE(NEW.created_by, v_user);
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_schedule_block_invariants()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user TEXT;
  v_role text;
  v_doctor_user TEXT;
  v_doctor_active INTEGER;
BEGIN
  v_user := auth.uid();
  v_role := current_user_role();

  IF v_role NOT IN ('superadmin', 'admin', 'recepcao') THEN
    RAISE EXCEPTION 'Perfil sem permissao para criar bloqueio de agenda';
  END IF;

  IF user_has_institution_access(NEW.institution_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Usuario sem acesso a instituicao do bloqueio';
  END IF;

  IF NEW.block_range IS NULL OR isempty(NEW.block_range) THEN
    RAISE EXCEPTION 'Intervalo de bloqueio invalido';
  END IF;

  IF COALESCE(NULLIF(btrim(NEW.reason), ''), '') = '' THEN
    RAISE EXCEPTION 'Bloqueio de agenda exige motivo';
  END IF;

  IF NEW.doctor_id IS NOT NULL THEN
    SELECT d.user_id, d.is_active
    INTO v_doctor_user, v_doctor_active
    FROM doctors d
    WHERE d.id = NEW.doctor_id
      AND d.deleted_at IS NULL;

    IF v_doctor_user IS NULL OR v_doctor_active IS NOT TRUE THEN
      RAISE EXCEPTION 'Profissional invalido ou inativo para bloqueio';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM user_institutions ui
      WHERE ui.user_id = v_doctor_user
        AND ui.institution_id = NEW.institution_id
    ) THEN
      RAISE EXCEPTION 'Profissional nao esta vinculado a instituicao do bloqueio';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.institution_id IS DISTINCT FROM OLD.institution_id
      OR NEW.doctor_id IS DISTINCT FROM OLD.doctor_id
    THEN
      RAISE EXCEPTION 'Instituicao e profissional do bloqueio sao imutaveis';
    END IF;
  ELSE
    NEW.created_by := COALESCE(NEW.created_by, v_user);
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_appointment_invariants()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user TEXT;
  v_role text;
  v_operation text;
  v_schedule_changed INTEGER;
  v_patient_institution TEXT;
  v_doctor_user TEXT;
  v_doctor_active INTEGER;
  v_doctor_specialty TEXT;
  v_doctor_has_institution INTEGER;
  v_within_availability INTEGER;
  v_has_block INTEGER;
  v_operational_timezone text;
BEGIN
  v_user := auth.uid();
  v_role := current_user_role();
  v_operation := current_setting('app.clinical_operation', true);
  IF TG_OP = 'INSERT' THEN
    v_schedule_changed := true;
  ELSE
    v_schedule_changed :=
      NEW.appointment_date IS DISTINCT FROM OLD.appointment_date
      OR NEW.end_date IS DISTINCT FROM OLD.end_date
      OR NEW.doctor_id IS DISTINCT FROM OLD.doctor_id
      OR NEW.institution_id IS DISTINCT FROM OLD.institution_id;

    IF v_operation = 'start_encounter'
       AND NEW.doctor_id IS DISTINCT FROM OLD.doctor_id
       AND NEW.appointment_date IS NOT DISTINCT FROM OLD.appointment_date
       AND NEW.end_date IS NOT DISTINCT FROM OLD.end_date
       AND NEW.institution_id IS NOT DISTINCT FROM OLD.institution_id THEN
      v_schedule_changed := false;
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF v_role <> 'superadmin' AND v_operation IS DISTINCT FROM 'schedule_appointment' THEN
      RAISE EXCEPTION 'Agendamento deve ser criado pela RPC api_schedule_appointment';
    END IF;

    IF NEW.status IS DISTINCT FROM 'agendado'::TEXT THEN
      RAISE EXCEPTION 'Agendamento deve nascer em status agendado';
    END IF;

    IF NEW.appointment_code IS NULL OR btrim(NEW.appointment_code) = '' THEN
      NEW.appointment_code := generate_appointment_code();
    END IF;

    NEW.scheduled_doctor_id := COALESCE(NEW.scheduled_doctor_id, NEW.doctor_id);
  ELSE
    IF NEW.appointment_code IS DISTINCT FROM OLD.appointment_code THEN
      RAISE EXCEPTION 'appointment_code e imutavel';
    END IF;

    IF NEW.scheduled_doctor_id IS DISTINCT FROM OLD.scheduled_doctor_id
      AND v_operation <> 'reschedule_appointment'
    THEN
      RAISE EXCEPTION 'Profissional originalmente agendado so pode mudar em reagendamento';
    END IF;

    IF OLD.status IN ('concluido', 'cancelado', 'nao_compareceu') AND NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Status terminal nao pode ser alterado';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NOT (
        (OLD.status = 'agendado' AND NEW.status = 'confirmado' AND v_operation = 'set_appointment_status') OR
        (OLD.status = 'agendado' AND NEW.status IN ('cancelado', 'nao_compareceu') AND v_operation = 'set_appointment_status') OR
        (OLD.status = 'agendado' AND NEW.status = 'em_atendimento' AND v_operation = 'start_encounter') OR
        (OLD.status = 'confirmado' AND NEW.status = 'agendado' AND v_operation = 'reschedule_appointment') OR
        (OLD.status = 'confirmado' AND NEW.status IN ('cancelado', 'nao_compareceu') AND v_operation = 'set_appointment_status') OR
        (OLD.status = 'confirmado' AND NEW.status = 'em_atendimento' AND v_operation = 'start_encounter') OR
        (OLD.status = 'em_atendimento' AND NEW.status = 'concluido' AND v_operation = 'finalize_encounter')
      ) THEN
        RAISE EXCEPTION 'Transicao de status de % para % nao permitida', OLD.status, NEW.status;
      END IF;
    END IF;

    IF v_schedule_changed
      AND OLD.status NOT IN ('agendado', 'confirmado')
    THEN
      RAISE EXCEPTION 'Horario nao pode ser alterado apos inicio ou encerramento do atendimento';
    END IF;

    IF v_schedule_changed
      AND OLD.status IN ('agendado', 'confirmado')
      AND v_operation <> 'reschedule_appointment'
    THEN
      RAISE EXCEPTION 'Alteracao de horario deve usar api_reschedule_appointment';
    END IF;

    IF NEW.status = 'cancelado' AND COALESCE(NULLIF(btrim(NEW.cancel_reason), ''), '') = '' THEN
      RAISE EXCEPTION 'Cancelamento exige motivo';
    END IF;

    IF NEW.status = 'nao_compareceu' AND COALESCE(NULLIF(btrim(NEW.no_show_reason), ''), '') = '' THEN
      RAISE EXCEPTION 'Nao comparecimento exige motivo';
    END IF;
  END IF;

  IF NEW.end_date <= NEW.appointment_date THEN
    RAISE EXCEPTION 'end_date deve ser maior que appointment_date';
  END IF;

  SELECT p.institution_id
  INTO v_patient_institution
  FROM patients p
  WHERE p.id = NEW.patient_id
    AND p.deleted_at IS NULL
    AND p.is_active = true;

  IF v_patient_institution IS NULL THEN
    RAISE EXCEPTION 'Paciente invalido, inativo ou sem instituicao';
  END IF;

  SELECT d.user_id, d.is_active, d.specialty_id
  INTO v_doctor_user, v_doctor_active, v_doctor_specialty
  FROM doctors d
  WHERE d.id = NEW.doctor_id
    AND d.deleted_at IS NULL;

  IF v_doctor_user IS NULL OR v_doctor_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Profissional invalido ou inativo';
  END IF;

  IF NEW.institution_id IS NULL THEN
    NEW.institution_id := v_patient_institution;
  END IF;

  IF NEW.institution_id IS DISTINCT FROM v_patient_institution THEN
    RAISE EXCEPTION 'Paciente nao pertence a instituicao da consulta';
  END IF;

  v_operational_timezone := get_operational_timezone(NEW.institution_id);

  SELECT EXISTS (
    SELECT 1
    FROM user_institutions ui
    WHERE ui.user_id = v_doctor_user
      AND ui.institution_id = NEW.institution_id
  ) INTO v_doctor_has_institution;

  IF NOT v_doctor_has_institution THEN
    RAISE EXCEPTION 'Profissional nao esta vinculado a instituicao da consulta';
  END IF;

  NEW.specialty_id := COALESCE(NEW.specialty_id, v_doctor_specialty);

  IF user_has_institution_access(NEW.institution_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Usuario sem acesso a instituicao da consulta';
  END IF;

  IF NEW.status IN ('agendado', 'confirmado', 'em_atendimento') THEN
    IF EXISTS (
      SELECT 1
      FROM appointments ax
      WHERE ax.id IS DISTINCT FROM NEW.id
        AND ax.deleted_at IS NULL
        AND ax.patient_id = NEW.patient_id
        AND ax.institution_id = NEW.institution_id
        AND ax.specialty_id IS NOT DISTINCT FROM NEW.specialty_id
        AND ax.status IN ('agendado', 'confirmado', 'em_atendimento')
        AND (ax.appointment_date AT TEXT ZONE v_operational_timezone)::date =
            (NEW.appointment_date AT TEXT ZONE v_operational_timezone)::date
    ) THEN
      RAISE EXCEPTION 'Paciente ja possui agendamento ativo para esta especialidade nesta data';
    END IF;
  END IF;

  IF v_schedule_changed THEN
    SELECT EXISTS (
      SELECT 1
      FROM doctor_availability da
      WHERE da.doctor_id = NEW.doctor_id
        AND da.institution_id = NEW.institution_id
        AND da.is_active = true
        AND da.deleted_at IS NULL
        AND da.weekday = EXTRACT(DOW FROM (NEW.appointment_date AT TEXT ZONE v_operational_timezone))::integer
        AND (NEW.appointment_date AT TEXT ZONE v_operational_timezone)::TEXT >= da.starts_at
        AND (NEW.end_date AT TEXT ZONE v_operational_timezone)::TEXT <= da.ends_at
    ) INTO v_within_availability;

    IF NOT v_within_availability THEN
      RAISE EXCEPTION 'Horario fora da disponibilidade configurada do profissional';
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM schedule_blocks sb
      WHERE sb.institution_id = NEW.institution_id
        AND sb.deleted_at IS NULL
        AND (sb.doctor_id IS NULL OR sb.doctor_id = NEW.doctor_id)
        AND sb.block_range && tstzrange(NEW.appointment_date, NEW.end_date, '[)')
    ) INTO v_has_block;

    IF v_has_block THEN
      RAISE EXCEPTION 'Horario bloqueado na agenda';
    END IF;
  END IF;

  IF v_role = 'medico' AND is_doctor_owner(NEW.doctor_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Medico so pode operar sua propria agenda';
  END IF;

  IF TG_OP = 'UPDATE'
    AND v_role = 'recepcao'
    AND (
      NEW.patient_id IS DISTINCT FROM OLD.patient_id OR
      NEW.doctor_id IS DISTINCT FROM OLD.doctor_id OR
      NEW.specialty_id IS DISTINCT FROM OLD.specialty_id
    )
  THEN
    RAISE EXCEPTION 'Recepcao nao pode trocar paciente ou profissional diretamente';
  END IF;

  NEW.updated_by := COALESCE(v_user, NEW.updated_by);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION assign_medical_record_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_encounter encounters%ROWTYPE;
BEGIN
  IF current_setting('app.clinical_operation', true) IS DISTINCT FROM 'add_medical_record_entry' THEN
    RAISE EXCEPTION 'Registro clinico deve ser criado pela RPC api_add_medical_record_entry';
  END IF;

  SELECT *
  INTO v_encounter
  FROM encounters e
  WHERE e.id = NEW.encounter_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Atendimento inexistente';
  END IF;

  IF v_encounter.status <> 'em_atendimento' THEN
    RAISE EXCEPTION 'Prontuario de atendimento finalizado/cancelado e imutavel';
  END IF;

  IF current_user_role() <> 'superadmin'
     AND is_doctor_owner(v_encounter.doctor_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Somente o profissional responsavel pode registrar evolucao clinica';
  END IF;

  NEW.institution_id := v_encounter.institution_id;
  NEW.created_by := COALESCE(NEW.created_by, auth.uid());
  NEW.version := COALESCE(
    NEW.version,
    (
      SELECT COALESCE(max(m.version), 0) + 1
      FROM medical_record_entries m
      WHERE m.encounter_id = NEW.encounter_id
    )
  );

  NEW.content_hash := encode(
    digest(
      concat_ws('|', NEW.encounter_id::text, NEW.version::text, NEW.entry_type::text, NEW.clinical_data::text, NEW.created_by::text),
      'sha256'
    ),
    'hex'
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION sync_profile_role_links()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role_institution TEXT;
BEGIN
  INSERT INTO users (
    id,
    auth_user_id,
    email,
    full_name,
    primary_institution_id,
    is_active,
    auth_status,
    metadata,
    updated_by
  )
  VALUES (
    NEW.id,
    NEW.id,
    NEW.email,
    btrim(COALESCE(NEW.full_name, NEW.first_name || ' ' || NEW.last_name, NEW.email)),
    NEW.institution_id,
    COALESCE(NEW.is_active, true),
    CASE WHEN COALESCE(NEW.is_active, true) THEN 'active' ELSE 'disabled' END,
    TEXT_build_object('source', 'profiles_sync'),
    auth.uid()
  )
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      full_name = EXCLUDED.full_name,
      primary_institution_id = EXCLUDED.primary_institution_id,
      is_active = EXCLUDED.is_active,
      auth_status = EXCLUDED.auth_status,
      updated_by = auth.uid(),
      updated_at = now();

  v_role_institution := CASE
    WHEN NEW.role IN ('superadmin', 'admin', 'auditor') THEN NULL
    ELSE NEW.institution_id
  END;

  IF NEW.role <> 'superadmin' AND NEW.institution_id IS NOT NULL THEN
    INSERT INTO user_institutions (user_id, institution_id, created_by)
    VALUES (NEW.id, NEW.institution_id, auth.uid())
    ON CONFLICT (user_id, institution_id)
    DO UPDATE SET 
  END IF;

  INSERT INTO TEXTs (user_id, role_id, role, institution_id, granted_by, revoked_at, revoked_by)
  VALUES (
    NEW.id,
    (
      SELECT r.id
      FROM roles r
      WHERE r.key = NEW.role::text
        AND (
          (v_role_institution IS NULL AND r.institution_id IS NULL)
          OR r.institution_id = v_role_institution
        )
        AND r.deleted_at IS NULL
      ORDER BY r.institution_id NULLS FIRST
      LIMIT 1
    ),
    NEW.role,
    v_role_institution,
    auth.uid(),
    CASE WHEN COALESCE(NEW.is_active, true) THEN NULL ELSE now() END,
    CASE WHEN COALESCE(NEW.is_active, true) THEN NULL ELSE auth.uid() END
  )
  ON CONFLICT (user_id, role, institution_id)
  DO UPDATE SET
    role_id = EXCLUDED.role_id,
    revoked_at = CASE WHEN COALESCE(NEW.is_active, true) THEN NULL ELSE now() END,
    revoked_by = CASE WHEN COALESCE(NEW.is_active, true) THEN NULL ELSE auth.uid() END,
    granted_by = CASE WHEN COALESCE(NEW.is_active, true) THEN EXCLUDED.granted_by ELSE TEXTs.granted_by END,

  IF COALESCE(NEW.is_active, true) IS NOT TRUE THEN
    UPDATE TEXTs
    SET revoked_at = COALESCE(revoked_at, now()),
        revoked_by = COALESCE(revoked_by, auth.uid())
    WHERE user_id = NEW.id
      AND revoked_at IS NULL
      AND (
        role = NEW.role
        OR EXISTS (
          SELECT 1
          FROM roles r
          WHERE r.id = TEXTs.role_id
            AND r.key = NEW.role::text
        )
      );
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO users (id, auth_user_id, email, full_name, is_active, auth_status, metadata)
  VALUES (
    NEW.id,
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name', split_part(NEW.email, '@', 1)),
    false,
    'disabled',
    TEXT_build_object('source', 'auth_signup')
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO profiles (id, email, first_name, last_name, role, is_active)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'first_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data ->> 'last_name', ''),
    'paciente',
    false
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION audit_row_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old TEXT;
  v_new TEXT;
  v_record_id TEXT;
  v_institution TEXT;
BEGIN
  v_old := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_TEXT(OLD) ELSE NULL END;
  v_new := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_TEXT(NEW) ELSE NULL END;
  v_record_id := COALESCE((v_new ->> 'id')::TEXT, (v_old ->> 'id')::TEXT);
  v_institution := NULLIF(COALESCE(v_new ->> 'institution_id', v_old ->> 'institution_id'), '')::TEXT;

  INSERT INTO audit_log (
    institution_id,
    user_id,
    user_name,
    action,
    table_name,
    record_id,
    old_data,
    new_data,
    created_at
  )
  VALUES (
    v_institution,
    auth.uid(),
    (SELECT p.full_name FROM profiles p WHERE p.id = auth.uid()),
    TG_OP,
    TG_TABLE_NAME,
    v_record_id,
    v_old,
    v_new,
    now()
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ============================================================
-- Trigger installation
-- ============================================================
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

DROP TRIGGER IF EXISTS trg_profiles_sensitive_fields ON profiles;

DROP TRIGGER IF EXISTS trg_profiles_sync_role_links ON profiles;

DROP TRIGGER IF EXISTS trg_patients_invariants ON patients;

DROP TRIGGER IF EXISTS trg_doctor_availability_invariants ON doctor_availability;

DROP TRIGGER IF EXISTS trg_schedule_blocks_invariants ON schedule_blocks;

DROP TRIGGER IF EXISTS trigger_enforce_appointments_update_guard ON appointments;
DROP TRIGGER IF EXISTS trigger_enforce_appointment_institution_consistency ON appointments;
DROP TRIGGER IF EXISTS trigger_populate_appointment_context ON appointments;
DROP TRIGGER IF EXISTS trigger_generate_ticket ON appointments;
DROP TRIGGER IF EXISTS trg_appointments_ticket ON appointments;

DROP TRIGGER IF EXISTS trg_appointments_invariants ON appointments;

DROP TRIGGER IF EXISTS trg_medical_record_version ON medical_record_entries;

DROP TRIGGER IF EXISTS trg_medical_record_immutable ON medical_record_entries;

DROP TRIGGER IF EXISTS trg_audit_log_immutable ON audit_log;

DROP TRIGGER IF EXISTS trg_clinical_events_immutable ON clinical_events;

DROP TRIGGER IF EXISTS trg_patients_no_delete ON patients;

DROP TRIGGER IF EXISTS trg_appointments_no_delete ON appointments;

DROP TRIGGER IF EXISTS trg_encounters_no_delete ON encounters;

DROP TRIGGER IF EXISTS trg_users_no_delete ON users;

DROP TRIGGER IF EXISTS trg_roles_no_delete ON roles;

DROP TRIGGER IF EXISTS trg_permissions_no_delete ON permissions;

DROP TRIGGER IF EXISTS trg_role_permissions_guardrails ON role_permissions;

DROP TRIGGER IF EXISTS trg_user_permissions_guardrails ON user_permissions;

DROP TRIGGER IF EXISTS trg_doctor_availability_no_delete ON doctor_availability;

DROP TRIGGER IF EXISTS trg_schedule_blocks_no_delete ON schedule_blocks;

DROP TRIGGER IF EXISTS audit_profiles ON profiles;
DROP TRIGGER IF EXISTS audit_patients ON patients;
DROP TRIGGER IF EXISTS audit_doctors ON doctors;
DROP TRIGGER IF EXISTS audit_appointments ON appointments;
DROP TRIGGER IF EXISTS audit_appointments_trigger ON appointments;
DROP TRIGGER IF EXISTS audit_specialties ON specialties;

DROP TRIGGER IF EXISTS trg_audit_profiles ON profiles;

DROP TRIGGER IF EXISTS trg_audit_users ON users;

DROP TRIGGER IF EXISTS trg_audit_roles ON roles;

DROP TRIGGER IF EXISTS trg_audit_permissions ON permissions;

DROP TRIGGER IF EXISTS trg_audit_role_permissions ON role_permissions;

DROP TRIGGER IF EXISTS trg_audit_user_permissions ON user_permissions;

DROP TRIGGER IF EXISTS trg_audit_user_roles ON TEXTs;

DROP TRIGGER IF EXISTS trg_audit_user_institutions ON user_institutions;

DROP TRIGGER IF EXISTS trg_audit_patients ON patients;

DROP TRIGGER IF EXISTS trg_audit_doctors ON doctors;

DROP TRIGGER IF EXISTS trg_audit_doctor_availability ON doctor_availability;

DROP TRIGGER IF EXISTS trg_audit_schedule_blocks ON schedule_blocks;

DROP TRIGGER IF EXISTS trg_audit_appointments ON appointments;

DROP TRIGGER IF EXISTS trg_audit_encounters ON encounters;

DROP TRIGGER IF EXISTS trg_audit_medical_record_entries ON medical_record_entries;

DROP TRIGGER IF EXISTS trg_touch_institutions ON institutions;

DROP TRIGGER IF EXISTS trg_touch_profiles ON profiles;

DROP TRIGGER IF EXISTS trg_touch_users ON users;

DROP TRIGGER IF EXISTS trg_touch_roles ON roles;

DROP TRIGGER IF EXISTS trg_touch_permissions ON permissions;

DROP TRIGGER IF EXISTS trg_touch_patients ON patients;

DROP TRIGGER IF EXISTS trg_touch_doctors ON doctors;

DROP TRIGGER IF EXISTS trg_touch_doctor_availability ON doctor_availability;

DROP TRIGGER IF EXISTS trg_touch_appointments ON appointments;

DROP TRIGGER IF EXISTS trg_touch_encounters ON encounters;

-- Backfill canonical RBAC links from existing profiles.
INSERT INTO users (id, auth_user_id, email, full_name, phone, primary_institution_id, is_active, auth_status, metadata)
SELECT
  p.id,
  p.id,
  p.email,
  COALESCE(NULLIF(btrim(p.full_name), ''), p.email),
  p.phone,
  p.institution_id,
  COALESCE(p.is_active, true),
  CASE WHEN COALESCE(p.is_active, true) THEN 'active' ELSE 'disabled' END,
  TEXT_build_object('source', 'profiles_backfill')
FROM profiles p
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    phone = EXCLUDED.phone,
    primary_institution_id = EXCLUDED.primary_institution_id,
    is_active = EXCLUDED.is_active,
    auth_status = EXCLUDED.auth_status,
    updated_at = now();

INSERT INTO user_institutions (user_id, institution_id)
SELECT p.id, p.institution_id
FROM profiles p
WHERE p.institution_id IS NOT NULL
ON CONFLICT (user_id, institution_id) DO UPDATE SET 

INSERT INTO TEXTs (user_id, role_id, role, institution_id)
SELECT
  p.id,
  (SELECT r.id FROM roles r WHERE r.key = p.role::text AND r.institution_id IS NULL AND r.deleted_at IS NULL LIMIT 1),
  p.role,
  CASE WHEN p.role IN ('superadmin', 'admin', 'auditor') THEN NULL ELSE p.institution_id END
FROM profiles p
WHERE p.is_active = true
ON CONFLICT (user_id, role, institution_id)
DO UPDATE SET role_id = EXCLUDED.role_id, 

-- ============================================================
-- Backend RPCs: operations are centralized and idempotent
-- ============================================================

CREATE OR REPLACE FUNCTION get_my_access_context()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user TEXT;
  v_scope TEXT;
BEGIN
  v_user := assert_authenticated();
  v_scope := current_user_primary_institution();
  PERFORM assert_can_access(
    'profiles',
    'read',
    TEXT_build_object('institution_id', v_scope, 'owner_user_id', v_user)
  );

  RETURN TEXT_build_object(
    'user_id', v_user,
    'role', current_user_role(),
    'preferences', COALESCE(
      (SELECT p.preferences FROM profiles p WHERE p.id = v_user AND p.deleted_at IS NULL),
      '{}'::TEXT
    ),
    'institution_id', v_scope,
    'institution_ids', current_user_institution_ids(),
    'permissions',
      COALESCE(
        (
          SELECT TEXT_agg(DISTINCT TEXT_build_object(
            'resource', p.resource,
            'action', p.action,
            'institution_id', COALESCE(p.institution_id, ur.institution_id)
          ))
          FROM TEXTs ur
          JOIN roles r ON r.id = ur.role_id OR r.key = ur.role::text
          JOIN role_permissions rp ON rp.role_id = r.id AND rp.revoked_at IS NULL
          JOIN permissions p ON p.id = rp.permission_id
          WHERE ur.user_id = v_user
            AND ur.revoked_at IS NULL
            AND r.is_active = true
            AND r.deleted_at IS NULL
            AND p.is_active = true
            AND p.deleted_at IS NULL
        ),
        '[]'::TEXT
      )
  );
END;
$$;

DROP FUNCTION IF EXISTS get_access_control_snapshot(TEXT);
CREATE OR REPLACE FUNCTION get_access_control_snapshot(
  p_institution_id TEXT DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 200
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor TEXT;
  v_scope TEXT;
  v_search text := lower(btrim(COALESCE(p_search, '')));
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 200), 1), 500);
  v_root_superadmin constant TEXT := 'e1610477-7e32-4dc7-88dc-39c84db49ede'::TEXT;
BEGIN
  v_actor := assert_authenticated();
  v_scope := COALESCE(p_institution_id, current_user_primary_institution());
  PERFORM require_permission('users', 'read', v_scope);

  RETURN TEXT_build_object(
    'context', get_my_access_context(),
    'users_search', NULLIF(v_search, ''),
    'users_limit', v_limit,
    'users_total',
      COALESCE((
        SELECT count(*)
        FROM users u
        WHERE u.deleted_at IS NULL
          AND (v_actor = v_root_superadmin OR u.id <> v_root_superadmin)
          AND (
            current_user_role() IN ('superadmin', 'admin', 'auditor')
            OR u.primary_institution_id = ANY(current_user_institution_ids())
            OR EXISTS (
              SELECT 1
              FROM user_institutions ui
              WHERE ui.user_id = u.id
                AND ui.revoked_at IS NULL
                AND ui.institution_id = ANY(current_user_institution_ids())
            )
          )
          AND (
            v_search = ''
            OR lower(COALESCE(u.full_name, '')) LIKE '%' || v_search || '%'
            OR lower(COALESCE(u.email, '')) LIKE '%' || v_search || '%'
            OR EXISTS (
              SELECT 1
              FROM TEXTs ur
              LEFT JOIN roles r ON r.id = ur.role_id
              WHERE ur.user_id = u.id
                AND ur.revoked_at IS NULL
                AND (
                  lower(COALESCE(r.name, '')) LIKE '%' || v_search || '%'
                  OR lower(COALESCE(r.key, ur.role::text, '')) LIKE '%' || v_search || '%'
                )
            )
            OR EXISTS (
              SELECT 1
              FROM user_institutions ui
              JOIN institutions i ON i.id = ui.institution_id
              WHERE ui.user_id = u.id
                AND ui.revoked_at IS NULL
                AND lower(COALESCE(i.name, '')) LIKE '%' || v_search || '%'
            )
          )
      ), 0),
    'institutions',
      COALESCE((
        SELECT TEXT_agg(to_TEXT(i) ORDER BY i.name)
        FROM institutions i
        WHERE i.deleted_at IS NULL
          AND (
            current_user_role() = 'superadmin'
            OR user_has_institution_access(i.id)
          )
      ), '[]'::TEXT),
    'users',
      COALESCE((
        SELECT TEXT_agg(TEXT_build_object(
          'id', u.id,
          'auth_user_id', u.auth_user_id,
          'email', u.email,
          'full_name', u.full_name,
          'phone', u.phone,
          'primary_institution_id', u.primary_institution_id,
          'is_active', u.is_active,
          'auth_status', u.auth_status,
          'roles', COALESCE((
            SELECT TEXT_agg(TEXT_build_object(
              'role_key', r.key,
              'role_name', r.name,
              'institution_id', ur.institution_id,
              'revoked_at', ur.revoked_at
            ) ORDER BY r.key)
            FROM TEXTs ur
            LEFT JOIN roles r ON r.id = ur.role_id
            WHERE ur.user_id = u.id
              AND ur.revoked_at IS NULL
          ), '[]'::TEXT),
          'institution_ids', COALESCE((
            SELECT TEXT_agg(ui.institution_id ORDER BY ui.institution_id)
            FROM user_institutions ui
            WHERE ui.user_id = u.id
              AND ui.revoked_at IS NULL
          ), '[]'::TEXT)
        ) ORDER BY u.full_name)
        FROM (
          SELECT u.*
          FROM users u
          WHERE u.deleted_at IS NULL
            AND (v_actor = v_root_superadmin OR u.id <> v_root_superadmin)
            AND (
              current_user_role() IN ('superadmin', 'admin', 'auditor')
              OR u.primary_institution_id = ANY(current_user_institution_ids())
              OR EXISTS (
                SELECT 1
                FROM user_institutions ui
                WHERE ui.user_id = u.id
                  AND ui.revoked_at IS NULL
                  AND ui.institution_id = ANY(current_user_institution_ids())
              )
            )
            AND (
              v_search = ''
              OR lower(COALESCE(u.full_name, '')) LIKE '%' || v_search || '%'
              OR lower(COALESCE(u.email, '')) LIKE '%' || v_search || '%'
              OR EXISTS (
                SELECT 1
                FROM TEXTs ur
                LEFT JOIN roles r ON r.id = ur.role_id
                WHERE ur.user_id = u.id
                  AND ur.revoked_at IS NULL
                  AND (
                    lower(COALESCE(r.name, '')) LIKE '%' || v_search || '%'
                    OR lower(COALESCE(r.key, ur.role::text, '')) LIKE '%' || v_search || '%'
                  )
              )
              OR EXISTS (
                SELECT 1
                FROM user_institutions ui
                JOIN institutions i ON i.id = ui.institution_id
                WHERE ui.user_id = u.id
                  AND ui.revoked_at IS NULL
                  AND lower(COALESCE(i.name, '')) LIKE '%' || v_search || '%'
              )
            )
          ORDER BY u.full_name
          LIMIT v_limit
        ) u
      ), '[]'::TEXT),
    'roles',
      COALESCE((
        SELECT TEXT_agg(TEXT_build_object(
          'id', r.id,
          'key', r.key,
          'name', r.name,
          'description', r.description,
          'institution_id', r.institution_id,
          'is_system', r.is_system,
          'is_active', r.is_active,
          'scope_label', CASE WHEN r.institution_id IS NULL THEN 'Global' ELSE 'Por instituicao' END,
          'assignable',
            CASE
              WHEN r.key = 'superadmin' THEN false
              WHEN current_user_role() = 'superadmin' THEN true
              WHEN current_user_role() = 'admin' THEN r.key IN ('admin', 'medico', 'recepcao', 'auditor', 'paciente')
              ELSE false
            END,
          'permissions_editable', current_user_role() = 'superadmin' AND r.key <> 'superadmin',
          'operational_summary', role_operational_summary(r.key)
        ) ORDER BY r.key)
        FROM roles r
        WHERE r.deleted_at IS NULL
          AND (
            r.institution_id IS NULL
            OR current_user_role() = 'superadmin'
            OR user_has_institution_access(r.institution_id)
          )
      ), '[]'::TEXT),
    'permissions',
      COALESCE((
        SELECT TEXT_agg(to_TEXT(p) ORDER BY p.resource, p.action)
        FROM permissions p
        WHERE p.deleted_at IS NULL
          AND (
            p.institution_id IS NULL
            OR current_user_role() = 'superadmin'
            OR user_has_institution_access(p.institution_id)
          )
      ), '[]'::TEXT),
    'role_permissions',
      COALESCE((
        SELECT TEXT_agg(TEXT_build_object(
          'role_id', rp.role_id,
          'permission_id', rp.permission_id,
          'institution_id', rp.institution_id,
          'revoked_at', rp.revoked_at
        ))
        FROM role_permissions rp
        JOIN roles r ON r.id = rp.role_id
        WHERE rp.revoked_at IS NULL
          AND (
            r.institution_id IS NULL
            OR current_user_role() = 'superadmin'
            OR user_has_institution_access(r.institution_id)
          )
      ), '[]'::TEXT),
    'user_permissions',
      COALESCE((
        SELECT TEXT_agg(TEXT_build_object(
          'user_id', up.user_id,
          'permission_id', up.permission_id,
          'institution_id', up.institution_id,
          'revoked_at', up.revoked_at
        ) ORDER BY up.user_id, up.permission_id)
        FROM user_permissions up
        WHERE up.revoked_at IS NULL
          AND (
            up.user_id = v_actor
            OR current_user_role() = 'superadmin'
            OR user_has_permission('permissions', 'read', up.institution_id)
          )
      ), '[]'::TEXT)
  );
END;
$$;

CREATE OR REPLACE FUNCTION upsert_institution(
  p_institution_id TEXT DEFAULT NULL,
  p_name text DEFAULT NULL,
  p_cnpj text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_address text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_state text DEFAULT NULL,
  p_is_active INTEGER DEFAULT true,
  p_idempotency_key text DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user TEXT;
  v_institution institutions%ROWTYPE;
  v_existing TEXT;
  v_response TEXT;
BEGIN
  v_user := assert_authenticated();
  v_existing := find_idempotent_response('upsert_institution', p_idempotency_key);
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  PERFORM set_config('app.admin_operation', 'upsert_institution', true);

  IF p_institution_id IS NULL THEN
    PERFORM require_permission('institutions', 'create', NULL);

    INSERT INTO institutions (name, cnpj, email, phone, address, city, state, is_active)
    VALUES (
      normalize_text(p_name, 180),
      NULLIF(normalize_cnpj(p_cnpj), ''),
      NULLIF(normalize_email(p_email), ''),
      NULLIF(normalize_phone(p_phone), ''),
      normalize_text(p_address, 500),
      normalize_text(p_city, 120),
      CASE WHEN normalize_text(p_state, 2) IS NULL THEN NULL ELSE upper(normalize_text(p_state, 2)) END,
      COALESCE(p_is_active, true)
    )
    RETURNING * INTO v_institution;
  ELSE
    PERFORM require_permission('institutions', 'update', p_institution_id);

    UPDATE institutions
    SET name = COALESCE(normalize_text(p_name, 180), name),
        cnpj = COALESCE(NULLIF(normalize_cnpj(p_cnpj), ''), cnpj),
        email = COALESCE(NULLIF(normalize_email(p_email), ''), email),
        phone = COALESCE(NULLIF(normalize_phone(p_phone), ''), phone),
        address = COALESCE(normalize_text(p_address, 500), address),
        city = COALESCE(normalize_text(p_city, 120), city),
        state = COALESCE(CASE WHEN normalize_text(p_state, 2) IS NULL THEN NULL ELSE upper(normalize_text(p_state, 2)) END, state),
        is_active = COALESCE(p_is_active, is_active),
        updated_at = now()
    WHERE id = p_institution_id
      AND deleted_at IS NULL
    RETURNING * INTO v_institution;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Instituicao nao encontrada';
    END IF;
  END IF;

  INSERT INTO clinical_events (institution_id, aggregate_table, aggregate_id, event_type, payload, created_by)
  VALUES (v_institution.id, 'institutions', v_institution.id, 'access.institution_upserted', to_TEXT(v_institution), v_user);

  v_response := TEXT_build_object('success', true, 'institution', to_TEXT(v_institution));
  RETURN remember_idempotent_response('upsert_institution', p_idempotency_key, v_institution.id, v_response);
END;
$$;

DROP FUNCTION IF EXISTS create_user(text, text, text, text, TEXT, TEXT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION create_user(
  p_email text,
  p_full_name text,
  p_phone text DEFAULT NULL,
  p_role_key text DEFAULT 'recepcao',
  p_institution_ids TEXT DEFAULT ARRAY[]::TEXT,
  p_primary_institution_id TEXT DEFAULT NULL,
  p_auth_user_id TEXT DEFAULT NULL,
  p_metadata TEXT DEFAULT '{}'::TEXT,
  p_idempotency_key text DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor TEXT;
  v_user_id TEXT;
  v_primary TEXT;
  v_role roles%ROWTYPE;
  v_legacy_role TEXT;
  v_auth_exists INTEGER;
  v_target_institution TEXT;
  v_role_institutions TEXT;
  v_reception_scope_count integer;
  v_existing TEXT;
  v_response TEXT;
BEGIN
  v_actor := assert_authenticated();
  v_existing := find_idempotent_response('create_user', p_idempotency_key);

  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  v_primary := COALESCE(p_primary_institution_id, p_institution_ids[1]);

  IF p_role_key NOT IN ('superadmin', 'admin', 'auditor', 'medico') AND v_primary IS NULL THEN
    RAISE EXCEPTION 'Instituicao principal obrigatoria para role %', p_role_key;
  END IF;

  PERFORM require_permission('users', 'create', v_primary);

  SELECT * INTO v_role
  FROM roles
  WHERE key = p_role_key
    AND deleted_at IS NULL
    AND is_active = true
    AND (institution_id IS NULL OR institution_id = v_primary)
  ORDER BY institution_id NULLS FIRST
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Role inexistente ou inativa: %', p_role_key;
  END IF;

  IF p_role_key = 'superadmin' AND current_user_role() <> 'superadmin' THEN
    RAISE EXCEPTION 'Somente superadmin pode criar outro superadmin';
  END IF;

  FOREACH v_target_institution IN ARRAY COALESCE(p_institution_ids, ARRAY[]::TEXT) LOOP
    IF current_user_role() <> 'superadmin' AND user_has_institution_access(v_target_institution) IS NOT TRUE THEN
      RAISE EXCEPTION 'Usuario sem acesso a instituicao %', v_target_institution;
    END IF;
  END LOOP;

  v_user_id := COALESCE(p_auth_user_id, gen_random_TEXT());
  v_auth_exists := p_auth_user_id IS NOT NULL AND EXISTS (SELECT 1 FROM auth.users au WHERE au.id = p_auth_user_id);

  IF p_auth_user_id IS NOT NULL AND v_auth_exists IS NOT TRUE THEN
    RAISE EXCEPTION 'auth_user_id informado nao existe em auth.users';
  END IF;

  IF p_role_key = ANY(enum_range(NULL::TEXT)::TEXT) THEN
    v_legacy_role := p_role_key::TEXT;
  ELSE
    v_legacy_role := NULL;
  END IF;

  INSERT INTO users (
    id,
    auth_user_id,
    email,
    full_name,
    phone,
    primary_institution_id,
    is_active,
    auth_status,
    metadata,
    created_by,
    updated_by
  )
  VALUES (
    v_user_id,
    p_auth_user_id,
    lower(btrim(p_email)),
    btrim(p_full_name),
    NULLIF(btrim(p_phone), ''),
    v_primary,
    true,
    CASE WHEN v_auth_exists THEN 'active' ELSE 'pending_auth' END,
    COALESCE(p_metadata, '{}'::TEXT),
    v_actor,
    v_actor
  )
  ON CONFLICT (id) DO UPDATE
  SET auth_user_id = COALESCE(users.auth_user_id, EXCLUDED.auth_user_id),
      email = EXCLUDED.email,
      full_name = EXCLUDED.full_name,
      phone = EXCLUDED.phone,
      primary_institution_id = EXCLUDED.primary_institution_id,
      is_active = true,
      auth_status = EXCLUDED.auth_status,
      metadata = users.metadata || EXCLUDED.metadata,
      deleted_at = NULL,
      deleted_by = NULL,
      updated_by = v_actor,
      updated_at = now();

  IF v_auth_exists THEN
    PERFORM set_config('app.access_operation', 'create_user', true);

    INSERT INTO profiles (id, email, first_name, last_name, role, phone, institution_id, is_active)
    VALUES (
      v_user_id,
      lower(btrim(p_email)),
      split_part(btrim(p_full_name), ' ', 1),
      btrim(substr(btrim(p_full_name), length(split_part(btrim(p_full_name), ' ', 1)) + 1)),
      COALESCE(v_legacy_role, 'paciente'::TEXT),
      NULLIF(btrim(p_phone), ''),
      v_primary,
      true
    )
    ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        role = COALESCE(EXCLUDED.role, profiles.role),
        phone = EXCLUDED.phone,
        institution_id = EXCLUDED.institution_id,
        is_active = true,
        deleted_at = NULL,
        deleted_by = NULL;
  END IF;

  UPDATE TEXTs ur
  SET revoked_at = now(),
      revoked_by = v_actor
  WHERE ur.user_id = v_user_id
    AND ur.revoked_at IS NULL
    AND (
      ur.role::text IN ('superadmin', 'admin', 'auditor', 'medico', 'recepcao', 'paciente')
      OR EXISTS (
        SELECT 1
        FROM roles structural_role
        WHERE structural_role.id = ur.role_id
          AND structural_role.key IN ('superadmin', 'admin', 'auditor', 'medico', 'recepcao', 'paciente')
      )
    );

  FOREACH v_target_institution IN ARRAY COALESCE(p_institution_ids, ARRAY[]::TEXT) LOOP
    INSERT INTO user_institutions (user_id, institution_id, created_by)
    VALUES (v_user_id, v_target_institution, v_actor)
    ON CONFLICT (user_id, institution_id)
    DO UPDATE SET 
  END LOOP;

  IF p_role_key IN ('superadmin', 'admin', 'auditor') THEN
    INSERT INTO TEXTs (user_id, role_id, role, institution_id, granted_by)
    VALUES (v_user_id, v_role.id, v_legacy_role, NULL, v_actor)
    ON CONFLICT (user_id, role_id, institution_id) WHERE role_id IS NOT NULL
    DO UPDATE SET revoked_at = NULL, revoked_by = NULL, 
  ELSE
    v_role_institutions := COALESCE(
      CASE
        WHEN array_length(p_institution_ids, 1) IS NULL OR array_length(p_institution_ids, 1) = 0 THEN ARRAY[v_primary]
        ELSE p_institution_ids
      END,
      ARRAY[v_primary]
    );

    FOREACH v_target_institution IN ARRAY v_role_institutions LOOP
      CONTINUE WHEN v_target_institution IS NULL;

      INSERT INTO TEXTs (user_id, role_id, role, institution_id, granted_by)
      VALUES (v_user_id, v_role.id, v_legacy_role, v_target_institution, v_actor)
      ON CONFLICT (user_id, role_id, institution_id) WHERE role_id IS NOT NULL
      DO UPDATE SET revoked_at = NULL, revoked_by = NULL, 
    END LOOP;
  END IF;

  INSERT INTO clinical_events (institution_id, aggregate_table, aggregate_id, event_type, payload, idempotency_key, created_by)
  VALUES (v_primary, 'users', v_user_id, 'access.user_created', TEXT_build_object('email', lower(btrim(p_email)), 'role', p_role_key), p_idempotency_key, v_actor)
  ON CONFLICT (institution_id, idempotency_key) DO NOTHING;

  v_response := TEXT_build_object('success', true, 'user_id', v_user_id, 'auth_status', CASE WHEN v_auth_exists THEN 'active' ELSE 'pending_auth' END);
  RETURN remember_idempotent_response('create_user', p_idempotency_key, v_primary, v_response);
END;
$$;

DROP FUNCTION IF EXISTS assign_role(TEXT, text, TEXT, INTEGER);
CREATE OR REPLACE FUNCTION assign_role(
  p_user_id TEXT,
  p_role_key text,
  p_institution_id TEXT DEFAULT NULL,
  p_revoke INTEGER DEFAULT false,
  p_idempotency_key text DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor TEXT;
  v_role roles%ROWTYPE;
  v_legacy_role TEXT;
  v_existing TEXT;
  v_response TEXT;
BEGIN
  v_actor := assert_authenticated();
  v_existing := find_idempotent_response('assign_role', p_idempotency_key);
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  IF p_role_key = 'superadmin' AND current_user_role() <> 'superadmin' THEN
    RAISE EXCEPTION 'Somente superadmin pode atribuir superadmin';
  END IF;

  IF p_role_key = 'superadmin' THEN
    PERFORM require_permission('roles', 'update', NULL);
  ELSE
    PERFORM require_permission('user_roles', 'update', p_institution_id);
  END IF;

  SELECT * INTO v_role
  FROM roles
  WHERE key = p_role_key
    AND deleted_at IS NULL
    AND is_active = true
    AND (institution_id IS NULL OR institution_id = p_institution_id)
  ORDER BY institution_id NULLS FIRST
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Role inexistente: %', p_role_key;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM users u WHERE u.id = p_user_id AND u.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Usuario inexistente';
  END IF;

  IF p_role_key = ANY(enum_range(NULL::TEXT)::TEXT) THEN
    v_legacy_role := p_role_key::TEXT;
  ELSE
    v_legacy_role := NULL;
  END IF;

  INSERT INTO TEXTs (user_id, role_id, role, institution_id, granted_by, revoked_at, revoked_by)
  VALUES (
    p_user_id,
    v_role.id,
    v_legacy_role,
    CASE WHEN p_role_key IN ('superadmin', 'admin', 'auditor') THEN NULL ELSE p_institution_id END,
    v_actor,
    CASE WHEN p_revoke THEN now() ELSE NULL END,
    CASE WHEN p_revoke THEN v_actor ELSE NULL END
  )
  ON CONFLICT (user_id, role_id, institution_id) WHERE role_id IS NOT NULL
  DO UPDATE SET revoked_at = CASE WHEN p_revoke THEN now() ELSE NULL END,
                revoked_by = CASE WHEN p_revoke THEN v_actor ELSE NULL END,
                granted_by = CASE WHEN p_revoke THEN TEXTs.granted_by ELSE v_actor END,

  IF p_revoke IS NOT TRUE AND v_legacy_role IS NOT NULL THEN
    PERFORM set_config('app.access_operation', 'assign_role', true);

    UPDATE profiles
    SET role = v_legacy_role,
        institution_id = CASE
          WHEN p_role_key IN ('superadmin', 'admin', 'auditor') THEN NULL
          ELSE COALESCE(p_institution_id, institution_id)
        END,
        is_active = true,
        updated_at = now()
    WHERE id = p_user_id;
  END IF;

  INSERT INTO clinical_events (institution_id, aggregate_table, aggregate_id, event_type, payload, idempotency_key, created_by)
  VALUES (
    p_institution_id,
    'user_roles',
    p_user_id,
    CASE WHEN p_revoke THEN 'access.role_revoked' ELSE 'access.role_assigned' END,
    TEXT_build_object('user_id', p_user_id, 'role_key', p_role_key, 'institution_id', p_institution_id, 'revoked', p_revoke),
    p_idempotency_key,
    v_actor
  )
  ON CONFLICT (institution_id, idempotency_key) DO NOTHING;

  v_response := TEXT_build_object('success', true, 'user_id', p_user_id, 'role_key', p_role_key, '
  RETURN remember_idempotent_response('assign_role', p_idempotency_key, p_institution_id, v_response);
END;
$$;

DROP FUNCTION IF EXISTS link_user_institution(TEXT, TEXT, INTEGER);
CREATE OR REPLACE FUNCTION link_user_institution(
  p_user_id TEXT,
  p_institution_id TEXT,
  p_revoke INTEGER DEFAULT false,
  p_idempotency_key text DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor TEXT;
  v_existing TEXT;
  v_response TEXT;
BEGIN
  v_actor := assert_authenticated();
  v_existing := find_idempotent_response('link_user_institution', p_idempotency_key);
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  PERFORM require_permission('user_institutions', 'update', p_institution_id);

  IF NOT EXISTS (SELECT 1 FROM users u WHERE u.id = p_user_id AND u.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Usuario inexistente';
  END IF;

  IF current_user_role() <> 'superadmin' AND user_has_institution_access(p_institution_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Usuario sem acesso a instituicao';
  END IF;

  IF p_revoke IS NOT TRUE
     AND EXISTS (
       SELECT 1
       FROM TEXTs ur
       LEFT JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id = p_user_id
         AND ur.revoked_at IS NULL
         AND COALESCE(r.key, ur.role::text) = 'superadmin'
     ) THEN
    RAISE EXCEPTION 'Superadmin possui escopo global e nao deve receber vinculo institucional direto';
  END IF;

  INSERT INTO user_institutions (user_id, institution_id, created_by, revoked_at, revoked_by)
  VALUES (
    p_user_id,
    p_institution_id,
    v_actor,
    CASE WHEN p_revoke THEN now() ELSE NULL END,
    CASE WHEN p_revoke THEN v_actor ELSE NULL END
  )
  ON CONFLICT (user_id, institution_id)
  DO UPDATE SET revoked_at = CASE WHEN p_revoke THEN now() ELSE NULL END,

  INSERT INTO clinical_events (institution_id, aggregate_table, aggregate_id, event_type, payload, idempotency_key, created_by)
  VALUES (
    p_institution_id,
    'user_institutions',
    p_user_id,
    CASE WHEN p_revoke THEN 'access.user_institution_revoked' ELSE 'access.user_institution_linked' END,
    TEXT_build_object('user_id', p_user_id, 'institution_id', p_institution_id, 'revoked', p_revoke),
    p_idempotency_key,
    v_actor
  )
  ON CONFLICT (institution_id, idempotency_key) DO NOTHING;

  v_response := TEXT_build_object('success', true, 'user_id', p_user_id, 'institution_id', p_institution_id, '
  RETURN remember_idempotent_response('link_user_institution', p_idempotency_key, p_institution_id, v_response);
END;
$$;

DROP FUNCTION IF EXISTS update_permissions(text, TEXT, TEXT);
CREATE OR REPLACE FUNCTION update_permissions(
  p_role_key text,
  p_permissions TEXT,
  p_institution_id TEXT DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor TEXT;
  v_role roles%ROWTYPE;
  v_item TEXT;
  v_permission_id TEXT;
  v_resource text;
  v_action text;
  v_enabled INTEGER;
  v_existing TEXT;
  v_response TEXT;
BEGIN
  v_actor := assert_authenticated();
  v_existing := find_idempotent_response('update_permissions', p_idempotency_key);
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  PERFORM require_permission('permissions', 'manage', p_institution_id);

  IF p_role_key IN ('superadmin', 'admin') AND current_user_role() <> 'superadmin' THEN
    RAISE EXCEPTION 'Somente superadmin pode alterar permissoes estruturais';
  END IF;

  SELECT * INTO v_role
  FROM roles
  WHERE key = p_role_key
    AND deleted_at IS NULL
    AND (institution_id IS NULL OR institution_id = p_institution_id)
  ORDER BY institution_id NULLS FIRST
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Role inexistente: %', p_role_key;
  END IF;

  PERFORM set_config('app.access_operation', 'update_permissions', true);

  FOR v_item IN SELECT value FROM TEXT_array_elements(COALESCE(p_permissions, '[]'::TEXT)) LOOP
    v_resource := lower(btrim(v_item ->> 'resource'));
    v_action := lower(btrim(v_item ->> 'action'));
    v_enabled := COALESCE((v_item ->> 'enabled')::INTEGER, true);

    IF v_resource = '' OR v_action NOT IN (
      'create', 'read', 'update', 'delete', 'manage',
      'append', 'execute', 'approve', 'export',
      'cancel', 'reschedule', 'start', 'finalize', 'send', 'configure'
    ) THEN
      RAISE EXCEPTION 'Permissao invalida: %.%', v_resource, v_action;
    END IF;

    IF v_enabled
       AND COALESCE((permission_semantic_state(v_resource, v_action)->>'applicable')::INTEGER, false) IS NOT TRUE THEN
      RAISE EXCEPTION 'Permissao sem aplicabilidade operacional: %.%', v_resource, v_action;
    END IF;

    IF v_enabled
       AND COALESCE((permission_guardrail_state(p_role_key, v_resource, v_action)->>'denied')::INTEGER, false) THEN
      RAISE EXCEPTION 'Permissao bloqueada por regra estrutural: %.%', v_resource, v_action;
    END IF;

    INSERT INTO permissions (institution_id, resource, action, description)
    VALUES (p_institution_id, v_resource, v_action, initcap(v_resource) || ' / ' || v_action)
    ON CONFLICT DO NOTHING;

    SELECT p.id INTO v_permission_id
    FROM permissions p
    WHERE p.resource = v_resource
      AND p.action = v_action
      AND p.deleted_at IS NULL
      AND (p.institution_id IS NOT DISTINCT FROM p_institution_id OR p.institution_id IS NULL)
    ORDER BY p.institution_id NULLS LAST
    LIMIT 1;

    INSERT INTO role_permissions (role_id, permission_id, institution_id, granted_by, revoked_at, revoked_by)
    VALUES (
      v_role.id,
      v_permission_id,
      p_institution_id,
      v_actor,
      CASE WHEN v_enabled THEN NULL ELSE now() END,
      CASE WHEN v_enabled THEN NULL ELSE v_actor END
    )
    ON CONFLICT (role_id, permission_id, institution_id)
    DO UPDATE SET revoked_at = CASE WHEN v_enabled THEN NULL ELSE now() END,
                  revoked_by = CASE WHEN v_enabled THEN NULL ELSE v_actor END,
                  granted_by = CASE WHEN v_enabled THEN v_actor ELSE role_permissions.granted_by END,
                  
  END LOOP;

  INSERT INTO clinical_events (institution_id, aggregate_table, aggregate_id, event_type, payload, idempotency_key, created_by)
  VALUES (
    p_institution_id,
    'role_permissions',
    v_role.id,
    'access.permissions_updated',
    TEXT_build_object('role_key', p_role_key, 'permissions', COALESCE(p_permissions, '[]'::TEXT)),
    p_idempotency_key,
    v_actor
  )
  ON CONFLICT (institution_id, idempotency_key) DO NOTHING;

  v_response := TEXT_build_object('success', true, 'role_key', p_role_key);
  RETURN remember_idempotent_response('update_permissions', p_idempotency_key, p_institution_id, v_response);
END;
$$;

CREATE OR REPLACE FUNCTION get_user_effective_permissions(
  p_user_id TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor TEXT;
  v_target_primary TEXT;
  v_payload TEXT;
BEGIN
  v_actor := assert_authenticated();

  SELECT COALESCE(u.primary_institution_id, pr.institution_id)
  INTO v_target_primary
  FROM users u
  FULL JOIN profiles pr ON pr.id = u.id
  WHERE COALESCE(u.id, pr.id) = p_user_id
    AND COALESCE(u.deleted_at, pr.deleted_at) IS NULL
  LIMIT 1;

  IF p_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM users u WHERE u.id = p_user_id AND u.deleted_at IS NULL
    UNION ALL
    SELECT 1 FROM profiles pr WHERE pr.id = p_user_id AND pr.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Usuario inexistente';
  END IF;

  PERFORM assert_can_access(
    'users',
    'read',
    TEXT_build_object('institution_id', v_target_primary, 'owner_user_id', p_user_id)
  );

  IF v_actor IS DISTINCT FROM p_user_id
     AND current_user_role() NOT IN ('superadmin', 'admin')
     AND user_has_permission('users', 'read', v_target_primary) IS NOT TRUE THEN
    RAISE EXCEPTION 'Permissao negada para consultar permissoes efetivas';
  END IF;

  WITH permission_rows AS (
    SELECT
      r.id AS role_id,
      r.key AS role_key,
      r.name AS role_name,
      p.id AS permission_id,
      p.resource,
      p.action,
      COALESCE(rp.institution_id, p.institution_id, ur.institution_id) AS scope_institution_id,
      'role_permission'::text AS origin,
      CASE
        WHEN r.key IN ('superadmin', 'admin', 'auditor')
          AND COALESCE(rp.institution_id, p.institution_id, ur.institution_id) IS NULL THEN 'global'
        WHEN r.key = 'paciente' THEN 'own'
        WHEN r.key = 'medico' AND p.resource IN ('encounters', 'medical_records') THEN 'owner'
        WHEN COALESCE(rp.institution_id, p.institution_id, ur.institution_id) IS NOT NULL THEN 'institution'
        WHEN r.key IN ('medico', 'recepcao') THEN 'institution'
        ELSE 'global'
      END AS scope,
      permission_guardrail_state(r.key, p.resource, p.action) AS guardrail,
      permission_semantic_state(p.resource, p.action) AS semantic_state,
      user_has_permission_for(p_user_id, p.resource, p.action, COALESCE(rp.institution_id, p.institution_id, ur.institution_id)) AS simulated_allowed
    FROM TEXTs ur
    JOIN roles r ON r.id = ur.role_id OR r.key = ur.role::text
    JOIN role_permissions rp ON rp.role_id = r.id AND rp.revoked_at IS NULL
    JOIN permissions p ON p.id = rp.permission_id
    WHERE ur.user_id = p_user_id
      AND ur.revoked_at IS NULL
      AND r.is_active = true
      AND r.deleted_at IS NULL
      AND p.is_active = true
      AND p.deleted_at IS NULL

    UNION ALL

    SELECT
      NULL::TEXT AS role_id,
      'individual'::text AS role_key,
      'Permissao individual'::text AS role_name,
      p.id AS permission_id,
      p.resource,
      p.action,
      COALESCE(up.institution_id, p.institution_id, v_target_primary) AS scope_institution_id,
      'user_permission'::text AS origin,
      CASE
        WHEN COALESCE(up.institution_id, p.institution_id, v_target_primary) IS NOT NULL THEN 'institution'
        ELSE 'global'
      END AS scope,
      permission_guardrail_state(COALESCE((
        SELECT r.key
        FROM TEXTs ur
        JOIN roles r ON r.id = ur.role_id OR r.key = ur.role::text
        WHERE ur.user_id = p_user_id
          AND ur.revoked_at IS NULL
          AND r.is_active = true
          AND r.deleted_at IS NULL
        ORDER BY
          CASE r.key
            WHEN 'superadmin' THEN 1
            WHEN 'admin' THEN 2
            WHEN 'medico' THEN 3
            WHEN 'recepcao' THEN 4
            WHEN 'auditor' THEN 5
            WHEN 'paciente' THEN 6
            ELSE 99
          END
        LIMIT 1
      ), 'paciente'), p.resource, p.action) AS guardrail,
      permission_semantic_state(p.resource, p.action) AS semantic_state,
      user_has_permission_for(p_user_id, p.resource, p.action, COALESCE(up.institution_id, p.institution_id, v_target_primary)) AS simulated_allowed
    FROM user_permissions up
    JOIN permissions p ON p.id = up.permission_id
    WHERE up.user_id = p_user_id
      AND up.revoked_at IS NULL
      AND p.is_active = true
      AND p.deleted_at IS NULL
  )
  SELECT TEXT_build_object(
    'user', (
      SELECT TEXT_build_object(
        'id', COALESCE(u.id, pr.id),
        'email', COALESCE(u.email, pr.email),
        'full_name', COALESCE(u.full_name, pr.full_name),
        'primary_institution_id', COALESCE(u.primary_institution_id, pr.institution_id),
        'is_active', COALESCE(u.is_active, pr.is_active, false)
      )
      FROM users u
      FULL JOIN profiles pr ON pr.id = u.id
      WHERE COALESCE(u.id, pr.id) = p_user_id
      LIMIT 1
    ),
    'permissions', COALESCE((
      SELECT TEXT_agg(
        TEXT_build_object(
          'role_id', role_id,
          'role_key', role_key,
          'role_name', role_name,
          'permission_id', permission_id,
          'resource', resource,
          'resource_label', permission_resource_label(resource),
          'action', action,
          'action_label', permission_action_label(action),
          'scope', scope,
          'scope_label', permission_scope_label(scope),
          'institution_id', scope_institution_id,
          'origin', origin,
          'applicable', COALESCE((semantic_state->>'applicable')::INTEGER, false),
          'semantic_reason', semantic_state->>'reason',
          'effective_allowed',
            simulated_allowed
            AND COALESCE((guardrail->>'denied')::INTEGER, false) = false
            AND COALESCE((semantic_state->>'applicable')::INTEGER, false) = true,
          'blocked_by_guardrail', COALESCE((guardrail->>'denied')::INTEGER, false),
          'guardrail_status', CASE WHEN COALESCE((guardrail->>'denied')::INTEGER, false) THEN 'denied_by_guardrail' ELSE 'allowed' END,
          'guardrail_reason', guardrail->>'reason',
          'enforcement', TEXT_build_array('role_permissions', 'user_has_permission', 'can_access', 'RLS/RPC')
        )
        ORDER BY resource, action, role_key, scope
      )
      FROM permission_rows
    ), '[]'::TEXT),
    'rls_policies', COALESCE((
      SELECT TEXT_agg(TEXT_build_object(
        'table', pol.tablename,
        'policy', pol.policyname,
        'command', pol.cmd
      ) ORDER BY pol.tablename, pol.policyname)
      FROM pg_policies pol
      WHERE pol.schemaname = 'public'
    ), '[]'::TEXT)
  )
  INTO v_payload;

  RETURN v_payload;
END;
$$;

CREATE OR REPLACE FUNCTION get_permissions_matrix()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor TEXT;
  v_payload TEXT;
BEGIN
  v_actor := assert_authenticated();

  IF user_has_permission('permissions', 'read', current_user_primary_institution()) IS NOT TRUE
     AND user_has_permission('permissions', 'manage', current_user_primary_institution()) IS NOT TRUE THEN
    RAISE EXCEPTION 'Permissao negada para consultar matriz de permissoes';
  END IF;

  WITH function_defs AS (
    SELECT
      p.oid,
      p.proname,
      pg_get_function_identity_arguments(p.oid) AS args,
      COALESCE(p.prosrc, '') AS definition
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname ~ '^(api_|list_|get_|upsert_|set_|assign_|link_|update_|grant_|revoke_|generate_|validate_|queue_|claim_|complete_|record_)'
  ),
  policy_defs AS (
    SELECT
      pol.tablename,
      pol.policyname,
      pol.cmd,
      COALESCE(pol.qual, '') || ' ' || COALESCE(pol.with_check, '') AS definition
    FROM pg_policies pol
    WHERE pol.schemaname = 'public'
  ),
  permission_catalog AS (
    SELECT
      p.id,
      p.resource,
      p.action,
      p.institution_id,
      permission_semantic_state(p.resource, p.action) AS semantic_state
    FROM permissions p
    WHERE p.deleted_at IS NULL
      AND p.is_active = true
      AND COALESCE((permission_semantic_state(p.resource, p.action)->>'applicable')::INTEGER, false) = true
  ),
  permission_usage AS (
    SELECT
      p.id AS permission_id,
      EXISTS (
        SELECT 1
        FROM function_defs fd
        WHERE fd.definition ILIKE '%' || p.resource || '%'
          AND fd.definition ILIKE '%' || p.action || '%'
      ) AS used_by_function,
      COALESCE((
        SELECT TEXT_agg(fd.proname ORDER BY fd.proname)
        FROM function_defs fd
        WHERE fd.definition ILIKE '%' || p.resource || '%'
          AND fd.definition ILIKE '%' || p.action || '%'
      ), '[]'::TEXT) AS rpc_functions,
      EXISTS (
        SELECT 1
        FROM policy_defs pd
        WHERE pd.tablename = p.resource
          OR (
            pd.definition ILIKE '%' || p.resource || '%'
            AND pd.definition ILIKE '%' || p.action || '%'
          )
      ) AS used_by_policy
      ,
      COALESCE((
        SELECT TEXT_agg(TEXT_build_object('table', pd.tablename, 'policy', pd.policyname, 'command', pd.cmd) ORDER BY pd.tablename, pd.policyname)
        FROM policy_defs pd
        WHERE pd.tablename = p.resource
          OR (
            pd.definition ILIKE '%' || p.resource || '%'
            AND pd.definition ILIKE '%' || p.action || '%'
          )
      ), '[]'::TEXT) AS rls_policies
    FROM permission_catalog p
  ),
  matrix_rows AS (
    SELECT
      r.id AS role_id,
      r.key AS role_key,
      r.name AS role_name,
      p.id AS permission_id,
      p.resource,
      p.action,
      COALESCE(rp.institution_id, p.institution_id, r.institution_id) AS scope_institution_id,
      CASE
        WHEN r.key IN ('superadmin', 'admin', 'auditor')
          AND COALESCE(rp.institution_id, p.institution_id, r.institution_id) IS NULL THEN 'global'
        WHEN r.key = 'paciente' THEN 'own'
        WHEN r.key = 'medico' AND p.resource IN ('encounters', 'medical_records') THEN 'owner'
        WHEN COALESCE(rp.institution_id, p.institution_id, r.institution_id) IS NOT NULL THEN 'institution'
        WHEN r.key IN ('medico', 'recepcao') THEN 'institution'
        ELSE 'global'
      END AS scope,
      (rp.role_id IS NOT NULL AND rp.revoked_at IS NULL) AS granted,
      permission_guardrail_state(r.key, p.resource, p.action) AS guardrail,
      p.semantic_state,
      COALESCE(pu.used_by_function, false) AS used_by_function,
      COALESCE(pu.used_by_policy, false) AS used_by_policy,
      COALESCE(pu.rpc_functions, '[]'::TEXT) AS rpc_functions,
      COALESCE(pu.rls_policies, '[]'::TEXT) AS rls_policies
    FROM roles r
    CROSS JOIN permission_catalog p
    LEFT JOIN permission_usage pu ON pu.permission_id = p.id
    LEFT JOIN role_permissions rp
      ON rp.role_id = r.id
     AND rp.permission_id = p.id
     AND rp.revoked_at IS NULL
    WHERE r.deleted_at IS NULL
      AND r.is_active = true
  )
  SELECT TEXT_build_object(
    'generated_at', now(),
    'roles', COALESCE((
      SELECT TEXT_agg(TEXT_build_object(
        'id', r.id,
        'key', r.key,
        'name', r.name,
        'description', r.description,
        'institution_id', r.institution_id,
        'is_system', r.is_system,
        'is_active', r.is_active,
        'scope_label', CASE WHEN r.institution_id IS NULL THEN 'Global' ELSE 'Por instituicao' END,
        'assignable',
          CASE
            WHEN r.key = 'superadmin' THEN false
            WHEN current_user_role() = 'superadmin' THEN true
            WHEN current_user_role() = 'admin' THEN r.key IN ('admin', 'medico', 'recepcao', 'auditor', 'paciente')
            ELSE false
          END,
        'permissions_editable', current_user_role() = 'superadmin' AND r.key <> 'superadmin',
        'operational_summary', role_operational_summary(r.key)
      ) ORDER BY r.key)
      FROM roles r
      WHERE r.deleted_at IS NULL
        AND r.is_active = true
    ), '[]'::TEXT),
    'resources', COALESCE((
      SELECT TEXT_agg(DISTINCT p.resource ORDER BY p.resource)
      FROM permissions p
      WHERE p.deleted_at IS NULL
        AND p.is_active = true
    ), '[]'::TEXT),
    'actions', COALESCE((
      SELECT TEXT_agg(DISTINCT p.action ORDER BY p.action)
      FROM permissions p
      WHERE p.deleted_at IS NULL
        AND p.is_active = true
    ), '[]'::TEXT),
    'matrix', COALESCE((
      SELECT TEXT_agg(
        TEXT_build_object(
          'role_id', mr.role_id,
          'role_key', mr.role_key,
          'role_name', mr.role_name,
          'permission_id', mr.permission_id,
          'resource', mr.resource,
          'resource_label', permission_resource_label(mr.resource),
          'action', mr.action,
          'action_label', permission_action_label(mr.action),
          'scope', mr.scope,
          'scope_label', permission_scope_label(mr.scope),
          'institution_id', mr.scope_institution_id,
          'granted', mr.granted,
          'applicable', COALESCE((mr.semantic_state->>'applicable')::INTEGER, false),
          'semantic_reason', mr.semantic_state->>'reason',
          'effective_allowed',
            mr.granted
            AND COALESCE((mr.guardrail->>'denied')::INTEGER, false) = false
            AND COALESCE((mr.semantic_state->>'applicable')::INTEGER, false) = true,
          'blocked_by_guardrail', COALESCE((mr.guardrail->>'denied')::INTEGER, false),
          'editable',
            current_user_role() = 'superadmin'
            AND mr.role_key <> 'superadmin'
            AND COALESCE((mr.guardrail->>'denied')::INTEGER, false) = false
            AND COALESCE((mr.semantic_state->>'applicable')::INTEGER, false) = true,
          'locked', COALESCE((mr.guardrail->>'locked')::INTEGER, false),
          'guardrail_status', CASE WHEN COALESCE((mr.guardrail->>'denied')::INTEGER, false) THEN 'denied_by_guardrail' ELSE 'catalog_controlled' END,
          'guardrail_reason', mr.guardrail->>'reason',
          'source', CASE WHEN mr.granted THEN 'role_permission' ELSE 'not_granted' END,
          'used_by_function', mr.used_by_function,
          'used_by_policy', mr.used_by_policy,
          'rpc_functions', mr.rpc_functions,
          'rls_policies', mr.rls_policies
        )
        ORDER BY mr.role_key, mr.resource, mr.action
      )
      FROM matrix_rows mr
    ), '[]'::TEXT),
    'rls_policies', COALESCE((
      SELECT TEXT_agg(TEXT_build_object(
        'table', pd.tablename,
        'policy', pd.policyname,
        'command', pd.cmd
      ) ORDER BY pd.tablename, pd.policyname)
      FROM policy_defs pd
    ), '[]'::TEXT),
    'rpc_functions', COALESCE((
      SELECT TEXT_agg(TEXT_build_object(
        'name', fd.proname,
        'arguments', fd.args,
        'has_authorization_check',
          fd.definition ILIKE '%require_permission(%'
          OR fd.definition ILIKE '%assert_can_access(%'
          OR fd.definition ILIKE '%user_has_permission(%'
          OR fd.definition ILIKE '%can_access(%'
          OR fd.definition ILIKE '%assert_authenticated(%'
      ) ORDER BY fd.proname, fd.args)
      FROM function_defs fd
    ), '[]'::TEXT),
    'inconsistencies', TEXT_build_object(
      'permissions_without_detected_usage', COALESCE((
        SELECT TEXT_agg(TEXT_build_object('resource', resource, 'action', action) ORDER BY resource, action)
        FROM (
          SELECT DISTINCT resource, action
          FROM matrix_rows
          WHERE used_by_function IS FALSE
            AND used_by_policy IS FALSE
            AND COALESCE((guardrail->>'denied')::INTEGER, false) = false
            AND COALESCE((semantic_state->>'applicable')::INTEGER, false) = true
        ) unused_permissions
      ), '[]'::TEXT),
      'rpc_without_authorization_marker', COALESCE((
        SELECT TEXT_agg(TEXT_build_object('name', fd.proname, 'arguments', fd.args) ORDER BY fd.proname, fd.args)
        FROM function_defs fd
        WHERE fd.definition NOT ILIKE '%require_permission(%'
          AND fd.definition NOT ILIKE '%assert_can_access(%'
          AND fd.definition NOT ILIKE '%user_has_permission(%'
          AND fd.definition NOT ILIKE '%can_access(%'
          AND fd.definition NOT ILIKE '%assert_authenticated(%'
          AND fd.proname NOT IN ('get_permissions_matrix')
      ), '[]'::TEXT)
    )
  )
  INTO v_payload;

  RETURN v_payload;
END;
$$;

CREATE OR REPLACE FUNCTION grant_permission(
  p_role_id TEXT,
  p_permission_id TEXT,
  p_institution_id TEXT DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor TEXT;
  v_role roles%ROWTYPE;
  v_permission permissions%ROWTYPE;
  v_guardrail TEXT;
  v_existing TEXT;
  v_response TEXT;
BEGIN
  v_actor := assert_authenticated();
  v_existing := find_idempotent_response('
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  IF current_user_role() <> 'superadmin' THEN
    RAISE EXCEPTION 'Somente superadmin pode conceder permissoes';
  END IF;

  PERFORM assert_can_access(
    'permissions',
    'manage',
    TEXT_build_object('institution_id', p_institution_id)
  );

  SELECT * INTO v_role
  FROM roles
  WHERE id = p_role_id
    AND deleted_at IS NULL
    AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Perfil inexistente';
  END IF;

  IF v_role.key = 'superadmin' THEN
    RAISE EXCEPTION 'Permissoes de superadmin sao estruturais e nao editaveis';
  END IF;

  SELECT * INTO v_permission
  FROM permissions
  WHERE id = p_permission_id
    AND deleted_at IS NULL
    AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Permissao inexistente';
  END IF;

  IF COALESCE((permission_semantic_state(v_permission.resource, v_permission.action)->>'applicable')::INTEGER, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Permissao sem aplicabilidade operacional: %.%', v_permission.resource, v_permission.action;
  END IF;

  v_guardrail := permission_guardrail_state(v_role.key, v_permission.resource, v_permission.action);
  IF COALESCE((v_guardrail->>'denied')::INTEGER, false) THEN
    RAISE EXCEPTION 'Permissao bloqueada por regra estrutural: %', v_guardrail->>'reason';
  END IF;

  PERFORM set_config('app.access_operation', '

  INSERT INTO role_permissions (role_id, permission_id, institution_id, granted_by, revoked_at, revoked_by)
  VALUES (v_role.id, v_permission.id, p_institution_id, v_actor, NULL, NULL)
  ON CONFLICT (role_id, permission_id, institution_id)
  DO UPDATE SET revoked_at = NULL,
                revoked_by = NULL,
                granted_by = v_actor,

  INSERT INTO clinical_events (institution_id, aggregate_table, aggregate_id, event_type, payload, idempotency_key, created_by)
  VALUES (
    p_institution_id,
    'role_permissions',
    v_role.id,
    'access.permission_granted',
    TEXT_build_object('role_key', v_role.key, 'resource', v_permission.resource, 'action', v_permission.action),
    p_idempotency_key,
    v_actor
  );

  v_response := TEXT_build_object(
    'success', true,
    'role_id', v_role.id,
    'permission_id', v_permission.id,
    'resource', v_permission.resource,
    'action', v_permission.action,
    'granted', true
  );
  RETURN remember_idempotent_response('
END;
$$;

CREATE OR REPLACE FUNCTION revoke_permission(
  p_role_id TEXT,
  p_permission_id TEXT,
  p_institution_id TEXT DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor TEXT;
  v_role roles%ROWTYPE;
  v_permission permissions%ROWTYPE;
  v_existing TEXT;
  v_response TEXT;
BEGIN
  v_actor := assert_authenticated();
  v_existing := find_idempotent_response('
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  IF current_user_role() <> 'superadmin' THEN
    RAISE EXCEPTION 'Somente superadmin pode revogar permissoes';
  END IF;

  PERFORM assert_can_access(
    'permissions',
    'manage',
    TEXT_build_object('institution_id', p_institution_id)
  );

  SELECT * INTO v_role
  FROM roles
  WHERE id = p_role_id
    AND deleted_at IS NULL
    AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Perfil inexistente';
  END IF;

  IF v_role.key = 'superadmin' THEN
    RAISE EXCEPTION 'Permissoes de superadmin sao estruturais e nao editaveis';
  END IF;

  SELECT * INTO v_permission
  FROM permissions
  WHERE id = p_permission_id
    AND deleted_at IS NULL
    AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Permissao inexistente';
  END IF;

  PERFORM set_config('app.access_operation', '

  INSERT INTO role_permissions (role_id, permission_id, institution_id, granted_by, revoked_at, revoked_by)
  VALUES (v_role.id, v_permission.id, p_institution_id, v_actor, now(), v_actor)
  ON CONFLICT (role_id, permission_id, institution_id)
  DO UPDATE SET revoked_at = now(),

  INSERT INTO clinical_events (institution_id, aggregate_table, aggregate_id, event_type, payload, idempotency_key, created_by)
  VALUES (
    p_institution_id,
    'role_permissions',
    v_role.id,
    'access.permission_revoked',
    TEXT_build_object('role_key', v_role.key, 'resource', v_permission.resource, 'action', v_permission.action),
    p_idempotency_key,
    v_actor
  );

  v_response := TEXT_build_object(
    'success', true,
    'role_id', v_role.id,
    'permission_id', v_permission.id,
    'resource', v_permission.resource,
    'action', v_permission.action,
    'granted', false
  );
  RETURN remember_idempotent_response('
END;
$$;

CREATE OR REPLACE FUNCTION grant_user_permission(
  p_user_id TEXT,
  p_permission_id TEXT,
  p_institution_id TEXT DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor TEXT;
  v_permission permissions%ROWTYPE;
  v_target_role text;
  v_guardrail TEXT;
  v_existing TEXT;
  v_response TEXT;
  v_root_superadmin constant TEXT := 'e1610477-7e32-4dc7-88dc-39c84db49ede'::TEXT;
BEGIN
  v_actor := assert_authenticated();
  v_existing := find_idempotent_response('
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  IF current_user_role() <> 'superadmin' THEN
    RAISE EXCEPTION 'Somente superadmin pode conceder permissoes individuais';
  END IF;

  IF p_user_id = v_root_superadmin AND v_actor <> v_root_superadmin THEN
    RAISE EXCEPTION 'Usuario estrutural protegido nao pode receber permissao individual por este operador';
  END IF;

  PERFORM assert_can_access(
    'permissions',
    'manage',
    TEXT_build_object('institution_id', p_institution_id)
  );

  IF NOT EXISTS (
    SELECT 1
    FROM users u
    WHERE u.id = p_user_id
      AND u.deleted_at IS NULL
      AND u.is_active = true
  ) THEN
    RAISE EXCEPTION 'Usuario alvo inexistente ou inativo';
  END IF;

  SELECT *
  INTO v_permission
  FROM permissions
  WHERE id = p_permission_id
    AND deleted_at IS NULL
    AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Permissao inexistente';
  END IF;

  IF COALESCE((permission_semantic_state(v_permission.resource, v_permission.action)->>'applicable')::INTEGER, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Permissao sem aplicabilidade operacional: %.%', v_permission.resource, v_permission.action;
  END IF;

  SELECT r.key
  INTO v_target_role
  FROM TEXTs ur
  JOIN roles r ON r.id = ur.role_id OR r.key = ur.role::text
  WHERE ur.user_id = p_user_id
    AND ur.revoked_at IS NULL
    AND r.deleted_at IS NULL
    AND r.is_active = true
  ORDER BY
    CASE r.key
      WHEN 'superadmin' THEN 1
      WHEN 'admin' THEN 2
      WHEN 'medico' THEN 3
      WHEN 'recepcao' THEN 4
      WHEN 'auditor' THEN 5
      WHEN 'paciente' THEN 6
      ELSE 99
    END
  LIMIT 1;

  IF v_target_role IS NULL THEN
    RAISE EXCEPTION 'Usuario alvo sem perfil ativo';
  END IF;

  IF v_target_role = 'superadmin' THEN
    RAISE EXCEPTION 'Superadmin possui escopo global e nao recebe permissoes individuais';
  END IF;

  v_guardrail := permission_guardrail_state(v_target_role, v_permission.resource, v_permission.action);
  IF COALESCE((v_guardrail->>'denied')::INTEGER, false) THEN
    RAISE EXCEPTION 'Permissao individual bloqueada por regra estrutural: %', v_guardrail->>'reason';
  END IF;

  PERFORM set_config('app.access_operation', '

  INSERT INTO user_permissions (user_id, permission_id, institution_id, granted_by, revoked_at, revoked_by)
  VALUES (p_user_id, v_permission.id, p_institution_id, v_actor, NULL, NULL)
  ON CONFLICT (user_id, permission_id, institution_id)
  DO UPDATE SET revoked_at = NULL,
                revoked_by = NULL,
                granted_by = v_actor,

  INSERT INTO clinical_events (institution_id, aggregate_table, aggregate_id, event_type, payload, idempotency_key, created_by)
  VALUES (
    p_institution_id,
    'user_permissions',
    p_user_id,
    'access.user_permission_granted',
    TEXT_build_object('user_id', p_user_id, 'resource', v_permission.resource, 'action', v_permission.action),
    p_idempotency_key,
    v_actor
  )
  ON CONFLICT (institution_id, idempotency_key) DO NOTHING;

  v_response := TEXT_build_object(
    'success', true,
    'user_id', p_user_id,
    'permission_id', v_permission.id,
    'resource', v_permission.resource,
    'action', v_permission.action,
    'granted', true
  );
  RETURN remember_idempotent_response('
END;
$$;

CREATE OR REPLACE FUNCTION revoke_user_permission(
  p_user_id TEXT,
  p_permission_id TEXT,
  p_institution_id TEXT DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor TEXT;
  v_permission permissions%ROWTYPE;
  v_existing TEXT;
  v_response TEXT;
  v_root_superadmin constant TEXT := 'e1610477-7e32-4dc7-88dc-39c84db49ede'::TEXT;
BEGIN
  v_actor := assert_authenticated();
  v_existing := find_idempotent_response('
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  IF current_user_role() <> 'superadmin' THEN
    RAISE EXCEPTION 'Somente superadmin pode revogar permissoes individuais';
  END IF;

  IF p_user_id = v_root_superadmin AND v_actor <> v_root_superadmin THEN
    RAISE EXCEPTION 'Usuario estrutural protegido nao pode ser gerenciado por este operador';
  END IF;

  PERFORM assert_can_access(
    'permissions',
    'manage',
    TEXT_build_object('institution_id', p_institution_id)
  );

  SELECT *
  INTO v_permission
  FROM permissions
  WHERE id = p_permission_id
    AND deleted_at IS NULL
    AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Permissao inexistente';
  END IF;

  PERFORM set_config('app.access_operation', '

  INSERT INTO user_permissions (user_id, permission_id, institution_id, granted_by, revoked_at, revoked_by)
  VALUES (p_user_id, v_permission.id, p_institution_id, v_actor, now(), v_actor)
  ON CONFLICT (user_id, permission_id, institution_id)
  DO UPDATE SET revoked_at = now(),

  INSERT INTO clinical_events (institution_id, aggregate_table, aggregate_id, event_type, payload, idempotency_key, created_by)
  VALUES (
    p_institution_id,
    'user_permissions',
    p_user_id,
    'access.user_permission_revoked',
    TEXT_build_object('user_id', p_user_id, 'resource', v_permission.resource, 'action', v_permission.action),
    p_idempotency_key,
    v_actor
  )
  ON CONFLICT (institution_id, idempotency_key) DO NOTHING;

  v_response := TEXT_build_object(
    'success', true,
    'user_id', p_user_id,
    'permission_id', v_permission.id,
    'resource', v_permission.resource,
    'action', v_permission.action,
    'granted', false
  );
  RETURN remember_idempotent_response('
END;
$$;

DROP FUNCTION IF EXISTS set_user_active(TEXT, INTEGER);
CREATE OR REPLACE FUNCTION set_user_active(
  p_user_id TEXT,
  p_is_active INTEGER,
  p_idempotency_key text DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor TEXT;
  v_scope TEXT;
  v_existing TEXT;
  v_response TEXT;
BEGIN
  v_actor := assert_authenticated();
  v_existing := find_idempotent_response('set_user_active', p_idempotency_key);
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  SELECT u.primary_institution_id INTO v_scope FROM users u WHERE u.id = p_user_id;
  PERFORM require_permission('users', 'update', v_scope);

  UPDATE users
  SET is_active = p_is_active,
      auth_status = CASE WHEN p_is_active THEN auth_status ELSE 'disabled' END,
      updated_by = v_actor
  WHERE id = p_user_id
    AND deleted_at IS NULL;

  PERFORM set_config('app.access_operation', 'set_user_active', true);

  UPDATE profiles
  SET is_active = p_is_active
  WHERE id = p_user_id;

  INSERT INTO clinical_events (institution_id, aggregate_table, aggregate_id, event_type, payload, idempotency_key, created_by)
  VALUES (
    v_scope,
    'users',
    p_user_id,
    'access.user_status_changed',
    TEXT_build_object('user_id', p_user_id, 'is_active', p_is_active),
    p_idempotency_key,
    v_actor
  )
  ON CONFLICT (institution_id, idempotency_key) DO NOTHING;

  v_response := TEXT_build_object('success', true, 'user_id', p_user_id, 'is_active', p_is_active);
  RETURN remember_idempotent_response('set_user_active', p_idempotency_key, v_scope, v_response);
END;
$$;

CREATE OR REPLACE FUNCTION api_set_doctor_availability(
  p_doctor_id TEXT,
  p_weekday integer,
  p_starts_at time,
  p_ends_at time,
  p_slot_minutes integer DEFAULT 5,
  p_is_active INTEGER DEFAULT true,
  p_idempotency_key text DEFAULT NULL,
  p_availability_id TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user TEXT;
  v_existing TEXT;
  v_availability doctor_availability%ROWTYPE;
  v_response TEXT;
BEGIN
  v_user := assert_authenticated();
  v_existing := find_idempotent_response('set_doctor_availability', p_idempotency_key);

  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext(COALESCE(p_availability_id::text, p_doctor_id::text)),
    COALESCE(p_weekday, 0)
  );

  IF p_availability_id IS NOT NULL THEN
    SELECT *
    INTO v_availability
    FROM doctor_availability
    WHERE id = p_availability_id
      AND deleted_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Disponibilidade nao localizada para atualizacao';
    END IF;

    IF v_availability.doctor_id IS DISTINCT FROM p_doctor_id THEN
      RAISE EXCEPTION 'Profissional da disponibilidade e imutavel';
    END IF;

    PERFORM assert_can_access(
      'doctor_availability',
      'update',
      TEXT_build_object('doctor_id', v_availability.doctor_id)
    );

    UPDATE doctor_availability
    SET weekday = p_weekday,
        starts_at = p_starts_at,
        ends_at = p_ends_at,
        slot_minutes = p_slot_minutes,
        is_active = COALESCE(p_is_active, true),
        updated_at = now()
    WHERE id = v_availability.id
    RETURNING * INTO v_availability;
  ELSE
    SELECT *
    INTO v_availability
    FROM doctor_availability
    WHERE doctor_id = p_doctor_id
      AND weekday = p_weekday
      AND starts_at = p_starts_at
      AND ends_at = p_ends_at
      AND deleted_at IS NULL
    FOR UPDATE;

    IF FOUND THEN
      PERFORM assert_can_access(
        'doctor_availability',
        'update',
        TEXT_build_object('doctor_id', p_doctor_id)
      );

      UPDATE doctor_availability
      SET slot_minutes = p_slot_minutes,
          is_active = COALESCE(p_is_active, true),
          updated_at = now()
      WHERE id = v_availability.id
      RETURNING * INTO v_availability;
    ELSE
      PERFORM assert_can_access(
        'doctor_availability',
        'create',
        TEXT_build_object('doctor_id', p_doctor_id)
      );

      INSERT INTO doctor_availability (
        doctor_id,
        weekday,
        starts_at,
        ends_at,
        slot_minutes,
        is_active,
        created_by
      )
      VALUES (
        p_doctor_id,
        p_weekday,
        p_starts_at,
        p_ends_at,
        p_slot_minutes,
        COALESCE(p_is_active, true),
        v_user
      )
      RETURNING * INTO v_availability;
    END IF;
  END IF;

  INSERT INTO clinical_events (institution_id, aggregate_table, aggregate_id, event_type, payload, idempotency_key, created_by)
  VALUES (
    NULL,
    'doctor_availability',
    v_availability.id,
    'schedule.availability_set',
    to_TEXT(v_availability),
    p_idempotency_key,
    v_user
  )
  ON CONFLICT (institution_id, idempotency_key) DO NOTHING;

  v_response := TEXT_build_object(
    'success', true,
    'availability_id', v_availability.id,
    'doctor_id', v_availability.doctor_id,
    'weekday', v_availability.weekday
  );

  RETURN remember_idempotent_response('set_doctor_availability', p_idempotency_key, NULL, v_response);
EXCEPTION
  WHEN exclusion_violation THEN
    RAISE EXCEPTION 'Disponibilidade sobreposta para o profissional';
END;
$$;

CREATE OR REPLACE FUNCTION api_create_schedule_block(
  p_doctor_id TEXT,
  p_start_at DATETIME,
  p_end_at DATETIME,
  p_reason text,
  p_idempotency_key text DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user TEXT;
  v_role text;
  v_existing TEXT;
  v_block schedule_blocks%ROWTYPE;
  v_response TEXT;
BEGIN
  v_user := assert_authenticated();
  v_role := current_user_role();
  v_existing := find_idempotent_response('create_schedule_block', p_idempotency_key);

  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  PERFORM assert_can_access(
    'schedule_blocks',
    'create',
    TEXT_build_object('doctor_id', p_doctor_id)
  );

  IF p_end_at <= p_start_at THEN
    RAISE EXCEPTION 'Fim do bloqueio deve ser maior que inicio';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_doctor_id::text));

  INSERT INTO schedule_blocks (
    doctor_id,
    block_range,
    reason,
    created_by
  )
  VALUES (
    p_doctor_id,
    tstzrange(p_start_at, p_end_at, '[)'),
    p_reason,
    v_user
  )
  RETURNING * INTO v_block;

  INSERT INTO clinical_events (institution_id, aggregate_table, aggregate_id, event_type, payload, idempotency_key, created_by)
  VALUES (
    NULL,
    'schedule_blocks',
    v_block.id,
    'schedule.block_created',
    to_TEXT(v_block),
    p_idempotency_key,
    v_user
  )
  ON CONFLICT (institution_id, idempotency_key) DO NOTHING;

  v_response := TEXT_build_object(
    'success', true,
    'block_id', v_block.id,
    'doctor_id', v_block.doctor_id,
    'starts_at', lower(v_block.block_range),
    'ends_at', upper(v_block.block_range)
  );

  RETURN remember_idempotent_response('create_schedule_block', p_idempotency_key, NULL, v_response);
EXCEPTION
  WHEN exclusion_violation THEN
    RAISE EXCEPTION 'Bloqueio de agenda sobreposto';
END;
$$;

-- Placeholder para get_operational_timezone para evitar erros de referencia no bloco DO abaixo
CREATE OR REPLACE FUNCTION get_operational_timezone(p_institution_id TEXT DEFAULT NULL)
RETURNS text
LANGUAGE sql
AS $$
  SELECT 'America/Sao_Paulo'::text;
$$;

CREATE OR REPLACE FUNCTION resolve_appointment_slot_end(
  p_doctor_id TEXT,
  p_institution_id TEXT,
  p_start_at DATETIME
)
RETURNS DATETIME
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_operational_timezone text;
  v_slot_minutes integer;
BEGIN
  IF p_doctor_id IS NULL OR p_institution_id IS NULL OR p_start_at IS NULL THEN
    RAISE EXCEPTION 'Profissional, instituicao e horario inicial sao obrigatorios';
  END IF;

  v_operational_timezone := get_operational_timezone(p_institution_id);

  SELECT da.slot_minutes
  INTO v_slot_minutes
  FROM doctor_availability da
  WHERE da.doctor_id = p_doctor_id
    AND da.deleted_at IS NULL
    AND da.is_active = true
    AND da.weekday = EXTRACT(DOW FROM (p_start_at AT TEXT ZONE v_operational_timezone))::integer
    AND (p_start_at AT TEXT ZONE v_operational_timezone)::TEXT >= da.starts_at
    AND ((p_start_at + make_interval(mins => GREATEST(da.slot_minutes, 1))) AT TEXT ZONE v_operational_timezone)::TEXT <= da.ends_at
  ORDER BY da.starts_at DESC
  LIMIT 1;

  IF v_slot_minutes IS NULL THEN
    RAISE EXCEPTION 'Horario fora da disponibilidade configurada do profissional';
  END IF;

  RETURN p_start_at + make_interval(mins => GREATEST(v_slot_minutes, 1));
END;
$$;

CREATE OR REPLACE FUNCTION api_schedule_appointment(
  p_institution_id TEXT,
  p_patient_id TEXT,
  p_doctor_id TEXT,
  p_start_at DATETIME,
  p_end_at DATETIME,
  p_reason text,
  p_idempotency_key text DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user TEXT;
  v_role text;
  v_appointment appointments%ROWTYPE;
  v_existing TEXT;
  v_response TEXT;
  v_slot_end DATETIME;
BEGIN
  v_user := assert_authenticated();
  v_role := current_user_role();

  v_existing := find_idempotent_response('schedule_appointment', p_idempotency_key);
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  PERFORM assert_can_access(
    'appointments',
    'create',
    TEXT_build_object(
      'institution_id', p_institution_id,
      'doctor_id', p_doctor_id,
      'patient_id', p_patient_id
    )
  );

  IF v_role = 'medico' AND is_doctor_owner(p_doctor_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Medico so pode agendar para si mesmo';
  END IF;

  PERFORM set_config('app.clinical_operation', 'schedule_appointment', true);
  v_slot_end := resolve_appointment_slot_end(p_doctor_id, p_institution_id, p_start_at);

  INSERT INTO appointments (
    institution_id,
    patient_id,
    doctor_id,
    scheduled_doctor_id,
    appointment_date,
    end_date,
    reason,
    status,
    idempotency_key,
    created_by,
    updated_by
  )
  VALUES (
    p_institution_id,
    p_patient_id,
    p_doctor_id,
    p_doctor_id,
    p_start_at,
    v_slot_end,
    p_reason,
    'agendado',
    p_idempotency_key,
    v_user,
    v_user
  )
  RETURNING * INTO v_appointment;

  INSERT INTO clinical_events (institution_id, aggregate_table, aggregate_id, event_type, payload, idempotency_key, created_by)
  VALUES (
    v_appointment.institution_id,
    'appointments',
    v_appointment.id,
    'appointment.scheduled',
    to_TEXT(v_appointment),
    p_idempotency_key,
    v_user
  )
  ON CONFLICT (institution_id, idempotency_key) DO NOTHING;

  v_response := TEXT_build_object(
    'success', true,
    'appointment_id', v_appointment.id,
    'appointment_code', v_appointment.appointment_code,
    'ticket_number', v_appointment.ticket_number,
    'status', v_appointment.status
  );

  RETURN remember_idempotent_response('schedule_appointment', p_idempotency_key, v_appointment.institution_id, v_response);
EXCEPTION
  WHEN exclusion_violation THEN
    RAISE EXCEPTION 'Horario indisponivel: existe sobreposicao para o profissional ou paciente';
END;
$$;

CREATE OR REPLACE FUNCTION api_reschedule_appointment(
  p_appointment_id TEXT,
  p_start_at DATETIME,
  p_end_at DATETIME,
  p_reason text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_doctor_id TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user TEXT;
  v_role text;
  v_appointment appointments%ROWTYPE;
  v_target_doctor_id TEXT;
  v_target_specialty_id TEXT;
  v_existing TEXT;
  v_response TEXT;
  v_slot_end DATETIME;
BEGIN
  v_user := assert_authenticated();
  v_role := current_user_role();

  v_existing := find_idempotent_response('reschedule_appointment', p_idempotency_key);
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  SELECT *
  INTO v_appointment
  FROM appointments
  WHERE id = p_appointment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Consulta nao encontrada';
  END IF;

  IF v_appointment.status NOT IN ('agendado', 'confirmado') THEN
    RAISE EXCEPTION 'Somente consultas agendadas/confirmadas podem ser reagendadas';
  END IF;

  v_target_doctor_id := COALESCE(p_doctor_id, v_appointment.doctor_id);

  SELECT d.specialty_id
  INTO v_target_specialty_id
  FROM doctors d
  JOIN users u ON u.id = d.user_id
  LEFT JOIN profiles pr ON pr.id = d.user_id
  LEFT JOIN specialties sp ON sp.id = d.specialty_id
  WHERE d.id = v_target_doctor_id
    AND d.deleted_at IS NULL
    AND d.is_active = true
    AND COALESCE(u.is_active, true) = true
    AND COALESCE(pr.is_active, true) = true
    AND (
      d.specialty_id IS NULL
      OR (sp.deleted_at IS NULL AND sp.is_active = true)
    );

  IF v_target_doctor_id IS NULL OR NOT FOUND THEN
    RAISE EXCEPTION 'Profissional invalido ou inativo';
  END IF;

  PERFORM assert_can_access(
    'appointments',
    'update',
    TEXT_build_object(
      'appointment_id', v_appointment.id,
      'doctor_id', v_target_doctor_id,
      'allowed_appointment_statuses', TEXT_build_array('agendado', 'confirmado')
    )
  );

  IF v_role = 'medico' AND is_doctor_owner(v_target_doctor_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Medico so pode reagendar para si mesmo';
  END IF;

  PERFORM set_config('app.clinical_operation', 'reschedule_appointment', true);
  v_slot_end := resolve_appointment_slot_end(v_target_doctor_id, v_appointment.institution_id, p_start_at);

  UPDATE appointments
  SET appointment_date = p_start_at,
      end_date = v_slot_end,
      doctor_id = v_target_doctor_id,
      scheduled_doctor_id = v_target_doctor_id,
      specialty_id = v_target_specialty_id,
      reason = COALESCE(NULLIF(btrim(p_reason), ''), reason),
      status = 'agendado',
      updated_by = v_user
  WHERE id = p_appointment_id
  RETURNING * INTO v_appointment;

  INSERT INTO clinical_events (institution_id, aggregate_table, aggregate_id, event_type, payload, idempotency_key, created_by)
  VALUES (
    v_appointment.institution_id,
    'appointments',
    v_appointment.id,
    'appointment.rescheduled',
    TEXT_build_object('appointment_date', v_appointment.appointment_date, 'end_date', v_appointment.end_date),
    p_idempotency_key,
    v_user
  )
  ON CONFLICT (institution_id, idempotency_key) DO NOTHING;

  v_response := TEXT_build_object('success', true, 'appointment_id', v_appointment.id, 'status', v_appointment.status);
  RETURN remember_idempotent_response('reschedule_appointment', p_idempotency_key, v_appointment.institution_id, v_response);
EXCEPTION
  WHEN exclusion_violation THEN
    RAISE EXCEPTION 'Horario indisponivel: existe sobreposicao para o profissional ou paciente';
END;
$$;

CREATE OR REPLACE FUNCTION api_set_appointment_status(
  p_appointment_id TEXT,
  p_status TEXT,
  p_reason text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user TEXT;
  v_role text;
  v_appointment appointments%ROWTYPE;
  v_existing TEXT;
  v_response TEXT;
BEGIN
  v_user := assert_authenticated();
  v_role := current_user_role();

  v_existing := find_idempotent_response('set_appointment_status', p_idempotency_key);
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  SELECT *
  INTO v_appointment
  FROM appointments
  WHERE id = p_appointment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Consulta nao encontrada';
  END IF;

  PERFORM assert_can_access(
    'appointments',
    'update',
    TEXT_build_object(
      'appointment_id', v_appointment.id,
      'allowed_appointment_statuses', TEXT_build_array('agendado', 'confirmado')
    )
  );

  IF p_status = 'confirmado'
     AND user_has_permission('appointments', 'update', v_appointment.institution_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Perfil sem permissao para confirmar consulta';
  END IF;

  IF p_status IN ('cancelado', 'nao_compareceu') AND COALESCE(NULLIF(btrim(p_reason), ''), '') = '' THEN
    RAISE EXCEPTION 'Motivo obrigatorio para status terminal';
  END IF;

  IF p_status NOT IN ('confirmado', 'cancelado', 'nao_compareceu') THEN
    RAISE EXCEPTION 'Use RPC dedicada para iniciar ou finalizar atendimento';
  END IF;

  PERFORM set_config('app.clinical_operation', 'set_appointment_status', true);

  UPDATE appointments
  SET status = p_status,
      cancel_reason = CASE WHEN p_status = 'cancelado' THEN p_reason ELSE cancel_reason END,
      no_show_reason = CASE WHEN p_status = 'nao_compareceu' THEN p_reason ELSE no_show_reason END,
      updated_by = v_user
  WHERE id = p_appointment_id
  RETURNING * INTO v_appointment;

  INSERT INTO clinical_events (institution_id, aggregate_table, aggregate_id, event_type, payload, idempotency_key, created_by)
  VALUES (
    v_appointment.institution_id,
    'appointments',
    v_appointment.id,
    'appointment.status_changed',
    TEXT_build_object('status', v_appointment.status, 'reason', p_reason),
    p_idempotency_key,
    v_user
  )
  ON CONFLICT (institution_id, idempotency_key) DO NOTHING;

  v_response := TEXT_build_object('success', true, 'appointment_id', v_appointment.id, 'status', v_appointment.status);
  RETURN remember_idempotent_response('set_appointment_status', p_idempotency_key, v_appointment.institution_id, v_response);
END;
$$;

CREATE OR REPLACE FUNCTION api_start_encounter(
  p_appointment_id TEXT,
  p_idempotency_key text DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user TEXT;
  v_role text;
  v_actor_doctor_id TEXT;
  v_actor_specialty_id TEXT;
  v_appointment appointments%ROWTYPE;
  v_encounter encounters%ROWTYPE;
  v_existing TEXT;
  v_response TEXT;
BEGIN
  v_user := assert_authenticated();
  v_role := current_user_role();
  v_actor_doctor_id := current_user_doctor_id();

  IF v_actor_doctor_id IS NOT NULL THEN
    SELECT d.specialty_id
    INTO v_actor_specialty_id
    FROM doctors d
    WHERE d.id = v_actor_doctor_id
      AND d.deleted_at IS NULL
      AND d.is_active = true;
  END IF;

  v_existing := find_idempotent_response('start_encounter', p_idempotency_key);
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  SELECT *
  INTO v_appointment
  FROM appointments
  WHERE id = p_appointment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Consulta nao encontrada';
  END IF;

  IF v_appointment.status NOT IN ('agendado', 'confirmado', 'em_atendimento') THEN
    RAISE EXCEPTION 'Consulta nao elegivel para atendimento';
  END IF;

  IF v_role = 'medico' THEN
    IF v_actor_doctor_id IS NULL THEN
      RAISE EXCEPTION 'Profissional autenticado sem cadastro medico ativo';
    END IF;

    IF v_appointment.status = 'em_atendimento'
       AND v_appointment.doctor_id IS DISTINCT FROM v_actor_doctor_id THEN
      RAISE EXCEPTION 'Atendimento ja assumido por outro profissional';
    END IF;

    IF v_appointment.doctor_id IS DISTINCT FROM v_actor_doctor_id
       AND (
         v_appointment.specialty_id IS NULL
         OR v_actor_specialty_id IS NULL
         OR v_appointment.specialty_id IS DISTINCT FROM v_actor_specialty_id
       ) THEN
      RAISE EXCEPTION 'Somente profissional da mesma especialidade pode iniciar este atendimento';
    END IF;
  ELSIF v_role <> 'superadmin'
     AND is_doctor_owner(v_appointment.doctor_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Somente o profissional responsavel pode iniciar atendimento';
  END IF;

  PERFORM assert_can_access(
    'encounters',
    'create',
    TEXT_build_object(
      'institution_id', v_appointment.institution_id,
      'doctor_id', COALESCE(v_actor_doctor_id, v_appointment.doctor_id),
      'allowed_appointment_statuses', TEXT_build_array('agendado', 'confirmado', 'em_atendimento')
    )
  );

  PERFORM set_config('app.clinical_operation', 'start_encounter', true);

  UPDATE appointments
  SET status = 'em_atendimento',
      doctor_id = CASE WHEN v_role = 'medico' THEN v_actor_doctor_id ELSE doctor_id END,
      actual_start_at = COALESCE(actual_start_at, now()),
      updated_by = v_user
  WHERE id = p_appointment_id
  RETURNING * INTO v_appointment;

  INSERT INTO encounters (
    institution_id,
    appointment_id,
    patient_id,
    doctor_id,
    status,
    started_by,
    idempotency_key
  )
  VALUES (
    v_appointment.institution_id,
    v_appointment.id,
    v_appointment.patient_id,
    v_appointment.doctor_id,
    'em_atendimento',
    v_user,
    p_idempotency_key
  )
  ON CONFLICT (appointment_id)
  DO UPDATE SET updated_at = now()
  RETURNING * INTO v_encounter;

  INSERT INTO clinical_events (institution_id, aggregate_table, aggregate_id, event_type, payload, idempotency_key, created_by)
  VALUES (
    v_encounter.institution_id,
    'encounters',
    v_encounter.id,
    'encounter.started',
    to_TEXT(v_encounter),
    p_idempotency_key,
    v_user
  )
  ON CONFLICT (institution_id, idempotency_key) DO NOTHING;

  v_response := TEXT_build_object(
    'success', true,
    'appointment_id', v_appointment.id,
    'encounter_id', v_encounter.id,
    'status', v_encounter.status
  );
  RETURN remember_idempotent_response('start_encounter', p_idempotency_key, v_encounter.institution_id, v_response);
END;
$$;

CREATE OR REPLACE FUNCTION api_add_medical_record_entry(
  p_encounter_id TEXT,
  p_entry_type TEXT,
  p_clinical_data TEXT,
  p_idempotency_key text DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user TEXT;
  v_encounter encounters%ROWTYPE;
  v_entry medical_record_entries%ROWTYPE;
  v_existing TEXT;
  v_response TEXT;
BEGIN
  v_user := assert_authenticated();

  v_existing := find_idempotent_response('add_medical_record_entry', p_idempotency_key);
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  SELECT *
  INTO v_encounter
  FROM encounters
  WHERE id = p_encounter_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Atendimento inexistente';
  END IF;

  IF v_encounter.status IS DISTINCT FROM 'em_atendimento'::TEXT THEN
    RAISE EXCEPTION 'Prontuario bloqueado: atendimento nao esta em andamento';
  END IF;

  PERFORM assert_can_access(
    'medical_records',
    'create',
    TEXT_build_object(
      'encounter_id', v_encounter.id,
      'require_doctor_owner', true,
      'allowed_encounter_statuses', TEXT_build_array('em_atendimento')
    )
  );

  IF current_user_role() <> 'superadmin'
     AND is_doctor_owner(v_encounter.doctor_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Somente o profissional responsavel pode registrar evolucao clinica';
  END IF;

  PERFORM set_config('app.clinical_operation', 'add_medical_record_entry', true);

  INSERT INTO medical_record_entries (
    encounter_id,
    entry_type,
    clinical_data,
    idempotency_key,
    created_by
  )
  VALUES (
    p_encounter_id,
    p_entry_type,
    COALESCE(p_clinical_data, '{}'::TEXT),
    p_idempotency_key,
    v_user
  )
  ON CONFLICT (encounter_id, idempotency_key)
  DO NOTHING
  RETURNING * INTO v_entry;

  IF v_entry.id IS NULL THEN
    SELECT *
    INTO v_entry
    FROM medical_record_entries
    WHERE encounter_id = p_encounter_id
      AND idempotency_key = p_idempotency_key;
  END IF;

  INSERT INTO clinical_events (institution_id, aggregate_table, aggregate_id, event_type, payload, idempotency_key, created_by)
  VALUES (
    v_entry.institution_id,
    'medical_record_entries',
    v_entry.id,
    'medical_record.entry_added',
    to_TEXT(v_entry),
    p_idempotency_key,
    v_user
  )
  ON CONFLICT (institution_id, idempotency_key) DO NOTHING;

  v_response := TEXT_build_object(
    'success', true,
    'entry_id', v_entry.id,
    'encounter_id', v_entry.encounter_id,
    'version', v_entry.version,
    'content_hash', v_entry.content_hash
  );
  RETURN remember_idempotent_response('add_medical_record_entry', p_idempotency_key, v_entry.institution_id, v_response);
END;
$$;

CREATE OR REPLACE FUNCTION api_finalize_encounter(
  p_encounter_id TEXT,
  p_final_data TEXT DEFAULT '{}'::TEXT,
  p_idempotency_key text DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user TEXT;
  v_encounter encounters%ROWTYPE;
  v_entry_count integer;
  v_existing TEXT;
  v_response TEXT;
BEGIN
  v_user := assert_authenticated();

  v_existing := find_idempotent_response('finalize_encounter', p_idempotency_key);
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  SELECT *
  INTO v_encounter
  FROM encounters
  WHERE id = p_encounter_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Atendimento nao encontrado';
  END IF;

  PERFORM assert_can_access(
    'encounters',
    'update',
    TEXT_build_object(
      'encounter_id', v_encounter.id,
      'require_doctor_owner', true,
      'allowed_encounter_statuses', TEXT_build_array('em_atendimento')
    )
  );

  IF current_user_role() <> 'superadmin'
     AND is_doctor_owner(v_encounter.doctor_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Somente o profissional responsavel pode finalizar atendimento';
  END IF;

  IF v_encounter.status = 'finalizado' THEN
    RETURN TEXT_build_object('success', true, 'encounter_id', v_encounter.id, 'status', v_encounter.status);
  END IF;

  PERFORM api_add_medical_record_entry(
    v_encounter.id,
    'finalizacao',
    COALESCE(p_final_data, '{}'::TEXT),
    COALESCE(p_idempotency_key, gen_random_TEXT()::text) || ':final'
  );

  PERFORM set_config('app.clinical_operation', 'finalize_encounter', true);

  UPDATE encounters
  SET status = 'finalizado',
      finalized_at = now(),
      finalized_by = v_user
  WHERE id = v_encounter.id
  RETURNING * INTO v_encounter;

  UPDATE appointments
  SET status = 'concluido',
      actual_end_at = now(),
      updated_by = v_user
  WHERE id = v_encounter.appointment_id;

  INSERT INTO clinical_events (institution_id, aggregate_table, aggregate_id, event_type, payload, idempotency_key, created_by)
  VALUES (
    v_encounter.institution_id,
    'encounters',
    v_encounter.id,
    'encounter.finalized',
    to_TEXT(v_encounter),
    p_idempotency_key,
    v_user
  )
  ON CONFLICT (institution_id, idempotency_key) DO NOTHING;

  v_response := TEXT_build_object('success', true, 'encounter_id', v_encounter.id, 'status', v_encounter.status);
  RETURN remember_idempotent_response('finalize_encounter', p_idempotency_key, v_encounter.institution_id, v_response);
END;
$$;

-- Legacy-compatible finalization wrapper. Existing clients can migrate without data corruption.
CREATE OR REPLACE FUNCTION finalize_consultation(appointment_TEXT TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_encounter_id TEXT;
BEGIN
  PERFORM assert_can_access(
    'encounters',
    'update',
    TEXT_build_object('appointment_id', appointment_TEXT, 'require_doctor_owner', true)
  );

  SELECT e.id
  INTO v_encounter_id
  FROM encounters e
  WHERE e.appointment_id = appointment_TEXT;

  IF v_encounter_id IS NULL THEN
    SELECT (api_start_encounter(appointment_TEXT, 'legacy-finalize-start-' || appointment_TEXT::text) ->> 'encounter_id')::TEXT
    INTO v_encounter_id;
  END IF;

  RETURN api_finalize_encounter(
    v_encounter_id,
    TEXT_build_object('source', 'legacy_finalize_consultation'),
    'legacy-finalize-' || appointment_TEXT::text
  );
END;
$$;

-- ============================================================
-- Backend-first operations: config, reports and notifications
-- ============================================================
CREATE TABLE IF NOT EXISTS system_config (
  id TEXT PRIMARY KEY DEFAULT gen_random_TEXT(),
  institution_id TEXT REFERENCES institutions(id) ON DELETE CASCADE,
  config_key text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  value TEXT NOT NULL DEFAULT '{}'::TEXT,
  description text,
  is_public INTEGER NOT NULL DEFAULT false,
  is_secret INTEGER NOT NULL DEFAULT false,
  is_active INTEGER NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  deleted_at DATETIME,
  deleted_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at DATETEXT NOT NULL DEFAULT now(),
  updated_at DATETEXT NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS report_snapshots (
  id TEXT PRIMARY KEY DEFAULT gen_random_TEXT(),
  report_code text UNIQUE,
  institution_id TEXT REFERENCES institutions(id) ON DELETE CASCADE,
  report_type text NOT NULL,
  title text NOT NULL,
  filter_payload TEXT NOT NULL DEFAULT '{}'::TEXT,
  snapshot TEXT NOT NULL DEFAULT '{}'::TEXT,
  rows_count integer NOT NULL DEFAULT 0,
  content_hash text NOT NULL,
  signature_hash text,
  signature_payload TEXT,
  pdf_storage_path text,
  pdf_file_name text,
  immutable INTEGER NOT NULL DEFAULT true,
  idempotency_key text,
  deleted_at DATETIME,
  deleted_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  generated_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  generated_at DATETEXT NOT NULL DEFAULT now(),
  created_at DATETEXT NOT NULL DEFAULT now(),
  updated_at DATETEXT NOT NULL DEFAULT now()
);

ALTER TABLE report_snapshots ADD COLUMN IF NOT EXISTS signature_hash text;
ALTER TABLE report_snapshots ADD COLUMN IF NOT EXISTS signature_payload TEXT;
ALTER TABLE report_snapshots ADD COLUMN IF NOT EXISTS pdf_storage_path text;
ALTER TABLE report_snapshots ADD COLUMN IF NOT EXISTS pdf_file_name text;

CREATE TABLE IF NOT EXISTS system_events (
  id TEXT PRIMARY KEY DEFAULT gen_random_TEXT(),
  institution_id TEXT REFERENCES institutions(id) ON DELETE SET NULL,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  user_role text,
  correlation_id text,
  ip_address inet,
  user_agent text,
  module text NOT NULL,
  action text NOT NULL,
  event_type text NOT NULL DEFAULT 'system',
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'error', 'critical')),
  description text NOT NULL,
  before_data TEXT,
  after_data TEXT,
  payload TEXT NOT NULL DEFAULT '{}'::TEXT,
  created_at DATETEXT NOT NULL DEFAULT now()
);

ALTER TABLE system_events
  ADD COLUMN IF NOT EXISTS correlation_id text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_system_config_unique_scope
  ON system_config(config_key, institution_id) 
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_system_config_category_scope
  ON system_config(category, institution_id)
  WHERE deleted_at IS NULL AND is_active = true;
CREATE UNIQUE INDEX IF NOT EXISTS idx_report_snapshots_idempotency
  ON report_snapshots(institution_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_report_snapshots_generated
  ON report_snapshots(institution_id, generated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_system_events_created
  ON system_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_events_module_action
  ON system_events(module, action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_events_correlation
  ON system_events(correlation_id)
  WHERE correlation_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_system_events_immutable ON system_events;

INSERT INTO system_config (
  institution_id,
  config_key,
  category,
  value,
  description,
  is_public,
  is_secret,
  is_active
)
VALUES
  (NULL, 'clinic_name', 'branding', to_TEXT('Instituicao de Saude'::text), 'Nome padrao exibido em documentos e interfaces.', true, false, true),
  (NULL, 'institution_name', 'branding', to_TEXT('SMS-MEDCO'::text), 'Nome institucional principal para relatorios e documentos oficiais.', true, false, true),
  (NULL, 'logo_url', 'branding', to_TEXT(''::text), 'URL oficial da marca institucional utilizada em relatorios e documentos.', true, false, true),
  (NULL, 'brand_primary_color', 'branding', to_TEXT('#0F172A'::text), 'Cor principal da identidade visual institucional.', true, false, true),
  (NULL, 'brand_secondary_color', 'branding', to_TEXT('#2563EB'::text), 'Cor secundaria da identidade visual institucional.', true, false, true),
  (NULL, 'brand_accent_color', 'branding', to_TEXT('#16A34A'::text), 'Cor de destaque para indicadores e selos oficiais.', true, false, true),
  (NULL, 'document_footer', 'branding', to_TEXT('Documento oficial rastreavel, assinado digitalmente e validavel pelo SMS-MEDCO.'::text), 'Rodape padrao de documentos e relatorios corporativos.', true, false, true),
  (NULL, 'support_email', 'support', to_TEXT('suporte@sms-medco.local'::text), 'Canal de suporte padrao do sistema.', true, false, true),
  (NULL, 'support_phone', 'support', to_TEXT(''::text), 'Telefone padrao de contato e suporte.', true, false, true),
  (NULL, 'timezone', 'general', to_TEXT('America/Sao_Paulo'::text), 'Timezone operacional padrao.', true, false, true),
  (NULL, 'schedule_model', 'operations', to_TEXT('global_professional'::text), 'Modelo operacional da agenda: profissional global entre instituicoes.', true, false, true),
  (NULL, 'schedule_conflict_message', 'operations', to_TEXT('Agenda global do profissional: conflitos em outras unidades sao bloqueados automaticamente.'::text), 'Mensagem operacional exibida quando houver bloqueio multiunidade.', true, false, true),
  (NULL, 'notification_worker_enabled', 'notifications', to_TEXT(true), 'Indica se o processamento assincrono de e-mails esta habilitado.', false, false, true),
  (NULL, 'lgpd_retention_days', 'governance', to_TEXT(3650), 'Prazo padrao de retencao operacional em dias.', false, false, true),
  (NULL, 'lgpd_anonymization_enabled', 'governance', to_TEXT(false), 'Controla rotinas futuras de anonimizacao conforme politica LGPD.', false, false, true)
ON CONFLICT (config_key, institution_id)
WHERE deleted_at IS NULL
DO UPDATE SET
  category = EXCLUDED.category,
  description = EXCLUDED.description,
  is_public = EXCLUDED.is_public,
  is_secret = EXCLUDED.is_secret,
  is_active = true,
  deleted_at = NULL,
  deleted_by = NULL,
  updated_at = now();

CREATE OR REPLACE FUNCTION normalize_email(value text)
RETURNS text
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT lower(btrim(COALESCE(value, '')));
$$;

CREATE OR REPLACE FUNCTION normalize_phone(value text)
RETURNS text
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT regexp_replace(COALESCE(value, ''), '\D', '', 'g');
$$;

CREATE OR REPLACE FUNCTION normalize_cnpj(value text)
RETURNS text
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT regexp_replace(COALESCE(value, ''), '\D', '', 'g');
$$;

CREATE OR REPLACE FUNCTION normalize_text(value text, max_length integer DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_value text;
BEGIN
  v_value := regexp_replace(btrim(COALESCE(value, '')), '\s+', ' ', 'g');
  IF max_length IS NOT NULL AND max_length > 0 THEN
    v_value := left(v_value, max_length);
  END IF;
  RETURN NULLIF(v_value, '');
END;
$$;

CREATE OR REPLACE FUNCTION normalize_search_text(value text)
RETURNS text
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT lower(
    translate(
      regexp_replace(btrim(COALESCE(value, '')), '\s+', ' ', 'g'),
      'ÃƒÂÃƒâ‚¬Ãƒâ€šÃƒÆ’Ãƒâ€žÃƒâ€¦ÃƒÂ¡ÃƒÂ ÃƒÂ¢ÃƒÂ£ÃƒÂ¤ÃƒÂ¥Ãƒâ€°ÃƒË†ÃƒÅ Ãƒâ€¹ÃƒÂ©ÃƒÂ¨ÃƒÂªÃƒÂ«ÃƒÂÃƒÅ’ÃƒÅ½ÃƒÂÃƒÂ­ÃƒÂ¬ÃƒÂ®ÃƒÂ¯Ãƒâ€œÃƒâ€™Ãƒâ€Ãƒâ€¢Ãƒâ€“ÃƒÂ³ÃƒÂ²ÃƒÂ´ÃƒÂµÃƒÂ¶ÃƒÅ¡Ãƒâ„¢Ãƒâ€ºÃƒÅ“ÃƒÂºÃƒÂ¹ÃƒÂ»ÃƒÂ¼Ãƒâ€¡ÃƒÂ§Ãƒâ€˜ÃƒÂ±',
      'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'
    )
  );
$$;

CREATE OR REPLACE FUNCTION is_valid_cpf(value text)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_cpf text;
  v_sum integer := 0;
  v_digit integer;
  i integer;
BEGIN
  v_cpf := normalize_cpf(value);

  IF length(v_cpf) <> 11 OR v_cpf ~ '^(\d)\1{10}$' THEN
    RETURN false;
  END IF;

  v_sum := 0;
  FOR i IN 1..9 LOOP
    v_sum := v_sum + (substr(v_cpf, i, 1)::integer * (11 - i));
  END LOOP;
  v_digit := ((v_sum * 10) % 11) % 10;
  IF v_digit <> substr(v_cpf, 10, 1)::integer THEN
    RETURN false;
  END IF;

  v_sum := 0;
  FOR i IN 1..10 LOOP
    v_sum := v_sum + (substr(v_cpf, i, 1)::integer * (12 - i));
  END LOOP;
  v_digit := ((v_sum * 10) % 11) % 10;
  RETURN v_digit = substr(v_cpf, 11, 1)::integer;
END;
$$;

CREATE OR REPLACE FUNCTION is_valid_cnpj(value text)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_cnpj text;
  v_sum integer := 0;
  v_digit integer;
  v_weights_1 integer[] := ARRAY[5,4,3,2,9,8,7,6,5,4,3,2];
  v_weights_2 integer[] := ARRAY[6,5,4,3,2,9,8,7,6,5,4,3,2];
  i integer;
BEGIN
  v_cnpj := normalize_cnpj(value);

  IF length(v_cnpj) <> 14 OR v_cnpj ~ '^(\d)\1{13}$' THEN
    RETURN false;
  END IF;

  FOR i IN 1..12 LOOP
    v_sum := v_sum + (substr(v_cnpj, i, 1)::integer * v_weights_1[i]);
  END LOOP;
  v_digit := 11 - (v_sum % 11);
  IF v_digit >= 10 THEN v_digit := 0; END IF;
  IF v_digit <> substr(v_cnpj, 13, 1)::integer THEN
    RETURN false;
  END IF;

  v_sum := 0;
  FOR i IN 1..13 LOOP
    v_sum := v_sum + (substr(v_cnpj, i, 1)::integer * v_weights_2[i]);
  END LOOP;
  v_digit := 11 - (v_sum % 11);
  IF v_digit >= 10 THEN v_digit := 0; END IF;
  RETURN v_digit = substr(v_cnpj, 14, 1)::integer;
END;
$$;

CREATE OR REPLACE FUNCTION request_is_service_role()
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_claims TEXT;
BEGIN
  v_role := current_setting('request.jwt.claim.role', true);

  IF v_role = 'service_role' THEN
    RETURN true;
  END IF;

  BEGIN
    v_claims := NULLIF(current_setting('request.jwt.claims', true), '')::TEXT;
  EXCEPTION
    WHEN others THEN
      v_claims := NULL;
  END;

  RETURN COALESCE(v_claims ->> 'role', '') = 'service_role';
END;
$$;

CREATE OR REPLACE FUNCTION can_access(
  target_resource text,
  target_action text,
  target_institution TEXT DEFAULT NULL,
  target_owner_user TEXT DEFAULT NULL,
  target_doctor TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    request_is_service_role()
    OR user_has_permission(target_resource, target_action, target_institution)
    OR (target_owner_user IS NOT NULL AND auth.uid() = target_owner_user)
    OR (target_doctor IS NOT NULL AND is_doctor_owner(target_doctor));
$$;

CREATE OR REPLACE FUNCTION assert_can_access(
  target_resource text,
  target_action text,
  context_json TEXT DEFAULT '{}'::TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_context TEXT := COALESCE(context_json, '{}'::TEXT);
  v_user TEXT;
  v_role text;
  v_resource text := lower(btrim(COALESCE(target_resource, '')));
  v_action text := lower(btrim(COALESCE(target_action, '')));
  v_institution TEXT;
  v_owner_user TEXT;
  v_doctor TEXT;
  v_patient TEXT;
  v_appointment TEXT;
  v_encounter TEXT;
  v_document TEXT;
  v_status text;
  v_allowed_statuses TEXT;
  v_require_doctor_owner INTEGER;
  v_can_access INTEGER;
BEGIN
  IF request_is_service_role() IS TRUE THEN
    RETURN TEXT_build_object('allowed', true, 'role', 'service_role', 'resource', v_resource, 'action', v_action);
  END IF;

  v_user := assert_authenticated();
  v_role := current_user_role();

  IF v_resource = '' OR v_action = '' THEN
    RAISE EXCEPTION 'Recurso e acao sao obrigatorios para autorizacao';
  END IF;

  BEGIN v_institution := NULLIF(v_context ->> 'institution_id', '')::TEXT; EXCEPTION WHEN others THEN RAISE EXCEPTION 'institution_id invalido no contexto'; END;
  BEGIN v_owner_user := NULLIF(v_context ->> 'owner_user_id', '')::TEXT; EXCEPTION WHEN others THEN RAISE EXCEPTION 'owner_user_id invalido no contexto'; END;
  BEGIN v_doctor := NULLIF(v_context ->> 'doctor_id', '')::TEXT; EXCEPTION WHEN others THEN RAISE EXCEPTION 'doctor_id invalido no contexto'; END;
  BEGIN v_patient := NULLIF(v_context ->> 'patient_id', '')::TEXT; EXCEPTION WHEN others THEN RAISE EXCEPTION 'patient_id invalido no contexto'; END;
  BEGIN v_appointment := NULLIF(v_context ->> 'appointment_id', '')::TEXT; EXCEPTION WHEN others THEN RAISE EXCEPTION 'appointment_id invalido no contexto'; END;
  BEGIN v_encounter := NULLIF(v_context ->> 'encounter_id', '')::TEXT; EXCEPTION WHEN others THEN RAISE EXCEPTION 'encounter_id invalido no contexto'; END;
  BEGIN v_document := NULLIF(v_context ->> 'document_id', '')::TEXT; EXCEPTION WHEN others THEN RAISE EXCEPTION 'document_id invalido no contexto'; END;

  IF v_appointment IS NOT NULL THEN
    SELECT a.institution_id, a.doctor_id, a.patient_id, a.status::text
    INTO v_institution, v_doctor, v_patient, v_status
    FROM appointments a
    WHERE a.id = v_appointment
      AND a.deleted_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Consulta inexistente ou inativa';
    END IF;

    SELECT array_agg(value::text)
    INTO v_allowed_statuses
    FROM TEXT_array_elements_text(COALESCE(v_context -> 'allowed_appointment_statuses', '[]'::TEXT)) AS value;

    IF COALESCE(array_length(v_allowed_statuses, 1), 0) > 0
       AND v_status <> ALL(v_allowed_statuses) THEN
      RAISE EXCEPTION 'Estado de consulta invalido para %.%: %', v_resource, v_action, v_status;
    END IF;
  END IF;

  IF v_encounter IS NOT NULL THEN
    SELECT e.institution_id, e.doctor_id, e.patient_id, e.appointment_id, e.status::text
    INTO v_institution, v_doctor, v_patient, v_appointment, v_status
    FROM encounters e
    WHERE e.id = v_encounter
      AND e.deleted_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Atendimento inexistente ou inativo';
    END IF;

    SELECT array_agg(value::text)
    INTO v_allowed_statuses
    FROM TEXT_array_elements_text(COALESCE(v_context -> 'allowed_encounter_statuses', '[]'::TEXT)) AS value;

    IF COALESCE(array_length(v_allowed_statuses, 1), 0) > 0
       AND v_status <> ALL(v_allowed_statuses) THEN
      RAISE EXCEPTION 'Estado de atendimento invalido para %.%: %', v_resource, v_action, v_status;
    END IF;
  END IF;

  IF v_document IS NOT NULL THEN
    SELECT d.institution_id, d.encounter_id, d.appointment_id
    INTO v_institution, v_encounter, v_appointment
    
    WHERE d.id = v_document
      AND d.deleted_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Documento inexistente ou inativo';
    END IF;
  END IF;

  IF v_patient IS NOT NULL THEN
    IF v_institution IS NULL THEN
      SELECT p.institution_id
      INTO v_institution
      FROM patients p
      WHERE p.id = v_patient
        AND p.deleted_at IS NULL;
    ELSIF NOT EXISTS (
      SELECT 1
      FROM patients p
      WHERE p.id = v_patient
        AND p.institution_id = v_institution
        AND p.deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Paciente fora da instituicao autorizada';
    END IF;
  END IF;

  IF v_role = 'auditor'
     AND NOT (
       (v_resource IN ('reports', 'audit') AND v_action IN ('read', 'export'))
       OR (v_resource = 'institutions' AND v_action = 'read')
       OR (v_resource IN ('profiles', 'users') AND v_action = 'read' AND v_owner_user = v_user)
     ) THEN
    RAISE EXCEPTION 'Auditor possui acesso restrito a metricas, auditoria sanitizada e instituicoes';
  END IF;

  IF v_role = 'admin'
     AND v_resource IN ('encounters', 'medical_records', 'clinical_corrections') THEN
    RAISE EXCEPTION 'Admin operacional nao acessa dominio clinico, prontuario, correcoes clinicas ou documentos clinicos';
  END IF;

  IF v_role = 'admin'
     AND NOT (
       (v_resource IN ('users', 'profiles', 'institutions', 'user_roles', 'user_institutions', 'specialties', 'doctors') AND v_action IN ('create', 'read', 'update', 'delete'))
       OR (v_resource IN ('doctor_availability', 'schedule_blocks') AND v_action IN ('create', 'read', 'update', 'delete'))
       OR (v_resource = 'schedules' AND v_action = 'read')
       OR (v_resource = 'patients' AND v_action IN ('create', 'read', 'update'))
       OR (v_resource = 'appointments' AND v_action IN ('create', 'read', 'update', 'cancel', 'reschedule'))
       OR (v_resource IN ('reports', 'audit', 'data_exports') AND v_action IN ('read', 'export'))
       OR (v_resource = 'notifications' AND v_action = 'send')
       OR (v_resource = 'report_email_deliveries' AND v_action = 'read')
     ) THEN
    RAISE EXCEPTION 'Admin operacional nao executa workflow, configuracao estrutural ou acoes fora do escopo administrativo';
  END IF;

  IF v_role = 'recepcao'
     AND v_resource IN ('encounters', 'medical_records', 'clinical_corrections') THEN
    RAISE EXCEPTION 'Recepcao nao acessa atendimento clinico, prontuario ou documentos clinicos';
  END IF;

  IF v_role = 'medico'
     AND v_resource = 'appointments'
     AND v_action IN ('create', 'update') THEN
    RAISE EXCEPTION 'Medico nao cria nem edita agendamentos; atua somente no fluxo clinico atribuido';
  END IF;

  IF v_role = 'medico'
     AND v_resource IN ('users', 'roles', 'permissions', 'user_roles', 'user_institutions', 'settings', 'system', 'security') THEN
    RAISE EXCEPTION 'Medico nao altera acesso, seguranca ou configuracao';
  END IF;

  IF v_role = 'superadmin' THEN
    RETURN TEXT_build_object('allowed', true, 'role', v_role, 'resource', v_resource, 'action', v_action, 'institution_id', v_institution);
  END IF;

  IF v_institution IS NOT NULL
     AND COALESCE((v_context ->> 'require_institution_access')::INTEGER, true)
     AND user_has_institution_access(v_institution) IS NOT TRUE THEN
    RAISE EXCEPTION 'Usuario sem vinculo com a instituicao %', v_institution;
  END IF;

  v_require_doctor_owner := COALESCE((v_context ->> 'require_doctor_owner')::INTEGER, false);
  IF v_require_doctor_owner
     AND (v_doctor IS NULL OR is_doctor_owner(v_doctor) IS NOT TRUE) THEN
    RAISE EXCEPTION 'Somente o profissional responsavel pode executar %.%', v_resource, v_action;
  END IF;

  v_can_access :=
    user_has_permission(v_resource, v_action, v_institution)
    OR (v_owner_user IS NOT NULL AND v_owner_user = v_user)
    OR (v_doctor IS NOT NULL AND is_doctor_owner(v_doctor));

  IF v_can_access IS NOT TRUE THEN
    RAISE EXCEPTION 'Permissao negada para %.% na instituicao %', v_resource, v_action, v_institution;
  END IF;

  RETURN TEXT_build_object('allowed', true, 'role', v_role, 'resource', v_resource, 'action', v_action, 'institution_id', v_institution);
END;
$$;

CREATE OR REPLACE FUNCTION current_user_doctor_id()
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN current_user_role() = 'medico' THEN (
      SELECT d.id
      FROM doctors d
      WHERE d.user_id = auth.uid()
        AND d.deleted_at IS NULL
        AND d.is_active = true
      ORDER BY d.created_at DESC
      LIMIT 1
    )
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION current_user_doctor_specialty_id()
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d.specialty_id
  FROM doctors d
  WHERE d.id = current_user_doctor_id()
    AND d.deleted_at IS NULL
    AND d.is_active = true
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION current_doctor_can_assume_appointment(target_appointment TEXT)
RETURNS INTEGER
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT current_user_role() = 'medico'
    AND EXISTS (
      SELECT 1
      FROM appointments a
      JOIN doctors current_doctor
        ON current_doctor.id = current_user_doctor_id()
       AND current_doctor.deleted_at IS NULL
       AND current_doctor.is_active = true
      WHERE a.id = target_appointment
        AND a.deleted_at IS NULL
        AND a.status IN ('agendado', 'confirmado')
        AND a.specialty_id IS NOT NULL
        AND a.specialty_id = current_doctor.specialty_id
    );
$$;

CREATE OR REPLACE FUNCTION allowed_routes_for_current_user()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_scope TEXT;
  v_doctor_id TEXT;
BEGIN
  v_scope := current_user_primary_institution();

  SELECT d.id
  INTO v_doctor_id
  FROM doctors d
  WHERE d.user_id = auth.uid()
    AND d.deleted_at IS NULL
    AND d.is_active = true
  LIMIT 1;

  RETURN ARRAY(
    SELECT route
    FROM unnest(ARRAY[
      CASE WHEN current_user_is_active() THEN '/dashboard' END,
      CASE WHEN can_access('schedules', 'read', v_scope, NULL, v_doctor_id) OR can_access('appointments', 'read', v_scope, NULL, v_doctor_id) THEN '/agenda' END,
      CASE WHEN can_access('doctor_availability', 'create', v_scope) OR can_access('doctor_availability', 'update', v_scope) OR can_access('schedule_blocks', 'create', v_scope) OR can_access('schedule_blocks', 'update', v_scope) THEN '/schedule-management' END,
      CASE WHEN can_access('appointments', 'read', v_scope, NULL, v_doctor_id) THEN '/appointments' END,
      CASE WHEN can_access('patients', 'read', v_scope, NULL, v_doctor_id) THEN '/patients' END,
      CASE WHEN can_access('doctors', 'update', v_scope) OR can_access('doctors', 'manage', v_scope) THEN '/doctors' END,
      CASE WHEN can_access('appointments', 'read', v_scope, NULL, v_doctor_id) OR can_access('medical_records', 'read', v_scope, NULL, v_doctor_id) THEN '/history' END,
      CASE WHEN can_access('reports', 'read', v_scope, NULL, v_doctor_id) THEN '/reports' END,
      CASE WHEN can_access('institutions', 'read', v_scope) OR can_access('institutions', 'update', v_scope) THEN '/institutions' END,
      CASE WHEN can_access('users', 'read', v_scope) THEN '/users' END,
      CASE WHEN can_access('specialties', 'read', v_scope) OR can_access('specialties', 'update', v_scope) THEN '/specialties' END,
      CASE WHEN can_access('settings', 'manage', v_scope) THEN '/settings' END,
      CASE WHEN can_access('audit', 'read', v_scope) THEN '/auditor' END,
      CASE WHEN can_access('audit', 'read', v_scope) THEN '/audit-log' END,

    ]) AS route
    WHERE route IS NOT NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION health_check()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN TEXT_build_object(
    'ok', true,
    'at', now(),
    'role', current_user_role(),
    'institution_id', current_user_primary_institution()
  );
END;
$$;

CREATE OR REPLACE FUNCTION render_template(template_text text, payload TEXT)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_output text := COALESCE(template_text, '');
  v_item record;
BEGIN
  FOR v_item IN
    SELECT key, value
    FROM TEXT_each_text(COALESCE(payload, '{}'::TEXT))
  LOOP
    v_output := replace(v_output, '{{' || v_item.key || '}}', COALESCE(v_item.value, ''));
  END LOOP;

  RETURN v_output;
END;
$$;

CREATE OR REPLACE FUNCTION get_my_access_context()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user TEXT;
  v_role text;
  v_doctor_id TEXT;
  v_scope TEXT;
BEGIN
  v_user := assert_authenticated();
  v_role := current_user_role();
  v_scope := current_user_primary_institution();

  PERFORM assert_can_access(
    'profiles',
    'read',
    TEXT_build_object('institution_id', v_scope, 'owner_user_id', v_user)
  );

  SELECT d.id
  INTO v_doctor_id
  FROM doctors d
  WHERE d.user_id = v_user
    AND d.deleted_at IS NULL
    AND d.is_active = true
  LIMIT 1;

  RETURN TEXT_build_object(
    'user_id', v_user,
    'role', v_role,
    'doctor_id', v_doctor_id,
    'preferences', COALESCE(
      (SELECT p.preferences FROM profiles p WHERE p.id = v_user AND p.deleted_at IS NULL),
      '{}'::TEXT
    ),
    'full_name', COALESCE(
      (SELECT u.full_name FROM users u WHERE u.id = v_user AND u.deleted_at IS NULL),
      (SELECT p.full_name FROM profiles p WHERE p.id = v_user AND p.deleted_at IS NULL)
    ),
    'email', COALESCE(
      (SELECT u.email FROM users u WHERE u.id = v_user AND u.deleted_at IS NULL),
      (SELECT p.email FROM profiles p WHERE p.id = v_user AND p.deleted_at IS NULL)
    ),
    'phone', COALESCE(
      (SELECT u.phone FROM users u WHERE u.id = v_user AND u.deleted_at IS NULL),
      (SELECT p.phone FROM profiles p WHERE p.id = v_user AND p.deleted_at IS NULL)
    ),
    'institution_id', v_scope,
    'institution_name', (
      SELECT i.name FROM institutions i WHERE i.id = v_scope
    ),
    'institution_ids', current_user_institution_ids(),
    'permissions',
      COALESCE(
        (
          SELECT TEXT_agg(DISTINCT TEXT_build_object(
            'resource', permission_source.resource,
            'action', permission_source.action,
            'institution_id', permission_source.institution_id
          ))
          FROM (
            SELECT p.resource, p.action, COALESCE(p.institution_id, ur.institution_id) AS institution_id
            FROM TEXTs ur
            JOIN roles r ON r.id = ur.role_id OR r.key = ur.role::text
            JOIN role_permissions rp ON rp.role_id = r.id AND rp.revoked_at IS NULL
            JOIN permissions p ON p.id = rp.permission_id
            WHERE ur.user_id = v_user
              AND ur.revoked_at IS NULL
              AND r.is_active = true
              AND r.deleted_at IS NULL
              AND p.is_active = true
              AND p.deleted_at IS NULL

            UNION ALL

            SELECT p.resource, p.action, COALESCE(p.institution_id, up.institution_id) AS institution_id
            FROM user_permissions up
            JOIN permissions p ON p.id = up.permission_id
            WHERE up.user_id = v_user
              AND up.revoked_at IS NULL
              AND p.is_active = true
              AND p.deleted_at IS NULL
          ) permission_source
        ),
        '[]'::TEXT
      ),
    'allowed_routes', to_TEXT(allowed_routes_for_current_user()),
    'is_active', current_user_is_active()
  );
END;
$$;

CREATE OR REPLACE FUNCTION get_system_config_snapshot(
  p_category text DEFAULT NULL,
  p_institution_id TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_scope TEXT;
BEGIN
  v_scope := COALESCE(p_institution_id, current_user_primary_institution());

  IF auth.uid() IS NOT NULL
     AND can_access('settings', 'read', v_scope) IS TRUE THEN
    PERFORM assert_can_access(
      'settings',
      'read',
      TEXT_build_object('institution_id', v_scope)
    );
  END IF;

  RETURN (
    WITH config AS (
      SELECT DISTINCT ON (sc.config_key)
        sc.id,
        sc.config_key,
        sc.category,
        sc.value,
        sc.description,
        sc.institution_id,
        sc.is_public,
        sc.version,
        sc.updated_at
      FROM system_config sc
      WHERE sc.deleted_at IS NULL
        AND sc.is_active = true
        AND (p_category IS NULL OR sc.category = p_category)
        AND (sc.institution_id IS NULL OR sc.institution_id = v_scope)
        AND (
          sc.is_public = true
          OR can_access('settings', 'read', COALESCE(sc.institution_id, v_scope))
        )
      ORDER BY sc.config_key, (sc.institution_id = v_scope) DESC, sc.updated_at DESC
    )
    SELECT TEXT_build_object(
      'items',
        COALESCE((
          SELECT TEXT_agg(
            TEXT_build_object(
              'id', c.id,
              'config_key', c.config_key,
              'category', c.category,
              'value', c.value,
              'description', c.description,
              'institution_id', c.institution_id,
              'is_public', c.is_public,
              'version', c.version,
              'updated_at', c.updated_at
            )
            ORDER BY c.category, c.config_key
          )
          FROM config c
        ), '[]'::TEXT),
      'map',
        COALESCE((
          SELECT TEXT_object_agg(c.config_key, c.value)
          FROM config c
        ), '{}'::TEXT)
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION get_operational_timezone(p_institution_id TEXT DEFAULT NULL)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH timezone_config AS (
    SELECT sc.value #>> '{}' AS timezone_value
    FROM system_config sc
    WHERE sc.config_key IN ('timezone', 'default_timezone')
      AND sc.deleted_at IS NULL
      AND sc.is_active = true
      AND (sc.institution_id IS NULL OR sc.institution_id = p_institution_id)
    ORDER BY
      (sc.institution_id = p_institution_id) DESC,
      CASE WHEN sc.config_key = 'timezone' THEN 0 ELSE 1 END,
      sc.updated_at DESC
    LIMIT 1
  )
  SELECT COALESCE(NULLIF((SELECT timezone_value FROM timezone_config), ''), 'America/Sao_Paulo')
  WHERE request_is_service_role() IS TRUE OR auth.uid() IS NOT NULL;
$$;
CREATE OR REPLACE FUNCTION upsert_system_config(
  p_config_key text,
  p_value TEXT,
  p_description text DEFAULT NULL,
  p_category text DEFAULT 'general',
  p_is_public INTEGER DEFAULT false,
  p_is_secret INTEGER DEFAULT false,
  p_institution_id TEXT DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor TEXT;
  v_scope TEXT;
  v_row system_config%ROWTYPE;
  v_existing TEXT;
  v_response TEXT;
BEGIN
  v_actor := assert_authenticated();
  v_existing := find_idempotent_response('upsert_system_config', p_idempotency_key);
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  v_scope := COALESCE(p_institution_id, current_user_primary_institution());
  PERFORM require_permission('settings', 'manage', v_scope);

  IF normalize_text(p_config_key, 120) IS NULL THEN
    RAISE EXCEPTION 'config_key obrigatoria';
  END IF;

  IF p_is_secret AND current_user_role() <> 'superadmin' THEN
    RAISE EXCEPTION 'Apenas superadmin pode gravar configuracoes secretas';
  END IF;

  PERFORM set_config('app.admin_operation', 'upsert_system_config', true);

  INSERT INTO system_config (
    institution_id,
    config_key,
    category,
    value,
    description,
    is_public,
    is_secret,
    created_by,
    updated_by
  )
  VALUES (
    p_institution_id,
    normalize_text(p_config_key, 120),
    COALESCE(normalize_text(p_category, 60), 'general'),
    COALESCE(p_value, '{}'::TEXT),
    normalize_text(p_description, 500),
    COALESCE(p_is_public, false),
    COALESCE(p_is_secret, false),
    v_actor,
    v_actor
  )
  ON CONFLICT (config_key, institution_id)
  WHERE deleted_at IS NULL
  DO UPDATE SET
    category = EXCLUDED.category,
    value = EXCLUDED.value,
    description = COALESCE(EXCLUDED.description, system_config.description),
    is_public = EXCLUDED.is_public,
    is_secret = EXCLUDED.is_secret,
    is_active = true,
    version = system_config.version + 1,
    updated_by = v_actor,
    updated_at = now(),
    deleted_at = NULL,
    deleted_by = NULL
  RETURNING * INTO v_row;

  INSERT INTO clinical_events (institution_id, aggregate_table, aggregate_id, event_type, payload, idempotency_key, created_by)
  VALUES (v_row.institution_id, 'system_config', v_row.id, 'settings.config_upserted', to_TEXT(v_row), p_idempotency_key, v_actor);

  v_response := TEXT_build_object(
    'success', true,
    'config_id', v_row.id,
    'config_key', v_row.config_key,
    'version', v_row.version
  );

  RETURN remember_idempotent_response('upsert_system_config', p_idempotency_key, v_scope, v_response);
END;
$$;

CREATE OR REPLACE FUNCTION list_institutions_catalog(
  p_search text DEFAULT NULL,
  p_include_inactive INTEGER DEFAULT true,
  p_only_with_records INTEGER DEFAULT false
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_scope TEXT;
BEGIN
  v_scope := current_user_primary_institution();
  PERFORM require_permission('institutions', 'read', v_scope);

  RETURN COALESCE((
    SELECT TEXT_agg(
      TEXT_build_object(
        'id', i.id,
        'name', i.name,
        'cnpj', i.cnpj,
        'email', i.email,
        'phone', i.phone,
        'address', i.address,
        'city', i.city,
        'state', i.state,
        'is_active', i.is_active,
        'created_at', i.created_at,
        'updated_at', i.updated_at
      )
      ORDER BY i.name
    )
    FROM institutions i
    WHERE i.deleted_at IS NULL
      AND (COALESCE(p_include_inactive, true) OR i.is_active = true)
      AND (
        NOT COALESCE(p_only_with_records, false)
        OR EXISTS (SELECT 1 FROM appointments a WHERE a.institution_id = i.id AND a.deleted_at IS NULL)
        OR EXISTS (SELECT 1 FROM patients p WHERE p.institution_id = i.id AND p.deleted_at IS NULL)

        OR EXISTS (SELECT 1 FROM user_institutions ui WHERE ui.institution_id = i.id AND ui.revoked_at IS NULL)
        OR EXISTS (SELECT 1 FROM users u WHERE u.primary_institution_id = i.id AND u.deleted_at IS NULL)
      )
      AND (
        current_user_role() = 'superadmin'
        OR user_has_institution_access(i.id)
      )
      AND (
        p_search IS NULL
        OR p_search = ''
        OR normalize_search_text(i.name) LIKE '%' || normalize_search_text(p_search) || '%'
        OR (normalize_cnpj(p_search) <> '' AND COALESCE(i.cnpj, '') ILIKE '%' || normalize_cnpj(p_search) || '%')
        OR normalize_search_text(COALESCE(i.email, '')) LIKE '%' || normalize_search_text(p_search) || '%'
        OR (normalize_cpf(p_search) <> '' AND normalize_cpf(COALESCE(i.phone, '')) LIKE '%' || normalize_cpf(p_search) || '%')
      )
  ), '[]'::TEXT);
END;
$$;

CREATE OR REPLACE FUNCTION set_institution_active(
  p_institution_id TEXT,
  p_is_active INTEGER,
  p_idempotency_key text DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor TEXT;
  v_row institutions%ROWTYPE;
  v_existing TEXT;
  v_response TEXT;
BEGIN
  v_actor := assert_authenticated();
  v_existing := find_idempotent_response('set_institution_active', p_idempotency_key);
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  SELECT *
  INTO v_row
  FROM institutions
  WHERE id = p_institution_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Instituicao nao encontrada';
  END IF;

  PERFORM require_permission('institutions', 'update', p_institution_id);
  PERFORM set_config('app.admin_operation', 'set_institution_active', true);

  UPDATE institutions
  SET is_active = COALESCE(p_is_active, false),
      updated_at = now()
  WHERE id = p_institution_id
  RETURNING * INTO v_row;

  INSERT INTO clinical_events (institution_id, aggregate_table, aggregate_id, event_type, payload, idempotency_key, created_by)
  VALUES (v_row.id, 'institutions', v_row.id, 'access.institution_status_changed', to_TEXT(v_row), p_idempotency_key, v_actor)
  ON CONFLICT (institution_id, idempotency_key) DO NOTHING;

  v_response := TEXT_build_object('success', true, 'institution', to_TEXT(v_row));
  RETURN remember_idempotent_response('set_institution_active', p_idempotency_key, v_row.id, v_response);
END;
$$;

CREATE OR REPLACE FUNCTION list_specialties_catalog(
  p_search text DEFAULT NULL,
  p_include_inactive INTEGER DEFAULT true
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM require_permission('specialties', 'read', current_user_primary_institution());

  RETURN COALESCE((
    SELECT TEXT_agg(
      TEXT_build_object(
        'id', s.id,
        'name', s.name,
        'description', s.description,
        'icon', s.icon,
        'color', s.color,
        'is_active', s.is_active,
        'created_at', s.created_at,
        'updated_at', s.updated_at
      )
      ORDER BY s.name
    )
    FROM specialties s
    WHERE s.deleted_at IS NULL
      AND (COALESCE(p_include_inactive, true) OR s.is_active = true)
      AND (
        p_search IS NULL
        OR p_search = ''
        OR normalize_search_text(s.name) LIKE '%' || normalize_search_text(p_search) || '%'
        OR normalize_search_text(COALESCE(s.description, '')) LIKE '%' || normalize_search_text(p_search) || '%'
      )
  ), '[]'::TEXT);
END;
$$;

CREATE OR REPLACE FUNCTION upsert_specialty(
  p_specialty_id TEXT DEFAULT NULL,
  p_name text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_icon text DEFAULT NULL,
  p_color text DEFAULT NULL,
  p_is_active INTEGER DEFAULT true,
  p_idempotency_key text DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor TEXT;
  v_row specialties%ROWTYPE;
  v_name text;
  v_existing TEXT;
  v_response TEXT;
BEGIN
  v_actor := assert_authenticated();
  v_existing := find_idempotent_response('upsert_specialty', p_idempotency_key);
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  v_name := normalize_text(p_name, 160);

  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Nome da especialidade obrigatorio';
  END IF;

  IF p_specialty_id IS NULL THEN
    PERFORM require_permission('specialties', 'create', current_user_primary_institution());
  ELSE
    PERFORM require_permission('specialties', 'update', current_user_primary_institution());
  END IF;

  PERFORM set_config('app.admin_operation', 'upsert_specialty', true);

  IF p_specialty_id IS NULL THEN
    INSERT INTO specialties (name, description, icon, color, is_active)
    VALUES (
      v_name,
      normalize_text(p_description, 500),
      normalize_text(p_icon, 80),
      normalize_text(p_color, 30),
      COALESCE(p_is_active, true)
    )
    RETURNING * INTO v_row;
  ELSE
    UPDATE specialties
    SET name = v_name,
        description = COALESCE(normalize_text(p_description, 500), description),
        icon = COALESCE(normalize_text(p_icon, 80), icon),
        color = COALESCE(normalize_text(p_color, 30), color),
        is_active = COALESCE(p_is_active, is_active),
        updated_at = now()
    WHERE id = p_specialty_id
      AND deleted_at IS NULL
    RETURNING * INTO v_row;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Especialidade nao encontrada';
    END IF;
  END IF;

  INSERT INTO clinical_events (institution_id, aggregate_table, aggregate_id, event_type, payload, idempotency_key, created_by)
  VALUES (current_user_primary_institution(), 'specialties', v_row.id, 'catalog.specialty_upserted', to_TEXT(v_row), p_idempotency_key, v_actor)
  ON CONFLICT (institution_id, idempotency_key) DO NOTHING;

  v_response := TEXT_build_object('success', true, 'specialty', to_TEXT(v_row));
  RETURN remember_idempotent_response('upsert_specialty', p_idempotency_key, current_user_primary_institution(), v_response);
END;
$$;

CREATE OR REPLACE FUNCTION set_specialty_active(
  p_specialty_id TEXT,
  p_is_active INTEGER,
  p_idempotency_key text DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor TEXT;
  v_row specialties%ROWTYPE;
  v_existing TEXT;
  v_response TEXT;
BEGIN
  v_actor := assert_authenticated();
  v_existing := find_idempotent_response('set_specialty_active', p_idempotency_key);
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  PERFORM require_permission('specialties', 'update', current_user_primary_institution());
  PERFORM set_config('app.admin_operation', 'set_specialty_active', true);

  UPDATE specialties
  SET is_active = COALESCE(p_is_active, false),
      updated_at = now()
  WHERE id = p_specialty_id
    AND deleted_at IS NULL
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Especialidade nao encontrada';
  END IF;

  INSERT INTO clinical_events (institution_id, aggregate_table, aggregate_id, event_type, payload, idempotency_key, created_by)
  VALUES (current_user_primary_institution(), 'specialties', v_row.id, 'catalog.specialty_status_changed', to_TEXT(v_row), p_idempotency_key, v_actor)
  ON CONFLICT (institution_id, idempotency_key) DO NOTHING;

  v_response := TEXT_build_object('success', true, 'specialty', to_TEXT(v_row));
  RETURN remember_idempotent_response('set_specialty_active', p_idempotency_key, current_user_primary_institution(), v_response);
END;
$$;

CREATE OR REPLACE FUNCTION list_patients_catalog(
  p_search text DEFAULT NULL,
  p_include_inactive INTEGER DEFAULT true,
  p_limit integer DEFAULT 100,
  p_institution_id TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_scope TEXT;
  v_doctor TEXT;
BEGIN
  v_scope := COALESCE(p_institution_id, current_user_primary_institution());
  v_doctor := current_user_doctor_id();

  PERFORM assert_can_access(
    'patients',
    'read',
    TEXT_build_object('institution_id', v_scope, 'doctor_id', v_doctor)
  );

  RETURN COALESCE((
    SELECT TEXT_agg(
      TEXT_build_object(
        'id', p.id,
        'patient_code', p.patient_code,
        'institution_id', p.institution_id,
        'full_name', p.full_name,
        'email', p.email,
        'phone', p.phone,
        'cpf', p.cpf,
        'birth_date', p.birth_date,
        'gender', p.gender,
        'address', p.address,
        'city', p.city,
        'state', p.state,
        'zip_code', p.zip_code,
        'emergency_contact', p.emergency_contact,
        'emergency_phone', p.emergency_phone,
        'blood_type', p.blood_type,
        'allergies', p.allergies,
        'chronic_diseases', p.chronic_diseases,
        'observations', p.observations,
        'is_active', p.is_active,
        'age', EXTRACT(YEAR FROM age(current_date, p.birth_date))::integer,
        'created_at', p.created_at,
        'updated_at', p.updated_at,
        'has_pending_appointment', pa.pending_appointment_id IS NOT NULL,
        'pending_appointment_id', pa.pending_appointment_id,
        'pending_appointment_date', pa.pending_appointment_date,
        'pending_appointment_status', pa.pending_appointment_status,
        'pending_specialty_name', pa.pending_specialty_name,
        'pending_doctor_name', pa.pending_doctor_name
      )
      ORDER BY p.full_name
    )
    FROM (
      SELECT p.*
      FROM patients p
      WHERE p.deleted_at IS NULL
        AND (COALESCE(p_include_inactive, true) OR p.is_active = true)
        AND (
          current_user_role() = 'superadmin'
          OR (
            current_user_role() IN ('recepcao', 'admin')
            AND user_has_institution_access(p.institution_id)
          )
          OR (
            current_user_role() = 'medico'
            AND v_doctor IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM appointments a
              WHERE a.patient_id = p.id
                AND a.deleted_at IS NULL
                AND (
                  a.doctor_id = v_doctor
                  OR (
                    a.status IN ('agendado', 'confirmado')
                    AND a.specialty_id IS NOT NULL
                    AND a.specialty_id = current_user_doctor_specialty_id()
                  )
                )
            )
          )
        )
        AND (
          p_search IS NULL
          OR p_search = ''
          OR normalize_search_text(p.full_name) LIKE '%' || normalize_search_text(p_search) || '%'
          OR (normalize_cpf(p_search) <> '' AND p.cpf ILIKE '%' || normalize_cpf(p_search) || '%')
          OR normalize_search_text(COALESCE(p.email, '')) LIKE '%' || normalize_search_text(p_search) || '%'
          OR (normalize_cpf(p_search) <> '' AND normalize_cpf(COALESCE(p.phone, '')) LIKE '%' || normalize_cpf(p_search) || '%')
        )
      ORDER BY p.full_name
      LIMIT GREATEST(COALESCE(p_limit, 100), 1)
    ) p
    LEFT JOIN LATERAL (
      SELECT
        a.id AS pending_appointment_id,
        a.appointment_date AS pending_appointment_date,
        a.status AS pending_appointment_status,
        sp.name AS pending_specialty_name,
        du.full_name AS pending_doctor_name
      FROM appointments a
      JOIN doctors d ON d.id = a.doctor_id
      JOIN users du ON du.id = d.user_id
      LEFT JOIN specialties sp ON sp.id = d.specialty_id
      WHERE a.patient_id = p.id
        AND a.deleted_at IS NULL
        AND a.status IN ('agendado', 'confirmado', 'em_atendimento')
      ORDER BY a.appointment_date ASC
      LIMIT 1
    ) pa ON true
  ), '[]'::TEXT);
END;
$$;

CREATE OR REPLACE FUNCTION get_patient_scheduling_guard(
  p_patient_id TEXT,
  p_doctor_id TEXT DEFAULT NULL,
  p_specialty_id TEXT DEFAULT NULL,
  p_recent_days integer DEFAULT 30
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_scope TEXT;
  v_doctor TEXT;
  v_patient patients%ROWTYPE;
  v_effective_specialty_id TEXT;
  v_recent_days integer := GREATEST(COALESCE(p_recent_days, 30), 1);
  v_active_id TEXT;
  v_active_ticket text;
  v_active_date DATETIME;
  v_active_status TEXT;
  v_active_doctor_id TEXT;
  v_active_doctor_name text;
  v_active_specialty_name text;
  v_recent_id TEXT;
  v_recent_ticket text;
  v_recent_date DATETIME;
  v_recent_status TEXT;
  v_recent_doctor_id TEXT;
  v_recent_doctor_name text;
  v_recent_specialty_name text;
  v_recent_rule text;
BEGIN
  IF p_patient_id IS NULL THEN
    RAISE EXCEPTION 'Paciente obrigatorio';
  END IF;

  v_scope := current_user_primary_institution();
  v_doctor := current_user_doctor_id();

  SELECT *
  INTO v_patient
  FROM patients
  WHERE id = p_patient_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Paciente nao encontrado';
  END IF;

  PERFORM assert_can_access(
    'patients',
    'read',
    TEXT_build_object('institution_id', v_patient.institution_id, 'doctor_id', v_doctor)
  );

  PERFORM assert_can_access(
    'appointments',
    'create',
    TEXT_build_object('institution_id', v_patient.institution_id, 'doctor_id', v_doctor)
  );

  v_effective_specialty_id := p_specialty_id;

  IF v_effective_specialty_id IS NULL AND p_doctor_id IS NOT NULL THEN
    SELECT d.specialty_id
    INTO v_effective_specialty_id
    FROM doctors d
    WHERE d.id = p_doctor_id
      AND d.deleted_at IS NULL;
  END IF;

  SELECT
    a.id,
    a.ticket_number,
    a.appointment_date,
    a.status,
    d.id,
    du.full_name,
    sp.name
  INTO
    v_active_id,
    v_active_ticket,
    v_active_date,
    v_active_status,
    v_active_doctor_id,
    v_active_doctor_name,
    v_active_specialty_name
  FROM appointments a
  JOIN doctors d ON d.id = a.doctor_id
  JOIN users du ON du.id = d.user_id
  LEFT JOIN specialties sp ON sp.id = d.specialty_id
  WHERE a.patient_id = p_patient_id
    AND a.deleted_at IS NULL
    AND a.status IN ('agendado', 'confirmado', 'em_atendimento')
  ORDER BY a.appointment_date ASC
  LIMIT 1;

  IF v_effective_specialty_id IS NOT NULL THEN
    SELECT
      a.id,
      a.ticket_number,
      a.appointment_date,
      a.status,
      d.id,
      du.full_name,
      sp.name
    INTO
      v_recent_id,
      v_recent_ticket,
      v_recent_date,
      v_recent_status,
      v_recent_doctor_id,
      v_recent_doctor_name,
      v_recent_specialty_name
    FROM appointments a
    JOIN doctors d ON d.id = a.doctor_id
    JOIN users du ON du.id = d.user_id
    LEFT JOIN specialties sp ON sp.id = d.specialty_id
    WHERE a.patient_id = p_patient_id
      AND a.deleted_at IS NULL
      AND a.status = 'concluido'
      AND d.specialty_id = v_effective_specialty_id
      AND a.appointment_date >= now() - make_interval(days => v_recent_days)
    ORDER BY a.appointment_date DESC
    LIMIT 1;

    IF v_recent_id IS NOT NULL THEN
      v_recent_rule := 'same_specialty';
    END IF;
  ELSE
    SELECT
      a.id,
      a.ticket_number,
      a.appointment_date,
      a.status,
      d.id,
      du.full_name,
      sp.name
    INTO
      v_recent_id,
      v_recent_ticket,
      v_recent_date,
      v_recent_status,
      v_recent_doctor_id,
      v_recent_doctor_name,
      v_recent_specialty_name
    FROM appointments a
    JOIN doctors d ON d.id = a.doctor_id
    JOIN users du ON du.id = d.user_id
    LEFT JOIN specialties sp ON sp.id = d.specialty_id
    WHERE a.patient_id = p_patient_id
      AND a.deleted_at IS NULL
      AND a.status = 'concluido'
      AND a.appointment_date >= now() - make_interval(days => v_recent_days)
    ORDER BY a.appointment_date DESC
    LIMIT 1;

    IF v_recent_id IS NOT NULL THEN
      v_recent_rule := 'recent_consultation';
    END IF;
  END IF;

  RETURN TEXT_build_object(
    'patient_id', p_patient_id,
    'requires_confirmation', (v_active_id IS NOT NULL OR v_recent_id IS NOT NULL),
    'has_active_appointment', v_active_id IS NOT NULL,
    'has_recent_consultation', v_recent_id IS NOT NULL,
    'has_recent_same_specialty', (v_recent_rule = 'same_specialty'),
    'recent_rule', v_recent_rule,
    'recent_days', v_recent_days,
    'active_appointment', CASE
      WHEN v_active_id IS NULL THEN NULL
      ELSE TEXT_build_object(
        'id', v_active_id,
        'ticket_number', v_active_ticket,
        'appointment_date', v_active_date,
        'status', v_active_status,
        'doctor_id', v_active_doctor_id,
        'doctor_name', v_active_doctor_name,
        'specialty_name', v_active_specialty_name
      )
    END,
    'recent_consultation', CASE
      WHEN v_recent_id IS NULL THEN NULL
      ELSE TEXT_build_object(
        'id', v_recent_id,
        'ticket_number', v_recent_ticket,
        'appointment_date', v_recent_date,
        'status', v_recent_status,
        'doctor_id', v_recent_doctor_id,
        'doctor_name', v_recent_doctor_name,
        'specialty_name', v_recent_specialty_name
      )
    END
  );
END;
$$;

CREATE OR REPLACE FUNCTION upsert_patient(
  p_patient_id TEXT DEFAULT NULL,
  p_institution_id TEXT DEFAULT NULL,
  p_full_name text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_cpf text DEFAULT NULL,
  p_birth_date date DEFAULT NULL,
  p_gender TEXT DEFAULT NULL,
  p_address text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_state text DEFAULT NULL,
  p_zip_code text DEFAULT NULL,
  p_emergency_contact text DEFAULT NULL,
  p_emergency_phone text DEFAULT NULL,
  p_blood_type text DEFAULT NULL,
  p_allergies text DEFAULT NULL,
  p_chronic_diseases text DEFAULT NULL,
  p_observations text DEFAULT NULL,
  p_is_active INTEGER DEFAULT true,
  p_idempotency_key text DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor TEXT;
  v_scope TEXT;
  v_row patients%ROWTYPE;
  v_duplicate TEXT;
  v_cpf text;
  v_existing TEXT;
  v_response TEXT;
BEGIN
  v_actor := assert_authenticated();
  v_existing := find_idempotent_response('upsert_patient', p_idempotency_key);
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  v_scope := COALESCE(p_institution_id, current_user_primary_institution());
  v_cpf := normalize_cpf(p_cpf);

  IF v_scope IS NULL THEN
    RAISE EXCEPTION 'Instituicao do paciente obrigatoria';
  END IF;

  IF normalize_text(p_full_name, 180) IS NULL THEN
    RAISE EXCEPTION 'Nome do paciente obrigatorio';
  END IF;

  IF length(COALESCE(v_cpf, '')) <> 11 THEN
    RAISE EXCEPTION 'CPF invalido';
  END IF;

  IF p_birth_date IS NULL OR p_birth_date > current_date THEN
    RAISE EXCEPTION 'Data de nascimento invalida';
  END IF;

  IF p_patient_id IS NULL THEN
    PERFORM require_permission('patients', 'create', v_scope);
  ELSE
    SELECT *
    INTO v_row
    FROM patients
    WHERE id = p_patient_id
      AND deleted_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Paciente nao encontrado';
    END IF;

    PERFORM require_permission('patients', 'update', v_row.institution_id);

    IF p_institution_id IS NOT NULL AND p_institution_id <> v_row.institution_id THEN
      IF user_has_institution_access(p_institution_id) IS NOT TRUE THEN
        RAISE EXCEPTION 'Usuario sem acesso a nova instituicao do paciente';
      END IF;
    END IF;

    IF v_row.cpf <> v_cpf THEN
      RAISE EXCEPTION 'CPF do paciente e imutavel';
    END IF;
  END IF;

  SELECT p.id
  INTO v_duplicate
  FROM patients p
  WHERE p.cpf = v_cpf
    AND p.institution_id = v_scope
    AND p.deleted_at IS NULL
    AND (p_patient_id IS NULL OR p.id <> p_patient_id)
  LIMIT 1;

  IF v_duplicate IS NOT NULL THEN
    RAISE EXCEPTION 'Paciente com este CPF ja existe';
  END IF;

  PERFORM set_config('app.admin_operation', 'upsert_patient', true);

  IF p_patient_id IS NULL THEN
    INSERT INTO patients (
      institution_id,
      full_name,
      email,
      phone,
      cpf,
      birth_date,
      gender,
      address,
      city,
      state,
      zip_code,
      emergency_contact,
      emergency_phone,
      blood_type,
      allergies,
      chronic_diseases,
      observations,
      is_active,
      created_by,
      updated_by
    )
    VALUES (
      v_scope,
      normalize_text(p_full_name, 180),
      NULLIF(normalize_email(p_email), ''),
      NULLIF(normalize_phone(p_phone), ''),
      v_cpf,
      p_birth_date,
      p_gender,
      normalize_text(p_address, 500),
      normalize_text(p_city, 120),
      CASE WHEN normalize_text(p_state, 2) IS NULL THEN NULL ELSE upper(normalize_text(p_state, 2)) END,
      normalize_text(p_zip_code, 20),
      normalize_text(p_emergency_contact, 180),
      NULLIF(normalize_phone(p_emergency_phone), ''),
      normalize_text(p_blood_type, 10),
      normalize_text(p_allergies, 2000),
      normalize_text(p_chronic_diseases, 2000),
      normalize_text(p_observations, 4000),
      COALESCE(p_is_active, true),
      v_actor,
      v_actor
    )
    RETURNING * INTO v_row;
  ELSE
    UPDATE patients
    SET full_name = normalize_text(p_full_name, 180),
        email = COALESCE(NULLIF(normalize_email(p_email), ''), email),
        phone = COALESCE(NULLIF(normalize_phone(p_phone), ''), phone),
        gender = COALESCE(p_gender, gender),
        address = COALESCE(normalize_text(p_address, 500), address),
        city = COALESCE(normalize_text(p_city, 120), city),
        state = COALESCE(CASE WHEN normalize_text(p_state, 2) IS NULL THEN NULL ELSE upper(normalize_text(p_state, 2)) END, state),
        zip_code = COALESCE(normalize_text(p_zip_code, 20), zip_code),
        emergency_contact = COALESCE(normalize_text(p_emergency_contact, 180), emergency_contact),
        emergency_phone = COALESCE(NULLIF(normalize_phone(p_emergency_phone), ''), emergency_phone),
        blood_type = COALESCE(normalize_text(p_blood_type, 10), blood_type),
        allergies = COALESCE(normalize_text(p_allergies, 2000), allergies),
        chronic_diseases = COALESCE(normalize_text(p_chronic_diseases, 2000), chronic_diseases),
        observations = COALESCE(normalize_text(p_observations, 4000), observations),
        is_active = COALESCE(p_is_active, is_active),
        updated_by = v_actor,
        updated_at = now()
    WHERE id = p_patient_id
    RETURNING * INTO v_row;
  END IF;

  INSERT INTO clinical_events (institution_id, aggregate_table, aggregate_id, event_type, payload, idempotency_key, created_by)
  VALUES (v_row.institution_id, 'patients', v_row.id, 'catalog.patient_upserted', to_TEXT(v_row), p_idempotency_key, v_actor)
  ON CONFLICT (institution_id, idempotency_key) DO NOTHING;

  v_response := TEXT_build_object('success', true, 'patient', to_TEXT(v_row));
  RETURN remember_idempotent_response('upsert_patient', p_idempotency_key, v_row.institution_id, v_response);
END;
$$;

CREATE OR REPLACE FUNCTION set_patient_active(
  p_patient_id TEXT,
  p_is_active INTEGER,
  p_idempotency_key text DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor TEXT;
  v_row patients%ROWTYPE;
  v_existing TEXT;
  v_response TEXT;
BEGIN
  v_actor := assert_authenticated();
  v_existing := find_idempotent_response('set_patient_active', p_idempotency_key);
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  SELECT *
  INTO v_row
  FROM patients
  WHERE id = p_patient_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Paciente nao encontrado';
  END IF;

  PERFORM require_permission('patients', 'update', v_row.institution_id);
  PERFORM set_config('app.admin_operation', 'set_patient_active', true);

  UPDATE patients
  SET is_active = COALESCE(p_is_active, false),
      updated_by = v_actor,
      updated_at = now()
  WHERE id = p_patient_id
  RETURNING * INTO v_row;

  INSERT INTO clinical_events (institution_id, aggregate_table, aggregate_id, event_type, payload, idempotency_key, created_by)
  VALUES (v_row.institution_id, 'patients', v_row.id, 'catalog.patient_status_changed', to_TEXT(v_row), p_idempotency_key, v_actor)
  ON CONFLICT (institution_id, idempotency_key) DO NOTHING;

  v_response := TEXT_build_object('success', true, 'patient', to_TEXT(v_row));
  RETURN remember_idempotent_response('set_patient_active', p_idempotency_key, v_row.institution_id, v_response);
END;
$$;

CREATE OR REPLACE FUNCTION list_doctors_catalog(
  p_search text DEFAULT NULL,
  p_include_inactive INTEGER DEFAULT true
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doctor TEXT;
  v_scope TEXT;
BEGIN
  v_doctor := current_user_doctor_id();
  v_scope := current_user_primary_institution();

  PERFORM assert_can_access(
    'doctors',
    'read',
    TEXT_build_object('institution_id', v_scope, 'doctor_id', v_doctor)
  );

  RETURN COALESCE((
    SELECT TEXT_agg(
      TEXT_build_object(
        'id', d.id,
        'user_id', d.user_id,
        'professional_council', d.professional_council,
        'professional_registration', d.crm,
        'registration_label', d.professional_council || ' ' || d.crm,
        'crm', d.crm,
        'specialty_id', d.specialty_id,
        'specialty_name', s.name,
        'specialty_color', s.color,
        'consultation_duration', d.consultation_duration,
        'is_active', d.is_active,
        'full_name', COALESCE(u.full_name, p.full_name),
        'email', COALESCE(u.email, p.email),
        'phone', COALESCE(u.phone, p.phone),
        'primary_institution_id', u.primary_institution_id,
        'institution_ids', COALESCE((
          SELECT TEXT_agg(ui.institution_id ORDER BY ui.institution_id)
          FROM user_institutions ui
          WHERE ui.user_id = d.user_id
            AND ui.revoked_at IS NULL
        ), '[]'::TEXT),
        'institution_names', COALESCE((
          SELECT TEXT_agg(i.name ORDER BY i.name)
          FROM user_institutions ui
          JOIN institutions i ON i.id = ui.institution_id
          WHERE ui.user_id = d.user_id
            AND ui.revoked_at IS NULL
        ), '[]'::TEXT),
        'total_appointments', COALESCE((
          SELECT count(*)::integer
          FROM appointments a
          WHERE a.doctor_id = d.id
            AND a.status NOT IN ('cancelado', 'nao_compareceu')
            AND a.deleted_at IS NULL
        ), 0),
        'created_at', d.created_at,
        'updated_at', d.updated_at
      )
      ORDER BY COALESCE(u.full_name, p.full_name)
    )
    FROM doctors d
    LEFT JOIN users u ON u.id = d.user_id
    LEFT JOIN profiles p ON p.id = d.user_id
    LEFT JOIN specialties s ON s.id = d.specialty_id
    WHERE d.deleted_at IS NULL
      AND (
        COALESCE(p_include_inactive, true)
        OR (
          d.is_active = true
          AND COALESCE(u.is_active, true) = true
          AND COALESCE(p.is_active, true) = true
          AND (
            d.specialty_id IS NULL
            OR EXISTS (
              SELECT 1
              FROM specialties sx
              WHERE sx.id = d.specialty_id
                AND sx.deleted_at IS NULL
                AND sx.is_active = true
            )
          )
          AND (
            EXISTS (
              SELECT 1
              FROM institutions ip
              WHERE ip.id = u.primary_institution_id
                AND ip.deleted_at IS NULL
                AND ip.is_active = true
            )
            OR EXISTS (
              SELECT 1
              FROM user_institutions dui2
              JOIN institutions ii ON ii.id = dui2.institution_id
              WHERE dui2.user_id = d.user_id
                AND dui2.revoked_at IS NULL
                AND ii.deleted_at IS NULL
                AND ii.is_active = true
            )
          )
        )
      )
      AND (
        current_user_role() = 'superadmin'
        OR is_doctor_owner(d.id)
        OR (u.primary_institution_id IS NOT NULL AND user_has_institution_access(u.primary_institution_id))
        OR EXISTS (
          SELECT 1
          FROM user_institutions dui
          WHERE dui.user_id = d.user_id
            AND dui.revoked_at IS NULL
            AND user_has_institution_access(dui.institution_id)
        )
      )
      AND (
        p_search IS NULL
        OR p_search = ''
        OR normalize_search_text(COALESCE(u.full_name, p.full_name, '')) LIKE '%' || normalize_search_text(p_search) || '%'
        OR normalize_search_text(COALESCE(d.professional_council, '')) LIKE '%' || normalize_search_text(p_search) || '%'
        OR normalize_search_text(COALESCE(d.crm, '')) LIKE '%' || normalize_search_text(p_search) || '%'
        OR normalize_search_text(COALESCE(s.name, '')) LIKE '%' || normalize_search_text(p_search) || '%'
      )
  ), '[]'::TEXT);
END;
$$;

DROP FUNCTION IF EXISTS ensure_auth_backing_for_user(TEXT);
CREATE OR REPLACE FUNCTION ensure_auth_backing_for_user(p_user_id TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user users%ROWTYPE;
  v_conflicting_auth_id TEXT;
  v_created_auth INTEGER := false;
  v_email text;
  v_full_name text;
BEGIN
  SELECT *
  INTO v_user
  FROM users
  WHERE id = p_user_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuario inexistente';
  END IF;

  IF v_user.auth_user_id IS NOT NULL AND v_user.auth_user_id <> p_user_id THEN
    RAISE EXCEPTION 'Usuario legado com auth_user_id divergente exige reconciliacao manual';
  END IF;

  v_email := COALESCE(NULLIF(lower(btrim(v_user.email)), ''), lower(p_user_id::text || '@legacy.local'));
  v_full_name := COALESCE(NULLIF(btrim(v_user.full_name), ''), 'Usuario');

  SELECT au.id
  INTO v_conflicting_auth_id
  FROM auth.users au
  WHERE lower(COALESCE(au.email, '')) = v_email
    AND au.id <> p_user_id
    AND au.deleted_at IS NULL
  LIMIT 1;

  IF v_conflicting_auth_id IS NOT NULL THEN
    RAISE EXCEPTION 'Ja existe identidade Auth ativa com o mesmo e-mail (%) vinculada a outro usuario (%)', v_email, v_conflicting_auth_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM auth.users au
    WHERE au.id = p_user_id
      AND au.deleted_at IS NULL
  ) THEN
    INSERT INTO auth.users (
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      created_at,
      updated_at,
      raw_app_meta_data,
      raw_user_meta_data
    )
    VALUES (
      p_user_id,
      'authenticated',
      'authenticated',
      v_email,
      '',
      now(),
      now(),
      now(),
      '{"provider":"email","providers":["email"]}'::TEXT,
      TEXT_strip_nulls(
        TEXT_build_object(
          'source', 'users_doctors_legacy_profile_patch',
          'full_name', v_full_name,
          'phone', NULLIF(btrim(COALESCE(v_user.phone, '')), '')
        )
      )
    )
    ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        deleted_at = NULL,
        updated_at = now(),
        raw_app_meta_data = COALESCE(auth.users.raw_app_meta_data, '{}'::TEXT) || EXCLUDED.raw_app_meta_data,
        raw_user_meta_data = COALESCE(auth.users.raw_user_meta_data, '{}'::TEXT) || EXCLUDED.raw_user_meta_data;

    v_created_auth := true;
  END IF;

  UPDATE users
  SET auth_user_id = COALESCE(auth_user_id, p_user_id),
      email = v_email,
      full_name = v_full_name,
      auth_status = CASE
        WHEN auth_status IS NULL OR btrim(auth_status) = '' THEN 'pending_auth'
        ELSE auth_status
      END,
      deleted_at = NULL,
      deleted_by = NULL,
      updated_at = now()
  WHERE id = p_user_id;

  RETURN TEXT_build_object(
    'success', true,
    'user_id', p_user_id,
    'created_auth_user', v_created_auth
  );
END;
$$;

DROP FUNCTION IF EXISTS upsert_doctor(TEXT, text, TEXT, TEXT, integer, INTEGER, text);
DROP FUNCTION IF EXISTS upsert_doctor(TEXT, text, TEXT, TEXT, integer, INTEGER, text, text);
CREATE OR REPLACE FUNCTION upsert_doctor(
  p_user_id TEXT,
  p_crm text,
  p_doctor_id TEXT DEFAULT NULL,
  p_specialty_id TEXT DEFAULT NULL,
  p_is_active INTEGER DEFAULT true,
  p_idempotency_key text DEFAULT NULL,
  p_professional_council text DEFAULT 'CRM'
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor TEXT;
  v_user users%ROWTYPE;
  v_row doctors%ROWTYPE;
  v_crm text;
  v_professional_council text;
  v_existing TEXT;
  v_response TEXT;
BEGIN
  v_actor := assert_authenticated();
  v_existing := find_idempotent_response('upsert_doctor', p_idempotency_key);
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  v_crm := upper(normalize_text(p_crm, 40));
  v_professional_council := upper(normalize_text(COALESCE(p_professional_council, 'CRM'), 20));
  IF v_professional_council = 'CREDITO' THEN
    v_professional_council := 'CREFITO';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id obrigatorio';
  END IF;

  IF v_crm IS NULL THEN
    RAISE EXCEPTION 'Registro profissional obrigatorio';
  END IF;

  IF v_professional_council IS NULL
     OR v_professional_council NOT IN (
       'CRM', 'CRO', 'COREN', 'CREFITO', 'CRP', 'CRF', 'CRN',
       'CRESS', 'CREFONO', 'CRBM', 'CRMV', 'CREF', 'OUTRO'
     ) THEN
    RAISE EXCEPTION 'Conselho profissional invalido';
  END IF;

  SELECT *
  INTO v_user
  FROM users
  WHERE id = p_user_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuario do profissional nao encontrado';
  END IF;

  IF p_doctor_id IS NULL THEN
    PERFORM require_permission('doctors', 'create', v_user.primary_institution_id);
  ELSE
    PERFORM require_permission('doctors', 'update', v_user.primary_institution_id);
  END IF;

  PERFORM ensure_auth_backing_for_user(p_user_id);

  SELECT *
  INTO v_user
  FROM users
  WHERE id = p_user_id
    AND deleted_at IS NULL;

  PERFORM set_config('app.admin_operation', 'upsert_doctor', true);
  PERFORM set_config('app.access_operation', 'create_user', true);

  INSERT INTO profiles (id, email, first_name, last_name, role, phone, institution_id, is_active)
  VALUES (
    p_user_id,
    COALESCE(NULLIF(lower(btrim(v_user.email)), ''), lower(p_user_id::text || '@legacy.local')),
    split_part(COALESCE(NULLIF(btrim(v_user.full_name), ''), 'Usuario'), ' ', 1),
    NULLIF(
      btrim(
        substr(
          COALESCE(NULLIF(btrim(v_user.full_name), ''), 'Usuario'),
          length(split_part(COALESCE(NULLIF(btrim(v_user.full_name), ''), 'Usuario'), ' ', 1)) + 1
        )
      ),
      ''
    ),
    'medico',
    v_user.phone,
    v_user.primary_institution_id,
    true
  )
  ON CONFLICT (id) DO UPDATE
  SET email = COALESCE(NULLIF(EXCLUDED.email, ''), profiles.email),
      first_name = COALESCE(NULLIF(EXCLUDED.first_name, ''), profiles.first_name),
      last_name = COALESCE(EXCLUDED.last_name, profiles.last_name),
      role = 'medico',
      phone = COALESCE(EXCLUDED.phone, profiles.phone),
      institution_id = COALESCE(EXCLUDED.institution_id, profiles.institution_id),
      is_active = true,
      deleted_at = NULL,
      deleted_by = NULL,
      updated_at = now();

  PERFORM set_config('app.access_operation', 'sync_user_profile', true);

  IF p_doctor_id IS NULL THEN
    INSERT INTO doctors (user_id, professional_council, crm, specialty_id, is_active)
    VALUES (
      p_user_id,
      v_professional_council,
      v_crm,
      p_specialty_id,
      COALESCE(p_is_active, true)
    )
    ON CONFLICT (user_id)
    DO UPDATE SET
      professional_council = EXCLUDED.professional_council,
      crm = EXCLUDED.crm,
      specialty_id = EXCLUDED.specialty_id,
      is_active = EXCLUDED.is_active,
      updated_at = now()
    RETURNING * INTO v_row;
  ELSE
    UPDATE doctors
    SET professional_council = v_professional_council,
        crm = v_crm,
        specialty_id = COALESCE(p_specialty_id, specialty_id),
        is_active = COALESCE(p_is_active, is_active),
        updated_at = now()
    WHERE id = p_doctor_id
      AND deleted_at IS NULL
    RETURNING * INTO v_row;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Profissional nao encontrado';
    END IF;
  END IF;

  UPDATE profiles
  SET role = 'medico',
      institution_id = COALESCE(institution_id, v_user.primary_institution_id),
      phone = COALESCE(phone, v_user.phone),
      email = COALESCE(email, v_user.email),
      updated_at = now()
  WHERE id = p_user_id;

  INSERT INTO clinical_events (institution_id, aggregate_table, aggregate_id, event_type, payload, idempotency_key, created_by)
  VALUES (v_user.primary_institution_id, 'doctors', v_row.id, 'catalog.doctor_upserted', to_TEXT(v_row), p_idempotency_key, v_actor)
  ON CONFLICT (institution_id, idempotency_key) DO NOTHING;

  v_response := TEXT_build_object('success', true, 'doctor', to_TEXT(v_row));
  RETURN remember_idempotent_response('upsert_doctor', p_idempotency_key, v_user.primary_institution_id, v_response);
END;
$$;

CREATE OR REPLACE FUNCTION set_doctor_active(
  p_doctor_id TEXT,
  p_is_active INTEGER,
  p_idempotency_key text DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor TEXT;
  v_row doctors%ROWTYPE;
  v_user users%ROWTYPE;
  v_existing TEXT;
  v_response TEXT;
BEGIN
  v_actor := assert_authenticated();
  v_existing := find_idempotent_response('set_doctor_active', p_idempotency_key);
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  SELECT *
  INTO v_row
  FROM doctors d
  WHERE d.id = p_doctor_id
    AND d.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profissional nao encontrado';
  END IF;

  SELECT *
  INTO v_user
  FROM users u
  WHERE u.id = v_row.user_id;

  PERFORM require_permission('doctors', 'update', v_user.primary_institution_id);
  PERFORM set_config('app.admin_operation', 'set_doctor_active', true);

  UPDATE doctors
  SET is_active = COALESCE(p_is_active, false),
      updated_at = now()
  WHERE id = p_doctor_id
  RETURNING * INTO v_row;

  INSERT INTO clinical_events (institution_id, aggregate_table, aggregate_id, event_type, payload, idempotency_key, created_by)
  VALUES (v_user.primary_institution_id, 'doctors', v_row.id, 'catalog.doctor_status_changed', to_TEXT(v_row), p_idempotency_key, v_actor)
  ON CONFLICT (institution_id, idempotency_key) DO NOTHING;

  v_response := TEXT_build_object('success', true, 'doctor', to_TEXT(v_row));
  RETURN remember_idempotent_response('set_doctor_active', p_idempotency_key, v_user.primary_institution_id, v_response);
END;
$$;

CREATE OR REPLACE FUNCTION list_notifications_snapshot(
  p_limit integer DEFAULT 10
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doctor TEXT;
  v_today_start DATETIME;
  v_today_end DATETIME;
BEGIN
  v_doctor := current_user_doctor_id();
  v_today_start := date_trunc('day', now());
  v_today_end := v_today_start + interval '1 day';

  PERFORM assert_can_access(
    'appointments',
    'read',
    TEXT_build_object('institution_id', current_user_primary_institution(), 'doctor_id', v_doctor)
  );

  RETURN TEXT_build_object(
    'items',
    COALESCE((
      SELECT TEXT_agg(
        TEXT_build_object(
          'id', a.id,
          'ticket_number', a.ticket_number,
          'appointment_date', a.appointment_date,
          'status', a.status,
          'patient_name', p.full_name,
          'doctor_name', COALESCE(u.full_name, pr.full_name)
        )
        ORDER BY a.appointment_date
      )
      FROM (
        SELECT a.*
        FROM appointments a
        WHERE a.deleted_at IS NULL
          AND a.appointment_date >= v_today_start
          AND a.appointment_date < v_today_end
          AND a.status IN ('agendado', 'confirmado', 'em_atendimento')
          AND (
            current_user_role() = 'superadmin'
            OR (current_user_role() = 'recepcao' AND user_has_institution_access(a.institution_id))
            OR (
              current_user_role() = 'medico'
              AND v_doctor IS NOT NULL
              AND (
                a.doctor_id = v_doctor
                OR (
                  a.status IN ('agendado', 'confirmado')
                  AND a.specialty_id IS NOT NULL
                  AND a.specialty_id = current_user_doctor_specialty_id()
                )
              )
            )
          )
        ORDER BY a.appointment_date
        LIMIT GREATEST(COALESCE(p_limit, 10), 1)
      ) a
      JOIN patients p ON p.id = a.patient_id
      JOIN doctors d ON d.id = a.doctor_id
      LEFT JOIN users u ON u.id = d.user_id
      LEFT JOIN profiles pr ON pr.id = d.user_id
    ), '[]'::TEXT),
    'pending_count',
    COALESCE((
      SELECT count(*)::integer
      FROM appointments a
      WHERE a.deleted_at IS NULL
        AND a.appointment_date >= v_today_start
        AND a.appointment_date < v_today_end
        AND a.status IN ('agendado', 'confirmado')
        AND (
          current_user_role() = 'superadmin'
          OR (current_user_role() = 'recepcao' AND user_has_institution_access(a.institution_id))
          OR (
            current_user_role() = 'medico'
            AND v_doctor IS NOT NULL
            AND (
              a.doctor_id = v_doctor
              OR (
                a.status IN ('agendado', 'confirmado')
                AND a.specialty_id IS NOT NULL
                AND a.specialty_id = current_user_doctor_specialty_id()
              )
            )
          )
        )
    ), 0)
  );
END;
$$;

CREATE OR REPLACE FUNCTION appointment_operational_at(
  p_status TEXT,
  p_appointment_date DATETIME,
  p_actual_start_at DATETEXT DEFAULT NULL,
  p_actual_end_at DATETEXT DEFAULT NULL,
  p_updated_at DATETEXT DEFAULT NULL,
  p_created_at DATETEXT DEFAULT NULL
)
RETURNS DATETIME
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_status = 'concluido'::TEXT
      THEN COALESCE(p_actual_end_at, p_updated_at, p_appointment_date, p_created_at)
    WHEN p_status IN ('cancelado'::TEXT, 'nao_compareceu'::TEXT)
      THEN COALESCE(p_updated_at, p_appointment_date, p_created_at)
    WHEN p_status = 'em_atendimento'::TEXT
      THEN COALESCE(p_actual_start_at, p_updated_at, p_appointment_date, p_created_at)
    ELSE COALESCE(p_appointment_date, p_created_at)
  END
$$;

CREATE OR REPLACE FUNCTION get_dashboard_snapshot(
  p_days integer DEFAULT 7
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doctor TEXT;
  v_scope TEXT;
  v_today_start DATETIME;
  v_today_end DATETIME;
BEGIN
  v_doctor := current_user_doctor_id();
  v_scope := current_user_primary_institution();
  v_today_start := date_trunc('day', now());
  v_today_end := v_today_start + interval '1 day';

  IF current_user_role() IN ('admin', 'auditor') THEN
    RETURN get_auditor_dashboard_snapshot(GREATEST(COALESCE(p_days, 7), 1));
  END IF;

  PERFORM assert_can_access(
    'appointments',
    'read',
    TEXT_build_object('institution_id', v_scope, 'doctor_id', v_doctor)
  );

  RETURN (
    WITH scoped_appointments AS (
      SELECT a.*
      FROM appointments a
      WHERE a.deleted_at IS NULL
        AND (
          current_user_role() = 'superadmin'
          OR (current_user_role() = 'recepcao' AND user_has_institution_access(a.institution_id))
          OR (
            current_user_role() = 'medico'
            AND v_doctor IS NOT NULL
            AND (
              a.doctor_id = v_doctor
              OR (
                a.status IN ('agendado', 'confirmado')
                AND a.specialty_id IS NOT NULL
                AND a.specialty_id = current_user_doctor_specialty_id()
              )
            )
          )
        )
    ),
    today_rows AS (
      SELECT a.id,
             a.appointment_date,
             a.status,
             p.full_name AS patient_name,
             d.id AS doctor_id,
             COALESCE(u.full_name, pr.full_name) AS doctor_name,
             s.name AS specialty_name
      FROM scoped_appointments a
      JOIN patients p ON p.id = a.patient_id
      JOIN doctors d ON d.id = a.doctor_id
      LEFT JOIN users u ON u.id = d.user_id
      LEFT JOIN profiles pr ON pr.id = d.user_id
      LEFT JOIN specialties s ON s.id = a.specialty_id
      WHERE a.appointment_date >= v_today_start
        AND a.appointment_date < v_today_end
        AND a.status <> 'cancelado'
      ORDER BY a.appointment_date
      LIMIT 10
    ),
    stats AS (
      SELECT
        count(*) FILTER (WHERE appointment_date >= v_today_start AND appointment_date < v_today_end)::integer AS today_appointments,
        count(*) FILTER (
          WHERE status = 'concluido'
            AND appointment_operational_at(status, appointment_date, actual_start_at, actual_end_at, updated_at, created_at) >= now() - interval '30 days'
        )::integer AS completed_appointments,
        count(*) FILTER (WHERE status IN ('agendado', 'confirmado', 'em_atendimento'))::integer AS pending_appointments,
        count(*) FILTER (
          WHERE status = 'cancelado'
            AND appointment_operational_at(status, appointment_date, actual_start_at, actual_end_at, updated_at, created_at) >= now() - interval '30 days'
        )::integer AS cancelled_appointments
      FROM scoped_appointments
    ),
    patient_count AS (
      SELECT count(*)::integer AS total_patients
      FROM patients p
      WHERE p.deleted_at IS NULL
        AND (
          current_user_role() = 'superadmin'
          OR (current_user_role() = 'recepcao' AND user_has_institution_access(p.institution_id))
          OR (
            current_user_role() = 'medico'
            AND
            v_doctor IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM appointments a
              WHERE a.patient_id = p.id
                AND a.doctor_id = v_doctor
                AND a.deleted_at IS NULL
            )
          )
        )
    ),
    doctor_count AS (
      SELECT count(*)::integer AS total_doctors
      FROM doctors d
      LEFT JOIN users u ON u.id = d.user_id
      WHERE d.deleted_at IS NULL
        AND (
          current_user_role() = 'superadmin'
          OR is_doctor_owner(d.id)
          OR (u.primary_institution_id IS NOT NULL AND user_has_institution_access(u.primary_institution_id))
          OR EXISTS (
            SELECT 1
            FROM user_institutions dui
            WHERE dui.user_id = d.user_id
              AND dui.revoked_at IS NULL
              AND user_has_institution_access(dui.institution_id)
          )
        )
    ),
    trend AS (
      SELECT TEXT_agg(
        TEXT_build_object(
          'date', to_char(day_ref, 'DD/MM'),
          'consultas', COALESCE(total_count, 0),
          'concluidas', COALESCE(done_count, 0)
        )
        ORDER BY day_ref
      ) AS rows
      FROM (
        SELECT gs.day_ref,
               count(a.id) FILTER (WHERE a.appointment_date >= gs.day_ref AND a.appointment_date < gs.day_ref + interval '1 day')::integer AS total_count,
               count(a.id) FILTER (
                 WHERE a.status = 'concluido'
                   AND appointment_operational_at(a.status, a.appointment_date, a.actual_start_at, a.actual_end_at, a.updated_at, a.created_at) >= gs.day_ref
                   AND appointment_operational_at(a.status, a.appointment_date, a.actual_start_at, a.actual_end_at, a.updated_at, a.created_at) < gs.day_ref + interval '1 day'
               )::integer AS done_count
        FROM generate_series(current_date - GREATEST(COALESCE(p_days, 7), 1) + 1, current_date, interval '1 day') AS gs(day_ref)
        LEFT JOIN scoped_appointments a
          ON (
            (a.appointment_date >= gs.day_ref AND a.appointment_date < gs.day_ref + interval '1 day')
            OR (
              appointment_operational_at(a.status, a.appointment_date, a.actual_start_at, a.actual_end_at, a.updated_at, a.created_at) >= gs.day_ref
              AND appointment_operational_at(a.status, a.appointment_date, a.actual_start_at, a.actual_end_at, a.updated_at, a.created_at) < gs.day_ref + interval '1 day'
            )
          )
        GROUP BY gs.day_ref
      ) x
    ),
    status_breakdown AS (
      SELECT TEXT_agg(
        TEXT_build_object(
          'name', label,
          'value', value,
          'color', color
        )
      ) AS rows
      FROM (
        VALUES
          ('Concluidas', (SELECT completed_appointments FROM stats), '#22c55e'),
          ('Pendentes', (SELECT pending_appointments FROM stats), '#eab308'),
          ('Canceladas', (SELECT cancelled_appointments FROM stats), '#ef4444'),
          ('Hoje', (SELECT today_appointments FROM stats), '#6366f1')
      ) AS items(label, value, color)
      WHERE value > 0
    )
    SELECT TEXT_build_object(
      'institution_name', (SELECT i.name FROM institutions i WHERE i.id = v_scope),
      'user_role', current_user_role(),
      'today_appointments', (SELECT today_appointments FROM stats),
      'completed_appointments', (SELECT completed_appointments FROM stats),
      'pending_appointments', (SELECT pending_appointments FROM stats),
      'cancelled_appointments', (SELECT cancelled_appointments FROM stats),
      'total_patients', (SELECT total_patients FROM patient_count),
      'total_doctors', (SELECT total_doctors FROM doctor_count),
      'todays_appointments', COALESCE((
        SELECT TEXT_agg(to_TEXT(today_rows) ORDER BY appointment_date)
        FROM today_rows
      ), '[]'::TEXT),
      'trend', COALESCE((SELECT rows FROM trend), '[]'::TEXT),
      'status_breakdown', COALESCE((SELECT rows FROM status_breakdown), '[]'::TEXT)
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION get_dashboard_bi_snapshot(
  p_days integer DEFAULT 30,
  p_institution_id text DEFAULT NULL,
  p_doctor_id text DEFAULT NULL,
  p_specialty_id text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_type text DEFAULT NULL,
  p_search text DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doctor TEXT;
  v_scope TEXT;
  v_days integer;
  v_period_start date;
  v_period_end date;
  v_previous_start date;
  v_previous_end date;
  v_search text;
BEGIN
  v_doctor := current_user_doctor_id();
  v_scope := current_user_primary_institution();
  v_days := LEAST(GREATEST(COALESCE(p_days, 30), 1), 365);
  v_period_end := current_date;
  v_period_start := current_date - v_days + 1;
  v_previous_end := v_period_start - 1;
  v_previous_start := v_previous_end - v_days + 1;
  v_search := NULLIF(trim(COALESCE(p_search, '')), '');

  PERFORM assert_can_access(
    'appointments',
    'read',
    TEXT_build_object(
      'institution_id', COALESCE(NULLIF(split_part(p_institution_id, ',', 1), '')::TEXT, v_scope),
      'doctor_id', COALESCE(NULLIF(split_part(p_doctor_id, ',', 1), '')::TEXT, v_doctor)
    )
  );

  RETURN (
    WITH accessible_appointments AS (
      SELECT a.*
      FROM appointments a
      WHERE a.deleted_at IS NULL
        AND (
          current_user_role() = 'superadmin'
          OR (current_user_role() IN ('admin', 'auditor', 'recepcao') AND user_has_institution_access(a.institution_id))
          OR (
            current_user_role() = 'medico'
            AND v_doctor IS NOT NULL
            AND (
              a.doctor_id = v_doctor
              OR (
                a.status IN ('agendado', 'confirmado')
                AND a.specialty_id IS NOT NULL
                AND a.specialty_id = current_user_doctor_specialty_id()
              )
            )
          )
        )
    ),
    scoped_appointments AS (
      SELECT a.*
      FROM accessible_appointments a
      JOIN patients p ON p.id = a.patient_id
      LEFT JOIN doctors d ON d.id = a.doctor_id
      LEFT JOIN users du ON du.id = d.user_id
      LEFT JOIN specialties s ON s.id = a.specialty_id
      LEFT JOIN institutions i ON i.id = a.institution_id
      WHERE (p_institution_id IS NULL OR a.institution_id::text IN (SELECT trim(value) FROM unnest(string_to_array(p_institution_id, ',')) AS value))
        AND (p_doctor_id IS NULL OR a.doctor_id::text IN (SELECT trim(value) FROM unnest(string_to_array(p_doctor_id, ',')) AS value) OR a.scheduled_doctor_id::text IN (SELECT trim(value) FROM unnest(string_to_array(p_doctor_id, ',')) AS value))
        AND (p_specialty_id IS NULL OR a.specialty_id::text IN (SELECT trim(value) FROM unnest(string_to_array(p_specialty_id, ',')) AS value))
        AND (p_status IS NULL OR a.status::text IN (SELECT trim(value) FROM unnest(string_to_array(p_status, ',')) AS value))
        AND (p_type IS NULL OR a.type::text IN (SELECT trim(value) FROM unnest(string_to_array(p_type, ',')) AS value))
        AND (
          v_search IS NULL
          OR normalize_search_text(p.full_name) LIKE '%' || normalize_search_text(v_search) || '%'
          OR (
            NULLIF(regexp_replace(v_search, '\D', '', 'g'), '') IS NOT NULL
            AND regexp_replace(COALESCE(p.cpf, ''), '\D', '', 'g') ILIKE '%' || regexp_replace(v_search, '\D', '', 'g') || '%'
          )
          OR normalize_search_text(COALESCE(du.full_name, '')) LIKE '%' || normalize_search_text(v_search) || '%'
          OR normalize_search_text(COALESCE(s.name, '')) LIKE '%' || normalize_search_text(v_search) || '%'
          OR normalize_search_text(COALESCE(i.name, '')) LIKE '%' || normalize_search_text(v_search) || '%'
          OR COALESCE(a.ticket_number, '') ILIKE '%' || v_search || '%'
        )
    ),
    current_period AS (
      SELECT *
      FROM scoped_appointments a
      WHERE (a.appointment_date AT TEXT ZONE get_operational_timezone(a.institution_id))::date BETWEEN v_period_start AND v_period_end
    ),
    previous_period AS (
      SELECT *
      FROM scoped_appointments a
      WHERE (a.appointment_date AT TEXT ZONE get_operational_timezone(a.institution_id))::date BETWEEN v_previous_start AND v_previous_end
    ),
    current_stats AS (
      SELECT
        count(*)::integer AS scheduled,
        count(*) FILTER (WHERE status = 'concluido')::integer AS completed,
        count(*) FILTER (WHERE status IN ('agendado', 'confirmado', 'em_atendimento'))::integer AS pending,
        count(*) FILTER (WHERE status = 'cancelado')::integer AS cancelled,
        count(*) FILTER (WHERE status = 'nao_compareceu')::integer AS no_show,
        count(DISTINCT patient_id)::integer AS patients,
        count(DISTINCT doctor_id)::integer AS doctors,
        COALESCE(round(avg(EXTRACT(epoch FROM (actual_end_at - actual_start_at)) / 60) FILTER (WHERE actual_start_at IS NOT NULL AND actual_end_at IS NOT NULL)::REAL, 1), 0)::REAL AS avg_service_minutes,
        COALESCE(round(avg(EXTRACT(epoch FROM (appointment_date - created_at)) / 86400) FILTER (WHERE appointment_date > created_at)::REAL, 1), 0)::REAL AS avg_days_until_appointment
      FROM current_period
    ),
    previous_stats AS (
      SELECT
        count(*)::integer AS scheduled,
        count(*) FILTER (WHERE status = 'concluido')::integer AS completed,
        count(*) FILTER (WHERE status = 'cancelado')::integer AS cancelled,
        count(*) FILTER (WHERE status = 'nao_compareceu')::integer AS no_show
      FROM previous_period
    ),
    patient_first_seen AS (
      SELECT cp.patient_id, min(a.appointment_date::date) AS first_date
      FROM current_period cp
      JOIN accessible_appointments a ON a.patient_id = cp.patient_id
      GROUP BY cp.patient_id
    ),
    timeline AS (
      SELECT TEXT_agg(
        TEXT_build_object(
          'date', to_char(day_ref, 'DD/MM'),
          'iso_date', to_char(day_ref, 'YYYY-MM-DD'),
          'agendadas', COALESCE(scheduled_count, 0),
          'realizadas', COALESCE(completed_count, 0),
          'canceladas', COALESCE(cancelled_count, 0),
          'pendentes', COALESCE(pending_count, 0),
          'no_show', COALESCE(no_show_count, 0)
        )
        ORDER BY day_ref
      ) AS rows
      FROM (
        SELECT gs.day_ref,
               count(a.id)::integer AS scheduled_count,
               count(a.id) FILTER (WHERE a.status = 'concluido')::integer AS completed_count,
               count(a.id) FILTER (WHERE a.status = 'cancelado')::integer AS cancelled_count,
               count(a.id) FILTER (WHERE a.status IN ('agendado', 'confirmado', 'em_atendimento'))::integer AS pending_count,
               count(a.id) FILTER (WHERE a.status = 'nao_compareceu')::integer AS no_show_count
        FROM generate_series(v_period_start, v_period_end, interval '1 day') AS gs(day_ref)
        LEFT JOIN current_period a ON a.appointment_date::date = gs.day_ref::date
        GROUP BY gs.day_ref
      ) x
    ),
    heatmap AS (
      SELECT TEXT_agg(
        TEXT_build_object(
          'day', day_name,
          'dow', dow,
          'hour', hour_label,
          'value', total,
          'intensity', CASE WHEN max_total > 0 THEN round((total::REAL / max_total::REAL) * 100, 1) ELSE 0 END
        )
        ORDER BY dow, hour_value
      ) AS rows
      FROM (
        SELECT *,
               max(total) OVER () AS max_total
        FROM (
          SELECT
            EXTRACT(isodow FROM appointment_date)::integer AS dow,
            CASE EXTRACT(isodow FROM appointment_date)::integer
              WHEN 1 THEN 'Seg'
              WHEN 2 THEN 'Ter'
              WHEN 3 THEN 'Qua'
              WHEN 4 THEN 'Qui'
              WHEN 5 THEN 'Sex'
              WHEN 6 THEN 'Sab'
              ELSE 'Dom'
            END AS day_name,
            EXTRACT(hour FROM appointment_date)::integer AS hour_value,
            to_char(date_trunc('hour', appointment_date), 'HH24:00') AS hour_label,
            count(*)::integer AS total
          FROM current_period
          GROUP BY 1, 2, 3, 4
        ) h
      ) ranked
    ),
    professional_ranking AS (
      SELECT TEXT_agg(to_TEXT(row_data) ORDER BY row_data.completed DESC, row_data.scheduled DESC) AS rows
      FROM (
        SELECT
          d.id,
          COALESCE(u.full_name, pr.full_name, 'Profissional') AS name,
          COALESCE(s.name, 'Sem especialidade') AS specialty,
          count(a.id)::integer AS scheduled,
          count(a.id) FILTER (WHERE a.status = 'concluido')::integer AS completed,
          count(a.id) FILTER (WHERE a.status = 'cancelado')::integer AS cancelled,
          count(a.id) FILTER (WHERE a.status = 'nao_compareceu')::integer AS no_show,
          CASE WHEN count(a.id) > 0 THEN round((count(a.id) FILTER (WHERE a.status = 'concluido')::REAL / count(a.id)::REAL) * 100, 1) ELSE 0 END AS efficiency
        FROM current_period a
        JOIN doctors d ON d.id = a.doctor_id
        LEFT JOIN users u ON u.id = d.user_id
        LEFT JOIN profiles pr ON pr.id = d.user_id
        LEFT JOIN specialties s ON s.id = a.specialty_id
        GROUP BY d.id, u.full_name, pr.full_name, s.name
        ORDER BY completed DESC, scheduled DESC
        LIMIT 10
      ) row_data
    ),
    specialty_ranking AS (
      SELECT TEXT_agg(to_TEXT(row_data) ORDER BY row_data.demand DESC) AS rows
      FROM (
        SELECT
          s.id,
          COALESCE(s.name, 'Sem especialidade') AS name,
          count(a.id)::integer AS demand,
          count(a.id) FILTER (WHERE a.status = 'concluido')::integer AS completed,
          count(a.id) FILTER (WHERE a.status = 'cancelado')::integer AS cancelled,
          CASE WHEN count(a.id) > 0 THEN round((count(a.id) FILTER (WHERE a.status = 'concluido')::REAL / count(a.id)::REAL) * 100, 1) ELSE 0 END AS conversion
        FROM current_period a
        LEFT JOIN specialties s ON s.id = a.specialty_id
        GROUP BY s.id, s.name
        ORDER BY demand DESC
        LIMIT 10
      ) row_data
    ),
    unit_distribution AS (
      SELECT TEXT_agg(to_TEXT(row_data) ORDER BY row_data.volume DESC) AS rows
      FROM (
        SELECT
          i.id,
          COALESCE(i.name, 'Sem unidade') AS name,
          count(a.id)::integer AS volume,
          count(a.id) FILTER (WHERE a.status = 'concluido')::integer AS completed,
          count(a.id) FILTER (WHERE a.status = 'cancelado')::integer AS cancelled,
          CASE WHEN count(a.id) > 0 THEN round((count(a.id) FILTER (WHERE a.status = 'concluido')::REAL / count(a.id)::REAL) * 100, 1) ELSE 0 END AS efficiency
        FROM current_period a
        LEFT JOIN institutions i ON i.id = a.institution_id
        GROUP BY i.id, i.name
        ORDER BY volume DESC
        LIMIT 10
      ) row_data
    ),
    type_distribution AS (
      SELECT TEXT_agg(to_TEXT(row_data) ORDER BY row_data.volume DESC) AS rows
      FROM (
        SELECT
          a.type::text AS name,
          count(a.id)::integer AS volume,
          count(a.id) FILTER (WHERE a.status = 'cancelado')::integer AS cancelled,
          CASE WHEN count(a.id) > 0 THEN round((count(a.id) FILTER (WHERE a.status = 'concluido')::REAL / count(a.id)::REAL) * 100, 1) ELSE 0 END AS conversion
        FROM current_period a
        GROUP BY a.type
      ) row_data
    ),
    filter_catalog AS (
      SELECT TEXT_build_object(
        'institutions', COALESCE((
          SELECT TEXT_agg(TEXT_build_object('id', id, 'name', name) ORDER BY name)
          FROM (
            SELECT DISTINCT i.id, i.name
            FROM accessible_appointments a
            JOIN institutions i ON i.id = a.institution_id
          ) rows
        ), '[]'::TEXT),
        'doctors', COALESCE((
          SELECT TEXT_agg(TEXT_build_object('id', id, 'name', name, 'specialty_id', specialty_id, 'institution_ids', institution_ids) ORDER BY name)
          FROM (
            SELECT
              d.id,
              COALESCE(u.full_name, pr.full_name, 'Profissional') AS name,
              d.specialty_id,
              COALESCE(TEXT_agg(DISTINCT a.institution_id) FILTER (WHERE a.institution_id IS NOT NULL), '[]'::TEXT) AS institution_ids
            FROM accessible_appointments a
            JOIN doctors d ON d.id = a.doctor_id
            LEFT JOIN users u ON u.id = d.user_id
            LEFT JOIN profiles pr ON pr.id = d.user_id
            GROUP BY d.id, u.full_name, pr.full_name, d.specialty_id
          ) rows
        ), '[]'::TEXT),
        'specialties', COALESCE((
          SELECT TEXT_agg(TEXT_build_object('id', id, 'name', name, 'institution_ids', institution_ids) ORDER BY name)
          FROM (
            SELECT
              s.id,
              s.name,
              COALESCE(TEXT_agg(DISTINCT a.institution_id) FILTER (WHERE a.institution_id IS NOT NULL), '[]'::TEXT) AS institution_ids
            FROM accessible_appointments a
            JOIN specialties s ON s.id = a.specialty_id
            GROUP BY s.id, s.name
          ) rows
        ), '[]'::TEXT)
      ) AS catalog
    )
    SELECT TEXT_build_object(
      'period', TEXT_build_object('days', v_days, 'start', v_period_start, 'end', v_period_end, 'previous_start', v_previous_start, 'previous_end', v_previous_end),
      'filters', (SELECT catalog FROM filter_catalog),
      'kpis', TEXT_build_object(
        'scheduled', (SELECT scheduled FROM current_stats),
        'completed', (SELECT completed FROM current_stats),
        'pending', (SELECT pending FROM current_stats),
        'cancelled', (SELECT cancelled FROM current_stats),
        'patients', (SELECT patients FROM current_stats),
        'doctors', (SELECT doctors FROM current_stats),
        'no_show', (SELECT no_show FROM current_stats),
        'new_patients', COALESCE((SELECT count(*) FROM patient_first_seen WHERE first_date BETWEEN v_period_start AND v_period_end), 0),
        'recurring_patients', GREATEST((SELECT patients FROM current_stats) - COALESCE((SELECT count(*) FROM patient_first_seen WHERE first_date BETWEEN v_period_start AND v_period_end), 0), 0),
        'completion_rate', CASE WHEN (SELECT scheduled FROM current_stats) > 0 THEN round(((SELECT completed FROM current_stats)::REAL / (SELECT scheduled FROM current_stats)::REAL) * 100, 1) ELSE 0 END,
        'cancellation_rate', CASE WHEN (SELECT scheduled FROM current_stats) > 0 THEN round(((SELECT cancelled FROM current_stats)::REAL / (SELECT scheduled FROM current_stats)::REAL) * 100, 1) ELSE 0 END,
        'no_show_rate', CASE WHEN (SELECT scheduled FROM current_stats) > 0 THEN round(((SELECT no_show FROM current_stats)::REAL / (SELECT scheduled FROM current_stats)::REAL) * 100, 1) ELSE 0 END,
        'avg_daily', round(((SELECT scheduled FROM current_stats)::REAL / v_days::REAL), 1),
        'avg_weekly', round(((SELECT scheduled FROM current_stats)::REAL / GREATEST(v_days::REAL / 7, 1)), 1),
        'avg_days_until_appointment', (SELECT avg_days_until_appointment FROM current_stats),
        'avg_service_minutes', (SELECT avg_service_minutes FROM current_stats),
        'growth_rate', CASE WHEN (SELECT scheduled FROM previous_stats) > 0 THEN round((((SELECT scheduled FROM current_stats)::REAL - (SELECT scheduled FROM previous_stats)::REAL) / (SELECT scheduled FROM previous_stats)::REAL) * 100, 1) ELSE 0 END,
        'efficiency', CASE WHEN ((SELECT completed FROM current_stats) + (SELECT cancelled FROM current_stats) + (SELECT no_show FROM current_stats)) > 0 THEN round(((SELECT completed FROM current_stats)::REAL / ((SELECT completed FROM current_stats) + (SELECT cancelled FROM current_stats) + (SELECT no_show FROM current_stats))::REAL) * 100, 1) ELSE 0 END,
        'operational_balance', GREATEST((SELECT pending FROM current_stats) - (SELECT cancelled FROM current_stats), 0),
        'critical_hours', COALESCE((SELECT count(*) FROM (SELECT 1 FROM current_period GROUP BY date_part('hour', appointment_date), date_part('isodow', appointment_date) HAVING count(*) >= 4) ch), 0),
        'idle_hours', GREATEST((v_days * 10) - COALESCE((SELECT count(DISTINCT to_char(appointment_date, 'YYYY-MM-DD HH24')) FROM current_period), 0), 0)
      ),
      'timeline', COALESCE((SELECT rows FROM timeline), '[]'::TEXT),
      'heatmap', COALESCE((SELECT rows FROM heatmap), '[]'::TEXT),
      'funnel', TEXT_build_array(
        TEXT_build_object('stage', 'Agendadas', 'value', (SELECT scheduled FROM current_stats)),
        TEXT_build_object('stage', 'Confirmadas', 'value', COALESCE((SELECT count(*) FROM current_period WHERE status IN ('confirmado', 'em_atendimento', 'concluido')), 0)),
        TEXT_build_object('stage', 'Comparecimento', 'value', COALESCE((SELECT count(*) FROM current_period WHERE status NOT IN ('cancelado', 'nao_compareceu')), 0)),
        TEXT_build_object('stage', 'Concluidas', 'value', (SELECT completed FROM current_stats)),
        TEXT_build_object('stage', 'Canceladas', 'value', (SELECT cancelled FROM current_stats))
      ),
      'rankings', TEXT_build_object(
        'professionals', COALESCE((SELECT rows FROM professional_ranking), '[]'::TEXT),
        'specialties', COALESCE((SELECT rows FROM specialty_ranking), '[]'::TEXT),
        'units', COALESCE((SELECT rows FROM unit_distribution), '[]'::TEXT),
        'types', COALESCE((SELECT rows FROM type_distribution), '[]'::TEXT)
      ),
      'alerts', (
        SELECT TEXT_agg(alert)
        FROM (
          SELECT TEXT_build_object('severity', 'critical', 'title', 'Cancelamentos elevados', 'impact', 'A taxa de cancelamento ultrapassou 15%.', 'recommendation', 'Revisar confirmaÃƒÂ§ÃƒÂµes ativas e motivos de cancelamento.') AS alert
          WHERE CASE WHEN (SELECT scheduled FROM current_stats) > 0 THEN ((SELECT cancelled FROM current_stats)::REAL / (SELECT scheduled FROM current_stats)::REAL) ELSE 0 END > 0.15
          UNION ALL
          SELECT TEXT_build_object('severity', 'warning', 'title', 'No-show acima do esperado', 'impact', 'HÃƒÂ¡ perda de capacidade por ausÃƒÂªncia.', 'recommendation', 'ReforÃƒÂ§ar lembretes e encaixes para horÃƒÂ¡rios de maior risco.')
          WHERE CASE WHEN (SELECT scheduled FROM current_stats) > 0 THEN ((SELECT no_show FROM current_stats)::REAL / (SELECT scheduled FROM current_stats)::REAL) ELSE 0 END > 0.08
          UNION ALL
          SELECT TEXT_build_object('severity', 'success', 'title', 'Crescimento operacional', 'impact', 'Demanda cresceu frente ao perÃƒÂ­odo anterior.', 'recommendation', 'Avaliar capacidade, profissionais e janelas crÃƒÂ­ticas.')
          WHERE CASE WHEN (SELECT scheduled FROM previous_stats) > 0 THEN (((SELECT scheduled FROM current_stats)::REAL - (SELECT scheduled FROM previous_stats)::REAL) / (SELECT scheduled FROM previous_stats)::REAL) ELSE 0 END > 0.1
          UNION ALL
          SELECT TEXT_build_object('severity', 'info', 'title', 'Baixa ocupaÃƒÂ§ÃƒÂ£o detectada', 'impact', 'Existem blocos horÃƒÂ¡rios com baixa utilizaÃƒÂ§ÃƒÂ£o.', 'recommendation', 'Rebalancear agendas, campanhas e encaixes por especialidade.')
          WHERE (SELECT scheduled FROM current_stats) < GREATEST(v_days * 4, 1)
        ) alerts
      )
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION list_appointments_snapshot(
  p_status text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 5000,
  p_start_date text DEFAULT NULL,
  p_end_date text DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doctor TEXT;
  v_scope TEXT;
BEGIN
  v_doctor := current_user_doctor_id();
  v_scope := current_user_primary_institution();

  PERFORM assert_can_access(
    'appointments',
    'read',
    TEXT_build_object('institution_id', v_scope, 'doctor_id', v_doctor)
  );

  RETURN COALESCE((
    WITH latest_entry AS (
      SELECT DISTINCT ON (mre.encounter_id)
        mre.encounter_id,
        mre.clinical_data
      FROM medical_record_entries mre
      ORDER BY mre.encounter_id, mre.version DESC
    )
    SELECT TEXT_agg(
      TEXT_build_object(
        'id', a.id,
        'appointment_code', a.appointment_code,
        'appointment_id', a.id,
        'institution_id', a.institution_id,
        'patient_id', a.patient_id,
        'doctor_id', a.doctor_id,
        'scheduled_doctor_id', COALESCE(a.scheduled_doctor_id, a.doctor_id),
        'specialty_id', a.specialty_id,
        'ticket_number', a.ticket_number,
        'patient_name', p.full_name,
        'patient_cpf', p.cpf,
        'doctor_name', COALESCE(u.full_name, pr.full_name),
        'doctor_crm', d.crm,
        'doctor_council', d.professional_council,
        'doctor_registration_label', d.professional_council || ' ' || d.crm,
        'scheduled_doctor_name', COALESCE(su.full_name, spr.full_name, u.full_name, pr.full_name),
        'scheduled_doctor_crm', COALESCE(sd.crm, d.crm),
        'scheduled_doctor_council', COALESCE(sd.professional_council, d.professional_council),
        'scheduled_doctor_registration_label', COALESCE(sd.professional_council || ' ' || sd.crm, d.professional_council || ' ' || d.crm),
        'specialty_name', s.name,
        'specialty_color', s.color,
        'appointment_date', a.appointment_date,
        'end_date', a.end_date,
        'actual_start_at', a.actual_start_at,
        'actual_end_at', a.actual_end_at,
        'reason', a.reason,
        'status', a.status,
        'cancel_reason', a.cancel_reason,
        'no_show_reason', a.no_show_reason,
        'diagnosis', COALESCE(le.clinical_data->>'diagnosis', a.diagnosis),
        'anamnesis', le.clinical_data->>'anamnesis',
        'evolution', le.clinical_data->>'evolution',
        'prescription', COALESCE(le.clinical_data->>'prescription', a.prescription),
        'blood_pressure', COALESCE(le.clinical_data->>'blood_pressure', a.blood_pressure),
        'heart_rate', NULLIF(le.clinical_data->>'heart_rate', '')::integer,
        'temperature', COALESCE(NULLIF(le.clinical_data->>'temperature', '')::REAL, a.temperature),
        'weight', COALESCE(NULLIF(le.clinical_data->>'weight', '')::REAL, a.weight),
        'height', COALESCE(NULLIF(le.clinical_data->>'height', '')::REAL, a.height),
        'encounter_id', e.id,
        'encounter_status', e.status,
        'created_at', a.created_at,
        'updated_at', a.updated_at
      )
      ORDER BY a.appointment_date DESC
    )
    FROM (
      SELECT a.*
      FROM appointments a
      WHERE a.deleted_at IS NULL
        AND (
          current_user_role() = 'superadmin'
          OR (current_user_role() IN ('recepcao', 'admin') AND user_has_institution_access(a.institution_id))
          OR (
            current_user_role() = 'medico'
            AND v_doctor IS NOT NULL
            AND (
              a.doctor_id = v_doctor
              OR (
                a.status IN ('agendado', 'confirmado')
                AND a.specialty_id IS NOT NULL
                AND a.specialty_id = current_user_doctor_specialty_id()
              )
            )
          )
        )
        AND (
          p_status IS NULL
          OR p_status = ''
          OR p_status = 'all'
          OR a.status::text = p_status
        )
        AND (
          p_start_date IS NULL
          OR a.appointment_date >= p_start_date::DATETIME
        )
        AND (
          p_end_date IS NULL
          OR a.appointment_date <= p_end_date::DATETEXT + interval '1 day' - interval '1 second'
        )
        AND (
          p_search IS NULL
          OR p_search = ''
          OR EXISTS (
            SELECT 1
            FROM patients px
            WHERE px.id = a.patient_id
              AND (
                normalize_search_text(px.full_name) LIKE '%' || normalize_search_text(p_search) || '%'
                OR (normalize_cpf(p_search) <> '' AND px.cpf ILIKE '%' || normalize_cpf(p_search) || '%')
              )
          )
          OR EXISTS (
            SELECT 1
            FROM doctors dx
            LEFT JOIN users ux ON ux.id = dx.user_id
            LEFT JOIN profiles prx ON prx.id = dx.user_id
            LEFT JOIN specialties sx ON sx.id = dx.specialty_id
            WHERE dx.id = a.doctor_id
              AND (
                normalize_search_text(COALESCE(ux.full_name, prx.full_name, '')) LIKE '%' || normalize_search_text(p_search) || '%'
                OR normalize_search_text(COALESCE(dx.professional_council, '')) LIKE '%' || normalize_search_text(p_search) || '%'
                OR normalize_search_text(COALESCE(dx.crm, '')) LIKE '%' || normalize_search_text(p_search) || '%'
                OR normalize_search_text(COALESCE(sx.name, '')) LIKE '%' || normalize_search_text(p_search) || '%'
              )
          )
          OR normalize_search_text(COALESCE(a.ticket_number, '')) LIKE '%' || normalize_search_text(p_search) || '%'
        )
      ORDER BY a.appointment_date DESC
      LIMIT GREATEST(COALESCE(p_limit, 50), 1)
    ) a
    JOIN patients p ON p.id = a.patient_id
    JOIN doctors d ON d.id = a.doctor_id
    LEFT JOIN doctors sd ON sd.id = COALESCE(a.scheduled_doctor_id, a.doctor_id)
    LEFT JOIN users u ON u.id = d.user_id
    LEFT JOIN profiles pr ON pr.id = d.user_id
    LEFT JOIN users su ON su.id = sd.user_id
    LEFT JOIN profiles spr ON spr.id = sd.user_id
    LEFT JOIN specialties s ON s.id = a.specialty_id
    LEFT JOIN encounters e ON e.appointment_id = a.id AND e.deleted_at IS NULL
    LEFT JOIN latest_entry le ON le.encounter_id = e.id
  ), '[]'::TEXT);
END;
$$;

CREATE OR REPLACE FUNCTION get_appointment_form_options(
  p_doctor_id TEXT DEFAULT NULL,
  p_booking_date date DEFAULT current_date,
  p_rescheduling_appointment_id TEXT DEFAULT NULL,
  p_selected_patient_id TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_scope TEXT;
  v_doctor TEXT;
BEGIN
  v_scope := current_user_primary_institution();
  v_doctor := current_user_doctor_id();

  PERFORM assert_can_access(
    'appointments',
    CASE WHEN p_rescheduling_appointment_id IS NULL THEN 'create' ELSE 'update' END,
    TEXT_build_object('institution_id', v_scope, 'doctor_id', v_doctor)
  );

  RETURN TEXT_build_object(
    'institution_id', v_scope,
    'my_doctor_id', v_doctor,
    'doctors', list_doctors_catalog(NULL, false),
    'patients', COALESCE((
      SELECT TEXT_agg(
        TEXT_build_object(
          'id', p.id,
          'patient_code', p.patient_code,
          'full_name', p.full_name,
          'cpf', p.cpf,
          'institution_id', p.institution_id
        )
        ORDER BY p.full_name
      )
      FROM patients p
      WHERE p.deleted_at IS NULL
        AND p.is_active = true
        AND EXISTS (
          SELECT 1
          FROM institutions pi
          WHERE pi.id = p.institution_id
            AND pi.deleted_at IS NULL
            AND pi.is_active = true
        )
        AND (
          current_user_role() = 'superadmin'
          OR (current_user_role() IN ('recepcao', 'admin') AND user_has_institution_access(p.institution_id))
          OR (
            current_user_role() = 'medico'
            AND v_doctor IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM appointments ax
              WHERE ax.patient_id = p.id
                AND ax.doctor_id = v_doctor
                AND ax.deleted_at IS NULL
            )
          )
        )
        AND (
          (p_selected_patient_id IS NOT NULL AND p.id = p_selected_patient_id)
          OR p_selected_patient_id IS NULL
        )
    ), '[]'::TEXT),
    'available_slots', CASE
      WHEN p_doctor_id IS NULL THEN '[]'::TEXT
      ELSE list_available_appointment_slots(p_doctor_id, COALESCE(p_booking_date, current_date), p_rescheduling_appointment_id)
    END
  );
END;
$$;

CREATE OR REPLACE FUNCTION list_available_appointment_slots(
  p_doctor_id TEXT,
  p_booking_date date DEFAULT current_date,
  p_rescheduling_appointment_id TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_scope TEXT;
  v_doctor TEXT;
  v_doctor_user TEXT;
BEGIN
  IF p_doctor_id IS NULL THEN
    RAISE EXCEPTION 'Profissional obrigatorio';
  END IF;

  v_scope := current_user_primary_institution();
  v_doctor := current_user_doctor_id();

  SELECT d.user_id
  INTO v_doctor_user
  FROM doctors d
  JOIN users u ON u.id = d.user_id
  LEFT JOIN profiles p ON p.id = d.user_id
  LEFT JOIN specialties sp ON sp.id = d.specialty_id
  WHERE d.id = p_doctor_id
    AND d.deleted_at IS NULL
    AND d.is_active = true
    AND COALESCE(u.is_active, true) = true
    AND COALESCE(p.is_active, true) = true
    AND (
      d.specialty_id IS NULL
      OR (
        sp.deleted_at IS NULL
        AND sp.is_active = true
      )
    )
    AND (
      EXISTS (
        SELECT 1
        FROM institutions ip
        WHERE ip.id = u.primary_institution_id
          AND ip.deleted_at IS NULL
          AND ip.is_active = true
      )
      OR EXISTS (
        SELECT 1
        FROM user_institutions dui
        JOIN institutions ii ON ii.id = dui.institution_id
        WHERE dui.user_id = d.user_id
          AND dui.revoked_at IS NULL
          AND ii.deleted_at IS NULL
          AND ii.is_active = true
      )
    );

  IF v_doctor_user IS NULL THEN
    RAISE EXCEPTION 'Profissional invalido ou inativo';
  END IF;

  IF current_user_role() = 'medico' AND is_doctor_owner(p_doctor_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Medico so pode consultar sua propria agenda';
  END IF;

  PERFORM assert_can_access(
    'schedules',
    'read',
    TEXT_build_object('institution_id', v_scope, 'doctor_id', v_doctor)
  );

  RETURN COALESCE((
    WITH availability_ranges AS (
      SELECT
        da.institution_id,
        da.doctor_id,
        GREATEST(da.slot_minutes, 1) AS step_minutes,
        GREATEST(da.slot_minutes, 1) AS duration_minutes,
        get_operational_timezone(da.institution_id) AS operational_timezone,
        ((p_booking_date::timestamp + da.starts_at) AT TEXT ZONE get_operational_timezone(da.institution_id)) AS starts_at,
        ((p_booking_date::timestamp + da.ends_at) AT TEXT ZONE get_operational_timezone(da.institution_id)) AS ends_at
      FROM doctor_availability da
      JOIN doctors d ON d.id = da.doctor_id
      JOIN users u ON u.id = d.user_id AND u.deleted_at IS NULL AND u.is_active = true
      LEFT JOIN profiles p ON p.id = d.user_id
      LEFT JOIN specialties sp ON sp.id = d.specialty_id
      JOIN institutions di ON di.id = da.institution_id AND di.deleted_at IS NULL AND di.is_active = true
      WHERE da.doctor_id = p_doctor_id
        AND da.deleted_at IS NULL
        AND da.is_active = true
        AND d.deleted_at IS NULL
        AND d.is_active = true
        AND COALESCE(p.is_active, true) = true
        AND (
          d.specialty_id IS NULL
          OR (
            sp.deleted_at IS NULL
            AND sp.is_active = true
          )
        )
        AND da.weekday = EXTRACT(DOW FROM p_booking_date)::integer
        AND (
          current_user_role() = 'superadmin'
          OR (current_user_role() IN ('recepcao', 'admin') AND user_has_institution_access(da.institution_id))
          OR is_doctor_owner(da.doctor_id)
        )
    ),
    slots AS (
      SELECT
        ar.institution_id,
        ar.doctor_id,
        ar.operational_timezone,
        gs.slot_start,
        gs.slot_start + make_interval(mins => ar.duration_minutes) AS slot_end
      FROM availability_ranges ar
      CROSS JOIN LATERAL generate_series(
        ar.starts_at,
        ar.ends_at - make_interval(mins => ar.duration_minutes),
        make_interval(mins => ar.step_minutes)
      ) AS gs(slot_start)
    )
    SELECT TEXT_agg(
      TEXT_build_object(
        'time', to_char(s.slot_start AT TEXT ZONE s.operational_timezone, 'HH24:MI'),
        'operational_timezone', s.operational_timezone,
        'starts_at', s.slot_start,
        'ends_at', s.slot_end,
        'institution_id', s.institution_id,
        'institution_name', COALESCE(si.name, 'Unidade vinculada'),
        'status', CASE
          WHEN blocked.id IS NOT NULL THEN 'blocked'
          WHEN booked.id IS NOT NULL AND booked.visible_to_current_user IS NOT TRUE THEN 'blocked'
          WHEN booked.id IS NOT NULL THEN 'booked'
          ELSE 'free'
        END,
        'block_reason', CASE
          WHEN blocked.id IS NOT NULL THEN 'Horario bloqueado'
          WHEN booked.id IS NOT NULL AND booked.visible_to_current_user IS NOT TRUE THEN 'Conflito em outra unidade'
          ELSE NULL
        END,
        'appointment_id', CASE
          WHEN booked.id IS NULL OR booked.visible_to_current_user IS NOT TRUE THEN NULL
          ELSE booked.id
        END,
        'appointment', CASE
          WHEN booked.id IS NULL OR booked.visible_to_current_user IS NOT TRUE THEN NULL
          ELSE TEXT_build_object(
            'id', booked.id,
            'patient_id', booked.patient_id,
            'institution_id', booked.institution_id,
            'institution_name', booked.institution_name,
            'specialty_id', booked.specialty_id,
            'specialty_name', booked.specialty_name,
            'encounter_id', booked.encounter_id,
            'status', booked.status,
            'appointment_date', booked.appointment_date,
            'end_date', booked.end_date,
            'reason', booked.reason,
            'patient_name', booked.patient_name,
            'patient_cpf', booked.patient_cpf,
            'doctor_name', booked.doctor_name,
            'doctor_crm', booked.doctor_crm,
            'doctor_council', booked.doctor_council,
            'doctor_registration_label', booked.doctor_registration_label
          )
        END
      )
      ORDER BY s.slot_start
    )
    FROM slots s
    LEFT JOIN institutions si ON si.id = s.institution_id
    LEFT JOIN LATERAL (
      SELECT
        a.id,
        a.patient_id,
        a.institution_id,
        a.specialty_id,
        a.status,
        a.appointment_date,
        a.end_date,
        a.reason,
        p.full_name AS patient_name,
        p.cpf AS patient_cpf,
        sp.name AS specialty_name,
        e.id AS encounter_id,
        COALESCE(u.full_name, pr.full_name) AS doctor_name,
        d.crm AS doctor_crm,
        d.professional_council AS doctor_council,
        d.professional_council || ' ' || d.crm AS doctor_registration_label,
        i.name AS institution_name,
        (
          current_user_role() = 'superadmin'
          OR user_has_institution_access(a.institution_id)
          OR is_doctor_owner(a.doctor_id)
        ) AS visible_to_current_user
      FROM appointments a
      JOIN patients p ON p.id = a.patient_id
      JOIN doctors d ON d.id = a.doctor_id
      LEFT JOIN specialties sp ON sp.id = a.specialty_id
      LEFT JOIN encounters e ON e.appointment_id = a.id AND e.deleted_at IS NULL
      LEFT JOIN institutions i ON i.id = a.institution_id
      LEFT JOIN users u ON u.id = d.user_id
      LEFT JOIN profiles pr ON pr.id = d.user_id
      WHERE a.deleted_at IS NULL
        AND a.doctor_id = p_doctor_id
        AND a.status IN ('agendado', 'confirmado', 'em_atendimento')
        AND (p_rescheduling_appointment_id IS NULL OR a.id <> p_rescheduling_appointment_id)
        AND tstzrange(a.appointment_date, a.end_date, '[)') && tstzrange(s.slot_start, s.slot_end, '[)')
      ORDER BY a.appointment_date
      LIMIT 1
    ) booked ON true
    LEFT JOIN LATERAL (
      SELECT sb.id
      FROM schedule_blocks sb
      WHERE sb.institution_id = s.institution_id
        AND sb.deleted_at IS NULL
        AND (sb.doctor_id IS NULL OR sb.doctor_id = p_doctor_id)
        AND sb.block_range && tstzrange(s.slot_start, s.slot_end, '[)')
      LIMIT 1
    ) blocked ON true
  ), '[]'::TEXT);
END;
$$;

CREATE OR REPLACE FUNCTION get_schedule_policy_snapshot(
  p_doctor_id TEXT DEFAULT NULL,
  p_booking_date date DEFAULT current_date
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_scope TEXT;
  v_actor_doctor TEXT;
  v_target_doctor TEXT;
  v_model text;
  v_message text;
  v_date date;
  v_global_conflicts integer;
BEGIN
  v_scope := current_user_primary_institution();
  v_actor_doctor := current_user_doctor_id();
  v_target_doctor := COALESCE(p_doctor_id, v_actor_doctor);
  v_date := COALESCE(p_booking_date, current_date);

  IF v_target_doctor IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM doctors d
       WHERE d.id = v_target_doctor
         AND d.deleted_at IS NULL
         AND d.is_active = true
     ) THEN
    RAISE EXCEPTION 'Profissional invalido ou inativo';
  END IF;

  PERFORM assert_can_access(
    'schedules',
    'read',
    TEXT_build_object('institution_id', v_scope, 'doctor_id', v_target_doctor)
  );

  SELECT sc.value #>> '{}'
  INTO v_model
  FROM system_config sc
  WHERE sc.config_key = 'schedule_model'
    AND sc.deleted_at IS NULL
    AND sc.is_active = true
    AND (sc.institution_id IS NULL OR sc.institution_id = v_scope)
  ORDER BY (sc.institution_id = v_scope) DESC, sc.updated_at DESC
  LIMIT 1;

  SELECT sc.value #>> '{}'
  INTO v_message
  FROM system_config sc
  WHERE sc.config_key = 'schedule_conflict_message'
    AND sc.deleted_at IS NULL
    AND sc.is_active = true
    AND (sc.institution_id IS NULL OR sc.institution_id = v_scope)
  ORDER BY (sc.institution_id = v_scope) DESC, sc.updated_at DESC
  LIMIT 1;

  v_model := COALESCE(NULLIF(v_model, ''), 'global_professional');
  v_message := COALESCE(
    NULLIF(v_message, ''),
    'Agenda global do profissional: conflitos em outras unidades sao bloqueados automaticamente.'
  );

  SELECT COUNT(*)::integer
  INTO v_global_conflicts
  FROM appointments a
  WHERE v_target_doctor IS NOT NULL
    AND a.doctor_id = v_target_doctor
    AND a.deleted_at IS NULL
    AND a.status IN ('agendado', 'confirmado', 'em_atendimento')
    AND (a.appointment_date AT TEXT ZONE get_operational_timezone(a.institution_id))::date = v_date
    AND (v_scope IS NULL OR a.institution_id <> v_scope);

  RETURN TEXT_build_object(
    'model', v_model,
    'title', 'Agenda profissional global',
    'description', v_message,
    'doctor_id', v_target_doctor,
    'booking_date', v_date,
    'active_institution_id', v_scope,
    'global_conflicts', COALESCE(v_global_conflicts, 0),
      'doctor_institutions', '[]'::TEXT,
    'guarantees',
      TEXT_build_array(
        'Conflito de horario do mesmo profissional e bloqueado globalmente',
        'Conflito em outra unidade nao expoe paciente, CPF, ticket ou dados clinicos fora do escopo',
        'Agendamento efetivo permanece validado pela RPC transacional e pelas constraints do banco'
      )
  );
END;
$$;

CREATE OR REPLACE FUNCTION get_schedule_admin_snapshot(
  p_doctor_id TEXT DEFAULT NULL,
  p_start_at DATETEXT DEFAULT date_trunc('day', now()),
  p_end_at DATETEXT DEFAULT (date_trunc('day', now()) + interval '30 days')
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_end_at <= p_start_at THEN
    RAISE EXCEPTION 'Periodo da agenda administrativa invalido';
  END IF;

  PERFORM assert_can_access(
    'doctor_availability',
    'update',
    TEXT_build_object(
      'doctor_id', p_doctor_id,
      'require_institution_access', false
    )
  );

  RETURN TEXT_build_object(
    'generated_at', now(),
    'filters', TEXT_build_object(
      'doctor_id', p_doctor_id,
      'start_at', p_start_at,
      'end_at', p_end_at
    ),
    'availabilities', COALESCE((
      SELECT TEXT_agg(
        TEXT_build_object(
          'availability_id', row_data.id,
          'availability_id', row_data.id,
          'doctor_id', row_data.doctor_id,
          'doctor_name', row_data.doctor_name,
          'doctor_crm', row_data.doctor_crm,
          'doctor_council', row_data.doctor_council,
          'doctor_registration_label', row_data.doctor_registration_label,
          'weekday', row_data.weekday,
          'starts_at', row_data.starts_at,
          'ends_at', row_data.ends_at,
          'slot_minutes', row_data.slot_minutes,
          'is_active', row_data.is_active,
          'created_at', row_data.created_at,
          'updated_at', row_data.updated_at
        )
        ORDER BY row_data.doctor_name, row_data.weekday, row_data.starts_at
      )
      FROM (
        SELECT
          da.id,
          da.id,
          da.doctor_id,
          COALESCE(u.full_name, pr.full_name, d.crm) AS doctor_name,
          d.crm AS doctor_crm,
          d.professional_council AS doctor_council,
          d.professional_council || ' ' || d.crm AS doctor_registration_label,
          da.weekday,
          da.starts_at,
          da.ends_at,
          da.slot_minutes,
          da.is_active,
          da.created_at,
          da.updated_at
        FROM doctor_availability da
        JOIN doctors d ON d.id = da.doctor_id
        LEFT JOIN users u ON u.id = d.user_id
        LEFT JOIN profiles pr ON pr.id = d.user_id
        WHERE da.deleted_at IS NULL
          AND d.deleted_at IS NULL
          AND (p_doctor_id IS NULL OR da.doctor_id = p_doctor_id)
      ) row_data
    ), '[]'::TEXT),
    'blocks', COALESCE((
      SELECT TEXT_agg(
        TEXT_build_object(
          'block_id', row_data.id,
          'institution_id', row_data.institution_id,
          'institution_name', row_data.institution_name,
          'doctor_id', row_data.doctor_id,
          'doctor_name', row_data.doctor_name,
          'starts_at', row_data.starts_at,
          'ends_at', row_data.ends_at,
          'reason', row_data.reason,
          'scope_type', row_data.scope_type,
          'created_at', row_data.created_at
        )
        ORDER BY row_data.starts_at, row_data.institution_name, row_data.doctor_name
      )
      FROM (
        SELECT
          sb.id,
          sb.id,
          sb.id AS institution_name,
          sb.doctor_id,
          COALESCE(u.full_name, pr.full_name, d.crm, 'Todos os profissionais da unidade') AS doctor_name,
          lower(sb.block_range) AS starts_at,
          upper(sb.block_range) AS ends_at,
          sb.reason,
          CASE WHEN sb.doctor_id IS NULL THEN 'institution' ELSE 'doctor' END AS scope_type,
          sb.created_at
        FROM schedule_blocks sb
        LEFT JOIN doctors d ON d.id = sb.doctor_id
        LEFT JOIN users u ON u.id = d.user_id
        LEFT JOIN profiles pr ON pr.id = d.user_id
        WHERE sb.deleted_at IS NULL
          AND (d.id IS NULL OR d.deleted_at IS NULL)
          AND (p_doctor_id IS NULL OR sb.doctor_id = p_doctor_id)
          AND upper(sb.block_range) > p_start_at
          AND lower(sb.block_range) < p_end_at
      ) row_data
    ), '[]'::TEXT),
    'summary', TEXT_build_object(
      'availability_count', (
        SELECT count(*)::integer
        FROM doctor_availability da
        WHERE da.deleted_at IS NULL
          AND (p_doctor_id IS NULL OR da.doctor_id = p_doctor_id)
      ),
      'active_availability_count', (
        SELECT count(*)::integer
        FROM doctor_availability da
        WHERE da.deleted_at IS NULL
          AND da.is_active = true
          AND (p_doctor_id IS NULL OR da.doctor_id = p_doctor_id)
      ),
      'block_count', (
        SELECT count(*)::integer
        FROM schedule_blocks sb
        WHERE sb.deleted_at IS NULL
          AND (p_doctor_id IS NULL OR sb.doctor_id = p_doctor_id)
          AND upper(sb.block_range) > p_start_at
          AND lower(sb.block_range) < p_end_at
      )
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION api_archive_schedule_block(
  p_block_id TEXT,
  p_idempotency_key text DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user TEXT;
  v_existing TEXT;
  v_block schedule_blocks%ROWTYPE;
  v_response TEXT;
BEGIN
  v_user := assert_authenticated();
  v_existing := find_idempotent_response('archive_schedule_block', p_idempotency_key);

  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  SELECT *
  INTO v_block
  FROM schedule_blocks
  WHERE id = p_block_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bloqueio de agenda nao encontrado';
  END IF;

  PERFORM assert_can_access(
    'schedule_blocks',
    'delete',
    TEXT_build_object('doctor_id', v_block.doctor_id)
  );

  IF v_block.deleted_at IS NULL THEN
    UPDATE schedule_blocks
    SET deleted_at = now(),
        deleted_by = v_user
    WHERE id = v_block.id
    RETURNING * INTO v_block;

    INSERT INTO clinical_events (institution_id, aggregate_table, aggregate_id, event_type, payload, idempotency_key, created_by)
    VALUES (
      NULL,
      'schedule_blocks',
      v_block.id,
      'schedule.block_archived',
      to_TEXT(v_block),
      p_idempotency_key,
      v_user
    )
    ON CONFLICT (institution_id, idempotency_key) DO NOTHING;
  END IF;

  v_response := TEXT_build_object(
    'success', true,
    'block_id', v_block.id,
    'archived', v_block.deleted_at IS NOT NULL,
    'doctor_id', v_block.doctor_id
  );

  RETURN remember_idempotent_response('archive_schedule_block', p_idempotency_key, NULL, v_response);
END;
$$;

CREATE OR REPLACE FUNCTION get_encounter_snapshot(
  p_appointment_id TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doctor TEXT;
  v_appointment appointments%ROWTYPE;
  v_encounter encounters%ROWTYPE;
  v_latest TEXT;
BEGIN
  v_doctor := current_user_doctor_id();

  SELECT *
  INTO v_appointment
  FROM appointments
  WHERE id = p_appointment_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Consulta nao encontrada';
  END IF;

  IF current_user_role() <> 'superadmin'
     AND (
       v_doctor IS NULL
       OR (
         v_appointment.doctor_id <> v_doctor
         AND current_doctor_can_assume_appointment(v_appointment.id) IS NOT TRUE
       )
     ) THEN
    RAISE EXCEPTION 'Permissao negada para carregar atendimento';
  END IF;

  PERFORM assert_can_access(
    'medical_records',
    'read',
    TEXT_build_object('appointment_id', v_appointment.id, 'require_doctor_owner', true)
  );

  SELECT *
  INTO v_encounter
  FROM encounters
  WHERE appointment_id = v_appointment.id
    AND deleted_at IS NULL;

  IF FOUND THEN
    SELECT mre.clinical_data
    INTO v_latest
    FROM medical_record_entries mre
    WHERE mre.encounter_id = v_encounter.id
    ORDER BY mre.version DESC
    LIMIT 1;
  END IF;

  RETURN TEXT_build_object(
    'appointment_id', v_appointment.id,
    'encounter_id', v_encounter.id,
    'encounter_status', v_encounter.status,
    'appointment_status', v_appointment.status,
    'clinical_data', COALESCE(v_latest, '{}'::TEXT),
    'appointment', (
      SELECT TEXT_build_object(
        'id', a.id,
        'appointment_code', a.appointment_code,
        'ticket_number', a.ticket_number,
        'appointment_date', a.appointment_date,
        'end_date', a.end_date,
        'reason', a.reason,
        'patient_name', p.full_name,
        'patient_cpf', p.cpf,
        'doctor_name', COALESCE(u.full_name, pr.full_name),
        'doctor_crm', d.crm,
        'doctor_council', d.professional_council,
        'doctor_registration_label', d.professional_council || ' ' || d.crm,
        'scheduled_doctor_id', COALESCE(a.scheduled_doctor_id, a.doctor_id),
        'scheduled_doctor_name', COALESCE(su.full_name, spr.full_name, u.full_name, pr.full_name),
        'scheduled_doctor_crm', COALESCE(sd.crm, d.crm),
        'scheduled_doctor_council', COALESCE(sd.professional_council, d.professional_council),
        'scheduled_doctor_registration_label', COALESCE(sd.professional_council || ' ' || sd.crm, d.professional_council || ' ' || d.crm),
        'specialty_name', s.name,
        'weight', a.weight,
        'height', a.height,
        'blood_pressure', a.blood_pressure,
        'temperature', a.temperature
      )
      FROM appointments a
      JOIN patients p ON p.id = a.patient_id
      JOIN doctors d ON d.id = a.doctor_id
      LEFT JOIN doctors sd ON sd.id = COALESCE(a.scheduled_doctor_id, a.doctor_id)
      LEFT JOIN users u ON u.id = d.user_id
      LEFT JOIN profiles pr ON pr.id = d.user_id
      LEFT JOIN users su ON su.id = sd.user_id
      LEFT JOIN profiles spr ON spr.id = sd.user_id
      LEFT JOIN specialties s ON s.id = a.specialty_id
      WHERE a.id = v_appointment.id
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION get_auditor_dashboard_snapshot(
  p_days integer DEFAULT 30
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from DATETIME;
  v_today_start DATETIME;
  v_today_end DATETIME;
BEGIN
  PERFORM require_permission('audit', 'read', current_user_primary_institution());

  v_from := now() - make_interval(days => GREATEST(COALESCE(p_days, 30), 1));
  v_today_start := date_trunc('day', now());
  v_today_end := v_today_start + interval '1 day';

  RETURN (
    WITH scoped_appointments AS (
      SELECT a.*
      FROM appointments a
      WHERE a.deleted_at IS NULL
        AND appointment_operational_at(a.status, a.appointment_date, a.actual_start_at, a.actual_end_at, a.updated_at, a.created_at) >= v_from
        AND (
          current_user_role() = 'superadmin'
          OR user_has_institution_access(a.institution_id)
        )
    ),
    totals AS (
      SELECT
        count(*)::integer AS total_consultas,
        count(*) FILTER (WHERE appointment_date >= v_today_start AND appointment_date < v_today_end)::integer AS consultas_hoje,
        count(*) FILTER (WHERE status = 'cancelado')::integer AS canceladas_mes,
        count(*) FILTER (WHERE status = 'nao_compareceu')::integer AS nao_compareceram_mes
      FROM scoped_appointments
    ),
    top_doctors AS (
      SELECT COALESCE(TEXT_agg(TEXT_build_object('name', doctor_name, 'value', total_count) ORDER BY total_count DESC), '[]'::TEXT) AS rows
      FROM (
        SELECT COALESCE(u.full_name, pr.full_name, d.crm, 'Profissional') AS doctor_name,
               count(*)::integer AS total_count
        FROM scoped_appointments a
        JOIN doctors d ON d.id = a.doctor_id
        LEFT JOIN users u ON u.id = d.user_id
        LEFT JOIN profiles pr ON pr.id = d.user_id
        GROUP BY COALESCE(u.full_name, pr.full_name, d.crm, 'Profissional')
        ORDER BY total_count DESC
        LIMIT 5
      ) x
    ),
    top_specialties AS (
      SELECT COALESCE(TEXT_agg(TEXT_build_object('name', specialty_name, 'value', total_count) ORDER BY total_count DESC), '[]'::TEXT) AS rows
      FROM (
        SELECT COALESCE(s.name, 'Sem especialidade') AS specialty_name,
               count(*)::integer AS total_count
        FROM scoped_appointments a
        LEFT JOIN specialties s ON s.id = a.specialty_id
        GROUP BY COALESCE(s.name, 'Sem especialidade')
        ORDER BY total_count DESC
        LIMIT 5
      ) x
    )
    SELECT TEXT_build_object(
      'totalConsultas', (SELECT total_consultas FROM totals),
      'consultasHoje', (SELECT consultas_hoje FROM totals),
      'canceladasMes', (SELECT canceladas_mes FROM totals),
      'naoCompareceramMes', (SELECT nao_compareceram_mes FROM totals),
      'topDoctors', (SELECT rows FROM top_doctors),
      'topSpecialties', (SELECT rows FROM top_specialties)
    )
  );
END;
$$;

DROP FUNCTION IF EXISTS get_reports_catalog();

CREATE OR REPLACE FUNCTION get_reports_catalog(p_include_inactive INTEGER DEFAULT false)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_scope TEXT;
BEGIN
  v_scope := current_user_primary_institution();
  PERFORM require_permission('reports', 'read', v_scope);

  RETURN TEXT_build_object(
    'institutions', list_institutions_catalog(NULL, p_include_inactive),
    'specialties', list_specialties_catalog(NULL, p_include_inactive),
    'doctors', list_doctors_catalog(NULL, p_include_inactive),
    'my_doctor_id', current_user_doctor_id(),
    'institution_id', v_scope
  );
END;
$$;

DROP FUNCTION IF EXISTS generate_report_snapshot(text, TEXT, date, date, text);

CREATE OR REPLACE FUNCTION generate_report_snapshot(
  p_filter_type text,
  p_selected_id TEXT DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_patient_search text DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor TEXT;
  v_scope TEXT;
  v_from date;
  v_to date;
  v_title text;
  v_rows TEXT;
  v_row_count integer;
  v_indicators TEXT;
  v_rank_specialties TEXT;
  v_rank_doctors TEXT;
  v_unit_productivity TEXT;
  v_period_chart TEXT;
  v_consolidated_rows TEXT;
  v_scope_institution_ids TEXT;
  v_scope_label text;
  v_snapshot TEXT;
  v_hash text;
  v_report_code text;

  v_report report_snapshots%ROWTYPE;
  v_existing TEXT;
  v_response TEXT;
BEGIN
  v_actor := assert_authenticated();
  v_existing := find_idempotent_response('generate_report_snapshot', p_idempotency_key);
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  v_scope := current_user_primary_institution();
  PERFORM assert_can_access(
    'reports',
    'read',
    TEXT_build_object('institution_id', v_scope)
  );

  IF current_user_role() IN ('admin', 'auditor') THEN
    RAISE EXCEPTION 'Relatorio identificavel de atendimentos indisponivel para admin/auditor; use metricas agregadas';
  END IF;

  PERFORM set_config('app.admin_operation', 'generate_report_snapshot', true);

  v_from := COALESCE(p_date_from, current_date - 30);
  v_to := COALESCE(p_date_to, current_date);

  IF v_from > v_to THEN
    RAISE EXCEPTION 'Periodo invalido';
  END IF;

  SELECT COALESCE(TEXT_agg(
    TEXT_build_object(
      'appointment_id', a.id,
      'appointment_date', a.appointment_date,
      'status', a.status,
      'reason', a.reason,
      'patient_name', p.full_name,
      'doctor_name', COALESCE(u.full_name, pr.full_name),
      'doctor_crm', d.crm,
      'doctor_council', d.professional_council,
      'doctor_registration_label', d.professional_council || ' ' || d.crm,
      'specialty_name', s.name,
      'institution_id', a.institution_id,
      'institution_name', i.name,
      'patient_code', p.patient_code,
      'appointment_code', a.appointment_code,
      'duration_minutes', CASE
        WHEN e.started_at IS NOT NULL AND e.finalized_at IS NOT NULL
        THEN round(extract(epoch FROM (e.finalized_at - e.started_at)) / 60)::integer
        ELSE NULL
      END
    )
    ORDER BY a.appointment_date DESC
  ), '[]'::TEXT)
  INTO v_rows
  FROM appointments a
  JOIN patients p ON p.id = a.patient_id
  JOIN doctors d ON d.id = a.doctor_id
  LEFT JOIN encounters e ON e.appointment_id = a.id AND e.deleted_at IS NULL
  LEFT JOIN institutions i ON i.id = a.institution_id
  LEFT JOIN users u ON u.id = d.user_id
  LEFT JOIN profiles pr ON pr.id = d.user_id
  LEFT JOIN specialties s ON s.id = a.specialty_id
  WHERE a.deleted_at IS NULL
    AND a.appointment_date >= v_from::DATETIME
    AND a.appointment_date < (v_to + 1)::DATETIME
    AND (
      current_user_role() = 'superadmin'
      OR (current_user_role() = 'recepcao' AND user_has_institution_access(a.institution_id))
      OR (current_user_role() = 'medico' AND current_user_doctor_id() IS NOT NULL AND a.doctor_id = current_user_doctor_id())
    )
    AND (
      p_filter_type = 'institution' AND (p_selected_id IS NULL OR a.institution_id = p_selected_id)
      OR p_filter_type = 'doctor' AND a.doctor_id = p_selected_id
      OR p_filter_type = 'specialty' AND a.specialty_id = p_selected_id
      OR p_filter_type IS NULL
      OR p_filter_type = ''
    )
    AND (
      p_status IS NULL
      OR p_status = ''
      OR p_status = 'all'
      OR a.status::text = p_status
    )
    AND (
      p_patient_search IS NULL
      OR p_patient_search = ''
      OR p.full_name ILIKE '%' || p_patient_search || '%'
      OR p.cpf ILIKE '%' || normalize_cpf(p_patient_search) || '%'
      OR p.patient_code ILIKE '%' || p_patient_search || '%'
    );

  v_row_count := COALESCE(TEXT_array_length(v_rows), 0);
  v_title := CASE
    WHEN p_filter_type = 'institution' THEN 'Relatorio por instituicao'
    WHEN p_filter_type = 'doctor' THEN 'Relatorio por profissional'
    WHEN p_filter_type = 'specialty' THEN 'Relatorio por especialidade'
    ELSE 'Relatorio geral de atendimentos'
  END || ' (' || to_char(v_from, 'DD/MM/YYYY') || ' - ' || to_char(v_to, 'DD/MM/YYYY') || ')';

  SELECT TEXT_build_object(
    'total_atendimentos', v_row_count,
    'finalizados', count(*) FILTER (WHERE value->>'status' = 'concluido'),
    'faltas', count(*) FILTER (WHERE value->>'status' = 'nao_compareceu'),
    'cancelamentos', count(*) FILTER (WHERE value->>'status' = 'cancelado'),
    'em_aberto', count(*) FILTER (WHERE value->>'status' IN ('agendado', 'confirmado', 'em_atendimento')),
    'tempo_medio_minutos', round(avg(NULLIF(value->>'duration_minutes', '')::REAL) FILTER (WHERE value->>'duration_minutes' IS NOT NULL), 2)
  )
  INTO v_indicators
  FROM TEXT_array_elements(v_rows) value;

  SELECT COALESCE(TEXT_agg(TEXT_build_object('name', item_name, 'total', total) ORDER BY total DESC, item_name), '[]'::TEXT)
  INTO v_rank_specialties
  FROM (
    SELECT COALESCE(NULLIF(value->>'specialty_name', ''), 'Sem especialidade') AS item_name, count(*)::integer AS total
    FROM TEXT_array_elements(v_rows) value
    GROUP BY 1
    ORDER BY 2 DESC, 1
    LIMIT 10
  ) x;

  SELECT COALESCE(TEXT_agg(TEXT_build_object('name', item_name, 'total', total) ORDER BY total DESC, item_name), '[]'::TEXT)
  INTO v_rank_doctors
  FROM (
    SELECT COALESCE(NULLIF(value->>'doctor_name', ''), 'Sem profissional') AS item_name, count(*)::integer AS total
    FROM TEXT_array_elements(v_rows) value
    GROUP BY 1
    ORDER BY 2 DESC, 1
    LIMIT 10
  ) x;

  SELECT COALESCE(TEXT_agg(TEXT_build_object('name', item_name, 'total', total, 'finalizados', finalizados) ORDER BY total DESC, item_name), '[]'::TEXT)
  INTO v_unit_productivity
  FROM (
    SELECT
      COALESCE(NULLIF(value->>'institution_name', ''), 'Sem unidade') AS item_name,
      count(*)::integer AS total,
      count(*) FILTER (WHERE value->>'status' = 'concluido')::integer AS finalizados
    FROM TEXT_array_elements(v_rows) value
    GROUP BY 1
    ORDER BY 2 DESC, 1
    LIMIT 10
  ) x;

  SELECT COALESCE(TEXT_agg(TEXT_build_object('date', item_date, 'total', total) ORDER BY item_date), '[]'::TEXT)
  INTO v_period_chart
  FROM (
    SELECT ((value->>'appointment_date')::DATETIME::date)::text AS item_date, count(*)::integer AS total
    FROM TEXT_array_elements(v_rows) value
    WHERE value->>'appointment_date' IS NOT NULL
    GROUP BY 1
    ORDER BY 1
  ) x;

  v_report_code := upper(encode(gen_random_bytes(8), 'hex'));
  v_snapshot := TEXT_build_object(
    'app', 'SMS-MEDCO',
    'document_kind', 'operational_report',
    'document_code', v_report_code,
    'title', v_title,
    'filter_type', p_filter_type,
    'selected_id', p_selected_id,
    'status_filter', p_status,
    'patient_search', p_patient_search,
    'date_from', v_from,
    'date_to', v_to,
    'rows', v_rows,
    'rows_count', v_row_count,
    'indicators', COALESCE(v_indicators, '{}'::TEXT),
    'ranking_specialties', COALESCE(v_rank_specialties, '[]'::TEXT),
    'ranking_doctors', COALESCE(v_rank_doctors, '[]'::TEXT),
    'unit_productivity', COALESCE(v_unit_productivity, '[]'::TEXT),
    'period_chart', COALESCE(v_period_chart, '[]'::TEXT),
    'institution_id', v_scope,
    'institution_name', (SELECT i.name FROM institutions i WHERE i.id = v_scope),
    'generated_by_name', COALESCE((SELECT u.full_name FROM users u WHERE u.id = v_actor), (SELECT p.full_name FROM profiles p WHERE p.id = v_actor), v_actor::text),
    'generated_by_role', v_role,
    'period_label', to_char(v_from, 'DD/MM/YYYY') || ' a ' || to_char(v_to, 'DD/MM/YYYY'),
    'generated_by', v_actor,
    'generated_at', now()
  );
  v_hash := encode(digest(v_snapshot::text, 'sha256'), 'hex');

  INSERT INTO report_snapshots (
    report_code,
    institution_id,
    report_type,
    title,
    filter_payload,
    snapshot,
    rows_count,
    content_hash,
    signature_hash,
    signature_payload,
    pdf_file_name,
    idempotency_key,
    generated_by
  )
  VALUES (
    v_report_code,
    v_scope,
    COALESCE(NULLIF(p_filter_type, ''), 'general'),
    v_title,
    TEXT_build_object('filter_type', p_filter_type, 'selected_id', p_selected_id, 'date_from', v_from, 'date_to', v_to, 'status', p_status, 'patient_search', p_patient_search),
    v_snapshot,
    v_row_count,
    v_hash,
    v_hash,
    TEXT_build_object('algorithm', 'SHA256', 'hash', v_hash, 'signed_at', now(), 'signed_by', v_actor),
    v_report_code || '.pdf',
    p_idempotency_key,
    v_actor
  )
  ON CONFLICT (institution_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND deleted_at IS NULL
  DO UPDATE SET
    title = EXCLUDED.title,
    filter_payload = EXCLUDED.filter_payload,
    snapshot = EXCLUDED.snapshot,
    rows_count = EXCLUDED.rows_count,
    content_hash = EXCLUDED.content_hash,
    signature_hash = EXCLUDED.signature_hash,
    signature_payload = EXCLUDED.signature_payload,
    pdf_file_name = EXCLUDED.pdf_file_name,
    updated_at = now()
  RETURNING * INTO v_report;

  INSERT INTO clinical_events (institution_id, aggregate_table, aggregate_id, event_type, payload, idempotency_key, created_by)
  VALUES (v_scope, 'report_snapshots', v_report.id, 'reports.snapshot_generated', to_TEXT(v_report), p_idempotency_key, v_actor)
  ON CONFLICT (institution_id, idempotency_key) DO NOTHING;

  v_response := TEXT_build_object(
    'success', true,
    'report_id', v_report.id,
    'report_code', v_report.report_code,
    'title', v_report.title,
    'rows_count', v_report.rows_count,
    'content_hash', v_report.content_hash,
    'signature_hash', v_report.signature_hash,
    'pdf_file_name', v_report.pdf_file_name,
    'snapshot', v_snapshot
  );
  RETURN remember_idempotent_response('generate_report_snapshot', p_idempotency_key, v_scope, v_response);
END;
$$;

CREATE OR REPLACE FUNCTION generate_operational_report_snapshot(
  p_report_type text DEFAULT 'general_attendance',
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_institution_id TEXT DEFAULT NULL,
  p_specialty_id TEXT DEFAULT NULL,
  p_doctor_id TEXT DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor TEXT;
  v_role text;
  v_scope TEXT;
  v_from date;
  v_to date;
  v_title text;
  v_rows TEXT;
  v_row_count integer;
  v_indicators TEXT;
  v_rank_specialties TEXT;
  v_rank_doctors TEXT;
  v_unit_productivity TEXT;
  v_period_chart TEXT;
  v_consolidated_rows TEXT;
  v_scope_institution_ids TEXT;
  v_scope_label text;
  v_snapshot TEXT;
  v_hash text;
  v_report_code text;

  v_report report_snapshots%ROWTYPE;
  v_existing TEXT;
  v_response TEXT;
BEGIN
  v_actor := assert_authenticated();
  v_role := current_user_role();
  v_scope := COALESCE(p_institution_id, current_user_primary_institution());

  v_existing := find_idempotent_response('generate_operational_report_snapshot', p_idempotency_key);
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  PERFORM assert_can_access(
    'reports',
    'read',
    TEXT_build_object('institution_id', v_scope, 'require_institution_access', v_scope IS NOT NULL)
  );

  IF p_institution_id IS NOT NULL AND user_has_institution_access(p_institution_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Instituicao fora do escopo do usuario';
  END IF;

  v_from := COALESCE(p_date_from, current_date - 30);
  v_to := COALESCE(p_date_to, current_date);
  IF v_from > v_to THEN
    RAISE EXCEPTION 'Periodo invalido';
  END IF;

  WITH base AS (
    SELECT
      a.id AS appointment_id,
      a.appointment_code,
      a.appointment_date,
      a.end_date,
      appointment_operational_at(a.status, a.appointment_date, a.actual_start_at, a.actual_end_at, a.updated_at, a.created_at) AS operational_at,
      a.status::text AS status,
      a.reason,
      a.institution_id,
      i.name AS institution_name,
      p.id AS patient_id,
      p.patient_code,
      p.full_name AS patient_name,
      p.cpf AS patient_cpf,
      p.birth_date AS patient_birth_date,
      p.email AS patient_email,
      p.phone AS patient_phone,
      d.id AS doctor_id,
      COALESCE(u.full_name, pr.full_name, d.crm) AS doctor_name,
      d.crm AS doctor_crm,
      d.professional_council AS doctor_council,
      d.professional_council || ' ' || d.crm AS doctor_registration_label,
      s.id AS specialty_id,
      s.name AS specialty_name,
      CASE
        WHEN e.started_at IS NOT NULL AND e.finalized_at IS NOT NULL
        THEN round(extract(epoch FROM (e.finalized_at - e.started_at)) / 60)::integer
        ELSE NULL
      END AS duration_minutes
    FROM appointments a
    JOIN patients p ON p.id = a.patient_id
    JOIN doctors d ON d.id = a.doctor_id
    LEFT JOIN encounters e ON e.appointment_id = a.id AND e.deleted_at IS NULL
    LEFT JOIN institutions i ON i.id = a.institution_id
    LEFT JOIN users u ON u.id = d.user_id
    LEFT JOIN profiles pr ON pr.id = d.user_id
    LEFT JOIN specialties s ON s.id = a.specialty_id
    WHERE a.deleted_at IS NULL
      AND a.appointment_date >= v_from::DATETIME
      AND a.appointment_date < (v_to + 1)::DATETIME
      AND (p_institution_id IS NULL OR a.institution_id = p_institution_id)
      AND (p_specialty_id IS NULL OR a.specialty_id = p_specialty_id)
      AND (p_doctor_id IS NULL OR a.doctor_id = p_doctor_id)
      AND (p_status IS NULL OR p_status = '' OR p_status = 'all' OR a.status::text = p_status)
      AND (
        v_role = 'superadmin'
        OR (v_role = 'recepcao' AND user_has_institution_access(a.institution_id))
        OR (v_role = 'medico' AND current_user_doctor_id() IS NOT NULL AND a.doctor_id = current_user_doctor_id())
        OR (v_role IN ('admin', 'auditor') AND user_has_permission('reports', 'read', a.institution_id))
      )
  ),
  rows_source AS (
    SELECT
      appointment_id,
      appointment_code,
      operational_at,
      appointment_date,
      end_date,
      status,
      reason,
      institution_id,
      institution_name,
      CASE WHEN v_role = 'auditor' THEN NULL ELSE patient_id END AS patient_id,
      CASE WHEN v_role = 'auditor' THEN NULL ELSE patient_code END AS patient_code,
      CASE WHEN v_role = 'auditor' THEN NULL ELSE patient_name END AS patient_name,
      CASE WHEN v_role = 'auditor' THEN NULL ELSE patient_cpf END AS patient_cpf,
      CASE WHEN v_role = 'auditor' THEN NULL ELSE patient_birth_date END AS patient_birth_date,
      CASE WHEN v_role = 'auditor' THEN NULL ELSE patient_email END AS patient_email,
      CASE WHEN v_role = 'auditor' THEN NULL ELSE patient_phone END AS patient_phone,
      doctor_id,
      doctor_name,
      doctor_crm,
      doctor_council,
      doctor_registration_label,
      specialty_id,
      specialty_name,
      duration_minutes
    FROM base
    ORDER BY operational_at DESC, appointment_date DESC
    LIMIT CASE WHEN v_role = 'auditor' THEN 0 ELSE 50000 END
  )
  SELECT COALESCE(TEXT_agg(to_TEXT(rows_source) ORDER BY operational_at DESC, appointment_date DESC), '[]'::TEXT)
  INTO v_rows
  FROM rows_source;

  WITH base AS (
    SELECT
      a.appointment_date,
      appointment_operational_at(a.status, a.appointment_date, a.actual_start_at, a.actual_end_at, a.updated_at, a.created_at) AS operational_at,
      a.status::text AS status,
      a.institution_id,
      COALESCE(i.name, 'Sem unidade') AS institution_name,
      COALESCE(s.name, 'Sem especialidade') AS specialty_name,
      COALESCE(u.full_name, pr.full_name, d.crm, 'Sem profissional') AS doctor_name,
      CASE
        WHEN e.started_at IS NOT NULL AND e.finalized_at IS NOT NULL
        THEN round(extract(epoch FROM (e.finalized_at - e.started_at)) / 60)::integer
        ELSE NULL
      END AS duration_minutes
    FROM appointments a
    JOIN patients p ON p.id = a.patient_id
    JOIN doctors d ON d.id = a.doctor_id
    LEFT JOIN encounters e ON e.appointment_id = a.id AND e.deleted_at IS NULL
    LEFT JOIN institutions i ON i.id = a.institution_id
    LEFT JOIN users u ON u.id = d.user_id
    LEFT JOIN profiles pr ON pr.id = d.user_id
    LEFT JOIN specialties s ON s.id = a.specialty_id
    WHERE a.deleted_at IS NULL
      AND a.appointment_date >= v_from::DATETIME
      AND a.appointment_date < (v_to + 1)::DATETIME
      AND (p_institution_id IS NULL OR a.institution_id = p_institution_id)
      AND (p_specialty_id IS NULL OR a.specialty_id = p_specialty_id)
      AND (p_doctor_id IS NULL OR a.doctor_id = p_doctor_id)
      AND (p_status IS NULL OR p_status = '' OR p_status = 'all' OR a.status::text = p_status)
      AND (
        v_role = 'superadmin'
        OR (v_role = 'recepcao' AND user_has_institution_access(a.institution_id))
        OR (v_role = 'medico' AND current_user_doctor_id() IS NOT NULL AND a.doctor_id = current_user_doctor_id())
        OR (v_role IN ('admin', 'auditor') AND user_has_permission('reports', 'read', a.institution_id))
      )
  )
  SELECT TEXT_build_object(
    'total_atendimentos', count(*)::integer,
    'agendados', count(*) FILTER (WHERE status = 'agendado')::integer,
    'confirmados', count(*) FILTER (WHERE status = 'confirmado')::integer,
    'em_atendimento', count(*) FILTER (WHERE status = 'em_atendimento')::integer,
    'concluidos', count(*) FILTER (WHERE status = 'concluido')::integer,
    'finalizados', count(*) FILTER (WHERE status = 'concluido')::integer,
    'cancelados', count(*) FILTER (WHERE status = 'cancelado')::integer,
    'cancelamentos', count(*) FILTER (WHERE status = 'cancelado')::integer,
    'nao_compareceu', count(*) FILTER (WHERE status = 'nao_compareceu')::integer,
    'faltas', count(*) FILTER (WHERE status = 'nao_compareceu')::integer,
    'em_aberto', count(*) FILTER (WHERE status IN ('agendado', 'confirmado', 'em_atendimento'))::integer,
    'tempo_medio_minutos', round(avg(duration_minutes::REAL) FILTER (WHERE duration_minutes IS NOT NULL), 2)
  )
  INTO v_indicators
  FROM base;

  v_row_count := COALESCE((v_indicators->>'total_atendimentos')::integer, 0);

  WITH base AS (
    SELECT
      a.appointment_date,
      appointment_operational_at(a.status, a.appointment_date, a.actual_start_at, a.actual_end_at, a.updated_at, a.created_at) AS operational_at,
      a.status::text AS status,
      a.institution_id,
      COALESCE(i.name, 'Sem unidade') AS institution_name,
      COALESCE(s.id::text, '') AS specialty_id,
      COALESCE(s.name, 'Sem especialidade') AS specialty_name,
      d.id AS doctor_id,
      COALESCE(u.full_name, pr.full_name, d.crm, 'Sem profissional') AS doctor_name
    FROM appointments a
    JOIN patients p ON p.id = a.patient_id
    JOIN doctors d ON d.id = a.doctor_id
    LEFT JOIN institutions i ON i.id = a.institution_id
    LEFT JOIN users u ON u.id = d.user_id
    LEFT JOIN profiles pr ON pr.id = d.user_id
    LEFT JOIN specialties s ON s.id = a.specialty_id
    WHERE a.deleted_at IS NULL
      AND a.appointment_date >= v_from::DATETIME
      AND a.appointment_date < (v_to + 1)::DATETIME
      AND (p_institution_id IS NULL OR a.institution_id = p_institution_id)
      AND (p_specialty_id IS NULL OR a.specialty_id = p_specialty_id)
      AND (p_doctor_id IS NULL OR a.doctor_id = p_doctor_id)
      AND (p_status IS NULL OR p_status = '' OR p_status = 'all' OR a.status::text = p_status)
      AND (
        v_role = 'superadmin'
        OR (v_role = 'recepcao' AND user_has_institution_access(a.institution_id))
        OR (v_role = 'medico' AND current_user_doctor_id() IS NOT NULL AND a.doctor_id = current_user_doctor_id())
        OR (v_role IN ('admin', 'auditor') AND user_has_permission('reports', 'read', a.institution_id))
      )
  )
  SELECT
    COALESCE((SELECT TEXT_agg(TEXT_build_object('name', specialty_name, 'total', total) ORDER BY total DESC, specialty_name) FROM (SELECT specialty_name, count(*)::integer total FROM base GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 100) x), '[]'::TEXT),
    COALESCE((SELECT TEXT_agg(TEXT_build_object('name', doctor_name, 'total', total) ORDER BY total DESC, doctor_name) FROM (SELECT doctor_name, count(*)::integer total FROM base GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 100) x), '[]'::TEXT),
    COALESCE((SELECT TEXT_agg(TEXT_build_object('name', institution_name, 'total', total, 'finalizados', finalizados) ORDER BY total DESC, institution_name) FROM (SELECT institution_name, count(*)::integer total, count(*) FILTER (WHERE status = 'concluido')::integer finalizados FROM base GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 100) x), '[]'::TEXT),
    COALESCE((SELECT TEXT_agg(TEXT_build_object('date', item_date, 'total', total) ORDER BY item_date) FROM (SELECT operational_at::date::text item_date, count(*)::integer total FROM base GROUP BY 1 ORDER BY 1) x), '[]'::TEXT),
    COALESCE((
      SELECT TEXT_agg(
        TEXT_build_object(
          'institution_id', institution_id,
          'institution_name', institution_name,
          'specialty_id', NULLIF(specialty_id, ''),
          'specialty_name', specialty_name,
          'doctor_id', doctor_id,
          'doctor_name', doctor_name,
          'status', status,
          'quantidade', total
        )
        ORDER BY institution_name, specialty_name, doctor_name, status
      )
      FROM (
        SELECT institution_id, institution_name, specialty_id, specialty_name, doctor_id, doctor_name, status, count(*)::integer total
        FROM base
        GROUP BY 1, 2, 3, 4, 5, 6, 7
        ORDER BY 2, 4, 6, 7
      ) x
    ), '[]'::TEXT)
  INTO v_rank_specialties, v_rank_doctors, v_unit_productivity, v_period_chart, v_consolidated_rows;

  SELECT COALESCE(TEXT_agg(DISTINCT item->>'institution_id'), '[]'::TEXT)
  INTO v_scope_institution_ids
  FROM TEXT_array_elements(COALESCE(v_consolidated_rows, '[]'::TEXT)) AS item
  WHERE item->>'institution_id' IS NOT NULL;

  v_scope_label := CASE
    WHEN p_institution_id IS NULL THEN 'Relatorio Consolidado'
    ELSE COALESCE((SELECT i.name FROM institutions i WHERE i.id = p_institution_id), 'Instituicao selecionada')
  END;

  v_report_code := upper(encode(gen_random_bytes(8), 'hex'));
  v_title := CASE
    WHEN COALESCE(NULLIF(p_report_type, ''), 'general_attendance') = 'analytical_attendance'
      THEN 'Relatorio Analitico de Atendimentos (' || to_char(v_from, 'DD/MM/YYYY') || ' - ' || to_char(v_to, 'DD/MM/YYYY') || ')'
    WHEN COALESCE(NULLIF(p_report_type, ''), 'general_attendance') = 'operational_consolidated'
      THEN 'Relatorio Operacional Consolidado (' || to_char(v_from, 'DD/MM/YYYY') || ' - ' || to_char(v_to, 'DD/MM/YYYY') || ')'
    ELSE 'Relatorio Geral de Atendimentos (' || to_char(v_from, 'DD/MM/YYYY') || ' - ' || to_char(v_to, 'DD/MM/YYYY') || ')'
  END;
  v_snapshot := TEXT_build_object(
    'app', 'SMS-MEDCO',
    'document_kind', 'operational_report',
    'document_version', 1,
    'document_code', v_report_code,
    'title', v_title,
    'report_type', COALESCE(NULLIF(p_report_type, ''), 'general_attendance'),
    'date_from', v_from,
    'date_to', v_to,
    'filters', TEXT_build_object(
      'institution_id', p_institution_id,
      'specialty_id', p_specialty_id,
      'doctor_id', p_doctor_id,
      'status', p_status
    ),
    'columns', TEXT_build_array('operational_at', 'appointment_date', 'patient_name', 'patient_cpf', 'patient_birth_date', 'patient_email', 'patient_phone', 'specialty_name', 'doctor_name', 'status', 'institution_name', 'reason'),
    'privacy_mode', CASE WHEN v_role = 'auditor' THEN 'aggregated_only' ELSE 'operational_with_rows' END,
    'rows', v_rows,
    'rows_count', v_row_count,
    'indicators', COALESCE(v_indicators, '{}'::TEXT),
    'executive_summary', TEXT_build_object(
      'total_atendimentos', COALESCE((v_indicators->>'total_atendimentos')::integer, 0),
      'agendados', COALESCE((v_indicators->>'agendados')::integer, 0),
      'confirmados', COALESCE((v_indicators->>'confirmados')::integer, 0),
      'em_atendimento', COALESCE((v_indicators->>'em_atendimento')::integer, 0),
      'concluidos', COALESCE((v_indicators->>'concluidos')::integer, 0),
      'cancelados', COALESCE((v_indicators->>'cancelados')::integer, 0),
      'nao_compareceu', COALESCE((v_indicators->>'nao_compareceu')::integer, 0)
    ),
    'consolidated_rows', COALESCE(v_consolidated_rows, '[]'::TEXT),
    'ranking_specialties', COALESCE(v_rank_specialties, '[]'::TEXT),
    'ranking_doctors', COALESCE(v_rank_doctors, '[]'::TEXT),
    'unit_productivity', COALESCE(v_unit_productivity, '[]'::TEXT),
    'period_chart', COALESCE(v_period_chart, '[]'::TEXT),
    'institution_id', v_scope,
    'institution_ids', COALESCE(v_scope_institution_ids, '[]'::TEXT),
    'institution_name', v_scope_label,
    'scope_label', v_scope_label,
    'generated_by', v_actor,
    'generated_by_name', COALESCE((SELECT u.full_name FROM users u WHERE u.id = v_actor), (SELECT p.full_name FROM profiles p WHERE p.id = v_actor), v_actor::text),
    'generated_by_role', v_role,
    'period_label', to_char(v_from, 'DD/MM/YYYY') || ' a ' || to_char(v_to, 'DD/MM/YYYY'),
    'generated_at', now()
  );
  v_hash := encode(digest(v_snapshot::text, 'sha256'), 'hex');
  PERFORM set_config('app.admin_operation', 'generate_report_snapshot', true);
  INSERT INTO report_snapshots (
    report_code, institution_id, report_type, title, filter_payload, snapshot,
    rows_count, content_hash, signature_hash, signature_payload, validation_payload,
    pdf_file_name, idempotency_key, generated_by
  )
  VALUES (
    v_report_code, v_scope, COALESCE(NULLIF(p_report_type, ''), 'general_attendance'), v_title,
    v_snapshot->'filters', v_snapshot, v_row_count, v_hash, v_hash,
    TEXT_build_object('algorithm', 'SHA256', 'hash', v_hash, 'signed_at', now(), 'signed_by', v_actor),
    v_report_code || '.pdf', p_idempotency_key, v_actor
  )
  ON CONFLICT (institution_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND deleted_at IS NULL
  DO UPDATE SET
    title = EXCLUDED.title,
    filter_payload = EXCLUDED.filter_payload,
    snapshot = EXCLUDED.snapshot,
    rows_count = EXCLUDED.rows_count,
    content_hash = EXCLUDED.content_hash,
    signature_hash = EXCLUDED.signature_hash,
    signature_payload = EXCLUDED.signature_payload,
    pdf_file_name = EXCLUDED.pdf_file_name,
    updated_at = now()
  RETURNING * INTO v_report;

  UPDATE report_snapshots
  SET signature_payload = COALESCE(signature_payload, '{}'::TEXT) || TEXT_build_object(
        'document_id', v_report.id,
        'report_id', v_report.id,

      ),
      updated_at = now()
  WHERE id = v_report.id
  RETURNING * INTO v_report;

  INSERT INTO clinical_events (institution_id, aggregate_table, aggregate_id, event_type, payload, idempotency_key, created_by)
  VALUES (v_scope, 'report_snapshots', v_report.id, 'reports.operational_generated', to_TEXT(v_report), p_idempotency_key, v_actor)
  ON CONFLICT (institution_id, idempotency_key) DO NOTHING;

  v_response := TEXT_build_object(
    'success', true,
    'report_id', v_report.id,
    'report_code', v_report.report_code,
    'title', v_report.title,
    'rows_count', v_report.rows_count,
    'content_hash', v_report.content_hash,
    'signature_hash', v_report.signature_hash,
    'pdf_file_name', v_report.pdf_file_name,
    'snapshot', v_snapshot
  );
  RETURN remember_idempotent_response('generate_operational_report_snapshot', p_idempotency_key, v_scope, v_response);
END;
$$;

CREATE OR REPLACE FUNCTION generate_module_export_snapshot(
  p_module text,
  p_format text DEFAULT 'pdf',
  p_filters TEXT DEFAULT '{}'::TEXT,
  p_idempotency_key text DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor TEXT;
  v_role text;
  v_module text;
  v_format text;
  v_scope TEXT;
  v_from date;
  v_to date;
  v_status text;
  v_search text;
  v_doctor_id TEXT;
  v_mode text;
  v_rows TEXT;
  v_columns TEXT;
  v_row_count integer;
  v_indicators TEXT;
  v_scope_definition TEXT;
  v_title text;
  v_snapshot TEXT;
  v_hash text;
  v_report_code text;
  v_report report_snapshots%ROWTYPE;
  v_existing TEXT;
  v_response TEXT;
BEGIN
  v_actor := assert_authenticated();
  v_role := current_user_role();
  v_module := lower(normalize_text(p_module, 60));
  v_format := lower(COALESCE(NULLIF(normalize_text(p_format, 20), ''), 'pdf'));
  BEGIN
    v_scope := COALESCE(NULLIF(p_filters->>'institution_id', '')::TEXT, current_user_primary_institution());
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'institution_id invalido nos filtros de exportacao';
  END;
  v_from := NULLIF(p_filters->>'date_from', '')::date;
  v_to := NULLIF(p_filters->>'date_to', '')::date;
  v_status := NULLIF(p_filters->>'status', '');
  v_search := NULLIF(normalize_text(p_filters->>'search', 180), '');
  v_doctor_id := NULLIF(p_filters->>'doctor_id', '')::TEXT;
  v_mode := COALESCE(NULLIF(normalize_text(p_filters->>'mode', 40), ''), 'events');

  IF v_module NOT IN ('appointments', 'agenda', 'history', 'patients', 'audit') THEN
    RAISE EXCEPTION 'Modulo de exportacao invalido';
  END IF;
  IF v_format NOT IN ('pdf', 'csv', 'excel') THEN
    RAISE EXCEPTION 'Formato de exportacao invalido';
  END IF;

  v_existing := find_idempotent_response('generate_module_export_snapshot', p_idempotency_key);
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  PERFORM assert_can_access(
    CASE
      WHEN v_module IN ('agenda', 'history') THEN 'appointments'
      WHEN v_module = 'audit' THEN 'audit'
      ELSE v_module
    END,
    'export',
    TEXT_build_object('institution_id', v_scope)
  );

  IF v_module = 'audit' THEN
    IF v_mode = 'records' THEN
      SELECT COALESCE(TEXT_agg(TEXT_build_object(
        'data_hora', al.created_at,
        'usuario', COALESCE(al.user_name, al.user_id::text, 'Sistema'),
        'acao', al.action,
        'tabela', al.table_name,
        'registro', al.record_id,
        'instituicao', al.institution_id,
        'transacao', al.txid
      ) ORDER BY al.created_at DESC), '[]'::TEXT)
      INTO v_rows
      FROM audit_log al
      WHERE (v_scope IS NULL OR al.institution_id = v_scope)
        AND (v_search IS NULL OR al.user_name ILIKE '%' || v_search || '%' OR al.table_name ILIKE '%' || v_search || '%' OR al.record_id::text ILIKE '%' || v_search || '%')
        AND (NULLIF(p_filters->>'action', '') IS NULL OR p_filters->>'action' = 'all' OR al.action = p_filters->>'action')
        AND (NULLIF(p_filters->>'table', '') IS NULL OR p_filters->>'table' = 'all' OR al.table_name = p_filters->>'table')
      LIMIT 500;

      v_columns := TEXT_build_array('data_hora', 'usuario', 'acao', 'tabela', 'registro', 'instituicao', 'transacao');
      v_title := 'Exportacao de Auditoria de Dados';
    ELSE
      SELECT COALESCE(TEXT_agg(TEXT_build_object(
        'data_hora', se.created_at,
        'usuario', COALESCE(u.full_name, p.full_name, se.user_id::text, 'Sistema'),
        'perfil', se.user_role,
        'modulo', se.module,
        'acao', se.action,
        'tipo', se.event_type,
        'criticidade', se.severity,
        'descricao', se.description
      ) ORDER BY se.created_at DESC), '[]'::TEXT)
      INTO v_rows
      FROM system_events se
      LEFT JOIN users u ON u.id = se.user_id
      LEFT JOIN profiles p ON p.id = se.user_id
      WHERE (v_scope IS NULL OR se.institution_id = v_scope)
        AND (v_from IS NULL OR se.created_at::date >= v_from)
        AND (v_to IS NULL OR se.created_at::date <= v_to)
        AND (
          v_search IS NULL
          OR se.description ILIKE '%' || v_search || '%'
          OR COALESCE(u.full_name, p.full_name, se.user_id::text, '') ILIKE '%' || v_search || '%'
          OR se.action ILIKE '%' || v_search || '%'
        )
        AND (NULLIF(p_filters->>'module', '') IS NULL OR p_filters->>'module' = 'all' OR se.module = p_filters->>'module')
        AND (NULLIF(p_filters->>'action', '') IS NULL OR p_filters->>'action' = 'all' OR se.action = p_filters->>'action')
        AND (NULLIF(p_filters->>'severity', '') IS NULL OR p_filters->>'severity' = 'all' OR se.severity = p_filters->>'severity')
      LIMIT 500;

      v_columns := TEXT_build_array('data_hora', 'usuario', 'perfil', 'modulo', 'acao', 'tipo', 'criticidade', 'descricao');
      v_title := 'Exportacao de Log de Sistema';
    END IF;
  ELSIF v_module = 'patients' THEN
    SELECT COALESCE(TEXT_agg(TEXT_build_object(
      'codigo', p.patient_code,
      'nome', p.full_name,
      'cpf', p.cpf,
      'nascimento', p.birth_date,
      'telefone', p.phone,
      'email', p.email,
      'cidade', p.city,
      'estado', p.state,
      'instituicao', COALESCE(i.name, 'Sem instituicao'),
      'institution_id', p.institution_id,
      'status', CASE WHEN p.is_active THEN 'ativo' ELSE 'inativo' END
    ) ORDER BY p.full_name), '[]'::TEXT)
    INTO v_rows
    FROM patients p
    LEFT JOIN institutions i ON i.id = p.institution_id
    WHERE p.deleted_at IS NULL
      AND (v_scope IS NULL OR p.institution_id = v_scope)
      AND (
        current_user_role() = 'superadmin'
        OR p.institution_id = ANY(current_user_institution_ids())
      )
      AND (v_search IS NULL OR p.full_name ILIKE '%' || v_search || '%' OR p.cpf ILIKE '%' || normalize_cpf(v_search) || '%' OR p.patient_code ILIKE '%' || v_search || '%');

    v_columns := TEXT_build_array('codigo', 'nome', 'cpf', 'nascimento', 'telefone', 'email', 'cidade', 'estado', 'instituicao', 'status');
    v_title := 'Exportacao de Pacientes';
  ELSE
    SELECT COALESCE(TEXT_agg(TEXT_build_object(
      'codigo', a.appointment_code,
      'data_atendimento', a.appointment_date,
      'status', a.status,
      'paciente', p.full_name,
      'cpf', p.cpf,
      'email', p.email,
      'telefone', p.phone,
      'profissional', COALESCE(u.full_name, pr.full_name, d.crm),
      'registro_profissional', d.professional_council || ' ' || d.crm,
      'especialidade', s.name,
      'instituicao', i.name,
      'motivo', a.reason
    ) ORDER BY a.appointment_date DESC), '[]'::TEXT)
    INTO v_rows
    FROM appointments a
    JOIN patients p ON p.id = a.patient_id
    JOIN doctors d ON d.id = a.doctor_id
    LEFT JOIN users u ON u.id = d.user_id
    LEFT JOIN profiles pr ON pr.id = d.user_id
    LEFT JOIN specialties s ON s.id = a.specialty_id
    LEFT JOIN institutions i ON i.id = a.institution_id
    WHERE a.deleted_at IS NULL
      AND (v_scope IS NULL OR a.institution_id = v_scope)
      AND (v_from IS NULL OR a.appointment_date >= v_from::DATETIME)
      AND (v_to IS NULL OR a.appointment_date < (v_to + 1)::DATETIME)
      AND (v_status IS NULL OR v_status = 'all' OR a.status::text = v_status)
      AND (v_doctor_id IS NULL OR a.doctor_id = v_doctor_id)
      AND (
        current_user_role() = 'superadmin'
        OR (current_user_role() = 'recepcao' AND user_has_institution_access(a.institution_id))
        OR (current_user_role() = 'medico' AND current_user_doctor_id() IS NOT NULL AND a.doctor_id = current_user_doctor_id())
      )
      AND (
        v_search IS NULL
        OR p.full_name ILIKE '%' || v_search || '%'
        OR p.cpf ILIKE '%' || normalize_cpf(v_search) || '%'
        OR a.appointment_code ILIKE '%' || v_search || '%'
        OR COALESCE(u.full_name, pr.full_name, '') ILIKE '%' || v_search || '%'
        OR COALESCE(d.professional_council, '') ILIKE '%' || upper(v_search) || '%'
        OR COALESCE(d.crm, '') ILIKE '%' || upper(v_search) || '%'
        OR COALESCE(s.name, '') ILIKE '%' || v_search || '%'
      );

    v_columns := TEXT_build_array('codigo', 'data_atendimento', 'paciente', 'cpf', 'email', 'telefone', 'especialidade', 'profissional', 'registro_profissional', 'status', 'instituicao', 'motivo');
    v_title := CASE v_module
      WHEN 'agenda' THEN 'Exportacao de Agenda'
      WHEN 'history' THEN 'Exportacao de Historico de Consultas'
      ELSE 'Exportacao de Consultas'
    END;
  END IF;

  v_row_count := COALESCE(TEXT_array_length(v_rows), 0);
  IF v_module IN ('appointments', 'agenda', 'history') THEN
    SELECT TEXT_build_object(
      'total_atendimentos', v_row_count,
      'agendados', count(*) FILTER (WHERE item->>'status' = 'agendado')::integer,
      'confirmados', count(*) FILTER (WHERE item->>'status' = 'confirmado')::integer,
      'em_atendimento', count(*) FILTER (WHERE item->>'status' = 'em_atendimento')::integer,
      'concluidos', count(*) FILTER (WHERE item->>'status' = 'concluido')::integer,
      'finalizados', count(*) FILTER (WHERE item->>'status' = 'concluido')::integer,
      'cancelados', count(*) FILTER (WHERE item->>'status' = 'cancelado')::integer,
      'cancelamentos', count(*) FILTER (WHERE item->>'status' = 'cancelado')::integer,
      'nao_compareceu', count(*) FILTER (WHERE item->>'status' = 'nao_compareceu')::integer,
      'faltas', count(*) FILTER (WHERE item->>'status' = 'nao_compareceu')::integer
    )
    INTO v_indicators
    FROM TEXT_array_elements(COALESCE(v_rows, '[]'::TEXT)) AS row_item(item);
    v_scope_definition := CASE v_module
      WHEN 'history' THEN TEXT_build_object(
        'label', 'Historico de consultas encerradas',
        'counting_criteria', 'Subconjunto de consultas com situacao concluida, cancelada ou nao compareceu.',
        'reconciliation_rule', 'Historico total = concluidos + cancelados + nao compareceu, usando os mesmos filtros de consultas.'
      )
      WHEN 'agenda' THEN TEXT_build_object(
        'label', 'Agenda de consultas',
        'counting_criteria', 'Consultas da agenda conforme data, profissional, instituicao e filtros informados.',
        'reconciliation_rule', 'Agenda total = soma das consultas por situacao dentro do mesmo filtro.'
      )
      ELSE TEXT_build_object(
        'label', 'Consultas operacionais',
        'counting_criteria', 'Todas as consultas ativas conforme filtros informados.',
        'reconciliation_rule', 'Consultas total = agendados + confirmados + em atendimento + concluidos + cancelados + nao compareceu.'
      )
    END;
  ELSIF v_module = 'patients' THEN
    SELECT TEXT_build_object(
      'total_registros', v_row_count,
      'pacientes_unicos_globais_por_cpf', count(DISTINCT NULLIF(regexp_replace(item->>'cpf', '\D', '', 'g'), ''))::integer,
      'registros_unicos_por_cpf_instituicao', count(DISTINCT ((item->>'institution_id') || ':' || NULLIF(regexp_replace(item->>'cpf', '\D', '', 'g'), ''))) FILTER (WHERE regexp_replace(COALESCE(item->>'cpf', ''), '\D', '', 'g') <> '')::integer,
      'nomes_unicos', count(DISTINCT lower(trim(item->>'nome'))) FILTER (WHERE trim(COALESCE(item->>'nome', '')) <> '')::integer,
      'registros_sem_cpf', count(*) FILTER (WHERE regexp_replace(COALESCE(item->>'cpf', ''), '\D', '', 'g') = '')::integer,
      'ativos', count(*) FILTER (WHERE item->>'status' = 'ativo')::integer,
      'inativos', count(*) FILTER (WHERE item->>'status' = 'inativo')::integer,
      'possiveis_dados_teste', count(*) FILTER (
        WHERE COALESCE(item->>'email', '') ILIKE '%example.test'
           OR COALESCE(item->>'nome', '') ILIKE 'QAISO %'
           OR COALESCE(item->>'nome', '') ILIKE 'qa_%'
           OR COALESCE(item->>'nome', '') ILIKE '%compartilhado%'
      )::integer
    )
    INTO v_indicators
    FROM TEXT_array_elements(COALESCE(v_rows, '[]'::TEXT)) AS row_item(item);
    v_scope_definition := TEXT_build_object(
      'label', 'Cadastro de pacientes',
      'counting_criteria', 'Total de registros representa linhas ativas no cadastro. Pacientes unicos globais sao calculados por CPF; a regra operacional permite o mesmo CPF em instituicoes diferentes.',
      'reconciliation_rule', 'Registros por instituicao podem ser maiores que CPFs unicos globais quando o mesmo paciente existe em mais de uma instituicao.'
    );
  ELSE
    v_indicators := TEXT_build_object(
      'total_registros', v_row_count
    );
    v_scope_definition := TEXT_build_object(
      'label', 'Exportacao operacional',
      'counting_criteria', 'Registros retornados conforme filtros informados.',
      'reconciliation_rule', 'Total de registros = quantidade de linhas exportadas.'
    );
  END IF;

  v_report_code := upper(encode(gen_random_bytes(8), 'hex'));
  v_snapshot := TEXT_build_object(
    'app', 'SMS-MEDCO',
    'document_kind', 'module_export',
    'document_code', v_report_code,
    'module', v_module,
    'export_format', v_format,
    'title', v_title,
    'filters', COALESCE(p_filters, '{}'::TEXT),
    'date_from', v_from,
    'date_to', v_to,
    'period_label', CASE
      WHEN v_from IS NULL AND v_to IS NULL THEN 'Todos os periodos'
      WHEN v_from IS NOT NULL AND v_to IS NOT NULL THEN to_char(v_from, 'DD/MM/YYYY') || ' a ' || to_char(v_to, 'DD/MM/YYYY')
      WHEN v_from IS NOT NULL THEN 'A partir de ' || to_char(v_from, 'DD/MM/YYYY')
      ELSE 'Ate ' || to_char(v_to, 'DD/MM/YYYY')
    END,
    'scope_definition', COALESCE(v_scope_definition, '{}'::TEXT),
    'columns', v_columns,
    'rows', v_rows,
    'rows_count', v_row_count,
    'indicators', COALESCE(v_indicators, '{}'::TEXT),
    'executive_summary', COALESCE(v_indicators, '{}'::TEXT),
    'institution_id', v_scope,
    'institution_name', (SELECT i.name FROM institutions i WHERE i.id = v_scope),
    'generated_by_name', COALESCE((SELECT u.full_name FROM users u WHERE u.id = v_actor), (SELECT p.full_name FROM profiles p WHERE p.id = v_actor), v_actor::text),
    'generated_by_role', v_role,
    'generated_by', v_actor,
    'generated_at', now()
  );
  v_hash := encode(digest(v_snapshot::text, 'sha256'), 'hex');

  PERFORM set_config('app.admin_operation', 'generate_report_snapshot', true);
  INSERT INTO report_snapshots (
    report_code, institution_id, report_type, title, filter_payload, snapshot,
    rows_count, content_hash, signature_hash, signature_payload, validation_payload,
    pdf_file_name, idempotency_key, generated_by
  )
  VALUES (
    v_report_code, v_scope, 'module_export_' || v_module, v_title,
    COALESCE(p_filters, '{}'::TEXT), v_snapshot, v_row_count, v_hash, v_hash,
    TEXT_build_object('algorithm', 'SHA256', 'hash', v_hash, 'signed_at', now(), 'signed_by', v_actor),
    TEXT_build_object('app', 'SMS-MEDCO', 'kind', 'module_export', 'code', v_report_code, 'hash', v_hash, 'issued_at', now()),
    v_report_code || CASE WHEN v_format = 'excel' THEN '.xlsx' WHEN v_format = 'csv' THEN '.csv' ELSE '.pdf' END,
    p_idempotency_key, v_actor
  )
  ON CONFLICT (institution_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND deleted_at IS NULL
  DO UPDATE SET
    title = EXCLUDED.title,
    filter_payload = EXCLUDED.filter_payload,
    snapshot = EXCLUDED.snapshot,
    rows_count = EXCLUDED.rows_count,
    content_hash = EXCLUDED.content_hash,
    signature_hash = EXCLUDED.signature_hash,
    signature_payload = EXCLUDED.signature_payload,
    pdf_file_name = EXCLUDED.pdf_file_name,
    updated_at = now()
  RETURNING * INTO v_report;

  INSERT INTO clinical_events (institution_id, aggregate_table, aggregate_id, event_type, payload, idempotency_key, created_by)
  VALUES (v_scope, 'report_snapshots', v_report.id, 'exports.module_generated', to_TEXT(v_report), p_idempotency_key, v_actor)
  ON CONFLICT (institution_id, idempotency_key) DO NOTHING;

  v_response := TEXT_build_object(
    'success', true,
    'report_id', v_report.id,
    'report_code', v_report.report_code,
    'title', v_report.title,
    'rows_count', v_report.rows_count,
    'content_hash', v_report.content_hash,
    'signature_hash', v_report.signature_hash,
    'pdf_file_name', v_report.pdf_file_name,
    'snapshot', v_snapshot
  );
  RETURN remember_idempotent_response('generate_module_export_snapshot', p_idempotency_key, v_scope, v_response);
END;
$$;

CREATE OR REPLACE FUNCTION get_report_export_payload(
  p_report_id TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_report report_snapshots%ROWTYPE;
BEGIN
  PERFORM assert_authenticated();

  SELECT * INTO v_report
  FROM report_snapshots rs
  WHERE rs.id = p_report_id
    AND rs.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Relatorio nao encontrado';
  END IF;

  PERFORM assert_can_access(
    'reports',
    'read',
    TEXT_build_object('institution_id', v_report.institution_id, 'require_institution_access', v_report.institution_id IS NOT NULL)
  );

  RETURN TEXT_build_object(
    'id', v_report.id,
    'report_code', v_report.report_code,
    'report_type', v_report.report_type,
    'title', v_report.title,
    'institution_id', v_report.institution_id,
    'filter_payload', v_report.filter_payload,
    'snapshot', v_report.snapshot,
    'rows_count', v_report.rows_count,
    'content_hash', v_report.content_hash,
    'signature_hash', v_report.signature_hash,
    'pdf_file_name', v_report.pdf_file_name,
    'generated_at', v_report.generated_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION list_history_snapshot(
  p_status text DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 1000
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doctor TEXT;
  v_role text;
  v_scope TEXT;
  v_allow_clinical INTEGER := false;
  v_mask_identity INTEGER := false;
BEGIN
  v_role := current_user_role();
  v_doctor := current_user_doctor_id();
  v_scope := current_user_primary_institution();

  IF v_role = 'superadmin' THEN
    v_allow_clinical := true;
  ELSIF v_role = 'medico' THEN
    IF v_doctor IS NULL THEN
      RAISE EXCEPTION 'Profissional sem vinculo medico ativo para consultar historico';
    END IF;

    PERFORM assert_can_access(
      'medical_records',
      'read',
      TEXT_build_object('doctor_id', v_doctor)
    );
    v_allow_clinical := true;
  ELSIF v_role IN ('admin', 'recepcao') THEN
    PERFORM require_permission('appointments', 'read', NULL);
  ELSIF v_role = 'auditor' THEN
    PERFORM require_permission('audit', 'read', NULL);
    v_mask_identity := true;
  ELSE
    RAISE EXCEPTION 'Permissao negada para consultar historico';
  END IF;

  RETURN COALESCE((
    WITH latest_entry AS (
      SELECT DISTINCT ON (mre.encounter_id)
        mre.encounter_id,
        mre.clinical_data
      FROM medical_record_entries mre
      ORDER BY mre.encounter_id, mre.version DESC
    )
    SELECT TEXT_agg(
      TEXT_build_object(
        'id', a.id,
        'appointment_id', a.id,
        'patient_id', a.patient_id,
        'patient_name', CASE WHEN v_mask_identity THEN 'Paciente protegido' ELSE p.full_name END,
        'patient_cpf', CASE WHEN v_mask_identity THEN NULL ELSE p.cpf END,
        'doctor_id', a.doctor_id,
        'doctor_name', CASE WHEN v_mask_identity THEN 'Profissional protegido' ELSE COALESCE(u.full_name, pr.full_name) END,
        'doctor_crm', CASE WHEN v_mask_identity THEN NULL ELSE d.crm END,
        'doctor_council', CASE WHEN v_mask_identity THEN NULL ELSE d.professional_council END,
        'doctor_registration_label', CASE WHEN v_mask_identity THEN NULL ELSE d.professional_council || ' ' || d.crm END,
        'specialty_id', a.specialty_id,
        'specialty_name', s.name,
        'appointment_date', a.appointment_date,
        'status', a.status,
        'reason', a.reason,
        'diagnosis', CASE WHEN v_allow_clinical THEN COALESCE(le.clinical_data->>'diagnosis', a.diagnosis) ELSE NULL END,
        'prescription', CASE WHEN v_allow_clinical THEN COALESCE(le.clinical_data->>'prescription', a.prescription) ELSE NULL END,
        'anamnesis', CASE WHEN v_allow_clinical THEN le.clinical_data->>'anamnesis' ELSE NULL END,
        'evolution', CASE WHEN v_allow_clinical THEN le.clinical_data->>'evolution' ELSE NULL END,
        'blood_pressure', CASE WHEN v_allow_clinical THEN le.clinical_data->>'blood_pressure' ELSE NULL END,
        'heart_rate', CASE WHEN v_allow_clinical THEN NULLIF(le.clinical_data->>'heart_rate', '')::integer ELSE NULL END,
        'temperature', CASE WHEN v_allow_clinical THEN NULLIF(le.clinical_data->>'temperature', '')::REAL ELSE NULL END,
        'weight', CASE WHEN v_allow_clinical THEN NULLIF(le.clinical_data->>'weight', '')::REAL ELSE NULL END,
        'height', CASE WHEN v_allow_clinical THEN NULLIF(le.clinical_data->>'height', '')::REAL ELSE NULL END,
        'archived_at', COALESCE(e.finalized_at, a.updated_at, a.created_at)
      )
      ORDER BY a.appointment_date DESC
    )
    FROM (
      SELECT a.*
      FROM appointments a
      WHERE a.deleted_at IS NULL
        AND (
          v_role IN ('superadmin', 'auditor')
          OR (v_role = 'medico' AND v_doctor IS NOT NULL AND a.doctor_id = v_doctor)
          OR (v_role IN ('admin', 'recepcao') AND user_has_institution_access(a.institution_id))
        )
        AND (
          p_status IS NULL
          OR p_status = ''
          OR p_status = 'all'
          OR a.status::text = p_status
        )
        AND (p_date_from IS NULL OR a.appointment_date >= p_date_from::DATETIME)
        AND (p_date_to IS NULL OR a.appointment_date < (p_date_to + 1)::DATETIME)
        AND (
          p_search IS NULL
          OR p_search = ''
          OR EXISTS (
            SELECT 1
            FROM patients px
            WHERE px.id = a.patient_id
              AND (
                normalize_search_text(px.full_name) LIKE '%' || normalize_search_text(p_search) || '%'
                OR (normalize_cpf(p_search) <> '' AND px.cpf ILIKE '%' || normalize_cpf(p_search) || '%')
              )
          )
          OR EXISTS (
            SELECT 1
            FROM doctors dx
            LEFT JOIN users ux ON ux.id = dx.user_id
            LEFT JOIN profiles prx ON prx.id = dx.user_id
            LEFT JOIN specialties sx ON sx.id = dx.specialty_id
            WHERE dx.id = a.doctor_id
              AND (
                normalize_search_text(COALESCE(ux.full_name, prx.full_name, '')) LIKE '%' || normalize_search_text(p_search) || '%'
                OR normalize_search_text(COALESCE(dx.professional_council, '')) LIKE '%' || normalize_search_text(p_search) || '%'
                OR normalize_search_text(COALESCE(dx.crm, '')) LIKE '%' || normalize_search_text(p_search) || '%'
                OR normalize_search_text(COALESCE(sx.name, '')) LIKE '%' || normalize_search_text(p_search) || '%'
              )
          )
        )
      ORDER BY a.appointment_date DESC
      LIMIT GREATEST(COALESCE(p_limit, 1000), 1)
    ) a
    JOIN patients p ON p.id = a.patient_id
    JOIN doctors d ON d.id = a.doctor_id
    LEFT JOIN users u ON u.id = d.user_id
    LEFT JOIN profiles pr ON pr.id = d.user_id
    LEFT JOIN specialties s ON s.id = a.specialty_id
    LEFT JOIN encounters e ON e.appointment_id = a.id
    LEFT JOIN latest_entry le ON le.encounter_id = e.id
  ), '[]'::TEXT);
END;
$$;

CREATE OR REPLACE FUNCTION list_audit_log_snapshot(
  p_search text DEFAULT NULL,
  p_action text DEFAULT NULL,
  p_table_name text DEFAULT NULL,
  p_limit integer DEFAULT 100
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  v_role := current_user_role();

  PERFORM require_permission('audit', 'read', current_user_primary_institution());

  RETURN COALESCE((
    SELECT TEXT_agg(
      TEXT_build_object(
        'id', al.id,
        'action', al.action,
        'table_name', al.table_name,
        'record_id', CASE WHEN v_role = 'superadmin' THEN al.record_id ELSE NULL END,
        'old_data', CASE WHEN v_role = 'superadmin' THEN al.old_data ELSE NULL END,
        'new_data', CASE WHEN v_role = 'superadmin' THEN al.new_data ELSE NULL END,
        'created_at', al.created_at,
        'user_id', CASE WHEN v_role IN ('superadmin', 'admin') THEN al.user_id ELSE NULL END,
        'user_name', CASE WHEN v_role = 'auditor' THEN 'Usuario protegido' ELSE COALESCE(al.user_name, p.full_name, 'Sistema') END,
        'user_email', CASE WHEN v_role IN ('superadmin', 'admin') THEN p.email ELSE NULL END
      )
      ORDER BY al.created_at DESC
    )
    FROM (
      SELECT *
      FROM audit_log
      WHERE (
          v_role = 'superadmin'
          OR user_has_institution_access(institution_id)
        )
        AND (
          p_search IS NULL
          OR p_search = ''
          OR (v_role <> 'auditor' AND COALESCE(user_name, '') ILIKE '%' || p_search || '%')
          OR table_name ILIKE '%' || p_search || '%'
        )
        AND (
          p_action IS NULL
          OR p_action = ''
          OR p_action = 'all'
          OR action = p_action
        )
        AND (
          p_table_name IS NULL
          OR p_table_name = ''
          OR p_table_name = 'all'
          OR table_name = p_table_name
        )
      ORDER BY created_at DESC
      LIMIT GREATEST(COALESCE(p_limit, 100), 1)
    ) al
    LEFT JOIN profiles p ON p.id = al.user_id
  ), '[]'::TEXT);
END;
$$;

CREATE OR REPLACE FUNCTION record_system_event(
  p_module text,
  p_action text,
  p_description text,
  p_severity text DEFAULT 'info',
  p_payload TEXT DEFAULT '{}'::TEXT,
  p_institution_id TEXT DEFAULT NULL,
  p_event_type text DEFAULT 'system',
  p_before_data TEXT DEFAULT NULL,
  p_after_data TEXT DEFAULT NULL,
  p_ip_address text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor TEXT;
  v_event system_events%ROWTYPE;
BEGIN
  IF request_is_service_role() IS TRUE THEN
    BEGIN
      v_actor := NULLIF(p_payload ->> 'user_id', '')::TEXT;
    EXCEPTION WHEN others THEN
      v_actor := NULL;
    END;
  ELSE
    v_actor := assert_authenticated();
  END IF;

  IF lower(COALESCE(p_severity, 'info')) NOT IN ('info', 'warning', 'error', 'critical') THEN
    RAISE EXCEPTION 'Criticidade invalida';
  END IF;

  INSERT INTO system_events (
    institution_id, user_id, user_role, correlation_id, ip_address, user_agent, module, action,
    event_type, severity, description, before_data, after_data, payload
  )
  VALUES (
    COALESCE(p_institution_id, current_user_primary_institution()),
    v_actor,
    current_user_role(),
    normalize_text(
      COALESCE(
        NULLIF(p_payload ->> 'correlation_id', ''),
        NULLIF(p_payload ->> 'request_id', ''),
        txid_current()::text
      ),
      120
    ),
    NULLIF(btrim(COALESCE(p_ip_address, '')), '')::inet,
    normalize_text(p_user_agent, 500),
    lower(normalize_text(p_module, 80)),
    lower(normalize_text(p_action, 80)),
    lower(COALESCE(normalize_text(p_event_type, 80), 'system')),
    lower(COALESCE(normalize_text(p_severity, 20), 'info')),
    normalize_text(p_description, 1000),
    p_before_data,
    p_after_data,
    COALESCE(p_payload, '{}'::TEXT)
  )
  RETURNING * INTO v_event;

  RETURN TEXT_build_object('success', true, 'event_id', v_event.id);
END;
$$;

DROP FUNCTION IF EXISTS list_system_events_snapshot(text, text, text, text, integer);

CREATE OR REPLACE FUNCTION list_system_events_snapshot(
  p_module text DEFAULT NULL,
  p_action text DEFAULT NULL,
  p_severity text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_user_id TEXT DEFAULT NULL,
  p_limit integer DEFAULT 100
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  v_role := current_user_role();

  PERFORM require_permission('audit', 'read', current_user_primary_institution());

  RETURN COALESCE((
    SELECT TEXT_agg(
      TEXT_build_object(
        'id', se.id,
        'created_at', se.created_at,
        'institution_id', se.institution_id,
        'user_id', CASE WHEN v_role IN ('superadmin', 'admin') THEN se.user_id ELSE NULL END,
        'user_role', se.user_role,
        'user_name', CASE WHEN v_role = 'auditor' THEN 'Usuario protegido' ELSE COALESCE(u.full_name, p.full_name) END,
        'ip_address', CASE WHEN v_role = 'superadmin' THEN se.ip_address::text ELSE NULL END,
        'user_agent', CASE WHEN v_role = 'superadmin' THEN se.user_agent ELSE NULL END,
        'module', se.module,
        'action', se.action,
        'event_type', se.event_type,
        'severity', se.severity,
        'description', se.description,
        'payload', CASE WHEN v_role = 'superadmin' THEN se.payload ELSE '{}'::TEXT END
      )
      ORDER BY se.created_at DESC
    )
    FROM (
      SELECT *
      FROM system_events se
      WHERE (
          v_role = 'superadmin'
          OR user_has_institution_access(se.institution_id)
          OR se.institution_id IS NULL
        )
        AND (p_module IS NULL OR p_module = '' OR se.module = lower(p_module))
        AND (p_action IS NULL OR p_action = '' OR se.action = lower(p_action))
        AND (p_severity IS NULL OR p_severity = '' OR se.severity = lower(p_severity))
        AND (p_date_from IS NULL OR se.created_at >= p_date_from::DATETIME)
        AND (p_date_to IS NULL OR se.created_at < (p_date_to + 1)::DATETIME)
        AND (p_user_id IS NULL OR se.user_id = p_user_id)
        AND (
          p_search IS NULL OR p_search = ''
          OR se.description ILIKE '%' || p_search || '%'
          OR se.module ILIKE '%' || p_search || '%'
          OR se.action ILIKE '%' || p_search || '%'
          OR se.event_type ILIKE '%' || p_search || '%'
          OR se.user_role ILIKE '%' || p_search || '%'
          OR (v_role <> 'auditor' AND se.user_id::text ILIKE '%' || p_search || '%')
        )
      ORDER BY se.created_at DESC
      LIMIT GREATEST(COALESCE(p_limit, 100), 1)
    ) se
    LEFT JOIN users u ON u.id = se.user_id
    LEFT JOIN profiles p ON p.id = se.user_id
  ), '[]'::TEXT);
END;
$$;

-- ============================================================
-- RLS
-- ============================================================

CREATE POLICY institutions_select_policy ON institutions
FOR SELECT TO authenticated
USING (
  current_user_role() = 'superadmin'
  OR user_has_institution_access(id)
);

CREATE POLICY institutions_write_policy ON institutions
FOR ALL TO authenticated
USING (
  current_setting('app.admin_operation', true) IN ('upsert_institution', 'set_institution_active')
  AND (
    current_user_role() = 'superadmin'
    OR user_has_permission('institutions', 'update', id)
  )
)
WITH CHECK (
  current_setting('app.admin_operation', true) IN ('upsert_institution', 'set_institution_active')
  AND (
    current_user_role() = 'superadmin'
    OR user_has_permission('institutions', 'create', id)
    OR user_has_permission('institutions', 'update', id)
  )
);

CREATE POLICY users_select_policy ON users
FOR SELECT TO authenticated
USING (
  id = auth.uid()
  OR current_user_role() = 'superadmin'
  OR user_has_permission('users', 'read', primary_institution_id)
  OR EXISTS (
    SELECT 1
    FROM user_institutions ui
    WHERE ui.user_id = users.id
      AND ui.revoked_at IS NULL
      AND user_has_permission('users', 'read', ui.institution_id)
  )
);

CREATE POLICY users_write_policy ON users
FOR ALL TO authenticated
USING (
  current_user_role() = 'superadmin'
  OR user_has_permission('users', 'update', primary_institution_id)
)
WITH CHECK (
  current_user_role() = 'superadmin'
  OR user_has_permission('users', 'create', primary_institution_id)
  OR user_has_permission('users', 'update', primary_institution_id)
);

CREATE POLICY roles_select_policy ON roles
FOR SELECT TO authenticated
USING (
  current_user_role() = 'superadmin'
  OR institution_id IS NULL
  OR user_has_permission('roles', 'read', institution_id)
);

CREATE POLICY roles_write_policy ON roles
FOR ALL TO authenticated
USING (
  current_user_role() = 'superadmin'
  OR user_has_permission('roles', 'update', institution_id)
)
WITH CHECK (
  current_user_role() = 'superadmin'
  OR user_has_permission('roles', 'create', institution_id)
  OR user_has_permission('roles', 'update', institution_id)
);

CREATE POLICY permissions_select_policy ON permissions
FOR SELECT TO authenticated
USING (
  current_user_role() = 'superadmin'
  OR institution_id IS NULL
  OR user_has_permission('permissions', 'read', institution_id)
);

CREATE POLICY permissions_write_policy ON permissions
FOR ALL TO authenticated
USING (
  current_setting('app.access_operation', true) = 'update_permissions'
  AND (
    current_user_role() = 'superadmin'
    OR user_has_permission('permissions', 'manage', institution_id)
  )
)
WITH CHECK (
  current_setting('app.access_operation', true) = 'update_permissions'
  AND (
    current_user_role() = 'superadmin'
    OR user_has_permission('permissions', 'manage', institution_id)
  )
);

CREATE POLICY role_permissions_select_policy ON role_permissions
FOR SELECT TO authenticated
USING (
  current_user_role() = 'superadmin'
  OR institution_id IS NULL
  OR user_has_permission('permissions', 'read', institution_id)
);

CREATE POLICY role_permissions_write_policy ON role_permissions
FOR ALL TO authenticated
USING (
  current_setting('app.access_operation', true) IN ('update_permissions', 'grant_permission', 'revoke_permission')
  AND (
    current_user_role() = 'superadmin'
    OR user_has_permission('permissions', 'manage', institution_id)
  )
)
WITH CHECK (
  current_setting('app.access_operation', true) IN ('update_permissions', 'grant_permission', 'revoke_permission')
  AND (
    current_user_role() = 'superadmin'
    OR user_has_permission('permissions', 'manage', institution_id)
  )
);

CREATE POLICY user_permissions_select_policy ON user_permissions
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR current_user_role() = 'superadmin'
  OR user_has_permission('permissions', 'read', institution_id)
);

CREATE POLICY user_permissions_write_policy ON user_permissions
FOR ALL TO authenticated
USING (
  current_setting('app.access_operation', true) IN ('grant_user_permission', 'revoke_user_permission')
  AND current_user_role() = 'superadmin'
)
WITH CHECK (
  current_setting('app.access_operation', true) IN ('grant_user_permission', 'revoke_user_permission')
  AND current_user_role() = 'superadmin'
);

CREATE POLICY profiles_select_policy ON profiles
FOR SELECT TO authenticated
USING (
  id = auth.uid()
  OR current_user_role() = 'superadmin'
  OR user_has_institution_access(institution_id)
);

CREATE POLICY profiles_update_policy ON profiles
FOR UPDATE TO authenticated
USING (
  id = auth.uid()
  OR current_user_role() = 'superadmin'
  OR (current_user_role() = 'admin' AND user_has_institution_access(institution_id))
)
WITH CHECK (
  id = auth.uid()
  OR current_user_role() = 'superadmin'
  OR (current_user_role() = 'admin' AND user_has_institution_access(institution_id))
);

CREATE POLICY user_roles_select_policy ON TEXTs
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR current_user_role() = 'superadmin'
  OR user_has_permission('roles', 'read', institution_id)
);

CREATE POLICY user_roles_write_policy ON TEXTs
FOR ALL TO authenticated
USING (
  current_user_role() = 'superadmin'
  OR user_has_permission('roles', 'update', institution_id)
)
WITH CHECK (
  current_user_role() = 'superadmin'
  OR user_has_permission('roles', 'update', institution_id)
);

CREATE POLICY user_institutions_select_policy ON user_institutions
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR current_user_role() = 'superadmin'
  OR user_has_permission('user_institutions', 'read', institution_id)
);

CREATE POLICY user_institutions_write_policy ON user_institutions
FOR ALL TO authenticated
USING (
  current_user_role() = 'superadmin'
  OR user_has_permission('user_institutions', 'update', institution_id)
)
WITH CHECK (
  current_user_role() = 'superadmin'
  OR user_has_permission('user_institutions', 'update', institution_id)
);

CREATE POLICY specialties_select_policy ON specialties
FOR SELECT TO authenticated
USING (is_active = true OR current_user_role() IN ('superadmin', 'admin', 'auditor'));

CREATE POLICY specialties_write_policy ON specialties
FOR ALL TO authenticated
USING (
  current_setting('app.admin_operation', true) IN ('upsert_specialty', 'set_specialty_active')
  AND user_has_permission('specialties', 'update', current_user_primary_institution())
)
WITH CHECK (
  current_setting('app.admin_operation', true) IN ('upsert_specialty', 'set_specialty_active')
  AND (
    user_has_permission('specialties', 'create', current_user_primary_institution())
    OR user_has_permission('specialties', 'update', current_user_primary_institution())
  )
);

CREATE POLICY doctors_select_policy ON doctors
FOR SELECT TO authenticated
USING (
  current_user_role() = 'superadmin'
  OR is_doctor_owner(id)
  OR EXISTS (
    SELECT 1
    FROM profiles dp
    WHERE dp.id = doctors.user_id
      AND user_has_institution_access(dp.institution_id)
  )
);

CREATE POLICY doctors_write_policy ON doctors
FOR ALL TO authenticated
USING (
  current_setting('app.admin_operation', true) IN ('upsert_doctor', 'set_doctor_active')
  AND (
    current_user_role() = 'superadmin'
    OR user_has_permission('doctors', 'update', current_user_primary_institution())
  )
)
WITH CHECK (
  current_setting('app.admin_operation', true) IN ('upsert_doctor', 'set_doctor_active')
  AND (
    current_user_role() = 'superadmin'
    OR user_has_permission('doctors', 'create', current_user_primary_institution())
    OR user_has_permission('doctors', 'update', current_user_primary_institution())
  )
);

CREATE POLICY doctor_availability_select_policy ON doctor_availability
FOR SELECT TO authenticated
USING (
  current_user_role() = 'superadmin'
  OR user_has_institution_access(institution_id)
  OR is_doctor_owner(doctor_id)
);

CREATE POLICY doctor_availability_write_policy ON doctor_availability
FOR ALL TO authenticated
USING (
  current_user_role() = 'superadmin'
  OR (current_user_role() = 'admin' AND user_has_institution_access(institution_id))
)
WITH CHECK (
  current_user_role() = 'superadmin'
  OR (current_user_role() = 'admin' AND user_has_institution_access(institution_id))
);

CREATE POLICY schedule_blocks_select_policy ON schedule_blocks
FOR SELECT TO authenticated
USING (
  current_user_role() = 'superadmin'
  OR user_has_institution_access(institution_id)
);

CREATE POLICY schedule_blocks_write_policy ON schedule_blocks
FOR ALL TO authenticated
USING (
  current_user_role() = 'superadmin'
  OR (current_user_role() IN ('admin', 'recepcao') AND user_has_institution_access(institution_id))
)
WITH CHECK (
  current_user_role() = 'superadmin'
  OR (current_user_role() IN ('admin', 'recepcao') AND user_has_institution_access(institution_id))
);

CREATE POLICY patients_select_policy ON patients
FOR SELECT TO authenticated
USING (
  current_user_role() = 'superadmin'
  OR (
    current_user_role() = 'recepcao'
    AND user_has_institution_access(institution_id)
  )
  OR (
    current_user_role() = 'medico'
    AND EXISTS (
      SELECT 1
      FROM appointments a
      JOIN doctors d ON d.id = a.doctor_id
      WHERE a.patient_id = patients.id
        AND d.user_id = auth.uid()
    )
  )
);

CREATE POLICY patients_write_policy ON patients
FOR ALL TO authenticated
USING (
  current_setting('app.admin_operation', true) IN ('upsert_patient', 'set_patient_active')
  AND (
    current_user_role() = 'superadmin'
    OR user_has_permission('patients', 'update', institution_id)
  )
)
WITH CHECK (
  current_setting('app.admin_operation', true) IN ('upsert_patient', 'set_patient_active')
  AND (
    current_user_role() = 'superadmin'
    OR user_has_permission('patients', 'create', institution_id)
    OR user_has_permission('patients', 'update', institution_id)
  )
);

CREATE POLICY appointments_select_policy ON appointments
FOR SELECT TO authenticated
USING (
  current_user_role() = 'superadmin'
  OR (current_user_role() IN ('recepcao', 'admin') AND user_has_institution_access(institution_id))
  OR is_doctor_owner(doctor_id)
  OR current_doctor_can_assume_appointment(id)
);

CREATE POLICY appointments_write_policy ON appointments
FOR ALL TO authenticated
USING (
  current_user_role() = 'superadmin'
  OR (
    current_setting('app.clinical_operation', true) IN ('schedule_appointment', 'reschedule_appointment', 'set_appointment_status')
    AND current_user_role() IN ('recepcao', 'admin')
    AND user_has_institution_access(institution_id)
  )
  OR (
    current_setting('app.clinical_operation', true) IN ('start_encounter', 'finalize_encounter')
    AND current_user_role() = 'medico'
    AND (is_doctor_owner(doctor_id) OR current_doctor_can_assume_appointment(id))
  )
)
WITH CHECK (
  current_user_role() = 'superadmin'
  OR (
    current_setting('app.clinical_operation', true) IN ('schedule_appointment', 'reschedule_appointment', 'set_appointment_status')
    AND current_user_role() IN ('recepcao', 'admin')
    AND user_has_institution_access(institution_id)
  )
  OR (
    current_setting('app.clinical_operation', true) IN ('start_encounter', 'finalize_encounter')
    AND current_user_role() = 'medico'
    AND is_doctor_owner(doctor_id)
  )
);

CREATE POLICY encounters_select_policy ON encounters
FOR SELECT TO authenticated
USING (
  current_user_role() = 'superadmin'
  OR is_doctor_owner(doctor_id)
);

CREATE POLICY encounters_write_policy ON encounters
FOR ALL TO authenticated
USING (
  current_setting('app.clinical_operation', true) IN ('start_encounter', 'finalize_encounter')
  AND (
    current_user_role() = 'superadmin'
    OR is_doctor_owner(doctor_id)
  )
)
WITH CHECK (
  current_setting('app.clinical_operation', true) IN ('start_encounter', 'finalize_encounter')
  AND (
    current_user_role() = 'superadmin'
    OR is_doctor_owner(doctor_id)
  )
);

CREATE POLICY medical_record_entries_select_policy ON medical_record_entries
FOR SELECT TO authenticated
USING (
  current_user_role() = 'superadmin'
  OR EXISTS (
    SELECT 1 FROM encounters e
    WHERE e.id = medical_record_entries.encounter_id
      AND is_doctor_owner(e.doctor_id)
  )
);

CREATE POLICY medical_record_entries_insert_policy ON medical_record_entries
FOR INSERT TO authenticated
WITH CHECK (
  current_setting('app.clinical_operation', true) = 'add_medical_record_entry'
  AND (
    current_user_role() = 'superadmin'
    OR EXISTS (
      SELECT 1 FROM encounters e
      WHERE e.id = medical_record_entries.encounter_id
        AND is_doctor_owner(e.doctor_id)
        AND e.status = 'em_atendimento'
    )
  )
);

CREATE POLICY clinical_events_select_policy ON clinical_events
FOR SELECT TO authenticated
USING (
  current_user_role() = 'superadmin'
);

CREATE POLICY audit_log_select_policy ON audit_log
FOR SELECT TO authenticated
USING (
  current_user_role() = 'superadmin'
);

CREATE POLICY audit_log_insert_policy ON audit_log
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY system_config_select_policy ON system_config
FOR SELECT TO authenticated
USING (
  deleted_at IS NULL
  AND (
    is_public = true
    OR current_user_role() = 'superadmin'
    OR user_has_permission('settings', 'read', COALESCE(institution_id, current_user_primary_institution()))
    OR user_has_permission('settings', 'manage', COALESCE(institution_id, current_user_primary_institution()))
  )
);

CREATE POLICY system_config_write_policy ON system_config
FOR ALL TO authenticated
USING (
  current_setting('app.admin_operation', true) = 'upsert_system_config'
  AND (
    current_user_role() = 'superadmin'
    OR user_has_permission('settings', 'manage', COALESCE(institution_id, current_user_primary_institution()))
  )
)
WITH CHECK (
  current_setting('app.admin_operation', true) = 'upsert_system_config'
  AND (
    current_user_role() = 'superadmin'
    OR user_has_permission('settings', 'manage', COALESCE(institution_id, current_user_primary_institution()))
  )
);

CREATE POLICY report_snapshots_select_policy ON report_snapshots
FOR SELECT TO authenticated
USING (
  deleted_at IS NULL
  AND (
    current_user_role() = 'superadmin'
    OR user_has_permission('reports', 'read', institution_id)
  )
);

CREATE POLICY report_snapshots_write_policy ON report_snapshots
FOR ALL TO authenticated
USING (
  current_setting('app.admin_operation', true) = 'generate_report_snapshot'
  AND (
    current_user_role() = 'superadmin'
    OR user_has_permission('reports', 'read', institution_id)
  )
)
WITH CHECK (
  current_setting('app.admin_operation', true) = 'generate_report_snapshot'
  AND (
    current_user_role() = 'superadmin'
    OR user_has_permission('reports', 'read', institution_id)
  )
);

CREATE POLICY system_events_select_policy ON system_events
FOR SELECT TO authenticated
USING (
  current_user_role() = 'superadmin'
);

CREATE POLICY system_events_insert_policy ON system_events
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  OR current_user_role() = 'superadmin'
  OR request_is_service_role()
);

-- Direct client writes are intentionally blocked. All mutations must use audited RPCs.

-- Least-privilege grants for RPCs.

REVOKE ALL ON FUNCTION 

REVOKE ALL ON FUNCTION 

COMMIT;

-- ============================================================
-- RBAC structural profile reflection overrides
-- ============================================================

CREATE OR REPLACE FUNCTION user_has_active_role_for(
  p_user_id TEXT,
  p_role_key text
)
RETURNS INTEGER
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM TEXTs ur
    LEFT JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = p_user_id
      AND ur.revoked_at IS NULL
      AND COALESCE(r.key, ur.role::text) = p_role_key
      AND COALESCE(r.is_active, true) = true
      AND COALESCE(r.deleted_at, NULL) IS NULL
    UNION ALL
    SELECT 1
    FROM profiles p
    WHERE p.id = p_user_id
      AND p.deleted_at IS NULL
      AND p.is_active = true
      AND p.role::text = p_role_key
  );
$$;

CREATE OR REPLACE FUNCTION active_superadmin_count()
RETURNS integer
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(DISTINCT ur.user_id)::integer
  FROM TEXTs ur
  LEFT JOIN roles r ON r.id = ur.role_id
  JOIN users u ON u.id = ur.user_id
  WHERE ur.revoked_at IS NULL
    AND u.deleted_at IS NULL
    AND u.is_active = true
    AND COALESCE(r.key, ur.role::text) = 'superadmin'
    AND COALESCE(r.is_active, true) = true
    AND COALESCE(r.deleted_at, NULL) IS NULL;
$$;

CREATE OR REPLACE FUNCTION assert_admin_can_manage_user(
  p_user_id TEXT,
  p_action text DEFAULT 'gerenciar o'
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_user_role() = 'admin'
     AND user_has_active_role_for(p_user_id, 'superadmin') THEN
    RAISE EXCEPTION 'Administrador nao pode % superadmin', p_action;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION is_doctor_owner(target_doctor TEXT)
RETURNS INTEGER
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT current_user_role() = 'medico'
    AND EXISTS (
      SELECT 1
      FROM doctors d
      WHERE d.id = target_doctor
        AND d.user_id = auth.uid()
        AND d.deleted_at IS NULL
        AND d.is_active = true
    );
$$;

DROP FUNCTION IF EXISTS set_user_access_profile(TEXT, text, TEXT, text);
CREATE OR REPLACE FUNCTION set_user_access_profile(
  p_user_id TEXT,
  p_role_key text,
  p_institution_id TEXT DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor TEXT;
  v_actor_role text;
  v_existing TEXT;
  v_role roles%ROWTYPE;
  v_user users%ROWTYPE;
  v_target_exists INTEGER;
  v_target_is_superadmin INTEGER;
  v_scope TEXT;
  v_role_institution TEXT;
  v_event_scope TEXT;
  v_legacy_role TEXT;
  v_assignment_id TEXT;
  v_response TEXT;
  v_structural_roles constant TEXT := ARRAY['superadmin', 'admin', 'auditor', 'medico', 'recepcao', 'paciente'];
  v_root_superadmin constant TEXT := 'e1610477-7e32-4dc7-88dc-39c84db49ede'::TEXT;
BEGIN
  v_actor := assert_authenticated();
  v_actor_role := current_user_role();
  v_existing := find_idempotent_response('set_user_access_profile', p_idempotency_key);
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  IF v_actor_role NOT IN ('superadmin', 'admin') THEN
    RAISE EXCEPTION 'Somente superadmin ou admin pode alterar perfil operacional';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM users u
    WHERE u.id = p_user_id
      AND u.deleted_at IS NULL
  ) INTO v_target_exists;

  IF v_target_exists IS NOT TRUE THEN
    RAISE EXCEPTION 'Usuario inexistente';
  END IF;

  IF p_user_id = v_root_superadmin AND v_actor <> v_root_superadmin THEN
    RAISE EXCEPTION 'Usuario estrutural protegido nao pode ser gerenciado por este operador';
  END IF;

  SELECT *
  INTO v_user
  FROM users u
  WHERE u.id = p_user_id
    AND u.deleted_at IS NULL
  LIMIT 1;

  IF p_role_key = 'medico'
     OR NOT EXISTS (
       SELECT 1
       FROM profiles existing_profile
       WHERE existing_profile.id = p_user_id
         AND existing_profile.deleted_at IS NULL
     )
  THEN
    PERFORM ensure_auth_backing_for_user(p_user_id);

    SELECT *
    INTO v_user
    FROM users u
    WHERE u.id = p_user_id
      AND u.deleted_at IS NULL
    LIMIT 1;
  END IF;

  v_target_is_superadmin := user_has_active_role_for(p_user_id, 'superadmin');

  IF v_target_is_superadmin THEN
    PERFORM assert_admin_can_manage_user(p_user_id, 'gerenciar o');
    IF p_role_key <> 'superadmin' THEN
      RAISE EXCEPTION 'Superadmin global nao pode ser reclassificado por esta operacao';
    END IF;
  END IF;

  IF p_role_key <> ALL(enum_range(NULL::TEXT)::TEXT) THEN
    RAISE EXCEPTION 'Perfil operacional invalido: %', p_role_key;
  END IF;

  SELECT COALESCE(p_institution_id, u.primary_institution_id, p.institution_id)
  INTO v_scope
  FROM users u
  LEFT JOIN profiles p ON p.id = u.id
  WHERE u.id = p_user_id
  LIMIT 1;

  IF p_role_key IN ('superadmin', 'admin', 'auditor') THEN
    v_scope := NULL;
  END IF;

  v_event_scope := COALESCE(v_scope, current_user_primary_institution());

  IF p_role_key NOT IN ('superadmin', 'admin', 'auditor', 'medico') AND v_scope IS NULL THEN
    RAISE EXCEPTION 'Perfil operacional exige instituicao principal';
  END IF;
  IF p_role_key IN ('superadmin', 'admin', 'auditor') THEN
    IF p_role_key <> 'superadmin' AND v_actor_role <> 'superadmin' THEN
      RAISE EXCEPTION 'Somente superadmin pode atribuir perfis estruturais';
    END IF;

    IF v_actor <> v_root_superadmin THEN
      IF p_role_key = 'superadmin' THEN
        RAISE EXCEPTION 'Somente o superadministrador raiz pode atribuir superadmin';
      END IF;
    END IF;

    PERFORM require_permission('roles', 'update', NULL);
  ELSE
    PERFORM require_permission('user_roles', 'update', v_scope);
  END IF;

  SELECT * INTO v_role
  FROM roles
  WHERE key = p_role_key
    AND deleted_at IS NULL
    AND is_active = true
    AND (institution_id IS NULL OR institution_id = v_scope)
  ORDER BY institution_id NULLS FIRST
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Role inexistente: %', p_role_key;
  END IF;

  v_role_institution := CASE WHEN p_role_key IN ('superadmin', 'admin', 'auditor') THEN NULL ELSE v_scope END;

  v_legacy_role := p_role_key::TEXT;

  SELECT ur.id
  INTO v_assignment_id
  FROM TEXTs ur
  WHERE ur.user_id = p_user_id
    AND (
      ur.role::text = p_role_key
      OR EXISTS (
        SELECT 1
        FROM roles existing_role
        WHERE existing_role.id = ur.role_id
          AND existing_role.key = p_role_key
      )
    )
  ORDER BY
    CASE WHEN ur.institution_id IS NOT DISTINCT FROM v_role_institution THEN 0 ELSE 1 END,
    ur.granted_at DESC NULLS LAST,
    ur.id DESC
  LIMIT 1
  FOR UPDATE;

  UPDATE TEXTs ur
  SET revoked_at = now(),
      revoked_by = v_actor
  WHERE ur.user_id = p_user_id
    AND ur.revoked_at IS NULL
    AND (v_assignment_id IS NULL OR ur.id <> v_assignment_id)
    AND (
      ur.role::text = ANY(v_structural_roles)
      OR EXISTS (
        SELECT 1
        FROM roles structural_role
        WHERE structural_role.id = ur.role_id
          AND structural_role.key = ANY(v_structural_roles)
      )
    );

  IF v_assignment_id IS NULL THEN
    INSERT INTO TEXTs (user_id, role_id, role, institution_id, granted_by, revoked_at, revoked_by)
    VALUES (p_user_id, v_role.id, v_legacy_role, v_role_institution, v_actor, NULL, NULL)
    RETURNING id INTO v_assignment_id;
  ELSE
    UPDATE TEXTs
    SET role = v_legacy_role,
        institution_id = v_role_institution,
        granted_by = v_actor,
        granted_at = now(),
        revoked_at = NULL,
        revoked_by = NULL
    WHERE id = v_assignment_id
    RETURNING id INTO v_assignment_id;
  END IF;

  UPDATE TEXTs ur
  SET revoked_at = now(),
      revoked_by = v_actor
  WHERE ur.user_id = p_user_id
    AND ur.revoked_at IS NULL
    AND ur.id <> v_assignment_id
    AND (
      ur.role::text = ANY(v_structural_roles)
      OR EXISTS (
        SELECT 1
        FROM roles structural_role
        WHERE structural_role.id = ur.role_id
          AND structural_role.key = ANY(v_structural_roles)
      )
    );

  UPDATE users
  SET primary_institution_id = CASE WHEN p_role_key IN ('superadmin', 'admin', 'auditor') THEN NULL ELSE v_scope END,
      is_active = true,
      auth_status = CASE WHEN auth_status = 'disabled' THEN 'active' ELSE auth_status END,
      updated_by = v_actor
  WHERE id = p_user_id
    AND deleted_at IS NULL;

  PERFORM set_config('app.access_operation', 'sync_user_profile', true);

  INSERT INTO profiles (id, email, first_name, last_name, role, phone, institution_id, is_active)
  VALUES (
    p_user_id,
    COALESCE(NULLIF(lower(btrim(v_user.email)), ''), lower(p_user_id::text || '@legacy.local')),
    split_part(COALESCE(NULLIF(btrim(v_user.full_name), ''), 'Usuario'), ' ', 1),
    COALESCE(
      btrim(
        substr(
          COALESCE(NULLIF(btrim(v_user.full_name), ''), 'Usuario'),
          length(split_part(COALESCE(NULLIF(btrim(v_user.full_name), ''), 'Usuario'), ' ', 1)) + 1
        )
      ),
      ''
    ),
    v_legacy_role,
    v_user.phone,
    CASE WHEN p_role_key IN ('superadmin', 'admin', 'auditor') THEN NULL ELSE v_scope END,
    true
  )
  ON CONFLICT (id) DO UPDATE
  SET email = COALESCE(NULLIF(EXCLUDED.email, ''), profiles.email),
      first_name = COALESCE(NULLIF(EXCLUDED.first_name, ''), profiles.first_name),
      last_name = COALESCE(EXCLUDED.last_name, profiles.last_name),
      role = EXCLUDED.role,
      phone = COALESCE(EXCLUDED.phone, profiles.phone),
      institution_id = EXCLUDED.institution_id,
      is_active = true,
      deleted_at = NULL,
      deleted_by = NULL,
      updated_at = now();

  PERFORM set_config('app.access_operation', 'sync_user_profile', true);

  UPDATE profiles
  SET role = v_legacy_role,
      institution_id = CASE WHEN p_role_key IN ('superadmin', 'admin', 'auditor') THEN NULL ELSE v_scope END,
      is_active = true,
      updated_at = now()
  WHERE id = p_user_id
    AND deleted_at IS NULL;

  INSERT INTO clinical_events (institution_id, aggregate_table, aggregate_id, event_type, payload, idempotency_key, created_by)
  VALUES (
    v_event_scope,
    'users',
    p_user_id,
    'access.profile_replaced',
    TEXT_build_object(
      'user_id', p_user_id,
      'role_key', p_role_key,
      'primary_institution_id', CASE WHEN p_role_key IN ('superadmin', 'admin', 'auditor') THEN NULL ELSE v_scope END,
      'role_institution_id', v_role_institution
    ),
    p_idempotency_key,
    v_actor
  )
  ON CONFLICT (institution_id, idempotency_key) DO NOTHING;

  v_response := TEXT_build_object(
    'success', true,
    'user_id', p_user_id,
    'role_key', p_role_key,
    'primary_institution_id', CASE WHEN p_role_key IN ('superadmin', 'admin', 'auditor') THEN NULL ELSE v_scope END,
    'role_institution_id', v_role_institution
  );

  RETURN remember_idempotent_response('set_user_access_profile', p_idempotency_key, v_event_scope, v_response);
END;
$$;

DROP FUNCTION IF EXISTS set_user_operational_profile(TEXT, text, TEXT, text, TEXT, integer, text, text);
CREATE OR REPLACE FUNCTION set_user_operational_profile(
  p_user_id TEXT,
  p_role_key text,
  p_institution_id TEXT DEFAULT NULL,
  p_professional_registration text DEFAULT NULL,
  p_specialty_id TEXT DEFAULT NULL,
  p_professional_council text DEFAULT 'CRM',
  p_idempotency_key text DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor TEXT;
  v_scope TEXT;
  v_access_result TEXT;
  v_doctor_result TEXT;
  v_existing TEXT;
  v_doctor_id TEXT;
  v_response TEXT;
BEGIN
  v_actor := assert_authenticated();

  PERFORM assert_can_access(
    'users',
    'update',
    TEXT_build_object(
      'owner_user_id', p_user_id,
      'institution_id', p_institution_id,
      'require_institution_access', p_institution_id IS NOT NULL
    )
  );

  v_existing := find_idempotent_response('set_user_operational_profile', p_idempotency_key);
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  SELECT COALESCE(p_institution_id, u.primary_institution_id, p.institution_id)
  INTO v_scope
  FROM users u
  LEFT JOIN profiles p ON p.id = u.id
  WHERE u.id = p_user_id
  LIMIT 1;

  v_access_result := set_user_access_profile(
    p_user_id,
    p_role_key,
    COALESCE(p_institution_id, v_scope),
    CASE WHEN p_idempotency_key IS NULL THEN NULL ELSE p_idempotency_key || ':access' END
  );

  IF p_role_key = 'medico' THEN
    IF NULLIF(btrim(COALESCE(p_professional_registration, '')), '') IS NULL THEN
      RAISE EXCEPTION 'Registro profissional obrigatorio para o perfil medico';
    END IF;

    IF p_specialty_id IS NULL THEN
      RAISE EXCEPTION 'Especialidade principal obrigatoria para o perfil medico';
    END IF;

    SELECT d.id
    INTO v_doctor_id
    FROM doctors d
    WHERE d.user_id = p_user_id
      AND d.deleted_at IS NULL
    ORDER BY d.created_at NULLS LAST, d.id DESC
    LIMIT 1;

    v_doctor_result := upsert_doctor(
      p_user_id := p_user_id,
      p_doctor_id := v_doctor_id,
      p_specialty_id := p_specialty_id,
      p_professional_council := COALESCE(NULLIF(btrim(p_professional_council), ''), 'CRM'),
      p_crm := p_professional_registration,
      p_idempotency_key := CASE WHEN p_idempotency_key IS NULL THEN NULL ELSE p_idempotency_key || ':doctor' END
    );
  ELSE
    UPDATE doctors
    SET is_active = false,
        updated_at = now()
    WHERE user_id = p_user_id
      AND deleted_at IS NULL
      AND is_active = true;
  END IF;

  v_response := TEXT_build_object(
    'success', true,
    'user_id', p_user_id,
    'role_key', p_role_key,
    'primary_institution_id', COALESCE(p_institution_id, v_scope),
    'access_result', v_access_result,
    'doctor_result', v_doctor_result
  );

  RETURN remember_idempotent_response(
    'set_user_operational_profile',
    p_idempotency_key,
    COALESCE(p_institution_id, v_scope),
    v_response
  );
END;
$$;

DROP FUNCTION IF EXISTS link_user_institution(TEXT, TEXT, INTEGER, text);
CREATE OR REPLACE FUNCTION link_user_institution(
  p_user_id TEXT,
  p_institution_id TEXT,
  p_revoke INTEGER DEFAULT false,
  p_idempotency_key text DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor TEXT;
  v_existing TEXT;
  v_response TEXT;
BEGIN
  v_actor := assert_authenticated();
  v_existing := find_idempotent_response('link_user_institution', p_idempotency_key);
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  PERFORM assert_admin_can_manage_user(p_user_id, 'gerenciar o');
  PERFORM require_permission('user_institutions', 'update', p_institution_id);

  IF NOT EXISTS (SELECT 1 FROM users u WHERE u.id = p_user_id AND u.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Usuario inexistente';
  END IF;

  IF current_user_role() <> 'superadmin' AND user_has_institution_access(p_institution_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Usuario sem acesso a instituicao';
  END IF;

  IF p_revoke IS NOT TRUE
     AND user_has_active_role_for(p_user_id, 'superadmin') THEN
    RAISE EXCEPTION 'Superadmin possui escopo global e nao deve receber vinculo institucional direto';
  END IF;

  INSERT INTO user_institutions (user_id, institution_id, created_by, revoked_at, revoked_by)
  VALUES (
    p_user_id,
    p_institution_id,
    v_actor,
    CASE WHEN p_revoke THEN now() ELSE NULL END,
    CASE WHEN p_revoke THEN v_actor ELSE NULL END
  )
  ON CONFLICT (user_id, institution_id)
  DO UPDATE SET revoked_at = CASE WHEN p_revoke THEN now() ELSE NULL END,
                revoked_by = CASE WHEN p_revoke THEN v_actor ELSE NULL END,
                created_by = CASE WHEN p_

  INSERT INTO clinical_events (institution_id, aggregate_table, aggregate_id, event_type, payload, idempotency_key, created_by)
  VALUES (
    p_institution_id,
    'user_institutions',
    p_user_id,
    CASE WHEN p_revoke THEN 'access.institution_unlinked' ELSE 'access.institution_linked' END,
    TEXT_build_object('user_id', p_user_id, 'institution_id', p_institution_id, 'revoked', p_revoke),
    p_idempotency_key,
    v_actor
  )
  ON CONFLICT (institution_id, idempotency_key) DO NOTHING;

  v_response := TEXT_build_object('success', true, 'user_id', p_user_id, 'institution_id', p_institution_id, '
  RETURN remember_idempotent_response('link_user_institution', p_idempotency_key, p_institution_id, v_response);
END;
$$;

DROP FUNCTION IF EXISTS set_user_active(TEXT, INTEGER, text);
CREATE OR REPLACE FUNCTION set_user_active(
  p_user_id TEXT,
  p_is_active INTEGER,
  p_idempotency_key text DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor TEXT;
  v_scope TEXT;
  v_existing TEXT;
  v_response TEXT;
BEGIN
  v_actor := assert_authenticated();
  v_existing := find_idempotent_response('set_user_active', p_idempotency_key);
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  SELECT u.primary_institution_id INTO v_scope FROM users u WHERE u.id = p_user_id;
  PERFORM assert_admin_can_manage_user(p_user_id, 'alterar o status do');
  PERFORM require_permission('users', 'update', v_scope);

  IF p_is_active IS FALSE AND user_has_active_role_for(p_user_id, 'superadmin') THEN
    RAISE EXCEPTION 'Superadmin global nao pode ser inativado por esta operacao';
  END IF;

  UPDATE users
  SET is_active = p_is_active,
      auth_status = CASE WHEN p_is_active THEN auth_status ELSE 'disabled' END,
      updated_by = v_actor
  WHERE id = p_user_id
    AND deleted_at IS NULL;

  PERFORM set_config('app.access_operation', 'set_user_active', true);

  UPDATE profiles
  SET is_active = p_is_active
  WHERE id = p_user_id;

  INSERT INTO clinical_events (institution_id, aggregate_table, aggregate_id, event_type, payload, idempotency_key, created_by)
  VALUES (
    v_scope,
    'users',
    p_user_id,
    'access.user_status_changed',
    TEXT_build_object('user_id', p_user_id, 'is_active', p_is_active),
    p_idempotency_key,
    v_actor
  )
  ON CONFLICT (institution_id, idempotency_key) DO NOTHING;

  v_response := TEXT_build_object('success', true, 'user_id', p_user_id, 'is_active', p_is_active);
  RETURN remember_idempotent_response('set_user_active', p_idempotency_key, v_scope, v_response);
END;
$$;

CREATE OR REPLACE FUNCTION allowed_routes_for_current_user()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_scope TEXT;
  v_doctor_id TEXT;
BEGIN
  v_scope := current_user_primary_institution();

  IF current_user_role() = 'medico' THEN
    SELECT d.id
    INTO v_doctor_id
    FROM doctors d
    WHERE d.user_id = auth.uid()
      AND d.deleted_at IS NULL
      AND d.is_active = true
    LIMIT 1;
  ELSE
    v_doctor_id := NULL;
  END IF;

  RETURN ARRAY(
    SELECT route
    FROM unnest(ARRAY[
      CASE WHEN current_user_is_active() THEN '/dashboard' END,
      CASE WHEN can_access('schedules', 'read', v_scope, NULL, v_doctor_id) OR can_access('appointments', 'read', v_scope, NULL, v_doctor_id) THEN '/agenda' END,
      CASE WHEN can_access('doctor_availability', 'create', v_scope) OR can_access('doctor_availability', 'update', v_scope) OR can_access('schedule_blocks', 'create', v_scope) OR can_access('schedule_blocks', 'update', v_scope) THEN '/schedule-management' END,
      CASE WHEN can_access('appointments', 'read', v_scope, NULL, v_doctor_id) THEN '/appointments' END,
      CASE WHEN can_access('patients', 'read', v_scope, NULL, v_doctor_id) THEN '/patients' END,
      CASE WHEN can_access('doctors', 'update', v_scope) OR can_access('doctors', 'manage', v_scope) THEN '/doctors' END,
      CASE WHEN can_access('appointments', 'read', v_scope, NULL, v_doctor_id) OR can_access('medical_records', 'read', v_scope, NULL, v_doctor_id) THEN '/history' END,
      CASE WHEN can_access('reports', 'read', v_scope, NULL, v_doctor_id) THEN '/reports' END,
      CASE WHEN can_access('institutions', 'read', v_scope) OR can_access('institutions', 'update', v_scope) THEN '/institutions' END,
      CASE WHEN can_access('users', 'read', v_scope) THEN '/users' END,
      CASE WHEN can_access('specialties', 'read', v_scope) OR can_access('specialties', 'update', v_scope) THEN '/specialties' END,
      CASE WHEN can_access('settings', 'manage', v_scope) THEN '/settings' END,
      CASE WHEN can_access('audit', 'read', v_scope) THEN '/auditor' END,
      CASE WHEN can_access('audit', 'read', v_scope) THEN '/audit-log' END,

    ]) AS route
    WHERE route IS NOT NULL
  );
END;
$$;
CREATE OR REPLACE FUNCTION get_my_access_context()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user TEXT;
  v_role text;
  v_doctor_id TEXT;
  v_scope TEXT;
BEGIN
  v_user := assert_authenticated();
  v_role := current_user_role();
  v_scope := current_user_primary_institution();

  PERFORM assert_can_access(
    'profiles',
    'read',
    TEXT_build_object('institution_id', v_scope, 'owner_user_id', v_user)
  );

  IF v_role = 'medico' THEN
    SELECT d.id
    INTO v_doctor_id
    FROM doctors d
    WHERE d.user_id = v_user
      AND d.deleted_at IS NULL
      AND d.is_active = true
    LIMIT 1;
  ELSE
    v_doctor_id := NULL;
  END IF;

  RETURN TEXT_build_object(
    'user_id', v_user,
    'role', v_role,
    'doctor_id', v_doctor_id,
    'preferences', COALESCE(
      (SELECT p.preferences FROM profiles p WHERE p.id = v_user AND p.deleted_at IS NULL),
      '{}'::TEXT
    ),
    'full_name', COALESCE(
      (SELECT u.full_name FROM users u WHERE u.id = v_user AND u.deleted_at IS NULL),
      (SELECT p.full_name FROM profiles p WHERE p.id = v_user AND p.deleted_at IS NULL)
    ),
    'email', COALESCE(
      (SELECT u.email FROM users u WHERE u.id = v_user AND u.deleted_at IS NULL),
      (SELECT p.email FROM profiles p WHERE p.id = v_user AND p.deleted_at IS NULL)
    ),
    'phone', COALESCE(
      (SELECT u.phone FROM users u WHERE u.id = v_user AND u.deleted_at IS NULL),
      (SELECT p.phone FROM profiles p WHERE p.id = v_user AND p.deleted_at IS NULL)
    ),
    'institution_id', v_scope,
    'institution_name', (
      SELECT i.name FROM institutions i WHERE i.id = v_scope
    ),
    'institution_ids', current_user_institution_ids(),
    'permissions',
      COALESCE(
        (
          SELECT TEXT_agg(DISTINCT TEXT_build_object(
            'resource', permission_source.resource,
            'action', permission_source.action,
            'institution_id', permission_source.institution_id
          ))
          FROM (
            SELECT p.resource, p.action, COALESCE(p.institution_id, ur.institution_id) AS institution_id
            FROM TEXTs ur
            JOIN roles r ON r.id = ur.role_id OR r.key = ur.role::text
            JOIN role_permissions rp ON rp.role_id = r.id AND rp.revoked_at IS NULL
            JOIN permissions p ON p.id = rp.permission_id
            WHERE ur.user_id = v_user
              AND ur.revoked_at IS NULL
              AND r.is_active = true
              AND r.deleted_at IS NULL
              AND p.is_active = true
              AND p.deleted_at IS NULL

            UNION ALL

            SELECT p.resource, p.action, COALESCE(p.institution_id, up.institution_id) AS institution_id
            FROM user_permissions up
            JOIN permissions p ON p.id = up.permission_id
            WHERE up.user_id = v_user
              AND up.revoked_at IS NULL
              AND p.is_active = true
              AND p.deleted_at IS NULL
          ) permission_source
        ),
        '[]'::TEXT
      ),
    'allowed_routes', to_TEXT(allowed_routes_for_current_user()),
    'is_active', current_user_is_active()
  );
END;
$$;

DROP FUNCTION IF EXISTS get_access_control_snapshot(TEXT, text, integer);
CREATE OR REPLACE FUNCTION get_access_control_snapshot(
  p_institution_id TEXT DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 200
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor TEXT;
  v_scope TEXT;
  v_search text := lower(btrim(COALESCE(p_search, '')));
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 200), 1), 500);
  v_root_superadmin constant TEXT := 'e1610477-7e32-4dc7-88dc-39c84db49ede'::TEXT;
BEGIN
  v_actor := assert_authenticated();
  v_scope := COALESCE(p_institution_id, current_user_primary_institution());
  PERFORM require_permission('users', 'read', v_scope);

  RETURN TEXT_build_object(
    'context', get_my_access_context(),
    'users_search', NULLIF(v_search, ''),
    'users_limit', v_limit,
    'users_total',
      COALESCE((
        SELECT count(*)
        FROM users u
        WHERE u.deleted_at IS NULL
          AND (v_actor = v_root_superadmin OR u.id <> v_root_superadmin)
          AND (
            current_user_role() IN ('superadmin', 'admin', 'auditor')
            OR u.primary_institution_id = ANY(current_user_institution_ids())
            OR EXISTS (
              SELECT 1
              FROM user_institutions ui
              WHERE ui.user_id = u.id
                AND ui.revoked_at IS NULL
                AND ui.institution_id = ANY(current_user_institution_ids())
            )
          )
          AND (
            current_user_role() <> 'admin'
            OR user_has_active_role_for(u.id, 'superadmin') IS NOT TRUE
          )
          AND (
            v_search = ''
            OR lower(COALESCE(u.full_name, '')) LIKE '%' || v_search || '%'
            OR lower(COALESCE(u.email, '')) LIKE '%' || v_search || '%'
            OR EXISTS (
              SELECT 1
              FROM TEXTs ur
              LEFT JOIN roles r ON r.id = ur.role_id
              WHERE ur.user_id = u.id
                AND ur.revoked_at IS NULL
                AND (
                  lower(COALESCE(r.name, '')) LIKE '%' || v_search || '%'
                  OR lower(COALESCE(r.key, ur.role::text, '')) LIKE '%' || v_search || '%'
                )
            )
            OR EXISTS (
              SELECT 1
              FROM user_institutions ui
              JOIN institutions i ON i.id = ui.institution_id
              WHERE ui.user_id = u.id
                AND ui.revoked_at IS NULL
                AND lower(COALESCE(i.name, '')) LIKE '%' || v_search || '%'
            )
          )
      ), 0),
    'institutions',
      COALESCE((
        SELECT TEXT_agg(to_TEXT(i) ORDER BY i.name)
        FROM institutions i
        WHERE i.deleted_at IS NULL
          AND (
            current_user_role() = 'superadmin'
            OR user_has_institution_access(i.id)
          )
      ), '[]'::TEXT),
    'users',
      COALESCE((
        SELECT TEXT_agg(TEXT_build_object(
          'id', u.id,
          'auth_user_id', u.auth_user_id,
          'email', u.email,
          'full_name', u.full_name,
          'phone', u.phone,
          'primary_institution_id', u.primary_institution_id,
          'is_active', u.is_active,
          'auth_status', u.auth_status,
          'roles', COALESCE((
            SELECT TEXT_agg(TEXT_build_object(
              'role_key', r.key,
              'role_name', r.name,
              'institution_id', ur.institution_id,
              'revoked_at', ur.revoked_at
            ) ORDER BY r.key)
            FROM TEXTs ur
            LEFT JOIN roles r ON r.id = ur.role_id
            WHERE ur.user_id = u.id
              AND ur.revoked_at IS NULL
          ), '[]'::TEXT),
          'institution_ids', COALESCE((
            SELECT TEXT_agg(ui.institution_id ORDER BY ui.institution_id)
            FROM user_institutions ui
            WHERE ui.user_id = u.id
              AND ui.revoked_at IS NULL
          ), '[]'::TEXT)
        ) ORDER BY u.full_name)
        FROM (
          SELECT u.*
          FROM users u
          WHERE u.deleted_at IS NULL
            AND (v_actor = v_root_superadmin OR u.id <> v_root_superadmin)
            AND (
              current_user_role() IN ('superadmin', 'admin', 'auditor')
              OR u.primary_institution_id = ANY(current_user_institution_ids())
              OR EXISTS (
                SELECT 1
                FROM user_institutions ui
                WHERE ui.user_id = u.id
                  AND ui.revoked_at IS NULL
                  AND ui.institution_id = ANY(current_user_institution_ids())
              )
            )
            AND (
              current_user_role() <> 'admin'
              OR user_has_active_role_for(u.id, 'superadmin') IS NOT TRUE
            )
            AND (
              v_search = ''
              OR lower(COALESCE(u.full_name, '')) LIKE '%' || v_search || '%'
              OR lower(COALESCE(u.email, '')) LIKE '%' || v_search || '%'
              OR EXISTS (
                SELECT 1
                FROM TEXTs ur
                LEFT JOIN roles r ON r.id = ur.role_id
                WHERE ur.user_id = u.id
                  AND ur.revoked_at IS NULL
                  AND (
                    lower(COALESCE(r.name, '')) LIKE '%' || v_search || '%'
                    OR lower(COALESCE(r.key, ur.role::text, '')) LIKE '%' || v_search || '%'
                  )
                )
              OR EXISTS (
                SELECT 1
                FROM user_institutions ui
                JOIN institutions i ON i.id = ui.institution_id
                WHERE ui.user_id = u.id
                  AND ui.revoked_at IS NULL
                  AND lower(COALESCE(i.name, '')) LIKE '%' || v_search || '%'
              )
            )
          ORDER BY u.full_name
          LIMIT v_limit
        ) u
      ), '[]'::TEXT),
    'roles',
      COALESCE((
        SELECT TEXT_agg(TEXT_build_object(
          'id', r.id,
          'key', r.key,
          'name', r.name,
          'description', r.description,
          'institution_id', r.institution_id,
          'is_system', r.is_system,
          'is_active', r.is_active,
          'scope_label', CASE WHEN r.institution_id IS NULL THEN 'Global' ELSE COALESCE(i.name, r.institution_id::text) END,
          'assignable', COALESCE(r.key <> 'superadmin' OR v_actor = v_root_superadmin, false),
          'permissions_editable', COALESCE(r.key <> 'superadmin' OR v_actor = v_root_superadmin, false),
          'operational_summary', role_operational_summary(r.key)
        ) ORDER BY r.name)
        FROM roles r
        LEFT JOIN institutions i ON i.id = r.institution_id
        WHERE r.deleted_at IS NULL
          AND r.is_active = true
      ), '[]'::TEXT),
    'permissions', COALESCE((SELECT TEXT_agg(to_TEXT(p) ORDER BY p.resource, p.action) FROM permissions p WHERE p.deleted_at IS NULL AND p.is_active = true), '[]'::TEXT),
    'role_permissions', COALESCE((SELECT TEXT_agg(to_TEXT(rp) ORDER BY rp.role_id, rp.permission_id) FROM role_permissions rp WHERE rp.revoked_at IS NULL), '[]'::TEXT),
    'user_permissions', COALESCE((SELECT TEXT_agg(to_TEXT(up) ORDER BY up.user_id, up.permission_id) FROM user_permissions up WHERE up.revoked_at IS NULL), '[]'::TEXT)
  );
END;
$$;

CREATE OR REPLACE VIEW permissions_rls_reference AS
SELECT
  schemaname AS schema_name,
  tablename AS table_name,
  policyname AS policy_name,
  cmd AS command
FROM pg_policies
WHERE schemaname = 'public';

CREATE OR REPLACE VIEW permissions_rpc_reference AS
SELECT
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS arguments,
  (
    pg_get_functiondef(p.oid) ILIKE '%assert_can_access%'
    OR pg_get_functiondef(p.oid) ILIKE '%require_permission%'
    OR pg_get_functiondef(p.oid) ILIKE '%assert_authenticated%'
    OR pg_get_functiondef(p.oid) ILIKE '%current_user_role%'
  ) AS has_authorization_check
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prokind = 'f';

CREATE OR REPLACE FUNCTION get_user_effective_permissions(
  p_user_id TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor TEXT;
  v_target_primary TEXT;
  v_payload TEXT;
BEGIN
  v_actor := assert_authenticated();

  SELECT COALESCE(u.primary_institution_id, pr.institution_id)
  INTO v_target_primary
  FROM users u
  FULL JOIN profiles pr ON pr.id = u.id
  WHERE COALESCE(u.id, pr.id) = p_user_id
    AND COALESCE(u.deleted_at, pr.deleted_at) IS NULL
  LIMIT 1;

  IF p_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM users u WHERE u.id = p_user_id AND u.deleted_at IS NULL
    UNION ALL
    SELECT 1 FROM profiles pr WHERE pr.id = p_user_id AND pr.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Usuario inexistente';
  END IF;

  PERFORM assert_admin_can_manage_user(p_user_id, 'consultar o contexto do');

  PERFORM assert_can_access(
    'users',
    'read',
    TEXT_build_object('institution_id', v_target_primary, 'owner_user_id', p_user_id)
  );

  IF v_actor IS DISTINCT FROM p_user_id
     AND current_user_role() NOT IN ('superadmin', 'admin')
     AND user_has_permission('users', 'read', v_target_primary) IS NOT TRUE THEN
    RAISE EXCEPTION 'Permissao negada para consultar permissoes efetivas';
  END IF;

  WITH permission_rows AS (
    SELECT
      r.id AS role_id,
      r.key AS role_key,
      r.name AS role_name,
      p.id AS permission_id,
      p.resource,
      p.action,
      COALESCE(rp.institution_id, p.institution_id, ur.institution_id) AS scope_institution_id,
      'role_permission'::text AS origin,
      CASE
        WHEN r.key IN ('superadmin', 'admin', 'auditor')
          AND COALESCE(rp.institution_id, p.institution_id, ur.institution_id) IS NULL THEN 'global'
        WHEN r.key = 'paciente' THEN 'own'
        WHEN r.key = 'medico' AND p.resource IN ('encounters', 'medical_records') THEN 'owner'
        WHEN COALESCE(rp.institution_id, p.institution_id, ur.institution_id) IS NOT NULL THEN 'institution'
        WHEN r.key IN ('medico', 'recepcao') THEN 'institution'
        ELSE 'global'
      END AS scope,
      permission_guardrail_state(r.key, p.resource, p.action) AS guardrail,
      permission_semantic_state(p.resource, p.action) AS semantic_state,
      user_has_permission_for(p_user_id, p.resource, p.action, COALESCE(rp.institution_id, p.institution_id, ur.institution_id)) AS simulated_allowed
    FROM TEXTs ur
    JOIN roles r ON r.id = ur.role_id OR r.key = ur.role::text
    JOIN role_permissions rp ON rp.role_id = r.id AND rp.revoked_at IS NULL
    JOIN permissions p ON p.id = rp.permission_id
    WHERE ur.user_id = p_user_id
      AND ur.revoked_at IS NULL
      AND r.is_active = true
      AND r.deleted_at IS NULL
      AND p.is_active = true
      AND p.deleted_at IS NULL

    UNION ALL

    SELECT
      NULL::TEXT AS role_id,
      'individual'::text AS role_key,
      'Permissao individual'::text AS role_name,
      p.id AS permission_id,
      p.resource,
      p.action,
      COALESCE(up.institution_id, p.institution_id, v_target_primary) AS scope_institution_id,
      'user_permission'::text AS origin,
      CASE
        WHEN COALESCE(up.institution_id, p.institution_id, v_target_primary) IS NOT NULL THEN 'institution'
        ELSE 'global'
      END AS scope,
      permission_guardrail_state(COALESCE((
        SELECT r.key
        FROM TEXTs ur
        JOIN roles r ON r.id = ur.role_id OR r.key = ur.role::text
        WHERE ur.user_id = p_user_id
          AND ur.revoked_at IS NULL
          AND r.is_active = true
          AND r.deleted_at IS NULL
        ORDER BY
          CASE r.key
            WHEN 'superadmin' THEN 1
            WHEN 'admin' THEN 2
            WHEN 'medico' THEN 3
            WHEN 'recepcao' THEN 4
            WHEN 'auditor' THEN 5
            WHEN 'paciente' THEN 6
            ELSE 99
          END
        LIMIT 1
      ), 'paciente'), p.resource, p.action) AS guardrail,
      permission_semantic_state(p.resource, p.action) AS semantic_state,
      user_has_permission_for(p_user_id, p.resource, p.action, COALESCE(up.institution_id, p.institution_id, v_target_primary)) AS simulated_allowed
    FROM user_permissions up
    JOIN permissions p ON p.id = up.permission_id
    WHERE up.user_id = p_user_id
      AND up.revoked_at IS NULL
      AND p.is_active = true
      AND p.deleted_at IS NULL
  )
  SELECT TEXT_build_object(
    'user', (
      SELECT TEXT_build_object(
        'id', COALESCE(u.id, pr.id),
        'email', COALESCE(u.email, pr.email),
        'full_name', COALESCE(u.full_name, pr.full_name),
        'primary_institution_id', COALESCE(u.primary_institution_id, pr.institution_id),
        'is_active', COALESCE(u.is_active, pr.is_active, false)
      )
      FROM users u
      FULL JOIN profiles pr ON pr.id = u.id
      WHERE COALESCE(u.id, pr.id) = p_user_id
      LIMIT 1
    ),
    'permissions', COALESCE((
      SELECT TEXT_agg(
        TEXT_build_object(
          'role_id', role_id,
          'role_key', role_key,
          'role_name', role_name,
          'permission_id', permission_id,
          'resource', resource,
          'resource_label', permission_resource_label(resource),
          'action', action,
          'action_label', permission_action_label(action),
          'scope', scope,
          'scope_label', permission_scope_label(scope),
          'institution_id', scope_institution_id,
          'origin', origin,
          'applicable', COALESCE((semantic_state->>'applicable')::INTEGER, false),
          'semantic_reason', semantic_state->>'reason',
          'effective_allowed', simulated_allowed AND COALESCE((guardrail->>'denied')::INTEGER, false) = false AND COALESCE((semantic_state->>'applicable')::INTEGER, false) = true,
          'blocked_by_guardrail', COALESCE((guardrail->>'denied')::INTEGER, false),
          'guardrail_status', CASE WHEN COALESCE((guardrail->>'denied')::INTEGER, false) THEN 'denied_by_guardrail' ELSE 'allowed' END,
          'guardrail_reason', guardrail->>'reason',
          'enforcement', TEXT_build_array('role_permissions', 'user_has_permission', 'can_access', 'RLS/RPC')
        )
        ORDER BY resource, action, role_key, scope
      )
      FROM permission_rows
    ), '[]'::TEXT),
    'rls_policies', COALESCE((
      SELECT TEXT_agg(TEXT_build_object('table', p.table_name, 'policy', p.policy_name, 'command', p.command) ORDER BY p.table_name, p.policy_name)
      FROM permissions_rls_reference p
    ), '[]'::TEXT),
    'rpc_functions', COALESCE((
      SELECT TEXT_agg(TEXT_build_object('name', f.function_name, 'arguments', f.arguments, 'has_authorization_check', f.has_authorization_check) ORDER BY f.function_name)
      FROM permissions_rpc_reference f
    ), '[]'::TEXT)
  ) INTO v_payload;

  RETURN COALESCE(v_payload, TEXT_build_object('user', NULL, 'permissions', '[]'::TEXT, 'rls_policies', '[]'::TEXT, 'rpc_functions', '[]'::TEXT));
END;
$$;

CREATE OR REPLACE FUNCTION importar_dados_planilha(
  p_linhas TEXT,
  p_actor_id TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_linha TEXT;
  v_nome_inst text;
  v_nome_esp text;
  v_nome_med text;
  v_nome_pac text;
  v_cpf_pac text;
  v_email_pac text;
  v_phone_pac text;
  v_data_nasc_raw text;
  v_data_nasc date;
  v_data_consulta_raw text;
  v_data_consulta DATETIME;
  v_data_fim DATETIME;
  v_situacao text;
  v_status_mapeado TEXT;
  v_motivo text;
  
  v_instituicao_id TEXT;
  v_especialidade_id TEXT;
  v_medico_id TEXT;
  v_medico_user_id TEXT;
  v_paciente_id TEXT;
  v_agendamento_id TEXT;
  v_encounter_id TEXT;
  
  v_email_med text;
  v_crm_gerado text;
  v_codigo_paciente text;
  v_codigo_agend text;
  v_numero_ticket text;
  
  v_role_id TEXT;
  
  v_dados_clinicos_anamnese TEXT;
  v_dados_clinicos_finalizacao TEXT;
  v_hash_anamnese text;
  v_hash_finalizacao text;
  
  v_total_inst integer := 0;
  v_total_esp integer := 0;
  v_total_med integer := 0;
  v_total_pac integer := 0;
  v_total_agend integer := 0;
  v_total_encount integer := 0;
  
  v_tabelas TEXT := ARRAY[
    'medical_record_entries',
    'encounters',
    'appointments',
    'doctors',
    'patients',
    'specialties',
    'TEXTs',
    'profiles',
    'users',
    'institutions'
  ];
  v_tabela text;
BEGIN
  -- SeguranÃƒÂ§a: Garantir que apenas o superadmin-root executa
  IF p_actor_id IS DISTINCT FROM 'e1610477-7e32-4dc7-88dc-39c84db49ede' THEN
    RAISE EXCEPTION 'Acesso negado: apenas o superadmin-root pode executar esta importacao.';
  END IF;

  -- Desativar triggers temporariamente na sessao
  FOREACH v_tabela IN ARRAY v_tabelas LOOP
    IF to_regclass(v_tabela) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %s DISABLE TRIGGER USER', to_regclass(v_tabela));
    END IF;
  END LOOP;

  -- Configuracoes temporarias de sessao para contornar restricoes RLS/clinicas
  PERFORM set_config('app.seed_operation', 'true', true);
  PERFORM set_config('app.clinical_operation', 'true', true);
  PERFORM set_config('app.access_operation', 'true', true);

  -- Loop pelos dados da planilha recebidos via JSON
  FOR v_linha IN SELECT * FROM TEXT_array_elements(p_linhas) LOOP
    v_nome_inst := trim(coalesce(v_linha->>'Instituicao', v_linha->>'InstituiÃƒÂ§ÃƒÂ£o', ''));
    v_nome_esp := trim(coalesce(v_linha->>'Especialidade', ''));
    v_nome_med := trim(coalesce(v_linha->>'Profissional', ''));
    v_nome_pac := trim(coalesce(v_linha->>'Paciente', ''));
    v_cpf_pac := regexp_replace(coalesce(v_linha->>'Patient Cpf', ''), '\D', '', 'g');
    v_data_nasc_raw := v_linha->>'Data de nascimento';
    v_email_pac := lower(trim(coalesce(v_linha->>'Patient Email', '')));
    v_phone_pac := regexp_replace(coalesce(v_linha->>'Patient Phone', ''), '\D', '', 'g');
    v_data_consulta_raw := v_linha->>'Data da consulta';
    v_situacao := v_linha->>'Situacao';
    IF v_situacao IS NULL THEN
      v_situacao := v_linha->>'SituaÃƒÂ§ÃƒÂ£o';
    END IF;
    v_motivo := trim(coalesce(v_linha->>'Motivo', ''));

    -- Ignorar linhas incompletas
    IF v_nome_pac = '' OR v_cpf_pac = '' OR v_data_consulta_raw IS NULL OR v_data_consulta_raw = '' THEN
      CONTINUE;
    END IF;

    -- 1. Resolver Instituicao
    IF v_nome_inst <> '' THEN
      v_instituicao_id := TEXT_generate_v5(TEXT_ns_url(), 'sms-medco:spreadsheet:institution:' || lower(v_nome_inst));
      INSERT INTO institutions (id, name, is_active)
      VALUES (v_instituicao_id, v_nome_inst, true)
      ON CONFLICT (id) DO NOTHING;
      
      IF FOUND THEN
        v_total_inst := v_total_inst + 1;
      END IF;
    ELSE
      v_instituicao_id := NULL;
    END IF;

    -- 2. Resolver Especialidade
    IF v_nome_esp <> '' THEN
      v_especialidade_id := TEXT_generate_v5(TEXT_ns_url(), 'sms-medco:spreadsheet:specialty:' || lower(v_nome_esp));
      INSERT INTO specialties (id, name, description, is_active)
      VALUES (v_especialidade_id, v_nome_esp, 'Especialidade importada da planilha corrigida', true)
      ON CONFLICT (id) DO NOTHING;
      
      IF FOUND THEN
        v_total_esp := v_total_esp + 1;
      END IF;
    ELSE
      v_especialidade_id := NULL;
    END IF;

    -- 3. Resolver Medico / Profissional
    IF v_nome_med <> '' THEN
      v_medico_user_id := TEXT_generate_v5(TEXT_ns_url(), 'sms-medco:spreadsheet:user:medico:' || lower(v_nome_med));
      v_medico_id := TEXT_generate_v5(TEXT_ns_url(), 'sms-medco:spreadsheet:doctor:' || lower(v_nome_med));
      
      SELECT d.id, d.user_id INTO v_medico_id, v_medico_user_id 
      FROM doctors d 
      JOIN profiles p ON d.user_id = p.id 
      WHERE lower(p.full_name) = lower(v_nome_med) AND d.deleted_at IS NULL
      LIMIT 1;

      IF v_medico_id IS NULL THEN
        -- Criar profissional dinamicamente se nao existir
        v_medico_user_id := TEXT_generate_v5(TEXT_ns_url(), 'sms-medco:spreadsheet:user:medico:' || lower(v_nome_med));
        v_medico_id := TEXT_generate_v5(TEXT_ns_url(), 'sms-medco:spreadsheet:doctor:' || lower(v_nome_med));
        v_email_med := 'medico.' || regexp_replace(lower(v_nome_med), '[^a-z0-9]', '', 'g') || '@sistema.local';
        v_crm_gerado := 'REG-' || upper(substring(regexp_replace(v_nome_med, '[^a-zA-Z]', '', 'g') from 1 for 3)) || '-' || upper(substring(TEXT_generate_v5(TEXT_ns_url(), v_nome_med)::text from 1 for 4));

        -- Inserir no auth.users
        INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
        VALUES (v_medico_user_id, 'authenticated', 'authenticated', v_email_med, '', now(), '{"provider":"email","providers":["email"]}'::TEXT, TEXT_build_object('full_name', v_nome_med, 'source', 'importacao_planilha'))
        ON CONFLICT (id) DO NOTHING;

        -- Inserir no users
        INSERT INTO users (id, auth_user_id, email, full_name, primary_institution_id, is_active, auth_status)
        VALUES (v_medico_user_id, v_medico_user_id, v_email_med, v_nome_med, v_instituicao_id, true, 'active')
        ON CONFLICT (id) DO NOTHING;

        -- Inserir no profiles
        INSERT INTO profiles (id, email, first_name, last_name, role, institution_id, is_active)
        VALUES (v_medico_user_id, v_email_med, split_part(v_nome_med, ' ', 1), coalesce(substring(v_nome_med from position(' ' in v_nome_med) + 1), ''), 'medico', v_instituicao_id, true)
        ON CONFLICT (id) DO NOTHING;

        -- Vincular na tabela user_roles
        SELECT id INTO v_role_id FROM roles WHERE key = 'medico' AND institution_id IS NULL LIMIT 1;
        IF v_role_id IS NOT NULL THEN
          INSERT INTO TEXTs (user_id, role_id, role, institution_id, granted_by)
          VALUES (v_medico_user_id, v_role_id, 'medico', v_instituicao_id, p_actor_id)
          ON CONFLICT DO NOTHING;
        END IF;

        -- Inserir na tabela doctors
        INSERT INTO doctors (id, user_id, professional_council, crm, specialty_id, is_active)
        VALUES (v_medico_id, v_medico_user_id, 'CRM', v_crm_gerado, v_especialidade_id, true)
        ON CONFLICT (id) DO NOTHING;

        v_total_med := v_total_med + 1;
      END IF;
    ELSE
      v_medico_id := NULL;
    END IF;

    -- 4. Resolver Paciente
    IF v_cpf_pac <> '' THEN
      v_paciente_id := TEXT_generate_v5(TEXT_ns_url(), 'sms-medco:spreadsheet:patient:' || v_cpf_pac);
      
      SELECT id INTO v_paciente_id FROM patients WHERE cpf = v_cpf_pac AND deleted_at IS NULL LIMIT 1;

      IF v_paciente_id IS NULL THEN
        v_paciente_id := TEXT_generate_v5(TEXT_ns_url(), 'sms-medco:spreadsheet:patient:' || v_cpf_pac);
        v_codigo_paciente := 'PAC-' || substring(v_cpf_pac from 1 for 3) || '-' || upper(substring(TEXT_generate_v5(TEXT_ns_url(), v_cpf_pac)::text from 1 for 4));
        
        BEGIN
          v_data_nasc := v_data_nasc_raw::date;
        EXCEPTION WHEN OTHERS THEN
          v_data_nasc := '1980-01-01'::date;
        END;

        INSERT INTO patients (id, patient_code, institution_id, full_name, email, phone, cpf, birth_date, is_active, created_by)
        VALUES (v_paciente_id, v_codigo_paciente, v_instituicao_id, v_nome_pac, NULLIF(v_email_pac, ''), NULLIF(v_phone_pac, ''), v_cpf_pac, v_data_nasc, true, p_actor_id)
        ON CONFLICT (id) DO NOTHING;

        v_total_pac := v_total_pac + 1;
      END IF;
    ELSE
      v_paciente_id := NULL;
    END IF;

    -- 5. Cadastrar Agendamento
    BEGIN
      v_data_consulta := v_data_consulta_raw::DATETIME;
    EXCEPTION WHEN OTHERS THEN
      CONTINUE; -- Data invalida, pula
    END;
    
    v_data_fim := v_data_consulta + interval '30 minutes';
    
    -- Mapear Situacao
    IF v_situacao ilike '%agend%' THEN v_status_mapeado := 'agendado';
    ELSIF v_situacao ilike '%confirm%' THEN v_status_mapeado := 'confirmado';
    ELSIF v_situacao ilike '%atend%' OR v_situacao ilike '%andamento%' THEN v_status_mapeado := 'em_atendimento';
    ELSIF v_situacao ilike '%concl%' OR v_situacao ilike '%finaliz%' THEN v_status_mapeado := 'concluido';
    ELSIF v_situacao ilike '%cancel%' THEN v_status_mapeado := 'cancelado';
    ELSIF v_situacao ilike '%compareceu%' OR v_situacao ilike '%falta%' OR v_situacao ilike '%faltou%' THEN v_status_mapeado := 'nao_compareceu';
    ELSIF v_situacao ilike '%reagend%' THEN v_status_mapeado := 'reagendado';
    ELSE v_status_mapeado := 'agendado';
    END IF;

    v_agendamento_id := TEXT_generate_v5(TEXT_ns_url(), 'sms-medco:spreadsheet:appointment:' || v_cpf_pac || '_' || v_data_consulta_raw);
    v_codigo_agend := 'APT-' || upper(substring(TEXT_generate_v5(TEXT_ns_url(), v_cpf_pac || '_' || v_data_consulta_raw)::text from 1 for 6));
    v_numero_ticket := 'TKT-' || upper(substring(TEXT_generate_v5(TEXT_ns_url(), v_cpf_pac || '_' || v_data_consulta_raw)::text from 7 for 6));

    INSERT INTO appointments (
      id, appointment_code, institution_id, patient_id, doctor_id, specialty_id,
      appointment_date, end_date, type, status, reason, ticket_number, created_by, updated_by
    )
    VALUES (
      v_agendamento_id, v_codigo_agend, v_instituicao_id, v_paciente_id, v_medico_id, v_especialidade_id,
      v_data_consulta, v_data_fim, 'consulta', v_status_mapeado, NULLIF(v_motivo, ''), v_numero_ticket, p_actor_id, p_actor_id
    )
    ON CONFLICT (id) DO NOTHING;

    IF FOUND THEN
      v_total_agend := v_total_agend + 1;

      -- 6. Atendimentos clinicos
      IF v_status_mapeado = 'concluido' THEN
        v_encounter_id := TEXT_generate_v5(TEXT_ns_url(), 'sms-medco:spreadsheet:encounter:' || v_cpf_pac || '_' || v_data_consulta_raw);
        
        INSERT INTO encounters (id, institution_id, appointment_id, patient_id, doctor_id, status, started_at, finalized_at, started_by, finalized_by)
        VALUES (v_encounter_id, v_instituicao_id, v_agendamento_id, v_paciente_id, v_medico_id, 'finalizado', v_data_consulta, v_data_fim, v_medico_user_id, v_medico_user_id)
        ON CONFLICT (id) DO NOTHING;

        IF FOUND THEN
          v_total_encount := v_total_encount + 1;

          -- Prontuario Anamnese
          v_dados_clinicos_anamnese := TEXT_build_object('queixa', coalesce(v_motivo, 'Importacao de historico corrigido.'), 'origem', 'importacao_planilha_corrigida');
          v_hash_anamnese := encode(digest(v_dados_clinicos_anamnese::text, 'sha256'), 'hex');
          
          INSERT INTO medical_record_entries (id, institution_id, encounter_id, version, entry_type, clinical_data, content_hash, created_by, created_at)
          VALUES (TEXT_generate_v5(TEXT_ns_url(), 'sms-medco:spreadsheet:record:anamnese:' || v_cpf_pac || '_' || v_data_consulta_raw), v_instituicao_id, v_encounter_id, 1, 'anamnese', v_dados_clinicos_anamnese, v_hash_anamnese, v_medico_user_id, v_data_consulta)
          ON CONFLICT DO NOTHING;

          -- Prontuario Finalizacao
          v_dados_clinicos_finalizacao := TEXT_build_object('conduta', 'Consulta de historico finalizada com sucesso.', 'origem', 'importacao_planilha_corrigida');
          v_hash_finalizacao := encode(digest(v_dados_clinicos_finalizacao::text, 'sha256'), 'hex');

          INSERT INTO medical_record_entries (id, institution_id, encounter_id, version, entry_type, clinical_data, content_hash, created_by, created_at)
          VALUES (TEXT_generate_v5(TEXT_ns_url(), 'sms-medco:spreadsheet:record:finalizacao:' || v_cpf_pac || '_' || v_data_consulta_raw), v_instituicao_id, v_encounter_id, 2, 'finalizacao', v_dados_clinicos_finalizacao, v_hash_finalizacao, v_medico_user_id, v_data_fim)
          ON CONFLICT DO NOTHING;
        END IF;

        UPDATE appointments 
        SET actual_start_at = v_data_consulta, 
            actual_end_at = v_data_fim 
        WHERE id = v_agendamento_id;

      ELSIF v_status_mapeado = 'em_atendimento' THEN
        v_encounter_id := TEXT_generate_v5(TEXT_ns_url(), 'sms-medco:spreadsheet:encounter:' || v_cpf_pac || '_' || v_data_consulta_raw);
        
        INSERT INTO encounters (id, institution_id, appointment_id, patient_id, doctor_id, status, started_at, started_by)
        VALUES (v_encounter_id, v_instituicao_id, v_agendamento_id, v_paciente_id, v_medico_id, 'em_atendimento', v_data_consulta, v_medico_user_id)
        ON CONFLICT (id) DO NOTHING;

        IF FOUND THEN
          v_total_encount := v_total_encount + 1;
        END IF;

        UPDATE appointments 
        SET actual_start_at = v_data_consulta 
        WHERE id = v_agendamento_id;
      END IF;
    END IF;
  END LOOP;

  -- Reativar triggers de usuario
  FOREACH v_tabela IN ARRAY v_tabelas LOOP
    IF to_regclass(v_tabela) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %s ENABLE TRIGGER USER', to_regclass(v_tabela));
    END IF;
  END LOOP;

  RETURN TEXT_build_object(
    'success', true,
    'institutions_created', v_total_inst,
    'specialties_created', v_total_esp,
    'doctors_created', v_total_med,
    'patients_created', v_total_pac,
    'appointments_created', v_total_agend,
    'encounters_created', v_total_encount
  );

EXCEPTION WHEN OTHERS THEN
  -- Em caso de erro, reativa os triggers e relanca o erro (o que causa o ROLLBACK automatico do PostgreSQL)
  FOREACH v_tabela IN ARRAY v_tabelas LOOP
    BEGIN
      IF to_regclass(v_tabela) IS NOT NULL THEN
        EXECUTE format('ALTER TABLE %s ENABLE TRIGGER USER', to_regclass(v_tabela));
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;
  RAISE;
END;
$$;

-- ============================================================
-- GRANT de tabelas para o role authenticated
-- CONTEXTO: RLS e GRANT sÃƒÂ£o camadas independentes no PostgreSQL.
-- Sem GRANT, a tabela retorna 403 antes da RLS ser avaliada.
-- ============================================================

-- Identidade / acesso

-- Cadastro institucional

-- ClÃƒÂ­nico

-- Auxiliares / sistema

-- ============================================================
-- FUNÃƒâ€¡ÃƒÆ’O: get_database_size_stats
-- Retorna estatÃƒÂ­sticas de uso do banco para o painel do superadmin.
-- Corrige: POST /rest/v1/rpc/get_database_size_stats Ã¢â€ â€™ 404
-- ============================================================

CREATE OR REPLACE FUNCTION get_database_size_stats()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_bytes   INTEGER;
  v_limit_bytes     INTEGER := 524288000; -- 500 MB (plano free Supabase)
  v_top_tables      TEXT;
BEGIN
  SELECT pg_database_size(current_database()) INTO v_current_bytes;

  SELECT TEXT_agg(
    TEXT_build_object(
      'table_name', relname,
      'size_bytes', pg_total_relation_size(oid),
      'size_pretty', pg_size_pretty(pg_total_relation_size(oid))
    )
    ORDER BY pg_total_relation_size(oid) DESC
  )
  INTO v_top_tables
  FROM pg_class
  WHERE relkind = 'r'
    AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  LIMIT 10;

  RETURN TEXT_build_object(
    'current_size_bytes',  v_current_bytes,
    'current_size_pretty', pg_size_pretty(v_current_bytes),
    'limit_bytes',         v_limit_bytes,
    'limit_pretty',        pg_size_pretty(v_limit_bytes),
    'free_bytes',          GREATEST(0, v_limit_bytes - v_current_bytes),
    'free_pretty',         pg_size_pretty(GREATEST(0, v_limit_bytes - v_current_bytes)),
    'usage_percentage',    ROUND((v_current_bytes::REAL / v_limit_bytes) * 100, 1),
    'top_tables',          COALESCE(v_top_tables, '[]'::TEXT)
  );
END;
$$;

-- ============================================================
-- FUNÃƒâ€¡ÃƒÆ’O: get_appointments_date_range
-- Retorna MIN/MAX de appointment_date para o filtro "Tudo".
-- SECURITY DEFINER evita acesso direto ÃƒÂ  tabela via .from().
-- ============================================================

CREATE OR REPLACE FUNCTION get_appointments_date_range()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_first_date DATETIME;
  v_last_date  DATETIME;
BEGIN
  PERFORM assert_authenticated();

  SELECT MIN(appointment_date), MAX(appointment_date)
  INTO v_first_date, v_last_date
  FROM appointments
  WHERE deleted_at IS NULL;

  RETURN TEXT_build_object(
    'first_date', v_first_date,
    'last_date',  v_last_date
  );
END;
$$;

CREATE OR REPLACE FUNCTION sync_user_institutions(
    p_user_id TEXT,
    p_institution_ids TEXT,
    p_role_key text DEFAULT NULL,
    p_idempotency_key text DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function
DECLARE
    v_actor TEXT;
    v_existing TEXT;
    v_current_ids TEXT;
    v_added TEXT;
    v_removed TEXT;
BEGIN
    v_actor := assert_authenticated();
    IF p_role_key = 'medico' THEN p_institution_ids := '{}'::TEXT; END IF;
    
    -- Se precisar, adicione idempotency
    v_existing := find_idempotent_response('sync_user_institutions', p_idempotency_key);
    IF v_existing IS NOT NULL THEN
        RETURN v_existing;
    END IF;

    -- Descobre vinculos atuais
    SELECT array_agg(institution_id) INTO v_current_ids
    FROM user_institutions
    WHERE user_id = p_user_id AND 
    
    IF v_current_ids IS NULL THEN
        v_current_ids := '{}'::TEXT;
    END IF;
    
    -- Para cada ID na lista atual que n�o est� na nova, remove
    v_removed := ARRAY(SELECT unnest(v_current_ids) EXCEPT SELECT unnest(p_institution_ids));
    IF array_length(v_removed, 1) > 0 THEN
        UPDATE user_institutions
        SET revoked_at = now()
        WHERE user_id = p_user_id AND institution_id = ANY(v_removed) AND 
    END IF;

    -- Para cada ID na nova lista que n�o est� na atual, adiciona
    v_added := ARRAY(SELECT unnest(p_institution_ids) EXCEPT SELECT unnest(v_current_ids));
    IF array_length(v_added, 1) > 0 THEN
        INSERT INTO user_institutions (user_id, institution_id)
        SELECT p_user_id, unnest(v_added)
        ON CONFLICT (user_id, institution_id) DO UPDATE SET 
    END IF;

    RETURN remember_idempotent_response('sync_user_institutions', p_idempotency_key, p_user_id, TEXT_build_object('success', true));
END;
$function;

