import { Hono } from 'hono';
import { DatabaseClient } from '../lib/db';
import { authMiddleware, requireRole } from '../middleware/auth';
import { Env, UserSession } from '../types';

export const institutionRoutes = new Hono<{ Bindings: Env; Variables: { user: UserSession; db: DatabaseClient } }>();

institutionRoutes.use('*', authMiddleware);

// GET /api/institutions
institutionRoutes.get('/', async (c) => {
  const db = c.get('db');
  const showInactive = c.req.query('all') === 'true';

  let sql = `SELECT id, name, cnpj, email, phone, address, city, state, is_active, created_at, updated_at
             FROM institutions
             WHERE deleted_at IS NULL`;

  if (!showInactive) {
    sql += ` AND is_active = 1`;
  }

  sql += ` ORDER BY name ASC`;

  const institutions = await db.query(sql);
  return c.json({ success: true, data: institutions });
});

// GET /api/institutions/:id
institutionRoutes.get('/:id', async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');

  const institution = await db.first(
    `SELECT id, name, cnpj, email, phone, address, city, state, is_active, created_at, updated_at
     FROM institutions
     WHERE id = ? AND deleted_at IS NULL`,
    [id]
  );

  if (!institution) {
    return c.json({ success: false, error: 'Instituição não encontrada.' }, 404);
  }

  return c.json({ success: true, data: institution });
});

// POST /api/institutions (Admin only)
institutionRoutes.post('/', requireRole(['admin', 'root']), async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const { name, cnpj, email, phone, address, city, state } = body;

  if (!name || !name.trim()) {
    return c.json({ success: false, error: 'O nome da instituição é obrigatório.' }, 400);
  }

  const id = crypto.randomUUID();
  await db.run(
    `INSERT INTO institutions (id, name, cnpj, email, phone, address, city, state, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [id, name.trim(), cnpj?.trim() || null, email?.trim() || null, phone?.trim() || null, address?.trim() || null, city?.trim() || null, state?.trim() || null]
  );

  await db.logAudit({
    userId: user.id,
    action: 'institution:create',
    resource: 'institutions',
    resourceId: id,
    details: { name, cnpj },
  });

  return c.json({ success: true, data: { id }, message: 'Instituição criada com sucesso.' }, 201);
});

// PUT /api/institutions/:id (Admin only)
institutionRoutes.put('/:id', requireRole(['admin', 'root']), async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const { name, cnpj, email, phone, address, city, state, is_active } = body;

  if (!name || !name.trim()) {
    return c.json({ success: false, error: 'O nome da instituição é obrigatório.' }, 400);
  }

  await db.run(
    `UPDATE institutions
     SET name = ?, cnpj = ?, email = ?, phone = ?, address = ?, city = ?, state = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND deleted_at IS NULL`,
    [name.trim(), cnpj?.trim() || null, email?.trim() || null, phone?.trim() || null, address?.trim() || null, city?.trim() || null, state?.trim() || null, is_active !== undefined ? (is_active ? 1 : 0) : 1, id]
  );

  await db.logAudit({
    userId: user.id,
    action: 'institution:update',
    resource: 'institutions',
    resourceId: id,
    details: { name, cnpj },
  });

  return c.json({ success: true, message: 'Instituição atualizada com sucesso.' });
});

// DELETE /api/institutions/:id (Soft delete, Admin only)
institutionRoutes.delete('/:id', requireRole(['admin', 'root']), async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const id = c.req.param('id');

  await db.run(
    `UPDATE institutions
     SET deleted_at = CURRENT_TIMESTAMP, deleted_by = ?, is_active = 0
     WHERE id = ?`,
    [user.id, id]
  );

  await db.logAudit({
    userId: user.id,
    action: 'institution:delete',
    resource: 'institutions',
    resourceId: id,
  });

  return c.json({ success: true, message: 'Instituição removida com sucesso.' });
});
