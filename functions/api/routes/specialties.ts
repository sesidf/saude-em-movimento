import { Hono } from 'hono';
import { DatabaseClient } from '../lib/db';
import { authMiddleware, requireRole } from '../middleware/auth';
import { Env, UserSession } from '../types';

export const specialtyRoutes = new Hono<{ Bindings: Env; Variables: { user: UserSession; db: DatabaseClient } }>();

specialtyRoutes.use('*', authMiddleware);

// GET /api/specialties
specialtyRoutes.get('/', async (c) => {
  const db = c.get('db');
  const showAll = c.req.query('all') === 'true';

  let sql = `SELECT id, name, description, icon, color, is_active, created_at, updated_at
             FROM specialties
             WHERE deleted_at IS NULL`;

  if (!showAll) {
    sql += ` AND is_active = 1`;
  }

  sql += ` ORDER BY name ASC`;

  const list = await db.query(sql);
  return c.json({ success: true, data: list });
});

// POST /api/specialties (Admin only)
specialtyRoutes.post('/', requireRole(['admin', 'root']), async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const { name, description, icon, color } = body;

  if (!name || !name.trim()) {
    return c.json({ success: false, error: 'O nome da especialidade é obrigatório.' }, 400);
  }

  // Verifica unicidade do nome
  const existing = await db.first(
    `SELECT id FROM specialties WHERE LOWER(name) = ? AND deleted_at IS NULL`,
    [name.trim().toLowerCase()]
  );
  if (existing) {
    return c.json({ success: false, error: 'Já existe uma especialidade com este nome.' }, 400);
  }

  const id = crypto.randomUUID();
  await db.run(
    `INSERT INTO specialties (id, name, description, icon, color, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [id, name.trim(), description?.trim() || null, icon || null, color || null]
  );

  await db.logAudit({
    userId: user.id,
    action: 'specialty:create',
    resource: 'specialties',
    resourceId: id,
    details: { name },
  });

  return c.json({ success: true, data: { id }, message: 'Especialidade criada com sucesso.' }, 201);
});

// PUT /api/specialties/:id (Admin only)
specialtyRoutes.put('/:id', requireRole(['admin', 'root']), async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const { name, description, icon, color, is_active } = body;

  if (!name || !name.trim()) {
    return c.json({ success: false, error: 'O nome da especialidade é obrigatório.' }, 400);
  }

  await db.run(
    `UPDATE specialties
     SET name = ?, description = ?, icon = ?, color = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND deleted_at IS NULL`,
    [name.trim(), description?.trim() || null, icon || null, color || null, is_active !== undefined ? (is_active ? 1 : 0) : 1, id]
  );

  await db.logAudit({
    userId: user.id,
    action: 'specialty:update',
    resource: 'specialties',
    resourceId: id,
    details: { name },
  });

  return c.json({ success: true, message: 'Especialidade atualizada com sucesso.' });
});

// DELETE /api/specialties/:id (Soft delete)
specialtyRoutes.delete('/:id', requireRole(['admin', 'root']), async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const id = c.req.param('id');

  await db.run(
    `UPDATE specialties
     SET deleted_at = CURRENT_TIMESTAMP, deleted_by = ?, is_active = 0
     WHERE id = ?`,
    [user.id, id]
  );

  await db.logAudit({
    userId: user.id,
    action: 'specialty:delete',
    resource: 'specialties',
    resourceId: id,
  });

  return c.json({ success: true, message: 'Especialidade removida com sucesso.' });
});
