import { Hono } from 'hono';
import { handle } from 'hono/cloudflare-pages';
import { jwt, sign } from 'hono/jwt';
import { compress } from 'hono/compress';

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
async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [saltHex, originalHash] = storedHash.split(':');
  if (!saltHex || !originalHash) return false;
  
  const newHash = await hashPassword(password, saltHex);
  return newHash === originalHash;
}

// --- MIDDLEWARES ---
// Compressão global Brotli/Gzip para economia de banda e performance
app.use('*', compress());
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
      'INSERT INTO users (email, full_name, password_hash, auth_status, is_active) VALUES (?, ?, ?, ?, ?) RETURNING id'
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
        { resource: 'patients', action: 'manage', institution_id: user.primary_institution_id }
      ],
      allowed_routes: ['/dashboard', '/patients', '/appointments', '/schedule-management'],
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
    
    // Whitelist basica de tabelas
    const allowedTables = ['patients', 'appointments', 'doctors', 'institutions', 'users'];
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

// RPC
app.post('/rpc/:functionName', async (c) => {
  return c.json({ data: [], error: 'RPC Genérico ainda não implementado' });
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
