import { Hono } from 'hono';
import { DatabaseClient } from '../lib/db';
import { authMiddleware } from '../middleware/auth';
import { Env, UserSession } from '../types';

export const scheduleRoutes = new Hono<{ Bindings: Env; Variables: { user: UserSession; db: DatabaseClient } }>();

scheduleRoutes.use('*', authMiddleware);

// GET /api/schedules/availability
scheduleRoutes.get('/availability', async (c) => {
  const db = c.get('db');
  const doctorId = c.req.query('doctor_id');

  let sql = `
    SELECT da.id, da.doctor_id, da.weekday, da.starts_at, da.ends_at, da.slot_minutes, da.is_active,
           COALESCE(u.full_name, p.full_name, 'Profissional') as doctor_name,
           s.name as specialty_name
    FROM doctor_availability da
    JOIN doctors d ON d.id = da.doctor_id
    LEFT JOIN users u ON u.id = d.user_id
    LEFT JOIN profiles p ON p.id = d.user_id
    LEFT JOIN specialties s ON s.id = d.specialty_id
    WHERE da.deleted_at IS NULL
  `;
  const params: any[] = [];

  if (doctorId) {
    sql += ` AND da.doctor_id = ?`;
    params.push(doctorId);
  }

  sql += ` ORDER BY da.weekday ASC, da.starts_at ASC`;

  const availabilities = await db.query(sql, params);
  return c.json({ success: true, data: availabilities });
});

// POST /api/schedules/availability
scheduleRoutes.post('/availability', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const { doctor_id, weekday, starts_at, ends_at, slot_minutes } = body;

  if (!doctor_id || weekday === undefined || !starts_at || !ends_at) {
    return c.json({ success: false, error: 'Médico, dia da semana e horários são obrigatórios.' }, 400);
  }

  const id = crypto.randomUUID();
  await db.run(
    `INSERT INTO doctor_availability (
      id, doctor_id, weekday, starts_at, ends_at, slot_minutes, is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [id, doctor_id, parseInt(weekday, 10), starts_at, ends_at, parseInt(slot_minutes || '15', 10)]
  );

  await db.logAudit({
    userId: user.id,
    action: 'schedule:create_availability',
    resource: 'doctor_availability',
    resourceId: id,
    details: { doctor_id, weekday, starts_at, ends_at },
  });

  return c.json({ success: true, data: { id }, message: 'Disponibilidade cadastrada com sucesso.' }, 201);
});

// DELETE /api/schedules/availability/:id
scheduleRoutes.delete('/availability/:id', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const id = c.req.param('id');

  await db.run(
    `UPDATE doctor_availability SET deleted_at = CURRENT_TIMESTAMP, deleted_by = ?, is_active = 0 WHERE id = ?`,
    [user.id, id]
  );

  return c.json({ success: true, message: 'Horário removido com sucesso.' });
});
