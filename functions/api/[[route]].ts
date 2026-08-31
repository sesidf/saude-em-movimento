import { Hono } from 'hono';
import { handle } from 'hono/cloudflare-pages';
import { jwt, sign, verify } from 'hono/jwt';
import { setCookie, deleteCookie } from 'hono/cookie';
import { compress } from 'hono/compress';
import { handlePatientsRpc } from './rpcs/patients';
import { handleDoctorsRpc } from './rpcs/doctors';
import { handleInstitutionsRpc } from './rpcs/institutions';
import { handleDashboardRpc } from './rpcs/dashboard';
import { handleUsersRpc } from './rpcs/users';
import { handleAppointmentsRpc } from './rpcs/appointments';
import { UserRepository } from './repositories/UserRepository';
import { BaseRepository } from './repositories/BaseRepository';

// Define the bindings for Cloudflare Pages (D1, Env vars)
type Bindings = {
  DB: any;
  JWT_SECRET: string;
  ROOT_EMAIL?: string;
  RESEND_API_KEY?: string;
};

const app = new Hono<{ Bindings: Bindings }>().basePath('/api');

// --- HELPER FUNCTIONS FOR WEBCRYPTO HASHING ---
// Em Cloudflare Workers, não temos acesso a bibliotecas C++ do Node como o bcrypt.
// Utilizamos WebCrypto nativo (PBKDF2 com SHA-256) para máxima segurança e velocidade.
const ITERATIONS = 100000;

function buf2hex(buffer: ArrayBuffer) {
  return Array.prototype.map.call(new Uint8Array(buffer), x => ('00' + x.toString(16)).slice(-2)).join('');
}

function hex2buf(hex: string) {
  const view = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    view[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return view.buffer;
}

async function hashPassword(password: string, saltHex: string): Promise<string> {
  const enc = new TextEncoder();
  const saltBuf = hex2buf(saltHex);
  
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  
  const key = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: saltBuf,
      iterations: ITERATIONS,
      hash: "SHA-256"
    },
    keyMaterial,
    256
  );
  
  return buf2hex(key);
}

// Cria um hash de senha e retorna no formato: salt:hash
async function createPasswordHash(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltHex = buf2hex(salt.buffer);
  const hashHex = await hashPassword(password, saltHex);
  return `${saltHex}:${hashHex}`;
}

// Verifica se a senha em texto puro bate com o hash armazenado
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));
app.post('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [saltHex, originalHash] = storedHash.split(':');
  if (!saltHex || !originalHash) return false;
  
  const newHash = await hashPassword(password, saltHex);
  return newHash === originalHash;
}

// --- MIDDLEWARES ---
// Compressão removida: A própria infraestrutura da Cloudflare já faz compressão Brotli/Gzip nativamente no edge.
// Protege todas as rotas de API, EXCETO login
app.use('*', async (c, next) => {
  const url = new URL(c.req.url);
  if (url.pathname.endsWith('/auth/sign_in') || url.pathname.endsWith('/auth/register')) {
    return next();
  }
  
  const jwtMiddleware = jwt({
    secret: c.env.JWT_SECRET || 'dev-secret-key-change-in-prod',
    alg: 'HS256',
    cookie: 'medco_access_token',
  });
  return jwtMiddleware(c, next);
});

// --- AUTH ROUTES ---

// Rota para CRIAR PRIMEIRO USUÁRIO (Apenas para dev / setup)
app.post('/auth/register', async (c) => {
  try {
    const body = await c.req.json();
    const { email, password, full_name } = body;
    
    if (!email || !password || !full_name) {
      return c.json({ error: 'Preencha todos os campos' }, 400);
    }
    
    // Verifica se já existe
    const repo = new UserRepository(c.env.DB);
    const existing = await repo.findFirst('email = ?', [email]);
    if (existing) {
      return c.json({ error: 'Usuário já existe' }, 400);
    }

    const hashedPwd = await createPasswordHash(password);
    
    const result: any = await repo.insert({
      id: crypto.randomUUID().replace(/-/g, '').toLowerCase(), // Simulating randomblob(16) hex
      email,
      full_name,
      password_hash: hashedPwd,
      auth_status: 'active',
      is_active: 1
    });

    if (c.env.ROOT_EMAIL && email === c.env.ROOT_EMAIL) {
      const superadminRole: any = await new BaseRepository(c.env.DB, '').queryFirst("SELECT id FROM roles WHERE key = 'superadmin'");
      if (superadminRole) {
        await new BaseRepository(c.env.DB, '').execute("INSERT INTO user_roles (id, user_id, role_id) VALUES (?, ?, ?)", [crypto.randomUUID().replace(/-/g, '').toLowerCase(), result.id, superadminRole.id]);
      }
    }

    return c.json({ success: true, message: 'Usuário criado com sucesso', id: result?.id });
  } catch (err) {
    console.error(err);
    return c.json({ error: 'Erro interno ao registrar' }, 500);
  }
});


