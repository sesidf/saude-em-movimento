import { Hono } from 'hono';
import { DatabaseClient } from '../lib/db';
import { authMiddleware, requireRole } from '../middleware/auth';
import { Env, UserSession } from '../types';

export const doctorRoutes = new Hono<{ Bindings: Env; Variables: { user: UserSession; db: DatabaseClient } }>();

doctorRoutes.use('*', authMiddleware);

// GET /api/doctors
doctorRoutes.get('/', async (c) => {
  const db = c.get('db');
  const specialtyId = c.req.query('specialty_id');
  const showAll = c.req.query('all') === 'true';

  let sql = `
    SELECT d.id, d.user_id, d.professional_council, d.crm, d.specialty_id, d.is_active,
           COALESCE(u.full_name, p.full_name, 'Profissional') as name,
           COALESCE(u.email, p.email, '') as email,
           COALESCE(u.phone, p.phone, '') as phone,
           s.name as specialty_name, s.color as specialty_color
    FROM doctors d
    LEFT JOIN users u ON u.id = d.user_id
    LEFT JOIN profiles p ON p.id = d.user_id
    LEFT JOIN specialties s ON s.id = d.specialty_id
    WHERE d.deleted_at IS NULL
  `;

  const params: any[] = [];

  if (!showAll) {
    sql += ` AND d.is_active = 1`;
  }

  if (specialtyId) {
    sql += ` AND d.specialty_id = ?`;
    params.push(specialtyId);
  }

  sql += ` ORDER BY name ASC`;

  const doctors = await db.query(sql, params);
  return c.json({ success: true, data: doctors });
});

// GET /api/doctors/:id
doctorRoutes.get('/:id', async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');

  const doctor = await db.first(
    `SELECT d.id, d.user_id, d.professional_council, d.crm, d.specialty_id, d.is_active,
            COALESCE(u.full_name, p.full_name, 'Profissional') as name,
            COALESCE(u.email, p.email, '') as email,
            COALESCE(u.phone, p.phone, '') as phone,
            s.name as specialty_name
     FROM doctors d
     LEFT JOIN users u ON u.id = d.user_id
     LEFT JOIN profiles p ON p.id = d.user_id
     LEFT JOIN specialties s ON s.id = d.specialty_id
     WHERE d.id = ? AND d.deleted_at IS NULL`,
    [id]
  );

  if (!doctor) {
    return c.json({ success: false, error: 'Profissional não encontrado.' }, 404);
  }

  return c.json({ success: true, data: doctor });
});

// POST /api/doctors (Admin only)
doctorRoutes.post('/', requireRole(['admin', 'root']), async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const { name, email, phone, crm, professional_council, specialty_id } = body;

  if (!name || !name.trim()) {
    return c.json({ success: false, error: 'O nome do profissional é obrigatório.' }, 400);
  }
  if (!crm || !crm.trim()) {
    return c.json({ success: false, error: 'O registro no conselho/CRM é obrigatório.' }, 400);
  }

  const userId = crypto.randomUUID();
  const doctorId = crypto.randomUUID();

  // Cria profile/user para o profissional
  await db.run(
    `INSERT INTO profiles (id, email, first_name, last_name, phone, is_active, created_at, updated_at)
     VALUES (?, ?, ?, '', ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [userId, email?.trim() || `${doctorId}@medco.local`, name.trim(), phone?.trim() || null]
  );

  // Cria registro na tabela doctors
  await db.run(
    `INSERT INTO doctors (id, user_id, professional_council, crm, specialty_id, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [doctorId, userId, professional_council || 'CRM', crm.trim(), specialty_id || null]
  );

  await db.logAudit({
    userId: user.id,
    action: 'doctor:create',
    resource: 'doctors',
    resourceId: doctorId,
    details: { name, crm, specialty_id },
  });

  return c.json({ success: true, data: { id: doctorId }, message: 'Profissional cadastrado com sucesso.' }, 201);
});

// PUT /api/doctors/:id (Admin only)
doctorRoutes.put('/:id', requireRole(['admin', 'root']), async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const { name, email, phone, crm, professional_council, specialty_id, is_active } = body;

  const doctor = await db.first<any>(`SELECT user_id FROM doctors WHERE id = ? AND deleted_at IS NULL`, [id]);
  if (!doctor) {
    return c.json({ success: false, error: 'Profissional não encontrado.' }, 404);
  }

  if (name) {
    await db.run(
      `UPDATE profiles SET first_name = ?, email = COALESCE(?, email), phone = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [name.trim(), email?.trim() || null, phone?.trim() || null, doctor.user_id]
    );
  }

  await db.run(
    `UPDATE doctors
     SET professional_council = ?, crm = ?, specialty_id = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [professional_council || 'CRM', crm?.trim() || '', specialty_id || null, is_active !== undefined ? (is_active ? 1 : 0) : 1, id]
  );

  await db.logAudit({
    userId: user.id,
    action: 'doctor:update',
    resource: 'doctors',
    resourceId: id,
    details: { name, crm, specialty_id },
  });

  return c.json({ success: true, message: 'Profissional atualizado com sucesso.' });
});

// DELETE /api/doctors/:id
doctorRoutes.delete('/:id', requireRole(['admin', 'root']), async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const id = c.req.param('id');

  await db.run(
    `UPDATE doctors SET deleted_at = CURRENT_TIMESTAMP, deleted_by = ?, is_active = 0 WHERE id = ?`,
    [user.id, id]
  );

  await db.logAudit({
    userId: user.id,
    action: 'doctor:delete',
    resource: 'doctors',
    resourceId: id,
  });

  return c.json({ success: true, message: 'Profissional removido com sucesso.' });
});
