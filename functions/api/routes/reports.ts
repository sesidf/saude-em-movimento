import { Hono } from 'hono';
import { DatabaseClient } from '../lib/db';
import { authMiddleware } from '../middleware/auth';
import { Env, UserSession } from '../types';

export const reportRoutes = new Hono<{ Bindings: Env; Variables: { user: UserSession; db: DatabaseClient } }>();

reportRoutes.use('*', authMiddleware);

// GET /api/reports/dashboard-metrics
reportRoutes.get('/dashboard-metrics', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const institutionId = c.req.query('institution_id') || user.institutionId;

  let instClause = '';
  const params: any[] = [];

  if (institutionId) {
    instClause = ' AND (institution_id = ? OR institution_id IS NULL)';
    params.push(institutionId);
  }

  // Agendamentos hoje
  const todayRow = await db.first<any>(
    `SELECT COUNT(*) as total,
            SUM(CASE WHEN status = 'finalizado' THEN 1 ELSE 0 END) as finalizados,
            SUM(CASE WHEN status = 'em_atendimento' THEN 1 ELSE 0 END) as em_atendimento,
            SUM(CASE WHEN status = 'aguardando' THEN 1 ELSE 0 END) as aguardando,
            SUM(CASE WHEN status = 'cancelado' THEN 1 ELSE 0 END) as cancelados,
            SUM(CASE WHEN status = 'nao_compareceu' THEN 1 ELSE 0 END) as nao_compareceram
     FROM appointments
     WHERE DATE(appointment_date) = DATE('now') AND deleted_at IS NULL ${instClause}`,
    params
  );

  // Total de Pacientes e Médicos
  const totalsRow = await db.first<any>(
    `SELECT (SELECT COUNT(*) FROM patients WHERE is_active = 1 AND deleted_at IS NULL) as total_patients,
            (SELECT COUNT(*) FROM doctors WHERE is_active = 1 AND deleted_at IS NULL) as total_doctors,
            (SELECT COUNT(*) FROM specialties WHERE is_active = 1 AND deleted_at IS NULL) as total_specialties`
  );

  return c.json({
    success: true,
    data: {
      today: {
        total: todayRow?.total || 0,
        completed: todayRow?.finalizados || 0,
        inProgress: todayRow?.em_atendimento || 0,
        waiting: todayRow?.aguardando || 0,
        canceled: todayRow?.cancelados || 0,
        noShow: todayRow?.nao_compareceram || 0,
      },
      system: {
        totalPatients: totalsRow?.total_patients || 0,
        totalDoctors: totalsRow?.total_doctors || 0,
        totalSpecialties: totalsRow?.total_specialties || 0,
      },
    },
  });
});

// GET /api/reports/audit-logs
reportRoutes.get('/audit-logs', async (c) => {
  const db = c.get('db');
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 100);

  const logs = await db.query(
    `SELECT al.*, COALESCE(u.full_name, 'Sistema') as user_name, u.email as user_email
     FROM audit_logs al
     LEFT JOIN users u ON u.id = al.user_id
     ORDER BY al.created_at DESC
     LIMIT ?`,
    [limit]
  );

  return c.json({ success: true, data: logs });
});