app.post('/auth/sign_in', async (c) => {
  try {
    const body = await c.req.json();
    const email = body.email;
    const password = body.password;
    
    if (!email || !password) {
      return c.json({ error: 'Email e senha são obrigatórios' }, 400);
    }

    // Busca o usuário no D1
    const repo = new UserRepository(c.env.DB);
    const user: any = await repo.findFirst('email = ?', [email]);
    
    if (!user) {
      return c.json({ error: 'Credenciais inválidas' }, 401);
    }

    if (user.auth_status === 'disabled' || user.is_active === 0) {
      return c.json({ error: 'Conta desativada' }, 403);
    }

    if (!user.password_hash) {
      return c.json({ error: 'Usuário sem senha configurada. Contate o suporte.' }, 401);
    }

    // Valida a senha via PBKDF2 WebCrypto
    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) {
      return c.json({ error: 'Credenciais inválidas' }, 401);
    }

    // Busca roles dinâmicas do banco
    const userRolesQuery = await new BaseRepository(c.env.DB, '').query(`
      SELECT r.key, r.name, ur.institution_id
      FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = ?
    `, [user.id]);
    const userRoles = userRolesQuery.results || [];

    const rootEmail = c.env.ROOT_EMAIL ? String(c.env.ROOT_EMAIL).trim().toLowerCase() : null;
    const userEmail = user.email ? String(user.email).trim().toLowerCase() : null;
    const isRoot = Boolean(rootEmail && userEmail === rootEmail);
    
    if (isRoot && !userRoles.find((r: any) => r.key === 'superadmin')) {
      userRoles.push({ key: 'superadmin', name: 'Super Administrador', institution_id: null });
    }

    if (userRoles.length === 0) {
      return c.json({ error: 'Sua conta ainda não possui cargos atribuídos. Entre em contato com a administração.' }, 403);
    }

    // Busca permissões dinâmicas amarradas aos cargos (apenas se tiver cargos)
    const userPermsQuery = await new BaseRepository(c.env.DB, '').query(`
      SELECT p.resource, p.action, ur.institution_id
      FROM user_roles ur
      JOIN role_permissions rp ON ur.role_id = rp.role_id
      JOIN permissions p ON rp.permission_id = p.id
      WHERE ur.user_id = ?
    `, [user.id]);
    const dbPermissions = userPermsQuery.results || [];

    const rolePriority = ['superadmin', 'admin', 'auditor', 'medico', 'recepcao'];
    let dominantRole = 'recepcao';
    let highestPriority = rolePriority.length;

    for (const r of userRoles as any[]) {
      const idx = rolePriority.indexOf(r.key);
      if (idx !== -1 && idx < highestPriority) {
        highestPriority = idx;
        dominantRole = r.key;
      }
    }

    const allowedRoutes = new Set<string>(['/force-password-change']);
    if (isRoot) {
      ['/dashboard', '/patients', '/appointments', '/schedule-management', '/agenda', '/doctors', '/history', '/institutions', '/users', '/specialties', '/reports', '/audit', '/audit-log', '/governance'].forEach(r => allowedRoutes.add(r));
    } else {
      const has = (res: string) => dbPermissions.some((p: any) => p.resource === res);
      if (has('dashboard')) allowedRoutes.add('/dashboard');
      if (has('patients')) allowedRoutes.add('/patients');
      if (has('appointments')) {
        allowedRoutes.add('/appointments');
        allowedRoutes.add('/schedule-management');
        allowedRoutes.add('/agenda');
        allowedRoutes.add('/history');
      }
      if (has('doctors')) allowedRoutes.add('/doctors');
      if (has('institutions')) allowedRoutes.add('/institutions');
      if (has('users')) allowedRoutes.add('/users');
      if (has('specialties')) allowedRoutes.add('/specialties');
      if (has('reports')) allowedRoutes.add('/reports');
      if (has('audit')) {
        allowedRoutes.add('/audit');
        allowedRoutes.add('/audit-log');
      }
      if (has('governance')) allowedRoutes.add('/governance');
    }

    const authProfile = {
      user_id: user.id,
      role: dominantRole,
      full_name: user.full_name,
      email: user.email,
      institution_id: user.primary_institution_id,
      institution_ids: user.primary_institution_id ? [user.primary_institution_id] : [],
      permissions: dbPermissions,
      allowed_routes: Array.from(allowedRoutes),
      is_active: true,
      is_root: isRoot,
      requires_password_change: user.auth_status === 'pending_auth'
    };

    // Gera o JWT usando Hono/jwt
    const token = await sign(
      {
        id: user.id,
        email: user.email,
        profile: authProfile,
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 // 24 hours
      } as any,
      c.env.JWT_SECRET || 'dev-secret-key-change-in-prod'
    );

    setCookie(c, 'medco_access_token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'Strict',
      path: '/',
      maxAge: 60 * 60 * 24 // 24 hours
    });

    return c.json({ 
      data: {
        session: { access_token: token, user: authProfile }
      },
      error: null 
    });
  } catch (err: any) {
    console.error(err);
    return c.json({ error: err.message || 'Internal Server Error' }, 500);
  }
});

app.post('/auth/session', async (c) => {
  try {
    const payload: any = c.get('jwtPayload');
    if (!payload) return c.json({ error: 'Sessão inválida' }, 401);
    return c.json({ data: { profile: payload.profile } });
  } catch (err: any) {
    return c.json({ error: err.message || 'Error fetching session' }, 500);
  }
});

app.post('/auth/logout', async (c) => {
  deleteCookie(c, 'medco_access_token', { path: '/' });
  return c.json({ data: { success: true }, error: null });
});


// --- GENERIC QUERY BUILDER (Substitui o Supabase) ---
// Rota Mágica que atende a chamadas como: chamarApiPost('/api/table/patients/select')

app.post('/table/:tableName/:operation', async (c) => {
  try {
    const tableName = c.req.param('tableName');
    const operation = c.req.param('operation');
    const body = await c.req.json(); // Pega os filtros do frontend
    
    // Whitelist completa de tabelas permitidas
    const allowedTables = ['patients', 'appointments', 'doctors', 'institutions', 'users', 'specialties', 'doctor_availability', 'roles', 'user_roles', 'user_institutions', 'system_events', 'audit_log', 'schedule_blocks', 'encounters', 'medical_record_entries', 'notifications', 'profiles'];
    if (!allowedTables.includes(tableName)) {
      return c.json({ error: `Tabela ${tableName} não permitida.` }, 403);
    }

    const repo = new BaseRepository(c.env.DB, tableName);

    if (operation === 'select') {
      const whereClauses: string[] = [];
      const bindParams: any[] = [];
      
      if (body.filters && Array.isArray(body.filters)) {
         body.filters.forEach((f: any) => {
           if (f.column && f.value !== undefined) {
             whereClauses.push(`${f.column} = ?`);
             bindParams.push(f.value);
           }
         });
      }
      
      const results = await repo.findMany({
        where: whereClauses.length > 0 ? whereClauses.join(' AND ') : undefined,
        params: bindParams,
        limit: body.limit
      });
      
      // Edge Caching Inteligente para tabelas que raramente mudam
      const cacheableTables = ['specialties', 'roles', 'institutions'];
      if (cacheableTables.includes(tableName)) {
        c.header('Cache-Control', 'public, max-age=3600');
      }
      
      return c.json({ data: results, error: null });
    }

    if (operation === 'insert') {
      const payload = body.payload; // O que queremos inserir
      if (!payload || typeof payload !== 'object') {
        return c.json({ error: 'Payload de insert ausente' }, 400);
      }
      
      const result = await repo.insert(payload);
      return c.json({ data: result, error: null });
    }

    if (operation === 'count') {
      const count = await repo.count();
      return c.json({ data: { count }, error: null });
    }

    if (operation === 'count_active') {
      const count = await repo.count('is_active = 1');
      return c.json({ data: { count }, error: null });
    }

    if (operation === 'first_date') {
      let where = `deleted_at IS NULL`;
      let params: any[] = [];
      if (body?.doctor_id) {
        where += ` AND doctor_id = ?`;
        params.push(body.doctor_id);
      }
      const result: any = await new BaseRepository(c.env.DB, '').queryFirst(`SELECT MIN(appointment_date) as appointment_date FROM ${tableName} WHERE ${where}`, [...params]);
      return c.json({ data: { appointment_date: result?.appointment_date }, error: null });
    }

    if (operation === 'last_date') {
      let where = `deleted_at IS NULL`;
      let params: any[] = [];
      if (body?.doctor_id) {
        where += ` AND doctor_id = ?`;
        params.push(body.doctor_id);
      }
      const result: any = await new BaseRepository(c.env.DB, '').queryFirst(`SELECT MAX(appointment_date) as appointment_date FROM ${tableName} WHERE ${where}`, [...params]);
      return c.json({ data: { appointment_date: result?.appointment_date }, error: null });
    }

    if (operation === 'all_active') {
      // Usado para listar os agendamentos ativos
      const results = await repo.findMany({ where: "status IN ('scheduled', 'confirmed') AND deleted_at IS NULL" });
      return c.json({ data: results, error: null });
    }

    // Outros casos: update, delete
    return c.json({ error: `Operação ${operation} não implementada no builder ainda.` }, 501);
    
  } catch (err: any) {
    console.error('Database Error:', err);
    return c.json({ data: null, error: err.message }, 500);
  }
});


