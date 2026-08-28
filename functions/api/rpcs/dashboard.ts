export const handleDashboardRpc = async (env: any, functionName: string, params: any) => {
  if (functionName === 'get_dashboard_bi_snapshot' || functionName === 'get_dashboard_snapshot') {
    const days = params.p_days || 30;
    const institutionId = params.p_institution_id || null;
    
    let instFilter = '';
    const instParams: any[] = [];
    if (institutionId) {
      instFilter = ' AND institution_id = ?';
      instParams.push(institutionId);
    }

    // Total de pacientes
    const totalPacientes = await env.DB.prepare(
      `SELECT COUNT(*) as total FROM patients WHERE deleted_at IS NULL${instFilter}`
    ).bind(...instParams).first();

    // Total de consultas no período
    const totalConsultas = await env.DB.prepare(
      `SELECT COUNT(*) as total FROM appointments WHERE appointment_date >= datetime('now', '-${days} days') AND deleted_at IS NULL${instFilter}`
    ).bind(...instParams).first();

    // Consultas por status
    const porStatus = await env.DB.prepare(
      `SELECT status, COUNT(*) as total FROM appointments WHERE appointment_date >= datetime('now', '-${days} days') AND deleted_at IS NULL${instFilter} GROUP BY status`
    ).bind(...instParams).all();

    // Consultas por dia (últimos 30 dias)
    const porDia = await env.DB.prepare(
      `SELECT date(appointment_date) as dia, COUNT(*) as total FROM appointments WHERE appointment_date >= datetime('now', '-${days} days') AND deleted_at IS NULL${instFilter} GROUP BY date(appointment_date) ORDER BY dia ASC`
    ).bind(...instParams).all();

    // Profissionais ativos
    const totalProfissionais = await env.DB.prepare(
      `SELECT COUNT(*) as total FROM doctors WHERE is_active = 1`
    ).first();

    return {
      data: {
        total_pacientes: totalPacientes?.total || 0,
        total_consultas: totalConsultas?.total || 0,
        total_profissionais: totalProfissionais?.total || 0,
        consultas_por_status: porStatus?.results || [],
        consultas_por_dia: porDia?.results || [],
      },
      error: null
    };
  }

  if (functionName === 'list_history_snapshot') {
    const patientId = params.p_patient_id || null;
    const limit = params.p_limit || 50;
    
    let query = `
      SELECT 
        a.id, a.appointment_date, a.status, a.reason,
        u.full_name as doctor_name,
        s.name as specialty_name,
        e.notes, e.diagnosis, e.treatment_plan, e.finalized_at
      FROM appointments a
      LEFT JOIN doctors d ON a.doctor_id = d.id
      LEFT JOIN users u ON d.user_id = u.id
      LEFT JOIN specialties s ON a.specialty_id = s.id
      LEFT JOIN encounters e ON a.id = e.appointment_id
      WHERE 1=1
    `;
    const bindParams: any[] = [];
    
    if (patientId) {
      query += " AND a.patient_id = ?";
      bindParams.push(patientId);
    }
    query += " ORDER BY a.appointment_date DESC LIMIT ?";
    bindParams.push(limit);
    
    const { results, success, error } = await env.DB.prepare(query).bind(...bindParams).all();
    if (!success) throw new Error(error || 'Failed to list history');
    return { data: results, error: null };
  }

  if (functionName === 'list_system_events_snapshot') {
    const limit = params.p_limit || 100;
    const { results, success, error } = await env.DB.prepare(
      "SELECT * FROM system_events ORDER BY created_at DESC LIMIT ?"
    ).bind(limit).all();
    if (!success) throw new Error(error || 'Failed to list system events');
    return { data: results, error: null };
  }

  if (functionName === 'list_audit_log_snapshot') {
    const limit = params.p_limit || 100;
    const { results, success, error } = await env.DB.prepare(
      "SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?"
    ).bind(limit).all();
    if (!success) throw new Error(error || 'Failed to list audit log');
    return { data: results, error: null };
  }

  if (functionName === 'api_clear_audit_and_system_logs') {
    await env.DB.prepare("DELETE FROM audit_log WHERE created_at < datetime('now', '-30 days')").run();
    await env.DB.prepare("DELETE FROM system_events WHERE created_at < datetime('now', '-30 days')").run();
    return { data: { success: true }, error: null };
  }

  if (functionName === 'list_notifications_snapshot') {
    const limit = params.p_limit || 100;
    const { results, success, error } = await env.DB.prepare(
      "SELECT * FROM notifications ORDER BY created_at DESC LIMIT ?"
    ).bind(limit).all();
    if (!success) throw new Error(error || 'Failed to list notifications');
    return { data: results, error: null };
  }

  if (functionName === 'get_database_size_stats') {
    const tables = ['patients', 'appointments', 'doctors', 'users', 'institutions', 'audit_log'];
    const counts: Record<string, number> = {};
    for (const table of tables) {
      const row = await env.DB.prepare(`SELECT COUNT(*) as total FROM ${table}`).first();
      counts[table] = row?.total || 0;
    }
    return { data: counts, error: null };
  }

  if (functionName === 'get_reports_catalog') {
    return { data: [], error: null };
  }

  if (functionName === 'generate_operational_report_snapshot') {
    return { data: { rows: [] }, error: null };
  }

  return { data: null, error: 'Function not implemented' };
};
