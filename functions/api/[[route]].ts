import { Hono } from 'hono';
import { handle } from 'hono/cloudflare-pages';
import { cors } from 'hono/cors';
import { Env, UserSession } from './types';
import { DatabaseClient } from './lib/db';
import { authRoutes } from './routes/auth';
import { institutionRoutes } from './routes/institutions';
import { specialtyRoutes } from './routes/specialties';
import { doctorRoutes } from './routes/doctors';
import { patientRoutes } from './routes/patients';
import { scheduleRoutes } from './routes/schedules';
import { appointmentRoutes } from './routes/appointments';
import { reportRoutes } from './routes/reports';
import { userRoutes } from './routes/users';

const app = new Hono<{ Bindings: Env; Variables: { user: UserSession; db: DatabaseClient } }>().basePath('/api');

// Middleware Global de CORS
app.use('*', cors({
  origin: (origin) => origin || '*',
  allowHeaders: ['Content-Type', 'Authorization', 'Accept'],
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true,
}));

// Rota de Health Check
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));
app.post('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Montagem dos módulos de rotas
app.route('/auth', authRoutes);
app.route('/institutions', institutionRoutes);
app.route('/specialties', specialtyRoutes);
app.route('/doctors', doctorRoutes);
app.route('/patients', patientRoutes);
app.route('/schedules', scheduleRoutes);
app.route('/appointments', appointmentRoutes);
app.route('/reports', reportRoutes);
app.route('/users', userRoutes);

// Tratamento de rotas não encontradas
app.notFound((c) => {
  return c.json({ success: false, error: `Rota não encontrada: ${c.req.path}` }, 404);
});

// Tratamento global de erros
app.onError((err, c) => {
  console.error('[API Unhandled Error]:', err);
  return c.json(
    {
      success: false,
      error: err.message || 'Erro interno no servidor de dados.',
    },
    500
  );
});

export const onRequest = handle(app);