app.post('/system/prune', async (c) => {
  try {
    await new BaseRepository(c.env.DB, '').execute("DELETE FROM audit_log WHERE created_at < datetime('now', '-30 days')");
    return c.json({ success: true, message: 'Prune executado com sucesso' });
  } catch(e: any) {
    return c.json({ error: e.message }, 500);
  }
});


// --- PATIENTS ROUTES ---
// Rota principal de listagem de pacientes (usada pelo hook usePatients)
app.post('/patients', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { search, institution_id, include_inactive, limit } = body as any;
    let query = `
      SELECT p.*, i.name as institution_name 
      FROM patients p 
      LEFT JOIN institutions i ON p.institution_id = i.id 
      WHERE p.deleted_at IS NULL
    `;
    const bind: any[] = [];
    if (!include_inactive) { query += ' AND p.is_active = 1'; }
    if (institution_id) { query += ' AND p.institution_id = ?'; bind.push(institution_id); }
    if (search) {
      query += ' AND (p.full_name LIKE ? OR p.cpf LIKE ? OR p.phone LIKE ? OR p.email LIKE ?)';
      const s = '%' + search + '%';
      bind.push(s, s, s, s);
    }
    query += ' ORDER BY p.full_name ASC LIMIT ?';
    bind.push(limit || 10000);
    const { results, success, error } = await c.env.DB.prepare(query).bind(...bind).all();
    if (!success) throw new Error(error || 'Query fail');
    return c.json({ data: results, error: null });
  } catch (err: any) {
    return c.json({ data: null, error: err.message }, 500);
  }
});

// Verificar CPF duplicado
app.post('/patients/check_cpf', async (c) => {
  try {
    const { cpf, exclude_id } = await c.req.json();
    if (!cpf) return c.json({ data: [], error: null });
    let query = 'SELECT id, full_name FROM patients WHERE cpf = ? AND deleted_at IS NULL';
    const bind: any[] = [cpf];
    if (exclude_id) { query += ' AND id != ?'; bind.push(exclude_id); }
    const { results } = await c.env.DB.prepare(query).bind(...bind).all();
    return c.json({ data: results || [], error: null });
  } catch (err: any) {
    return c.json({ data: null, error: err.message }, 500);
  }
});

