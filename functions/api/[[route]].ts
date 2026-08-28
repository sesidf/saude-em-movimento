import { Hono } from 'hono';
import { handle } from 'hono/cloudflare-pages';
import { jwt, sign } from 'hono/jwt';
import { compress } from 'hono/compress';
import { handlePatientsRpc } from './rpcs/patients';
import { handleDoctorsRpc } from './rpcs/doctors';
import { handleInstitutionsRpc } from './rpcs/institutions';
import { handleDashboardRpc } from './rpcs/dashboard';
import { handleUsersRpc } from './rpcs/users';
import { handleAppointmentsRpc } from './rpcs/appointments';

// Define the bindings for Cloudflare Pages (D1, Env vars)
type Bindings = {
  DB: any;
  JWT_SECRET: string;
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
    const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
    if (existing) {
      return c.json({ error: 'Usuário já existe' }, 400);
    }

    const hashedPwd = await createPasswordHash(password);
    
    // Insere no banco
    const result = await c.env.DB.prepare(
      'INSERT INTO users (id, email, full_name, password_hash, auth_status, is_active) VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?) RETURNING id'
    ).bind(email, full_name, hashedPwd, 'active', 1).first();

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
    const user: any = await c.env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
    
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

    // Busca permissões no banco (tabela auth.users não existe mais, pegamos perfis)
    // Para simplificar, consideramos "admin" se for o email principal ou mockamos perfil.
    const mockProfile = {
      user_id: user.id,
      role: 'admin',
      full_name: user.full_name,
      email: user.email,
      institution_id: user.primary_institution_id,
      institution_ids: user.primary_institution_id ? [user.primary_institution_id] : [],
      permissions: [
        { resource: 'patients', action: 'manage', institution_id: user.primary_institution_id },
        { resource: 'doctors', action: 'manage' },
        { resource: 'users', action: 'manage' },
        { resource: 'appointments', action: 'manage' },
        { resource: 'reports', action: 'manage' },
        { resource: 'institutions', action: 'manage' },
        { resource: 'specialties', action: 'manage' },
        { resource: 'audit', action: 'manage' }
      ],
      allowed_routes: [
        '/dashboard', '/patients', '/appointments', '/schedule-management',
        '/agenda', '/doctors', '/history', '/institutions', '/users', 
        '/specialties', '/reports', '/audit', '/audit-log', '/governance', '/force-password-change'
      ],
      is_active: true
    };

    // Gera o JWT usando Hono/jwt
    const token = await sign(
      {
        id: user.id,
        email: user.email,
        profile: mockProfile,
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 // 24 hours
      },
      c.env.JWT_SECRET || 'dev-secret-key-change-in-prod'
    );

    return c.json({ 
      data: {
        session: { access_token: token, user: mockProfile }
      },
      error: null 
    });
  } catch (err: any) {
    console.error(err);
    return c.json({ error: err.message || 'Internal Server Error' }, 500);
  }
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

    if (operation === 'select') {
      let query = `SELECT * FROM ${tableName}`;
      const bindParams: any[] = [];
      const whereClauses: string[] = [];
      
      // Exemplo básico de mapeamento de filtros .eq() do frontend
      if (body.filters && Array.isArray(body.filters)) {
         body.filters.forEach((f: any) => {
           if (f.column && f.value !== undefined) {
             // Aceitar operadores no futuro. Por ora, igualdade simples.
             whereClauses.push(`${f.column} = ?`);
             bindParams.push(f.value);
           }
         });
      }
      
      if (whereClauses.length > 0) {
        query += ` WHERE ` + whereClauses.join(' AND ');
      }
      
      // Limites
      if (body.limit) {
        query += ` LIMIT ?`;
        bindParams.push(body.limit);
      }

      const { results, success, error } = await c.env.DB.prepare(query).bind(...bindParams).all();
      
      // Edge Caching Inteligente para tabelas que raramente mudam
      const cacheableTables = ['specialties', 'roles', 'institutions'];
      if (cacheableTables.includes(tableName)) {
        c.header('Cache-Control', 'public, max-age=3600');
      }
      
      if (!success) throw new Error(error || 'Query fail');
      return c.json({ data: results, error: null });
    }

    if (operation === 'insert') {
      const payload = body.payload; // O que queremos inserir
      if (!payload || typeof payload !== 'object') {
        return c.json({ error: 'Payload de insert ausente' }, 400);
      }
      
      const keys = Object.keys(payload);
      const values = Object.values(payload);
      const placeholders = keys.map(() => '?').join(', ');
      
      const query = `INSERT INTO ${tableName} (${keys.join(', ')}) VALUES (${placeholders}) RETURNING *`;
      const result = await c.env.DB.prepare(query).bind(...values).first();
      
      return c.json({ data: result, error: null });
    }
    // Outros casos comuns:
    if (operation === 'count') {
      const { results } = await c.env.DB.prepare(`SELECT count(*) as count FROM ${tableName}`).all();
      return c.json({ data: { count: (results[0] as any).count }, error: null });
    }

    if (operation === 'count_active') {
      const { results } = await c.env.DB.prepare(`SELECT count(*) as count FROM ${tableName} WHERE is_active = 1`).all();
      return c.json({ data: { count: (results[0] as any).count }, error: null });
    }

    if (operation === 'first_date') {
      let query = `SELECT MIN(appointment_date) as appointment_date FROM ${tableName} WHERE deleted_at IS NULL`;
      let param = null;
      if (body?.doctor_id) {
        query += ` AND doctor_id = ?`;
        param = body.doctor_id;
      }
      const stmt = param ? c.env.DB.prepare(query).bind(param) : c.env.DB.prepare(query);
      const { results } = await stmt.all();
      return c.json({ data: { appointment_date: (results[0] as any)?.appointment_date }, error: null });
    }

    if (operation === 'last_date') {
      let query = `SELECT MAX(appointment_date) as appointment_date FROM ${tableName} WHERE deleted_at IS NULL`;
      let param = null;
      if (body?.doctor_id) {
        query += ` AND doctor_id = ?`;
        param = body.doctor_id;
      }
      const stmt = param ? c.env.DB.prepare(query).bind(param) : c.env.DB.prepare(query);
      const { results } = await stmt.all();
      return c.json({ data: { appointment_date: (results[0] as any)?.appointment_date }, error: null });
    }

    if (operation === 'all_active') {
      // Usado para listar os agendamentos ativos
      const { results } = await c.env.DB.prepare(`SELECT * FROM ${tableName} WHERE status IN ('scheduled', 'confirmed') AND deleted_at IS NULL`).all();
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
    await c.env.DB.prepare("DELETE FROM audit_log WHERE created_at < datetime('now', '-30 days')").run();
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
    let query = 'SELECT * FROM patients WHERE deleted_at IS NULL';
    const bind: any[] = [];
    if (!include_inactive) { query += ' AND is_active = 1'; }
    if (institution_id) { query += ' AND institution_id = ?'; bind.push(institution_id); }
    if (search) {
      query += ' AND (full_name LIKE ? OR cpf LIKE ? OR phone LIKE ? OR email LIKE ?)';
      const s = '%' + search + '%';
      bind.push(s, s, s, s);
    }
    query += ' ORDER BY full_name ASC LIMIT ?';
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
    if (!payload || !payload.id) return c.json({ data: null, error: 'ID obrigatório' }, 400);
    const existing = await c.env.DB.prepare('SELECT id FROM patients WHERE id = ?').bind(payload.id).first();
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
    await c.env.DB.prepare("INSERT INTO audit_log (id, table_name, record_id, action, changed_by) VALUES (lower(hex(randomblob(16))), 'patients', ?, ?, 'system')").bind(payload.id, existing ? 'UPDATE' : 'INSERT').run();
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
    const { success, error } = await c.env.DB.prepare('UPDATE patients SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(is_active ? 1 : 0, patient_id).run();
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
    const { success, error } = await c.env.DB.prepare("UPDATE patients SET deleted_at = CURRENT_TIMESTAMP, deleted_by = ?, is_active = 0 WHERE id = ?").bind(deleted_by || 'system', patient_id).run();
    if (!success) throw new Error(error || 'Delete failed');
    await c.env.DB.prepare("INSERT INTO audit_log (id, table_name, record_id, action, changed_by) VALUES (lower(hex(randomblob(16))), 'patients', ?, 'SOFT_DELETE', ?)").bind(patient_id, deleted_by || 'system').run();
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
    const { results } = await c.env.DB.prepare('SELECT * FROM specialties WHERE is_active = 1 ORDER BY name ASC').all();
    return c.json({ data: results || [], error: null });
  } catch (err: any) {
    return c.json({ data: null, error: err.message }, 500);
  }
});

