import { Hono } from 'hono';
import { sign } from 'hono/jwt';
import { setCookie, deleteCookie } from 'hono/cookie';
import { DatabaseClient } from '../lib/db';
import { verifyPassword, createPasswordHash } from '../utils/crypto';
import { authMiddleware } from '../middleware/auth';
import { Env, UserSession } from '../types';

export const authRoutes = new Hono<{ Bindings: Env; Variables: { user: UserSession; db: DatabaseClient } }>();

// POST /api/auth/login
authRoutes.post('/login', async (c) => {
  const db = new DatabaseClient(c.env.DB);
  const body = await c.req.json().catch(() => ({}));
  const { email, password } = body;

  if (!email || !password) {
    return c.json({ success: false, error: 'E-mail e senha são obrigatórios.' }, 400);
  }

  const normalizedEmail = email.trim().toLowerCase();

  const user = await db.first<any>(
    `SELECT u.id, u.email, u.full_name, u.password_hash, u.is_active, u.auth_status,
            u.primary_institution_id, u.metadata,
            i.name as institution_name
     FROM users u
     LEFT JOIN institutions i ON i.id = u.primary_institution_id
     WHERE LOWER(u.email) = ? AND u.deleted_at IS NULL`,
    [normalizedEmail]
  );

  if (!user || !user.password_hash) {
    return c.json({ success: false, error: 'Credenciais inválidas.' }, 401);
  }

  if (user.is_active === 0 || user.auth_status === 'disabled') {
    return c.json({ success: false, error: 'Usuário inativo ou desativado pelo administrador.' }, 403);
  }

  const isValid = await verifyPassword(password, user.password_hash);
  if (!isValid) {
    return c.json({ success: false, error: 'Credenciais inválidas.' }, 401);
  }

  // Busca papéis do usuário
  const userRoles = await db.query<any>(
    `SELECT r.key as role_key, r.name as role_name, ur.institution_id
     FROM user_roles ur
     JOIN roles r ON r.id = ur.role_id
     WHERE ur.user_id = ? AND r.is_active = 1`,
    [user.id]
  );

  const rolesList = userRoles.map((r: any) => r.role_key);
  const primaryRole = rolesList.length > 0 ? rolesList[0] : 'user';
  const isRoot = (c.env.ROOT_EMAIL && user.email.toLowerCase() === c.env.ROOT_EMAIL.toLowerCase()) || rolesList.includes('admin') || rolesList.includes('root');

  const secret = c.env.JWT_SECRET || 'dev-secret-key-change-in-prod';
  const nowInSeconds = Math.floor(Date.now() / 1000);
  const expInSeconds = nowInSeconds + (7 * 24 * 60 * 60); // 7 dias

  const token = await sign(
    {
      id: user.id,
      email: user.email,
      role: primaryRole,
      institutionId: user.primary_institution_id,
      exp: expInSeconds,
      iat: nowInSeconds,
    },
    secret,
    'HS256'
  );

  setCookie(c, 'medco_access_token', token, {
    path: '/',
    secure: true,
    httpOnly: false,
    sameSite: 'Lax',
    maxAge: 7 * 24 * 60 * 60,
  });

  await db.logAudit({
    userId: user.id,
    action: 'auth:login',
    resource: 'users',
    resourceId: user.id,
    institutionId: user.primary_institution_id,
    ipAddress: c.req.header('CF-Connecting-IP') || null,
  });

  return c.json({
    success: true,
    data: {
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: primaryRole,
        roles: rolesList,
        primaryInstitutionId: user.primary_institution_id,
        institutionName: user.institution_name,
        authStatus: user.auth_status,
        requiresPasswordChange: user.auth_status === 'pending_auth',
        isRoot,
      },
    },
  });
});

// POST /api/auth/logout
authRoutes.post('/logout', async (c) => {
  deleteCookie(c, 'medco_access_token', { path: '/' });
  return c.json({ success: true, message: 'Sessão encerrada com sucesso.' });
});

// GET /api/auth/me (requer autenticação)
authRoutes.get('/me', authMiddleware, async (c) => {
  const user = c.get('user');
  const db = c.get('db');

  // Busca instituições vinculadas ao usuário
  const institutions = await db.query<any>(
    `SELECT i.id, i.name, i.cnpj, i.city, i.state, i.is_active
     FROM institutions i
     WHERE i.is_active = 1 AND i.deleted_at IS NULL
     ORDER BY i.name ASC`
  );

  return c.json({
    success: true,
    data: {
      user,
      institutions,
    },
  });
});

// POST /api/auth/change-password
authRoutes.post('/change-password', authMiddleware, async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const body = await c.req.json().catch(() => ({}));
  const { currentPassword, newPassword } = body;

  if (!newPassword || newPassword.length < 6) {
    return c.json({ success: false, error: 'A nova senha deve ter no mínimo 6 caracteres.' }, 400);
  }

  const dbUser = await db.first<any>(`SELECT password_hash, auth_status FROM users WHERE id = ?`, [user.id]);
  if (!dbUser) {
    return c.json({ success: false, error: 'Usuário não encontrado.' }, 404);
  }

  // Se não estiver em pending_auth, exige a senha atual
  if (dbUser.auth_status !== 'pending_auth' && currentPassword) {
    const isValid = await verifyPassword(currentPassword, dbUser.password_hash);
    if (!isValid) {
      return c.json({ success: false, error: 'A senha atual está incorreta.' }, 400);
    }
  }

  const newHash = await createPasswordHash(newPassword);
  await db.run(
    `UPDATE users
     SET password_hash = ?, auth_status = 'active', updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [newHash, user.id]
  );

  await db.logAudit({
    userId: user.id,
    action: 'auth:change-password',
    resource: 'users',
    resourceId: user.id,
  });

  return c.json({ success: true, message: 'Senha alterada com sucesso.' });
});