// Upsert de paciente
app.post('/patients/upsert', async (c) => {
  try {
    const body = await c.req.json();
    const payload = body.p_payload || body;
    
    if (payload.patient_id !== undefined && !payload.id) {
      payload.id = payload.patient_id;
    }
    
    if (!payload.id) {
      payload.id = crypto.randomUUID();
    }
    
    delete payload.patient_id;
    delete payload.idempotency_key;
    delete payload.tcle_accepted;

    const existing = await new BaseRepository(c.env.DB, '').queryFirst('SELECT id FROM patients WHERE id = ?', [payload.id]);
    const keys = Object.keys(payload).filter(k => k !== 'id');
    let query = '';
    let bind: any[] = [];
    if (existing) {
      const setClause = keys.map(k => k + ' = ?').join(', ');
      query = `UPDATE patients SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
      bind = [...keys.map(k => payload[k]), payload.id];
    } else {
      const allKeys = Object.keys(payload);
      query = `INSERT INTO patients (${allKeys.join(', ')}) VALUES (${allKeys.map(() => '?').join(', ')})`;
      bind = allKeys.map(k => payload[k]);
    }
    const { success, error } = await c.env.DB.prepare(query).bind(...bind).run();
    if (!success) throw new Error(error || 'Upsert failed');
    // Desativado a pedido: await new BaseRepository(c.env.DB, '').execute("INSERT INTO audit_log (id, table_name, record_id, action, changed_by) VALUES (lower(hex(randomblob(16))), 'patients', ?, ?, 'system')", [payload.id, existing ? 'UPDATE' : 'INSERT']);
    return c.json({ data: { success: true, id: payload.id }, error: null });
  } catch (err: any) {
    return c.json({ data: null, error: err.message }, 500);
  }
});

// Ativar ou desativar paciente
app.post('/patients/set_active', async (c) => {
  try {
    const { patient_id, is_active } = await c.req.json();
    if (!patient_id) return c.json({ data: null, error: 'patient_id obrigatório' }, 400);
    const success = await new BaseRepository(c.env.DB, '').execute('UPDATE patients SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [is_active ? 1 : 0, patient_id]);
    const error = null;
    if (!success) throw new Error(error || 'Update failed');
    return c.json({ data: { success: true }, error: null });
  } catch (err: any) {
    return c.json({ data: null, error: err.message }, 500);
  }
});

// Exclusão lógica (soft delete) de paciente
app.post('/patients/excluir_raiz', async (c) => {
  try {
    const { patient_id, deleted_by } = await c.req.json();
    if (!patient_id) return c.json({ data: null, error: 'patient_id obrigatório' }, 400);
    const success = await new BaseRepository(c.env.DB, '').execute("UPDATE patients SET deleted_at = CURRENT_TIMESTAMP, deleted_by = ?, is_active = 0 WHERE id = ?", [deleted_by || 'system', patient_id]);
    const error = null;
    if (!success) throw new Error(error || 'Delete failed');
    // Desativado a pedido: await new BaseRepository(c.env.DB, '').execute("INSERT INTO audit_log (id, table_name, record_id, action, changed_by) VALUES (lower(hex(randomblob(16))), 'patients', ?, 'SOFT_DELETE', ?)", [patient_id, deleted_by || 'system']);
    return c.json({ data: { success: true }, error: null });
  } catch (err: any) {
    return c.json({ data: null, error: err.message }, 500);
  }
});


// --- CATALOG ROUTES (dropdowns rápidos) ---
app.post('/catalog/doctors', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { institution_id, specialty_id } = body as any;
    let query = `SELECT d.id, d.crm, d.specialty_id, u.full_name, u.email FROM doctors d LEFT JOIN users u ON d.user_id = u.id WHERE d.is_active = 1 AND d.deleted_at IS NULL`;
    const bind: any[] = [];
    if (specialty_id) { query += ' AND d.specialty_id = ?'; bind.push(specialty_id); }
    query += ' ORDER BY u.full_name ASC';
    c.header('Cache-Control', 'public, max-age=60');
    const { results } = await c.env.DB.prepare(query).bind(...bind).all();
    return c.json({ data: results || [], error: null });
  } catch (err: any) {
    return c.json({ data: null, error: err.message }, 500);
  }
});

app.post('/catalog/specialties', async (c) => {
  try {
    c.header('Cache-Control', 'public, max-age=3600');
    const results = await new BaseRepository(c.env.DB, '').query('SELECT * FROM specialties WHERE is_active = 1 ORDER BY name ASC');
    return c.json({ data: results || [], error: null });
  } catch (err: any) {
    return c.json({ data: null, error: err.message }, 500);
  }
});

app.post('/catalog/institutions', async (c) => {
  try {
    c.header('Cache-Control', 'public, max-age=3600');
    const results = await new BaseRepository(c.env.DB, '').query('SELECT * FROM institutions WHERE is_active = 1 AND deleted_at IS NULL ORDER BY name ASC');
    return c.json({ data: results || [], error: null });
  } catch (err: any) {
    return c.json({ data: null, error: err.message }, 500);
  }
});


// --- FROM ROUTES (busca genérica substituindo o Supabase .from()) ---
app.post('/from/:tableName', async (c) => {
  try {
    const tableName = c.req.param('tableName');
    const allowedFrom = ['users', 'institutions', 'roles', 'user_roles', 'user_institutions', 'profiles', 'doctors', 'specialties', 'patients'];
    if (!allowedFrom.includes(tableName)) return c.json({ data: null, error: 'Tabela não permitida' }, 403);
    const body = await c.req.json().catch(() => ({}));
    const limit = (body as any).limit || 10000;
    const results = await new BaseRepository(c.env.DB, '').query(`SELECT * FROM ${tableName} LIMIT ?`, [limit]);
    return c.json({ data: results || [], error: null });
  } catch (err: any) {
    return c.json({ data: null, error: err.message }, 500);
  }
});


// --- AUTH SESSION ROUTE ---
// Valida se o token JWT ainda é válido e retorna dados do usuário
app.all('/auth/session', async (c) => {
  try {
    // O middleware JWT já validou o token. Se chegou aqui, está válido.
    const payload = c.get('jwtPayload') as any;
    if (!payload || !payload.id) return c.json({ data: null, error: 'Sessão inválida' }, 401);
    // Busca dados atualizados do usuário
    const repo = new UserRepository(c.env.DB);
    const user = await repo.findFirst('id = ?', [payload.id]);
    if (!user || (user as any).is_active === 0) return c.json({ data: null, error: 'Usuário inativo' }, 403);
    return c.json({ data: { user, profile: payload.profile }, error: null });
  } catch (err: any) {
    return c.json({ data: null, error: err.message }, 500);
  }
});
// --- AUTH UPDATE PREFERENCES ---
app.post('/auth/preferences', async (c) => {
  try {
    const payload = c.get('jwtPayload') as any;
    if (!payload || !payload.id) return c.json({ data: null, error: 'Sessão inválida' }, 401);
    
    // O ID do perfil está no payload JWT
    const profileId = payload.profile?.id;
    if (!profileId) return c.json({ data: null, error: 'Perfil não encontrado na sessão' }, 400);

    const body = await c.req.json();
    const { preferences } = body;
    if (!preferences || typeof preferences !== 'object') {
      return c.json({ data: null, error: 'As preferências devem ser um objeto JSON' }, 400);
    }

    const result = await c.env.DB.prepare(
      "UPDATE profiles SET preferences = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(JSON.stringify(preferences), profileId).run();
    
    if (!result.success) throw new Error(result.error || 'Falha ao atualizar as preferências');

    return c.json({ data: { success: true }, error: null });
  } catch (err: any) {
    return c.json({ data: null, error: err.message }, 500);
  }
});


// --- AUTH UPDATE PASSWORD ---
app.post('/auth/update-password', async (c) => {
  try {
    const payload = c.get('jwtPayload') as any;
    if (!payload || !payload.id) return c.json({ data: null, error: 'Sessão inválida' }, 401);
    
    const body = await c.req.json();
    const { password } = body;
    if (!password) return c.json({ data: null, error: 'A nova senha é obrigatória' }, 400);

    const hashedPwd = await createPasswordHash(password);
    
    const result = await c.env.DB.prepare(
      "UPDATE users SET password_hash = ?, auth_status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(hashedPwd, payload.id).run();
    
    if (!result.success) throw new Error(result.error || 'Falha ao atualizar a senha');

    return c.json({ data: { success: true }, error: null });
  } catch (err: any) {
    return c.json({ data: null, error: err.message }, 500);
  }
});
// --- AUTH REQUEST PASSWORD RESET ---
app.post('/auth/request-password-reset', async (c) => {
  try {
    const { email } = await c.req.json();
    if (!email) return c.json({ data: null, error: 'O email é obrigatório' }, 400);

    const repo = new UserRepository(c.env.DB);
    const user: any = await repo.findFirst('email = ?', [email]);
    
    if (user && user.is_active === 1 && user.auth_status !== 'disabled') {
      const payload = {
        id: user.id,
        action: 'reset_password',
        exp: Math.floor(Date.now() / 1000) + 15 * 60 // 15 minutes
      };
      
      const token = await sign(payload, c.env.JWT_SECRET);
      const resetLink = `${new URL(c.req.url).origin}/#/reset-password?token=${token}`;

      if (c.env.RESEND_API_KEY) {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${c.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: 'Saúde em Movimento <no-reply@resend.dev>',
            to: [email],
            subject: 'Redefinição de Senha - Saúde em Movimento',
            html: `<p>Olá, ${user.full_name},</p><p>Você solicitou a redefinição da sua senha.</p><p><a href="${resetLink}">Clique aqui para criar uma nova senha</a>.</p><p>Este link expira em 15 minutos.</p>`
          })
        });
      } else {
        console.log('RESEND_API_KEY não configurada. Link de reset gerado:', resetLink);
      }
    }

    return c.json({ data: { success: true }, error: null });
  } catch (err: any) {
    return c.json({ data: null, error: err.message }, 500);
  }
});

