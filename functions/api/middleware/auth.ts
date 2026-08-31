import { Context, Next } from 'hono';
import { verify } from 'hono/jwt';
import { getCookie } from 'hono/cookie';
import { DatabaseClient } from '../lib/db';
import { Env, UserSession } from '../types';

export async function authMiddleware(c: Context<{ Bindings: Env; Variables: { user: UserSession; db: DatabaseClient } }>, next: Next) {
  const db = new DatabaseClient(c.env.DB);
  c.set('db', db);

  const authHeader = c.req.header('Authorization');
  let token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;

  if (!token) {
    token = getCookie(c, 'medco_access_token') || null;
  }

  if (!token) {
    return c.json({ success: false, error: 'Não autorizado. Token de autenticação ausente.' }, 401);
  }

  const secret = c.env.JWT_SECRET || 'dev-secret-key-change-in-prod';

  try {
    const payload = (await verify(token, secret, 'HS256')) as any;
    if (!payload || !payload.id) {
      return c.json({ success: false, error: 'Sessão inválida ou expirada.' }, 401);
    }

    // Busca usuário ativo no banco
    const user = await db.first<any>(
      `SELECT u.id, u.email, u.full_name, u.is_active, u.auth_status, u.primary_institution_id,
              i.name as institution_name
       FROM users u
       LEFT JOIN institutions i ON i.id = u.primary_institution_id
       WHERE u.id = ? AND (u.deleted_at IS NULL)`,
      [payload.id]
    );

    if (!user || user.is_active === 0 || user.auth_status === 'disabled') {
      return c.json({ success: false, error: 'Usuário desativado ou não encontrado.' }, 403);
    }

    // Busca roles e permissões do usuário
    const userRoles = await db.query<any>(
      `SELECT r.key as role_key, r.name as role_name, ur.institution_id
       FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id = ? AND r.is_active = 1`,
      [user.id]
    );

    const rolesList = userRoles.map(r => r.role_key);
    const primaryRole = rolesList.length > 0 ? rolesList[0] : (payload.role || 'user');
    const isRoot = (c.env.ROOT_EMAIL && user.email.toLowerCase() === c.env.ROOT_EMAIL.toLowerCase()) || rolesList.includes('admin') || rolesList.includes('root');

    const session: UserSession = {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: primaryRole,
      primaryInstitutionId: user.primary_institution_id,
      institutionId: payload.institutionId || user.primary_institution_id,
      institutionName: user.institution_name,
      roles: rolesList,
      isRoot,
    };

    c.set('user', session);
    await next();
  } catch (err: any) {
    return c.json({ success: false, error: 'Token inválido ou expirado.' }, 401);
  }
}

export function requireRole(allowedRoles: string[]) {
  return async (c: Context<{ Bindings: Env; Variables: { user: UserSession; db: DatabaseClient } }>, next: Next) => {
    const user = c.get('user');
    if (!user) {
      return c.json({ success: false, error: 'Não autenticado.' }, 401);
    }

    if (user.isRoot) {
      return next();
    }

    const hasRole = allowedRoles.some(r => user.roles?.includes(r) || user.role === r);
    if (!hasRole) {
      return c.json({ success: false, error: 'Acesso negado. Nível de permissão insuficiente.' }, 403);
    }

    await next();
  };
}
