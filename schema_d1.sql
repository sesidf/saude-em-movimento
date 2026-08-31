CREATE TABLE IF NOT EXISTS institutions (
  id TEXT PRIMARY KEY ,
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
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY ,
  auth_user_id TEXT UNIQUE,
  email text NOT NULL UNIQUE,
  full_name text NOT NULL,
  phone text,
  primary_institution_id TEXT REFERENCES institutions(id) ON DELETE SET NULL,
  is_active INTEGER NOT NULL DEFAULT true,
  auth_status text NOT NULL DEFAULT 'pending_auth' CHECK (auth_status IN ('pending_auth', 'active', 'disabled')),
  password_hash text,
  metadata TEXT NOT NULL DEFAULT '{}',
  deleted_at DATETIME,
  deleted_by TEXT,
  created_by TEXT,
  updated_by TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  email text NOT NULL,
  first_name text NOT NULL,
  last_name text NOT NULL DEFAULT '',
  full_name text GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED,
  role TEXT,
  phone text,
  cpf text UNIQUE,
  avatar_url text,
  institution_id TEXT REFERENCES institutions(id) ON DELETE SET NULL,
  is_active INTEGER NOT NULL DEFAULT true,
  preferences TEXT NOT NULL DEFAULT '{}',
  deleted_at DATETIME,
  deleted_by TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY ,
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
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS permissions (
  id TEXT PRIMARY KEY ,
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
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS role_permissions (
  id TEXT DEFAULT (lower(hex(randomblob(16)))),
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id TEXT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  institution_id TEXT REFERENCES institutions(id) ON DELETE CASCADE,
  granted_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  granted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
  granted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at DATETIME,
  revoked_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS user_roles (
  id TEXT PRIMARY KEY ,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id TEXT REFERENCES roles(id) ON DELETE RESTRICT,
  role TEXT,
  institution_id TEXT REFERENCES institutions(id) ON DELETE CASCADE,
  granted_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  granted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at DATETIME,
  revoked_by TEXT REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS user_institutions (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  revoked_at DATETIME,
  revoked_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (user_id, institution_id)
);

CREATE TABLE IF NOT EXISTS specialties (
  id TEXT PRIMARY KEY ,
  name text NOT NULL UNIQUE,
  description text,
  icon text,
  color text,
  is_active INTEGER NOT NULL DEFAULT true,
  deleted_at DATETIME,
  deleted_by TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS doctors (
  id TEXT PRIMARY KEY ,
  user_id TEXT NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  professional_council text NOT NULL DEFAULT 'CRM',
  crm text NOT NULL,
  specialty_id TEXT REFERENCES specialties(id) ON DELETE SET NULL,
  is_active INTEGER NOT NULL DEFAULT true,
  deleted_at DATETIME,
  deleted_by TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS doctor_availability (
  id TEXT PRIMARY KEY ,
  doctor_id TEXT NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  weekday integer NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  slot_minutes integer NOT NULL DEFAULT 5 CHECK (slot_minutes > 0 AND slot_minutes <= 480),
  is_active INTEGER NOT NULL DEFAULT true,
  deleted_at DATETIME,
  deleted_by TEXT,
  created_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (ends_at > starts_at)
);

CREATE TABLE IF NOT EXISTS schedule_blocks (
  id TEXT PRIMARY KEY,
  doctor_id TEXT REFERENCES doctors(id) ON DELETE CASCADE,
  starts_at DATETIME NOT NULL,
  ends_at DATETIME NOT NULL,
  reason text NOT NULL,
  deleted_at DATETIME,
  deleted_by TEXT,
  created_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS patients (
  id TEXT PRIMARY KEY ,
  patient_code text UNIQUE,
  user_id TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  institution_id TEXT REFERENCES institutions(id) ON DELETE RESTRICT,
  full_name text NOT NULL,
  phone text,
  cpf text NOT NULL,
  birth_date date NOT NULL,

  is_active INTEGER NOT NULL DEFAULT true,
  deleted_at DATETIME,
  deleted_by TEXT,
  created_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY ,
  appointment_code text UNIQUE,
  institution_id TEXT REFERENCES institutions(id) ON DELETE RESTRICT,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  doctor_id TEXT NOT NULL REFERENCES doctors(id) ON DELETE RESTRICT,
  scheduled_doctor_id TEXT REFERENCES doctors(id) ON DELETE RESTRICT,
  specialty_id TEXT REFERENCES specialties(id) ON DELETE RESTRICT,
  appointment_date DATETIME NOT NULL,
  end_date DATETIME NOT NULL,
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
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS encounters (
  id TEXT PRIMARY KEY ,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  appointment_id TEXT NOT NULL UNIQUE REFERENCES appointments(id) ON DELETE RESTRICT,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  doctor_id TEXT NOT NULL REFERENCES doctors(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'em_atendimento',
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finalized_at DATETIME,
  canceled_at DATETIME,
  started_by TEXT NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  finalized_by TEXT REFERENCES profiles(id) ON DELETE RESTRICT,
  canceled_by TEXT REFERENCES profiles(id) ON DELETE RESTRICT,
  idempotency_key text,
  deleted_at DATETIME,
  deleted_by TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS medical_record_entries (
  id TEXT PRIMARY KEY ,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  encounter_id TEXT NOT NULL REFERENCES encounters(id) ON DELETE RESTRICT,
  version integer NOT NULL,
  entry_type TEXT NOT NULL,
  clinical_data TEXT NOT NULL DEFAULT '{}',
  content_hash text NOT NULL,
  idempotency_key text,
  created_by TEXT NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (encounter_id, version),
  UNIQUE (encounter_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS clinical_events (
  id TEXT PRIMARY KEY ,
  institution_id TEXT REFERENCES institutions(id) ON DELETE CASCADE,
  aggregate_table text NOT NULL,
  aggregate_id TEXT NOT NULL,
  event_type text NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  idempotency_key text,
  created_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (institution_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY ,
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
  txid INTEGER,
  request_id text ,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  action TEXT NOT NULL,
  resource TEXT,
  resource_id TEXT,
  details TEXT,
  institution_id TEXT,
  ip_address TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS system_config (
  id TEXT PRIMARY KEY ,
  institution_id TEXT REFERENCES institutions(id) ON DELETE CASCADE,
  config_key text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  value TEXT NOT NULL DEFAULT '{}',
  description text,
  is_public INTEGER NOT NULL DEFAULT false,
  is_secret INTEGER NOT NULL DEFAULT false,
  is_active INTEGER NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  deleted_at DATETIME,
  deleted_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS report_snapshots (
  id TEXT PRIMARY KEY ,
  report_code text UNIQUE,
  institution_id TEXT REFERENCES institutions(id) ON DELETE CASCADE,
  report_type text NOT NULL,
  title text NOT NULL,
  filter_payload TEXT NOT NULL DEFAULT '{}',
  snapshot TEXT NOT NULL DEFAULT '{}',
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
  generated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS system_events (
  id TEXT PRIMARY KEY ,
  institution_id TEXT REFERENCES institutions(id) ON DELETE SET NULL,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  user_role text,
  correlation_id text,
  ip_address TEXT,
  user_agent text,
  module text NOT NULL,
  action text NOT NULL,
  event_type text NOT NULL DEFAULT 'system',
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'error', 'critical')),
  description text NOT NULL,
  before_data TEXT,
  after_data TEXT,
  payload TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT,
  type TEXT NOT NULL DEFAULT 'info' CHECK (type IN ('info', 'warning', 'error', 'success')),
  is_read INTEGER NOT NULL DEFAULT 0,
  link TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