// --- AUTH RESET PASSWORD (ANON) ---
app.post('/auth/reset-password', async (c) => {
  try {
    const body = await c.req.json();
    const { token, password } = body;
    if (!token || !password) return c.json({ data: null, error: 'Token e nova senha são obrigatórios' }, 400);

    let payload: any;
    try {
      payload = await verify(token, c.env.JWT_SECRET, 'HS256');
    } catch {
      return c.json({ data: null, error: 'Token inválido ou expirado' }, 401);
    }

    if (payload.action !== 'reset_password' || !payload.id) {
      return c.json({ data: null, error: 'Token de recuperação inválido' }, 401);
    }

    const hashedPwd = await createPasswordHash(password);
    const result = await c.env.DB.prepare(
      "UPDATE users SET password_hash = ?, auth_status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(hashedPwd, payload.id).run();
    
    if (!result.success) throw new Error(result.error || 'Falha ao atualizar a senha');

    return c.json({ data: { success: true }, error: null });
  } catch (err: any) {
    return c.json({ data: null, error: err.message }, 500);
  }
});


// --- ADMIN CREATE USER ---
app.post('/admin-create-user', async (c) => {
  try {
    const body = await c.req.json();
    const { email, password, full_name, phone, institution_id, role_id: explicit_role_id, role, crm, specialty_id, professional_council } = body;
    if (!email || !password || !full_name) return c.json({ data: null, error: 'email, password e full_name são obrigatórios' }, 400);

    let role_id = explicit_role_id;
    if (!role_id && role) {
      const roleRow = await new BaseRepository(c.env.DB, '').queryFirst('SELECT id FROM roles WHERE key = ?', [role]);
      if (roleRow) role_id = (roleRow as any).id;
    }
    let userId: string;

    const existing = await new BaseRepository(c.env.DB, '').queryFirst('SELECT id FROM users WHERE email = ?', [email]);
    if (existing) {
      userId = (existing as any).id;
    } else {
      userId = crypto.randomUUID();
      const hashedPwd = await createPasswordHash(password);
      await c.env.DB.prepare(
        'INSERT INTO users (id, email, full_name, phone, password_hash, auth_status, is_active, primary_institution_id) VALUES (?, ?, ?, ?, ?, ?, 1, ?)'
      ).bind(userId, email, full_name, phone || null, hashedPwd, 'active', institution_id || null).run();
    }

    // Vincula à instituição
    if (institution_id) {
      const existingInst = await new BaseRepository(c.env.DB, '').queryFirst('SELECT user_id FROM user_institutions WHERE user_id = ? AND institution_id = ?', [userId, institution_id]);
      if (!existingInst) {
        await new BaseRepository(c.env.DB, '').execute('INSERT INTO user_institutions (user_id, institution_id) VALUES (?, ?)', [userId, institution_id]);
      }
    }
    // Atribui role
    if (role_id) {
      const existingRole = await new BaseRepository(c.env.DB, '').queryFirst('SELECT id FROM user_roles WHERE user_id = ? AND role_id = ?', [userId, role_id]);
      if (!existingRole) {
        await new BaseRepository(c.env.DB, '').execute('INSERT INTO user_roles (id, user_id, role_id, institution_id) VALUES (lower(hex(randomblob(16))), ?, ?, ?)', [userId, role_id, institution_id || null]);
      }
    }
    // Se for médico, cria o registro na tabela doctors
    if (role === 'medico' || crm) {
      const existingDoctor = await new BaseRepository(c.env.DB, '').queryFirst('SELECT id FROM doctors WHERE user_id = ?', [userId]);
      if (!existingDoctor) {
        const doctorId = crypto.randomUUID();
        await new BaseRepository(c.env.DB, '').execute(
          'INSERT INTO doctors (id, user_id, specialty_id, professional_council, crm) VALUES (?, ?, ?, ?, ?)',
          [doctorId, userId, specialty_id || null, professional_council || 'CRM', crm || '00']
        );
      }
    }
    // Registra na tabela de auditoria
    const payload = c.get('jwtPayload') as any;
    const adminId = payload?.id || payload?.profile?.id || 'admin';
    const adminName = payload?.profile?.full_name || 'System Admin';
    
    await c.env.DB.prepare(
      "INSERT INTO audit_log (id, table_name, record_id, action, user_id, user_name) VALUES (lower(hex(randomblob(16))), 'users', ?, 'ADMIN_CREATE', ?, ?)"
    ).bind(userId, adminId, adminName).run();

    return c.json({ data: { success: true, id: userId }, error: null });
  } catch (err: any) {
    return c.json({ data: null, error: err.message }, 500);
  }
});

// --- ADMIN DELETE USER ---
app.post('/admin-delete-user', async (c) => {
  try {
    const body = await c.req.json();
    const { user_id } = body;
    if (!user_id) return c.json({ data: null, error: 'user_id é obrigatório' }, 400);

    const payload = c.get('jwtPayload') as any;
    const adminId = payload?.id || payload?.profile?.id || 'admin';
    if (user_id === adminId) {
      return c.json({ data: null, error: 'Não é possível excluir o próprio usuário' }, 400);
    }
    
    // Deleta os registros dependentes primeiro (fallback caso D1 não ative PRAGMA foreign_keys ON por padrão)
    const db = c.env.DB;
    await db.prepare('DELETE FROM user_permissions WHERE user_id = ?').bind(user_id).run();
    await db.prepare('DELETE FROM user_roles WHERE user_id = ?').bind(user_id).run();
    await db.prepare('DELETE FROM user_institutions WHERE user_id = ?').bind(user_id).run();
    await db.prepare('DELETE FROM doctors WHERE user_id = ?').bind(user_id).run();
    await db.prepare('DELETE FROM TEXTs WHERE user_id = ?').bind(user_id).run(); // Devido ao typo no schema local

    await db.prepare('DELETE FROM users WHERE id = ?').bind(user_id).run();
    
    const adminName = payload?.profile?.full_name || 'System Admin';
    await db.prepare(
      "INSERT INTO audit_log (id, table_name, record_id, action, user_id, user_name) VALUES (lower(hex(randomblob(16))), 'users', ?, 'ADMIN_DELETE', ?, ?)"
    ).bind(user_id, adminId, adminName).run();
    
    return c.json({ data: { success: true }, error: null });
  } catch (err: any) {
    return c.json({ data: null, error: err.message }, 500);
  }
});

// --- ADMIN RESET PASSWORD ---
app.post('/admin-reset-password', async (c) => {
  try {
    const body = await c.req.json();
    const { user_id, password } = body;
    
    if (!user_id || !password) {
      return c.json({ data: null, error: 'user_id e password são obrigatórios' }, 400);
    }
    
    // Authorization check
    const payload = c.get('jwtPayload') as any;
    if (!payload || !payload.profile) {
      return c.json({ data: null, error: 'Não autorizado' }, 401);
    }
    
    const role = payload.profile.role;
    if (role !== 'superadmin' && role !== 'admin') {
      return c.json({ data: null, error: 'Sem permissão para redefinir senha' }, 403);
    }

    const hashedPwd = await createPasswordHash(password);
    
    // Update password and set auth_status to pending_auth
    const result = await c.env.DB.prepare(
      "UPDATE users SET password_hash = ?, auth_status = 'pending_auth', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(hashedPwd, user_id).run();
    
    if (!result.success) throw new Error(result.error || 'Falha ao redefinir a senha');

    return c.json({ data: { success: true }, error: null });
  } catch (err: any) {
    return c.json({ data: null, error: err.message }, 500);
  }
});


// --- APPOINTMENTS EXTRA ROUTES ---
// Busca range de datas das consultas (usado pelo buscarLimitesConsultas)
app.post('/appointments/date_range', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const institution_id = (body as any).institution_id || null;
    let query = 'SELECT MIN(appointment_date) as first_date, MAX(appointment_date) as last_date FROM appointments WHERE deleted_at IS NULL';
    const bind: any[] = [];
    if (institution_id) { query += ' AND institution_id = ?'; bind.push(institution_id); }
    const result = await c.env.DB.prepare(query).bind(...bind).first();
    return c.json({ data: result, error: null });
  } catch (err: any) {
    return c.json({ data: null, error: err.message }, 500);
  }
});

