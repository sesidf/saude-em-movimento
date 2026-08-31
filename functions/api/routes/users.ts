import { Hono } from 'hono';
import { DatabaseClient } from '../lib/db';
import { authMiddleware, requireRole } from '../middleware/auth';
import { createPasswordHash } from '../utils/crypto';
import { Env, UserSession } from '../types';

export const userRoutes = new Hono<{ Bindings: Env; Variables: { user: UserSession; db: DatabaseClient } }>();

userRoutes.use('*', authMiddleware, requireRole(['admin', 'root']));

// GET /api/users
userRoutes.get('/', async (c) => {
  const db = c.get('db');

  const users = await db.query(
    `SELECT u.id, u.email, u.full_name, u.phone, u.is_active, u.auth_status,
            u.primary_institution_id, u.created_at, u.updated_at,
            i.name as institution_name,
            GROUP_CONCAT(r.key) as role_keys,
            GROUP_CONCAT(r.name) as role_names
     FROM users u
     LEFT JOIN institutions i ON i.id = u.primary_institution_id
     LEFT JOIN user_roles ur ON ur.user_id = u.id
     LEFT JOIN roles r ON r.id = ur.role_id
     WHERE u.deleted_at IS NULL
     GROUP BY u.id
     ORDER BY u.full_name ASC`
  );

  const roles = await db.query(`SELECT id, key, name, description FROM roles WHERE is_active = 1`);

  return c.json({ success: true, data: { users, roles } });
});

// POST /api/users
userRoutes.post('/', async (c) => {
  const db = c.get('db');
  const actor = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const { email, full_name, phone, password, role_id, primary_institution_id } = body;

  if (!email || !full_name) {
    return c.json({ success: false, error: 'E-mail e nome completo são obrigatórios.' }, 400);
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Verifica unicidade do e-mail
  const existing = await db.first(`SELECT id FROM users WHERE LOWER(email) = ? AND deleted_at IS NULL`, [normalizedEmail]);
  if (existing) {
    return c.json({ success: false, error: 'Já existe um usuário com este e-mail.' }, 400);
  }

  const initialPassword = password || 'Mudar@123';
  const passwordHash = await createPasswordHash(initialPassword);
  const userId = crypto.randomUUID();

  await db.run(
    `INSERT INTO users (
      id, email, full_name, phone, primary_institution_id, is_active, auth_status, password_hash, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 1, 'pending_auth', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [
      userId,
      normalizedEmail,
      full_name.trim(),
      phone?.trim() || null,
      primary_institution_id || null,
      passwordHash,
    ]
  );

  // Atribui perfil/role
  if (role_id) {
    const userRoleId = crypto.randomUUID();
    await db.run(
      `INSERT INTO user_roles (id, user_id, role_id, institution_id, granted_by, granted_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [userRoleId, userId, role_id, primary_institution_id || null, actor.id]
    );
  }

  await db.logAudit({
    userId: actor.id,
    action: 'user:create',
    resource: 'users',
    resourceId: userId,
    details: { email: normalizedEmail, full_name },
  });

  return c.json({ success: true, data: { id: userId }, message: 'Usuário cadastrado com sucesso.' }, 201);
});

// PUT /api/users/:id
userRoutes.put('/:id', async (c) => {
  const db = c.get('db');
  const actor = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const { full_name, phone, is_active, primary_institution_id, role_id } = body;

  await db.run(
    `UPDATE users
     SET full_name = COALESCE(?, full_name),
         phone = ?,
         is_active = COALESCE(?, is_active),
         primary_institution_id = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND deleted_at IS NULL`,
    [
      full_name ? full_name.trim() : null,
      phone?.trim() || null,
      is_active !== undefined ? (is_active ? 1 : 0) : null,
      primary_institution_id || null,
      id,
    ]
  );

  if (role_id) {
    await db.run(`DELETE FROM user_roles WHERE user_id = ?`, [id]);
    const userRoleId = crypto.randomUUID();
    await db.run(
      `INSERT INTO user_roles (id, user_id, role_id, institution_id, granted_by, granted_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [userRoleId, id, role_id, primary_institution_id || null, actor.id]
    );
  }

  await db.logAudit({
    userId: actor.id,
    action: 'user:update',
    resource: 'users',
    resourceId: id,
  });

  return c.json({ success: true, message: 'Usuário atualizado com sucesso.' });
});

// POST /api/users/:id/reset-password
userRoutes.post('/:id/reset-password', async (c) => {
  const db = c.get('db');
  const actor = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const { new_password } = body;

  const tempPassword = new_password || 'Mudar@123';
  const passwordHash = await createPasswordHash(tempPassword);

  await db.run(
    `UPDATE users
     SET password_hash = ?, auth_status = 'pending_auth', updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND deleted_at IS NULL`,
    [passwordHash, id]
  );

  await db.logAudit({
    userId: actor.id,
    action: 'user:reset_password',
    resource: 'users',
    resourceId: id,
  });

  return c.json({ success: true, message: 'Senha redefinida para o padrão temporário.' });
});
