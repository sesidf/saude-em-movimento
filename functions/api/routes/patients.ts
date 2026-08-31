import { Hono } from 'hono';
import { DatabaseClient } from '../lib/db';
import { authMiddleware } from '../middleware/auth';
import { Env, UserSession } from '../types';

export const patientRoutes = new Hono<{ Bindings: Env; Variables: { user: UserSession; db: DatabaseClient } }>();

patientRoutes.use('*', authMiddleware);

// GET /api/patients
patientRoutes.get('/', async (c) => {
  const db = c.get('db');
  const search = c.req.query('search') || '';
  const institutionId = c.req.query('institution_id');
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 100);
  const offset = parseInt(c.req.query('offset') || '0', 10);

  let sql = `
    SELECT p.id, p.patient_code, p.institution_id, p.full_name, p.phone, p.cpf, p.birth_date,
           p.is_active, p.created_at, p.updated_at,
           i.name as institution_name
    FROM patients p
    LEFT JOIN institutions i ON i.id = p.institution_id
    WHERE p.deleted_at IS NULL
  `;
  const params: any[] = [];

  if (institutionId) {
    sql += ` AND (p.institution_id = ? OR p.institution_id IS NULL)`;
    params.push(institutionId);
  }

  if (search.trim()) {
    const cleanSearch = search.trim();
    const cleanDigits = cleanSearch.replace(/\D/g, '');
    sql += ` AND (
      LOWER(p.full_name) LIKE ? OR
      p.cpf LIKE ? OR
      p.patient_code LIKE ? OR
      p.phone LIKE ?
    )`;
    params.push(
      `%${cleanSearch.toLowerCase()}%`,
      `%${cleanDigits || cleanSearch}%`,
      `%${cleanSearch}%`,
      `%${cleanDigits || cleanSearch}%`
    );
  }

  sql += ` ORDER BY p.full_name ASC LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  const patients = await db.query(sql, params);
  return c.json({ success: true, data: patients });
});

// GET /api/patients/:id
patientRoutes.get('/:id', async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');

  const patient = await db.first(
    `SELECT p.*, i.name as institution_name
     FROM patients p
     LEFT JOIN institutions i ON i.id = p.institution_id
     WHERE p.id = ? AND p.deleted_at IS NULL`,
    [id]
  );

  if (!patient) {
    return c.json({ success: false, error: 'Paciente não encontrado.' }, 404);
  }

  return c.json({ success: true, data: patient });
});

// GET /api/patients/:id/history
patientRoutes.get('/:id/history', async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');

  const appointments = await db.query(
    `SELECT a.id, a.appointment_code, a.appointment_date, a.status, a.reason,
            a.diagnosis, a.prescription, a.blood_pressure, a.weight, a.height, a.temperature,
            s.name as specialty_name,
            COALESCE(u.full_name, p.full_name, 'Profissional') as doctor_name
     FROM appointments a
     LEFT JOIN doctors d ON d.id = a.doctor_id
     LEFT JOIN users u ON u.id = d.user_id
     LEFT JOIN profiles p ON p.id = d.user_id
     LEFT JOIN specialties s ON s.id = a.specialty_id
     WHERE a.patient_id = ? AND a.deleted_at IS NULL
     ORDER BY a.appointment_date DESC
     LIMIT 50`,
    [id]
  );

  return c.json({ success: true, data: appointments });
});

// POST /api/patients
patientRoutes.post('/', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const { full_name, cpf, phone, birth_date, institution_id } = body;

  if (!full_name || !full_name.trim()) {
    return c.json({ success: false, error: 'O nome completo do paciente é obrigatório.' }, 400);
  }
  if (!cpf || !cpf.trim()) {
    return c.json({ success: false, error: 'O CPF do paciente é obrigatório.' }, 400);
  }
  if (!birth_date) {
    return c.json({ success: false, error: 'A data de nascimento é obrigatória.' }, 400);
  }

  const cleanCpf = cpf.replace(/\D/g, '');

  // Checa duplicidade de CPF
  const existing = await db.first<any>(
    `SELECT id, full_name FROM patients WHERE REPLACE(REPLACE(cpf, '.', ''), '-', '') = ? AND deleted_at IS NULL`,
    [cleanCpf]
  );

  if (existing) {
    return c.json({ success: false, error: `Já existe um paciente cadastrado com este CPF (${existing.full_name}).` }, 400);
  }

  const id = crypto.randomUUID();
  const patientCode = `PAC-${Math.floor(100000 + Math.random() * 900000)}`;

  await db.run(
    `INSERT INTO patients (
      id, patient_code, institution_id, full_name, phone, cpf, birth_date, is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [
      id,
      patientCode,
      institution_id || user.institutionId || null,
      full_name.trim(),
      phone?.trim() || null,
      cleanCpf,
      birth_date,
    ]
  );

  await db.logAudit({
    userId: user.id,
    action: 'patient:create',
    resource: 'patients',
    resourceId: id,
    institutionId: institution_id || user.institutionId || null,
    details: { full_name, cpf: cleanCpf },
  });

  return c.json({ success: true, data: { id, patient_code: patientCode }, message: 'Paciente cadastrado com sucesso.' }, 201);
});

// PUT /api/patients/:id
patientRoutes.put('/:id', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const { full_name, cpf, phone, birth_date, institution_id, is_active } = body;

  if (!full_name || !full_name.trim()) {
    return c.json({ success: false, error: 'O nome completo do paciente é obrigatório.' }, 400);
  }

  const cleanCpf = cpf ? cpf.replace(/\D/g, '') : null;

  await db.run(
    `UPDATE patients
     SET full_name = ?, cpf = COALESCE(?, cpf), phone = ?, birth_date = COALESCE(?, birth_date),
         institution_id = COALESCE(?, institution_id), is_active = COALESCE(?, is_active), updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND deleted_at IS NULL`,
    [
      full_name.trim(),
      cleanCpf,
      phone?.trim() || null,
      birth_date || null,
      institution_id || null,
      is_active !== undefined ? (is_active ? 1 : 0) : null,
      id,
    ]
  );

  await db.logAudit({
    userId: user.id,
    action: 'patient:update',
    resource: 'patients',
    resourceId: id,
    institutionId: institution_id || user.institutionId || null,
  });

  return c.json({ success: true, message: 'Paciente atualizado com sucesso.' });
});

// DELETE /api/patients/:id
patientRoutes.delete('/:id', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const id = c.req.param('id');

  await db.run(
    `UPDATE patients SET deleted_at = CURRENT_TIMESTAMP, deleted_by = ?, is_active = 0 WHERE id = ?`,
    [user.id, id]
  );

  await db.logAudit({
    userId: user.id,
    action: 'patient:delete',
    resource: 'patients',
    resourceId: id,
  });

  return c.json({ success: true, message: 'Paciente removido com sucesso.' });
});