// Busca consultas para transferência entre médicos
app.post('/agenda/appointments_for_transfer', async (c) => {
  try {
    const { doctor_id, start_date, end_date, status_filter } = await c.req.json();
    if (!doctor_id) return c.json({ data: null, error: 'doctor_id obrigatório' }, 400);
    let query = `
      SELECT a.id, a.appointment_date, a.end_date, a.status, a.reason,
             p.full_name as patient_name, p.phone as patient_phone
      FROM appointments a
      LEFT JOIN patients p ON a.patient_id = p.id
      WHERE a.doctor_id = ? AND a.deleted_at IS NULL AND a.status NOT IN ('cancelled', 'completed')
    `;
    const bind: any[] = [doctor_id];
    if (start_date) { query += ' AND a.appointment_date >= ?'; bind.push(start_date); }
    if (end_date) { query += ' AND a.appointment_date <= ?'; bind.push(end_date); }
    query += ' ORDER BY a.appointment_date ASC';
    const { results } = await c.env.DB.prepare(query).bind(...bind).all();
    return c.json({ data: results || [], error: null });
  } catch (err: any) {
    return c.json({ data: null, error: err.message }, 500);
  }
});


// --- CNPJ LOOKUP (consulta Receita Federal) ---
app.post('/functions/fetch-cnpj', async (c) => {
  try {
    const { cnpj } = await c.req.json();
    if (!cnpj) return c.json({ data: null, error: 'CNPJ obrigatório' }, 400);
    const cnpjClean = cnpj.replace(/\D/g, '');
    if (cnpjClean.length !== 14) return c.json({ data: null, error: 'CNPJ inválido' }, 400);
    // Cloudflare Workers suporta fetch() nativo para chamadas externas
    const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpjClean}`, {
      headers: { 'Accept': 'application/json' }
    });
    if (!response.ok) return c.json({ data: null, error: 'CNPJ não encontrado' }, 404);
    const cnpjData = await response.json() as any;
    return c.json({
      data: {
        razao_social: cnpjData.razao_social,
        nome_fantasia: cnpjData.nome_fantasia,
        email: cnpjData.email,
        ddd_telefone_1: cnpjData.ddd_telefone_1,
        logradouro: cnpjData.logradouro,
        numero: cnpjData.numero,
        bairro: cnpjData.bairro,
        municipio: cnpjData.municipio,
        uf: cnpjData.uf,
        cep: cnpjData.cep,
      },
      error: null
    });
  } catch (err: any) {
    return c.json({ data: null, error: 'Erro ao consultar CNPJ: ' + err.message }, 500);
  }
});


// --- AGENDA ROUTES ---

app.post('/agenda/doctor_availability', async (c) => {
  try {
    const { doctor_id, weekday } = await c.req.json();
    if (!doctor_id || weekday === undefined) return c.json({ data: null, error: 'Parâmetros inválidos' }, 400);

    const query = `
      SELECT starts_at, ends_at, slot_minutes 
      FROM doctor_availability 
      WHERE doctor_id = ? AND weekday = ? AND is_active = 1
    `;
    const { results, success, error } = await c.env.DB.prepare(query).bind(doctor_id, weekday).all();
    
    if (!success) throw new Error(error || 'Query fail');
    return c.json({ data: results, error: null });
  } catch (err: any) {
    return c.json({ data: null, error: err.message }, 500);
  }
});

app.post('/agenda/appointments', async (c) => {
  try {
    const { doctor_id, booking_date } = await c.req.json();
    if (!doctor_id || !booking_date) return c.json({ data: null, error: 'Parâmetros inválidos' }, 400);

    const startDate = `${booking_date}T00:00:00.000Z`;
    const endDate = `${booking_date}T23:59:59.999Z`;

    const query = `
      SELECT id, patient_id, specialty_id, institution_id, status, appointment_date, end_date, reason
      FROM appointments 
      WHERE doctor_id = ? 
      AND appointment_date >= ? AND appointment_date <= ?
      AND status NOT IN ('cancelled')
    `;
    const { results, success, error } = await c.env.DB.prepare(query).bind(doctor_id, startDate, endDate).all();
    
    if (!success) throw new Error(error || 'Query fail');
    return c.json({ data: results, error: null });
  } catch (err: any) {
    return c.json({ data: null, error: err.message }, 500);
  }
});

app.post('/agenda/list_available_appointment_slots', async (c) => {
  try {
    const { doctor_id, booking_date, institution_id, patient_id } = await c.req.json();
    if (!doctor_id || !booking_date) return c.json({ data: null, error: 'Parâmetros inválidos' }, 400);

    // Retornamos array vazio para que o `agendas.ts` frontend faça o processamento de fallback localmente (já implementado lá)
    return c.json({ data: [], error: null });
  } catch (err: any) {
    return c.json({ data: null, error: err.message }, 500);
  }
});

app.post('/agenda/transferir_consultas_profissional', async (c) => {
  try {
    const { doctor_id_origem, doctor_id_destino, appointment_ids, motivo } = await c.req.json();
    if (!doctor_id_origem || !doctor_id_destino || !appointment_ids || !Array.isArray(appointment_ids)) {
      return c.json({ data: null, error: 'Parâmetros inválidos' }, 400);
    }
    
    // Atualiza multiplos IDs
    const placeholders = appointment_ids.map(() => '?').join(', ');
    const query = `UPDATE appointments SET doctor_id = ?, status = 'rescheduled', reason = ? WHERE id IN (${placeholders}) AND doctor_id = ?`;
    
    const { success, error } = await c.env.DB.prepare(query).bind(doctor_id_destino, motivo || 'Transferência', ...appointment_ids, doctor_id_origem).run();
    
    if (!success) throw new Error(error || 'Update failed');
    return c.json({ data: { transferred_count: appointment_ids.length, details: [] }, error: null });
  } catch (err: any) {
    return c.json({ data: null, error: err.message }, 500);
  }
});

app.post('/agenda/reschedule_appointment', async (c) => {
  try {
    const { appointment_id, start_at, end_at, reason } = await c.req.json();
    if (!appointment_id || !start_at) return c.json({ data: null, error: 'Parâmetros inválidos' }, 400);
    
    const query = `UPDATE appointments SET appointment_date = ?, end_date = ?, reason = ? WHERE id = ?`;
    const { success, error } = await c.env.DB.prepare(query).bind(start_at, end_at || null, reason || 'Reagendamento', appointment_id).run();
    
    if (!success) throw new Error(error || 'Update failed');
    return c.json({ data: { success: true }, error: null });
  } catch (err: any) {
    return c.json({ data: null, error: err.message }, 500);
  }
});

app.post('/agenda/get_schedule_policy_snapshot', async (c) => {
  try {
    const { doctor_id, booking_date } = await c.req.json();
    return c.json({ data: {
      id: "policy-mock",
      max_appointments_per_day: 20,
      allows_overbooking: true,
      max_overbooking_per_day: 2,
      min_notice_hours: 24,
      max_advance_days: 30,
      block_consecutive_shifts: false,
      requires_approval: false
    }, error: null });
  } catch (err: any) {
    return c.json({ data: null, error: err.message }, 500);
  }
});

// --- BOOTSTRAP RBAC ---
// Rota utilizada apenas para configurar cargos e permissões iniciais.
// Bloqueada automaticamente se já existirem cargos cadastrados.
app.post('/system/bootstrap-rbac', async (c) => {
  try {
    const db = c.env.DB;
    const { count } = await new BaseRepository(db, '').queryFirst('SELECT count(*) as count FROM roles') as { count: number };
    if (count > 0) {
      return c.json({ data: null, error: 'O sistema já possui cargos. O bootstrap está bloqueado.' }, 403);
    }

    // 1. Definir permissões disponíveis (Base)
    const basePermissions = [
      { resource: 'institutions', action: 'manage', description: 'Gerenciar Cadastro de Instituições' },
      { resource: 'users', action: 'manage', description: 'Gerenciar Usuários' },
      { resource: 'roles', action: 'manage', description: 'Gerenciar Cargos e Permissões' },
      { resource: 'dashboard', action: 'read', description: 'Visualizar Dashboard/Métricas' },
      { resource: 'appointments', action: 'manage', description: 'Gerenciar Consultas (Criar/Editar/Excluir)' },
      { resource: 'appointments', action: 'read', description: 'Visualizar Consultas' },
      { resource: 'patients', action: 'manage', description: 'Gerenciar Pacientes' },
      { resource: 'patients', action: 'read', description: 'Visualizar Pacientes' },
      { resource: 'medical_records', action: 'manage', description: 'Gerenciar Prontuários' },
      { resource: 'medical_records', action: 'read', description: 'Visualizar Prontuários' },
    ].map(p => ({ ...p, id: crypto.randomUUID() }));

    // 2. Inserir permissões no banco
    for (const perm of basePermissions) {
      await new BaseRepository(db, '').execute('INSERT INTO permissions (id, resource, action, description) VALUES (?, ?, ?, ?)', [perm.id, perm.resource, perm.action, perm.description]);
    }

    // 3. Definir Cargos Base e seus acessos
    const baseRoles = [
      { 
        key: 'superadmin', name: 'Super Administrador', description: 'Acesso total e irrestrito ao sistema.', is_system: 1,
        perms: ['institutions.manage', 'users.manage', 'roles.manage', 'dashboard.read', 'appointments.manage', 'appointments.read', 'patients.manage', 'patients.read', 'medical_records.manage', 'medical_records.read']
      },
      {
        key: 'admin', name: 'Administrador da Unidade', description: 'Gestão completa dentro da sua unidade.', is_system: 1,
        perms: ['users.manage', 'dashboard.read', 'appointments.manage', 'appointments.read', 'patients.manage', 'patients.read']
      },
      {
        key: 'medico', name: 'Médico', description: 'Profissional de saúde que atende pacientes.', is_system: 1,
        perms: ['dashboard.read', 'appointments.read', 'patients.read', 'medical_records.manage', 'medical_records.read']
      },
      {
        key: 'recepcao', name: 'Recepcionista', description: 'Focado no agendamento e cadastro de pacientes.', is_system: 1,
        perms: ['appointments.manage', 'appointments.read', 'patients.manage', 'patients.read']
      },
      {
        key: 'auditor', name: 'Auditor', description: 'Auditoria de prontuários e acessos.', is_system: 1,
        perms: ['dashboard.read', 'medical_records.read']
      }
    ].map(r => ({ ...r, id: crypto.randomUUID() }));

    // 4. Inserir cargos e mapear permissões
    for (const role of baseRoles) {
      await new BaseRepository(db, '').execute('INSERT INTO roles (id, key, name, description, is_system) VALUES (?, ?, ?, ?, ?)', [role.id, role.key, role.name, role.description, role.is_system]);
      
      for (const permKey of role.perms) {
        const [res, act] = permKey.split('.');
        const permId = basePermissions.find(p => p.resource === res && p.action === act)?.id;
        if (permId) {
          await new BaseRepository(db, '').execute('INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [role.id, permId]);
        }
      }
    }

    // 5. Associar ROOT_EMAIL ao cargo de superadmin (se já existir)
    if (c.env.ROOT_EMAIL) {
      const rootEmailRaw = String(c.env.ROOT_EMAIL).trim().toLowerCase();
      const rootUser: any = await new BaseRepository(db, '').queryFirst("SELECT id FROM users WHERE LOWER(email) = ?", [rootEmailRaw]);
      if (rootUser) {
        const superRole = baseRoles.find(r => r.key === 'superadmin');
        if (superRole) {
          await new BaseRepository(db, '').execute("INSERT INTO user_roles (id, user_id, role_id) VALUES (?, ?, ?)", [crypto.randomUUID().replace(/-/g, '').toLowerCase(), rootUser.id, superRole.id]);
        }
      }
    }

    return c.json({ data: { success: true, message: 'Bootstrap RBAC concluído com sucesso.' }, error: null });
  } catch (err: any) {
    return c.json({ data: null, error: err.message }, 500);
  }
});

// --- ROTEADOR CENTRAL DE RPCs ---
// Substitui completamente os antigos RPCs do PostgreSQL por handlers TypeScript nativos.
app.post('/rpc/:functionName', async (c) => {
  try {
    const functionName = c.req.param('functionName');
    const params = await c.req.json().catch(() => ({}));
    const env = c.env;

    // Módulo: Pacientes
    const patientsRpcs = ['list_patients_catalog', 'upsert_patient'];
    if (patientsRpcs.includes(functionName)) {
      const result = await handlePatientsRpc(env, functionName, params);
      return c.json(result);
    }

    // Módulo: Profissionais e Especialidades
    const doctorsRpcs = ['list_doctors_catalog', 'set_doctor_active', 'list_specialties_catalog', 'upsert_specialty', 'set_specialty_active', 'upsert_doctor'];
    if (doctorsRpcs.includes(functionName)) {
      const result = await handleDoctorsRpc(env, functionName, params);
      return c.json(result);
    }

    // Módulo: Instituições
    const institutionsRpcs = ['list_institutions_catalog', 'get_all_institutions_catalog', 'upsert_institution', 'set_institution_active', 'api_excluir_instituicao'];
    if (institutionsRpcs.includes(functionName)) {
      const result = await handleInstitutionsRpc(env, functionName, params);
      return c.json(result);
    }

    // Módulo: Dashboard, Histórico, Logs
    const dashboardRpcs = ['get_dashboard_bi_snapshot', 'get_dashboard_snapshot', 'list_history_snapshot', 'list_system_events_snapshot', 'list_audit_log_snapshot', 'api_clear_audit_and_system_logs', 'list_notifications_snapshot', 'get_database_size_stats', 'get_reports_catalog', 'generate_operational_report_snapshot'];
    if (dashboardRpcs.includes(functionName)) {
      const result = await handleDashboardRpc(env, functionName, params);
      return c.json(result);
    }

    // Módulo: Usuários e Controle de Acesso
    const usersRpcs = ['get_access_control_snapshot', 'get_user_effective_permissions', 'set_user_active', 'link_user_institution', 'sync_user_institutions', 'set_user_access_profile', 'set_user_operational_profile', 'get_permissions_matrix', 'get_my_access_context', 'confirm_password_change'];
    if (usersRpcs.includes(functionName)) {
      const result = await handleUsersRpc(env, functionName, params);
      return c.json(result);
    }

    // Módulo: Consultas e Agenda
    const appointmentsRpcs = ['list_appointments_snapshot', 'api_schedule_appointment', 'api_set_appointment_status', 'api_reschedule_appointment', 'api_start_encounter', 'api_finalize_encounter', 'api_reorganize_schedule_conflicts', 'get_patient_scheduling_guard', 'get_schedule_admin_snapshot', 'api_set_doctor_availability', 'api_archive_schedule_block', 'importar_dados_planilha', 'add_medical_record_entry', 'api_create_schedule_block', 'api_clear_all_schedule_blocks', 'list_patients_catalog'];
    if (appointmentsRpcs.includes(functionName)) {
      const result = await handleAppointmentsRpc(env, functionName, params);
      return c.json(result);
    }

    // Fallback seguro para RPCs não mapeadas
    console.warn(`[RPC] Função não mapeada: ${functionName}`);
    return c.json({ data: null, error: `Função '${functionName}' não encontrada` }, 404);
  } catch (err: any) {
    console.error('[RPC] Erro:', err);
    return c.json({ data: null, error: err.message || 'Erro interno' }, 500);
  }
});


export const scheduled = async (event: any, env: Bindings, ctx: any) => {
  console.log('Executando auto-limpeza do banco D1 (Pruning)...');
  try {
    await new BaseRepository(env.DB, '').execute("DELETE FROM audit_log WHERE created_at < datetime('now', '-30 days')");
    await new BaseRepository(env.DB, '').execute("DELETE FROM system_events WHERE created_at < datetime('now', '-30 days')");
    console.log('Limpeza concluída.');
  } catch(e) {
    console.error('Erro na limpeza', e);
  }
};

export const onRequest = handle(app);
