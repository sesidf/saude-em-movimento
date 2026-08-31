import { Hono } from 'hono';
import { DatabaseClient } from '../lib/db';
import { authMiddleware } from '../middleware/auth';
import { Env, UserSession } from '../types';

export const appointmentRoutes = new Hono<{ Bindings: Env; Variables: { user: UserSession; db: DatabaseClient } }>();

appointmentRoutes.use('*', authMiddleware);

// GET /api/appointments
appointmentRoutes.get('/', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const date = c.req.query('date');
  const startDate = c.req.query('start_date');
  const endDate = c.req.query('end_date');
  const doctorId = c.req.query('doctor_id');
  const specialtyId = c.req.query('specialty_id');
  const status = c.req.query('status');
  const institutionId = c.req.query('institution_id') || user.institutionId;

  let sql = `
    SELECT a.id, a.appointment_code, a.institution_id, a.patient_id, a.doctor_id, a.specialty_id,
           a.appointment_date, a.end_date, a.actual_start_at, a.actual_end_at, a.status, a.reason,
           a.cancel_reason, a.diagnosis, a.prescription, a.notes, a.blood_pressure, a.weight, a.height, a.temperature,
           p.full_name as patient_name, p.cpf as patient_cpf, p.phone as patient_phone, p.birth_date as patient_birth_date,
           s.name as specialty_name, s.color as specialty_color,
           COALESCE(u.full_name, pr.full_name, 'Profissional') as doctor_name,
           d.crm as doctor_crm,
           i.name as institution_name
    FROM appointments a
    JOIN patients p ON p.id = a.patient_id
    JOIN doctors d ON d.id = a.doctor_id
    LEFT JOIN users u ON u.id = d.user_id
    LEFT JOIN profiles pr ON pr.id = d.user_id
    LEFT JOIN specialties s ON s.id = a.specialty_id
    LEFT JOIN institutions i ON i.id = a.institution_id
    WHERE a.deleted_at IS NULL
  `;
  const params: any[] = [];

  if (institutionId) {
    sql += ` AND (a.institution_id = ? OR a.institution_id IS NULL)`;
    params.push(institutionId);
  }

  if (date) {
    sql += ` AND DATE(a.appointment_date) = DATE(?)`;
    params.push(date);
  } else if (startDate && endDate) {
    sql += ` AND DATE(a.appointment_date) >= DATE(?) AND DATE(a.appointment_date) <= DATE(?)`;
    params.push(startDate, endDate);
  }

  if (doctorId) {
    sql += ` AND a.doctor_id = ?`;
    params.push(doctorId);
  }

  if (specialtyId) {
    sql += ` AND a.specialty_id = ?`;
    params.push(specialtyId);
  }

  if (status) {
    sql += ` AND a.status = ?`;
    params.push(status);
  }

  sql += ` ORDER BY a.appointment_date ASC`;

  const appointments = await db.query(sql, params);
  return c.json({ success: true, data: appointments });
});

// GET /api/appointments/:id
appointmentRoutes.get('/:id', async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');

  const appointment = await db.first(
    `SELECT a.*,
            p.full_name as patient_name, p.cpf as patient_cpf, p.phone as patient_phone, p.birth_date as patient_birth_date,
            s.name as specialty_name,
            COALESCE(u.full_name, pr.full_name, 'Profissional') as doctor_name,
            d.crm as doctor_crm,
            i.name as institution_name
     FROM appointments a
     JOIN patients p ON p.id = a.patient_id
     JOIN doctors d ON d.id = a.doctor_id
     LEFT JOIN users u ON u.id = d.user_id
     LEFT JOIN profiles pr ON pr.id = d.user_id
     LEFT JOIN specialties s ON s.id = a.specialty_id
     LEFT JOIN institutions i ON i.id = a.institution_id
     WHERE a.id = ? AND a.deleted_at IS NULL`,
    [id]
  );

  if (!appointment) {
    return c.json({ success: false, error: 'Agendamento não encontrado.' }, 404);
  }

  return c.json({ success: true, data: appointment });
});