app.post('/catalog/institutions', async (c) => {
  try {
    c.header('Cache-Control', 'public, max-age=3600');
    const { results } = await c.env.DB.prepare('SELECT * FROM institutions WHERE is_active = 1 AND deleted_at IS NULL ORDER BY name ASC').all();
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
    const { results } = await c.env.DB.prepare(`SELECT * FROM ${tableName} LIMIT ?`).bind(limit).all();
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
    const user = await c.env.DB.prepare('SELECT id, email, full_name, is_active, auth_status, primary_institution_id FROM users WHERE id = ?').bind(payload.id).first();
    if (!user || (user as any).is_active === 0) return c.json({ data: null, error: 'Usuário inativo' }, 403);
    return c.json({ data: { user, profile: payload.profile }, error: null });
  } catch (err: any) {
    return c.json({ data: null, error: err.message }, 500);
  }
});


// --- ADMIN CREATE USER ---
app.post('/admin-create-user', async (c) => {
  try {
    const body = await c.req.json();
    const { email, password, full_name, phone, institution_id, role_id } = body;
    if (!email || !password || !full_name) return c.json({ data: null, error: 'email, password e full_name são obrigatórios' }, 400);
    // Verifica se já existe
    const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
    if (existing) return c.json({ data: null, error: 'Email já cadastrado' }, 409);
    const hashedPwd = await createPasswordHash(password);
    const userId = crypto.randomUUID();
    await c.env.DB.prepare(
      'INSERT INTO users (id, email, full_name, phone, password_hash, auth_status, is_active, primary_institution_id) VALUES (?, ?, ?, ?, ?, ?, 1, ?)'
    ).bind(userId, email, full_name, phone || null, hashedPwd, 'active', institution_id || null).run();
    // Vincula à instituição
    if (institution_id) {
      await c.env.DB.prepare('INSERT INTO user_institutions (id, user_id, institution_id) VALUES (lower(hex(randomblob(16))), ?, ?)').bind(userId, institution_id).run();
    }
    // Atribui role
    if (role_id) {
      await c.env.DB.prepare('INSERT INTO user_roles (id, user_id, role_id, institution_id) VALUES (lower(hex(randomblob(16))), ?, ?, ?)').bind(userId, role_id, institution_id || null).run();
    }
    await c.env.DB.prepare("INSERT INTO audit_log (id, table_name, record_id, action, changed_by) VALUES (lower(hex(randomblob(16))), 'users', ?, 'ADMIN_CREATE', 'admin')").bind(userId).run();
    return c.json({ data: { success: true, id: userId }, error: null });
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
    const doctorsRpcs = ['list_doctors_catalog', 'set_doctor_active', 'list_specialties_catalog', 'upsert_specialty', 'set_specialty_active'];
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
    await env.DB.prepare("DELETE FROM audit_log WHERE created_at < datetime('now', '-30 days')").run();
    await env.DB.prepare("DELETE FROM system_events WHERE created_at < datetime('now', '-30 days')").run();
    console.log('Limpeza concluída.');
  } catch(e) {
    console.error('Erro na limpeza', e);
  }
};

export const onRequest = handle(app);
