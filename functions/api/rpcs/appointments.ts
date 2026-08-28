export const handleAppointmentsRpc = async (env: any, functionName: string, params: any) => {
  if (functionName === 'list_appointments_snapshot') {
    const limit = params.p_limit || 1000;
    const institutionId = params.p_institution_id || null;
    const doctorId = params.p_doctor_id || null;
    const patientId = params.p_patient_id || null;
    const startDate = params.p_start_date || null;
    const endDate = params.p_end_date || null;

    let query = `
      SELECT 
        a.*,
        u.full_name as doctor_name,
        s.name as specialty_name,
        p.full_name as patient_name, p.cpf as patient_cpf, p.phone as patient_phone
      FROM appointments a
      LEFT JOIN doctors d ON a.doctor_id = d.id
      LEFT JOIN users u ON d.user_id = u.id
      LEFT JOIN specialties s ON a.specialty_id = s.id
      LEFT JOIN patients p ON a.patient_id = p.id
      WHERE a.deleted_at IS NULL
    `;
    const bindParams: any[] = [];

    if (institutionId) { query += " AND a.institution_id = ?"; bindParams.push(institutionId); }
    if (doctorId) { query += " AND a.doctor_id = ?"; bindParams.push(doctorId); }
    if (patientId) { query += " AND a.patient_id = ?"; bindParams.push(patientId); }
    if (startDate) { query += " AND a.appointment_date >= ?"; bindParams.push(startDate); }
    if (endDate) { query += " AND a.appointment_date <= ?"; bindParams.push(endDate); }
    
    query += " ORDER BY a.appointment_date DESC LIMIT ?";
    bindParams.push(limit);

    const { results, success, error } = await env.DB.prepare(query).bind(...bindParams).all();
    if (!success) throw new Error(error || 'Failed to list appointments');
    return { data: results, error: null };
  }

  if (functionName === 'api_schedule_appointment') {
    const payload = params.p_payload;
    if (!payload?.id) throw new Error('Invalid payload: missing id');
    
    const query = `
      INSERT INTO appointments (id, patient_id, doctor_id, specialty_id, institution_id, appointment_date, end_date, status, reason, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const { success, error } = await env.DB.prepare(query).bind(
      payload.id, payload.patient_id, payload.doctor_id, payload.specialty_id,
      payload.institution_id, payload.appointment_date, payload.end_date || null,
      payload.status || 'scheduled', payload.reason || null, payload.created_by || 'system'
    ).run();
    if (!success) throw new Error(error || 'Failed to schedule appointment');
    return { data: { success: true, id: payload.id }, error: null };
  }

  if (functionName === 'api_set_appointment_status') {
    const { p_appointment_id, p_status, p_reason, p_user_id } = params;
    const { success, error } = await env.DB.prepare(
      "UPDATE appointments SET status = ?, reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(p_status, p_reason || null, p_appointment_id).run();
    if (!success) throw new Error(error || 'Failed to update appointment status');
    // Audit log
    await env.DB.prepare(
      "INSERT INTO audit_log (id, table_name, record_id, action, changed_by, new_values) VALUES (lower(hex(randomblob(16))), 'appointments', ?, 'STATUS_CHANGE', ?, ?)"
    ).bind(p_appointment_id, p_user_id || 'system', JSON.stringify({ status: p_status })).run();
    return { data: { success: true }, error: null };
  }

  if (functionName === 'api_reschedule_appointment') {
    const { p_appointment_id, p_new_start, p_new_end, p_reason } = params;
    const { success, error } = await env.DB.prepare(
      "UPDATE appointments SET appointment_date = ?, end_date = ?, reason = ?, status = 'rescheduled', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(p_new_start, p_new_end || null, p_reason || 'Reagendamento', p_appointment_id).run();
    if (!success) throw new Error(error || 'Failed to reschedule appointment');
    return { data: { success: true }, error: null };
  }

  if (functionName === 'api_start_encounter') {
    const { p_appointment_id, p_user_id } = params;
    // Cria ou atualiza encounter
    const existing = await env.DB.prepare("SELECT id FROM encounters WHERE appointment_id = ?").bind(p_appointment_id).first();
    if (!existing) {
      await env.DB.prepare(
        "INSERT INTO encounters (id, appointment_id, started_at, started_by) VALUES (lower(hex(randomblob(16))), ?, CURRENT_TIMESTAMP, ?)"
      ).bind(p_appointment_id, p_user_id || 'system').run();
    }
    await env.DB.prepare(
      "UPDATE appointments SET status = 'in_progress', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(p_appointment_id).run();
    return { data: { success: true }, error: null };
  }

  if (functionName === 'api_finalize_encounter') {
    const { p_appointment_id, p_notes, p_diagnosis, p_treatment_plan, p_user_id } = params;
    await env.DB.prepare(
      "UPDATE encounters SET notes = ?, diagnosis = ?, treatment_plan = ?, finalized_at = CURRENT_TIMESTAMP WHERE appointment_id = ?"
    ).bind(p_notes || null, p_diagnosis || null, p_treatment_plan || null, p_appointment_id).run();
    await env.DB.prepare(
      "UPDATE appointments SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(p_appointment_id).run();
    return { data: { success: true }, error: null };
  }

  if (functionName === 'api_reorganize_schedule_conflicts') {
    // Marca consultas conflitantes como 'rescheduled'
    const { p_doctor_id, p_date } = params;
    const { success, error } = await env.DB.prepare(
      "UPDATE appointments SET status = 'rescheduled', updated_at = CURRENT_TIMESTAMP WHERE doctor_id = ? AND date(appointment_date) = date(?) AND status = 'scheduled'"
    ).bind(p_doctor_id, p_date).run();
    return { data: { success: true }, error: null };
  }

  if (functionName === 'get_patient_scheduling_guard') {
    const { p_patient_id, p_institution_id } = params;
    // Consultas ativas do paciente hoje
    const today = new Date().toISOString().split('T')[0];
    const { results } = await env.DB.prepare(
      "SELECT * FROM appointments WHERE patient_id = ? AND date(appointment_date) = date(?) AND status NOT IN ('cancelled', 'completed')"
    ).bind(p_patient_id, today).all();
    return { data: { active_today: (results || []).length, appointments: results || [] }, error: null };
  }

  if (functionName === 'get_schedule_admin_snapshot') {
    const { p_doctor_id, p_start_date, p_end_date } = params;
    const availability = await env.DB.prepare(
      "SELECT * FROM doctor_availability WHERE doctor_id = ? AND is_active = 1"
    ).bind(p_doctor_id).all();
    const blocks = await env.DB.prepare(
      "SELECT * FROM schedule_blocks WHERE doctor_id = ? AND end_at >= ? AND start_at <= ?"
    ).bind(p_doctor_id, p_start_date || new Date().toISOString(), p_end_date || new Date().toISOString()).all();
    return { data: { availability: availability?.results || [], blocks: blocks?.results || [] }, error: null };
  }

  if (functionName === 'api_set_doctor_availability') {
    const payload = params.p_payload;
    const doctorId = params.p_doctor_id;
    const weekday = params.p_weekday;
    // Remove existing for this doctor+weekday
    await env.DB.prepare("DELETE FROM doctor_availability WHERE doctor_id = ? AND weekday = ?").bind(doctorId, weekday).run();
    // Insert new
    if (payload && payload.starts_at) {
      await env.DB.prepare(
        "INSERT INTO doctor_availability (id, doctor_id, weekday, starts_at, ends_at, slot_minutes, is_active) VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, 1)"
      ).bind(doctorId, weekday, payload.starts_at, payload.ends_at, payload.slot_minutes || 30).run();
    }
    return { data: { success: true }, error: null };
  }

  if (functionName === 'api_archive_schedule_block') {
    const { p_block_id } = params;
    await env.DB.prepare("UPDATE schedule_blocks SET is_active = 0 WHERE id = ?").bind(p_block_id).run();
    return { data: { success: true }, error: null };
  }

  if (functionName === 'list_patients_catalog') {
    // Delegação alternativa — mesmo resultado de patients.ts
    const search = params.p_search || null;
    const limit = params.p_limit || 100;
    let query = "SELECT * FROM patients WHERE deleted_at IS NULL";
    const bindParams: any[] = [];
    if (search) {
      query += " AND (full_name LIKE ? OR cpf LIKE ? OR phone LIKE ?)";
      const likeSearch = '%' + search + '%';
      bindParams.push(likeSearch, likeSearch, likeSearch);
    }
    query += " ORDER BY full_name ASC LIMIT ?";
    bindParams.push(limit);
    const { results, success, error } = await env.DB.prepare(query).bind(...bindParams).all();
    if (!success) throw new Error(error || 'Failed to list patients');
    return { data: results, error: null };
  }

  if (functionName === 'importar_dados_planilha') {
    // Import de dados em lote
    const { p_rows, p_table } = params;
    if (!Array.isArray(p_rows) || !p_table) {
      return { data: { imported: 0 }, error: 'Invalid payload' };
    }
    const allowed = ['patients', 'doctors', 'appointments'];
    if (!allowed.includes(p_table)) return { data: null, error: 'Table not allowed' };

    let imported = 0;
    for (const row of p_rows) {
      try {
        const keys = Object.keys(row);
        const vals = Object.values(row);
        const placeholders = keys.map(() => '?').join(', ');
        await env.DB.prepare(`INSERT OR IGNORE INTO ${p_table} (${keys.join(', ')}) VALUES (${placeholders})`).bind(...vals).run();
        imported++;
      } catch (_) {}
    }
    return { data: { imported }, error: null };
  }

  // --- Prontuário médico ---
  if (functionName === 'add_medical_record_entry') {
    const { p_encounter_id, p_entry_type, p_clinical_data, p_user_id, p_institution_id } = params;
    if (!p_encounter_id || !p_entry_type) return { data: null, error: 'encounter_id e entry_type são obrigatórios' };

    // Busca a última versão do prontuário para este atendimento
    const lastVersion = await env.DB.prepare(
      "SELECT COALESCE(MAX(version), 0) as v FROM medical_record_entries WHERE encounter_id = ?"
    ).bind(p_encounter_id).first() as any;
    const nextVersion = (lastVersion?.v || 0) + 1;

    await env.DB.prepare(
      "INSERT INTO medical_record_entries (id, institution_id, encounter_id, version, entry_type, clinical_data, created_by) VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?)"
    ).bind(p_institution_id || null, p_encounter_id, nextVersion, p_entry_type, JSON.stringify(p_clinical_data || {}), p_user_id || 'system').run();

    return { data: { success: true, version: nextVersion }, error: null };
  }

  // --- Criar bloqueio de agenda ---
  if (functionName === 'api_create_schedule_block') {
    const { p_doctor_id, p_start_at, p_end_at, p_reason } = params;
    if (!p_doctor_id || !p_start_at || !p_end_at) return { data: null, error: 'doctor_id, start_at e end_at são obrigatórios' };

    // Em SQLite, armazenamos como JSON de intervalo (não tem tipo tstzrange)
    const blockRange = JSON.stringify({ start: p_start_at, end: p_end_at });
    const { success, error } = await env.DB.prepare(
      "INSERT INTO schedule_blocks (id, doctor_id, block_range, reason) VALUES (lower(hex(randomblob(16))), ?, ?, ?)"
    ).bind(p_doctor_id, blockRange, p_reason || 'Bloqueio de agenda').run();
    if (!success) throw new Error(error || 'Failed to create block');
    return { data: { success: true }, error: null };
  }

  // --- Limpar todos os bloqueios de agenda de um médico ---
  if (functionName === 'api_clear_all_schedule_blocks') {
    const { p_doctor_id } = params;
    if (p_doctor_id) {
      await env.DB.prepare("DELETE FROM schedule_blocks WHERE doctor_id = ?").bind(p_doctor_id).run();
    } else {
      // Se não passar doctor_id, limpa bloqueios já expirados
      await env.DB.prepare("DELETE FROM schedule_blocks WHERE json_extract(block_range, '$.end') < datetime('now')").run();
    }
    return { data: { success: true }, error: null };
  }

  return { data: null, error: `RPC '${functionName}' não implementado` };
};