// POST /api/appointments
appointmentRoutes.post('/', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const { patient_id, doctor_id, specialty_id, appointment_date, end_date, reason, institution_id } = body;

  if (!patient_id || !doctor_id || !appointment_date || !reason) {
    return c.json({ success: false, error: 'Paciente, médico, data e motivo são obrigatórios.' }, 400);
  }

  // Verifica conflito de horário para o mesmo médico
  const conflict = await db.first(
    `SELECT id FROM appointments
     WHERE doctor_id = ? AND appointment_date = ? AND status NOT IN ('cancelado', 'nao_compareceu') AND deleted_at IS NULL`,
    [doctor_id, appointment_date]
  );

  if (conflict) {
    return c.json({ success: false, error: 'Já existe um agendamento para este médico no horário selecionado.' }, 400);
  }

  const id = crypto.randomUUID();
  const appointmentCode = `AG-${Math.floor(100000 + Math.random() * 900000)}`;
  const finalEndDate = end_date || appointment_date;

  await db.run(
    `INSERT INTO appointments (
      id, appointment_code, institution_id, patient_id, doctor_id, specialty_id,
      appointment_date, end_date, status, reason, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'agendado', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [
      id,
      appointmentCode,
      institution_id || user.institutionId || null,
      patient_id,
      doctor_id,
      specialty_id || null,
      appointment_date,
      finalEndDate,
      reason.trim(),
    ]
  );

  await db.logAudit({
    userId: user.id,
    action: 'appointment:create',
    resource: 'appointments',
    resourceId: id,
    institutionId: institution_id || user.institutionId || null,
    details: { patient_id, doctor_id, appointment_date },
  });

  return c.json({ success: true, data: { id, appointment_code: appointmentCode }, message: 'Consulta agendada com sucesso.' }, 201);
});

// PATCH /api/appointments/:id/status
appointmentRoutes.patch('/:id/status', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const { status, cancel_reason } = body;

  const validStatuses = ['agendado', 'confirmado', 'aguardando', 'em_atendimento', 'finalizado', 'cancelado', 'nao_compareceu'];
  if (!status || !validStatuses.includes(status)) {
    return c.json({ success: false, error: 'Status de atendimento inválido.' }, 400);
  }

  let extraSql = '';
  const extraParams: any[] = [];

  if (status === 'em_atendimento') {
    extraSql = `, actual_start_at = COALESCE(actual_start_at, CURRENT_TIMESTAMP)`;
  } else if (status === 'finalizado') {
    extraSql = `, actual_end_at = CURRENT_TIMESTAMP`;
  } else if (status === 'cancelado') {
    extraSql = `, cancel_reason = ?`;
    extraParams.push(cancel_reason || 'Cancelado pelo operador');
  }

  await db.run(
    `UPDATE appointments
     SET status = ?, updated_at = CURRENT_TIMESTAMP ${extraSql}
     WHERE id = ? AND deleted_at IS NULL`,
    [status, ...extraParams, id]
  );

  await db.logAudit({
    userId: user.id,
    action: `appointment:status_${status}`,
    resource: 'appointments',
    resourceId: id,
  });

  return c.json({ success: true, message: `Status da consulta atualizado para '${status}'.` });
});

// PUT /api/appointments/:id/clinical-data
appointmentRoutes.put('/:id/clinical-data', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const { diagnosis, prescription, notes, blood_pressure, weight, height, temperature } = body;

  await db.run(
    `UPDATE appointments
     SET diagnosis = ?, prescription = ?, notes = ?,
         blood_pressure = ?, weight = ?, height = ?, temperature = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND deleted_at IS NULL`,
    [
      diagnosis || null,
      prescription || null,
      notes || null,
      blood_pressure || null,
      weight !== undefined ? parseFloat(weight) || null : null,
      height !== undefined ? parseFloat(height) || null : null,
      temperature !== undefined ? parseFloat(temperature) || null : null,
      id,
    ]
  );

  await db.logAudit({
    userId: user.id,
    action: 'appointment:clinical_update',
    resource: 'appointments',
    resourceId: id,
  });

  return c.json({ success: true, message: 'Dados clínicos salvos com sucesso.' });
});
