import { BaseRepository } from './BaseRepository';

export class AppointmentRepository extends BaseRepository {
  constructor(db: any) {
    super(db, 'appointments');
  }

  public async listAppointmentsSnapshot(params: any) {
    const limit = params.limit || 1000;
    let sql = `
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

    if (params.institutionId) { sql += " AND a.institution_id = ?"; bindParams.push(params.institutionId); }
    if (params.doctorId) { sql += " AND a.doctor_id = ?"; bindParams.push(params.doctorId); }
    if (params.patientId) { sql += " AND a.patient_id = ?"; bindParams.push(params.patientId); }
    if (params.startDate) { sql += " AND a.appointment_date >= ?"; bindParams.push(params.startDate); }
    if (params.endDate) { sql += " AND a.appointment_date <= ?"; bindParams.push(params.endDate); }
    
    sql += " ORDER BY a.appointment_date DESC LIMIT ?";
    bindParams.push(limit);

    return this.query(sql, bindParams);
  }

  public async scheduleAppointment(payload: any) {
    if (!payload?.id) throw new Error('Invalid payload: missing id');
    
    await this.insert({
      id: payload.id,
      patient_id: payload.patient_id,
      doctor_id: payload.doctor_id,
      specialty_id: payload.specialty_id,
      institution_id: payload.institution_id,
      appointment_date: payload.appointment_date,
      end_date: payload.end_date || null,
      status: payload.status || 'scheduled',
      reason: payload.reason || null,
      created_by: payload.created_by || 'system'
    });
    
    return { success: true, id: payload.id };
  }

  public async setAppointmentStatus(appointmentId: string, status: string, reason: string | null) {
    await this.update(appointmentId, { status, reason: reason || null });
    return { success: true };
  }

  public async rescheduleAppointment(appointmentId: string, newStart: string, newEnd: string | null, reason: string | null) {
    await this.update(appointmentId, {
      appointment_date: newStart,
      end_date: newEnd || null,
      reason: reason || 'Reagendamento',
      status: 'rescheduled'
    });
    return { success: true };
  }

  public async startEncounter(appointmentId: string, userId: string) {
    const existing = await this.queryFirst("SELECT id FROM encounters WHERE appointment_id = ?", [appointmentId]);
    if (!existing) {
      await this.execute(
        "INSERT INTO encounters (id, appointment_id, started_at, started_by) VALUES (lower(hex(randomblob(16))), ?, CURRENT_TIMESTAMP, ?)",
        [appointmentId, userId || 'system']
      );
    }
    await this.update(appointmentId, { status: 'in_progress' });
    return { success: true };
  }

  public async finalizeEncounter(appointmentId: string, notes: string | null, diagnosis: string | null, treatmentPlan: string | null) {
    await this.execute(
      "UPDATE encounters SET notes = ?, diagnosis = ?, treatment_plan = ?, finalized_at = CURRENT_TIMESTAMP WHERE appointment_id = ?",
      [notes || null, diagnosis || null, treatmentPlan || null, appointmentId]
    );
    await this.update(appointmentId, { status: 'completed' });
    return { success: true };
  }

  public async reorganizeScheduleConflicts(doctorId: string, date: string) {
    await this.execute(
      "UPDATE appointments SET status = 'rescheduled', updated_at = CURRENT_TIMESTAMP WHERE doctor_id = ? AND date(appointment_date) = date(?) AND status = 'scheduled'",
      [doctorId, date]
    );
    return { success: true };
  }

  public async getPatientSchedulingGuard(patientId: string) {
    const today = new Date().toISOString().split('T')[0];
    const results = await this.query(
      "SELECT * FROM appointments WHERE patient_id = ? AND date(appointment_date) = date(?) AND status NOT IN ('cancelled', 'completed')",
      [patientId, today]
    );
    return { active_today: (results || []).length, appointments: results || [] };
  }

  public async getScheduleAdminSnapshot(doctorId: string, startDate: string, endDate: string) {
    const availability = await this.query(
      "SELECT * FROM doctor_availability WHERE doctor_id = ? AND is_active = 1",
      [doctorId]
    );
    const blocks = await this.query(
      "SELECT * FROM schedule_blocks WHERE doctor_id = ? AND end_at >= ? AND start_at <= ?",
      [doctorId, startDate, endDate]
    );
    return { availability: availability || [], blocks: blocks || [] };
  }

  public async setDoctorAvailability(doctorId: string, weekday: number, payload: any) {
    await this.execute("DELETE FROM doctor_availability WHERE doctor_id = ? AND weekday = ?", [doctorId, weekday]);
    if (payload && payload.starts_at) {
      await this.execute(
        "INSERT INTO doctor_availability (id, doctor_id, weekday, starts_at, ends_at, slot_minutes, is_active) VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, 1)",
        [doctorId, weekday, payload.starts_at, payload.ends_at, payload.slot_minutes || 30]
      );
    }
    return { success: true };
  }

  public async archiveScheduleBlock(blockId: string) {
    await this.execute("UPDATE schedule_blocks SET is_active = 0 WHERE id = ?", [blockId]);
    return { success: true };
  }

  public async importarDadosPlanilha(rows: any[], tableName: string) {
    if (!Array.isArray(rows) || !tableName) return { imported: 0 };
    const allowed = ['patients', 'doctors', 'appointments'];
    if (!allowed.includes(tableName)) throw new Error('Table not allowed');

    let imported = 0;
    for (const row of rows) {
      try {
        const keys = Object.keys(row);
        const vals = Object.values(row);
        const placeholders = keys.map(() => '?').join(', ');
        await this.execute(`INSERT OR IGNORE INTO ${tableName} (${keys.join(', ')}) VALUES (${placeholders})`, vals);
        imported++;
      } catch (_) {
        // Ignore individual errors
      }
    }
    return { imported };
  }

  public async addMedicalRecordEntry(encounterId: string, entryType: string, clinicalData: any, userId: string, institutionId: string) {
    const lastVersion = await this.queryFirst(
      "SELECT COALESCE(MAX(version), 0) as v FROM medical_record_entries WHERE encounter_id = ?",
      [encounterId]
    );
    const nextVersion = ((lastVersion as any)?.v || 0) + 1;

    await this.execute(
      "INSERT INTO medical_record_entries (id, institution_id, encounter_id, version, entry_type, clinical_data, created_by) VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?)",
      [institutionId || null, encounterId, nextVersion, entryType, JSON.stringify(clinicalData || {}), userId || 'system']
    );

    return { success: true, version: nextVersion };
  }

  public async createScheduleBlock(doctorId: string, startAt: string, endAt: string, reason: string | null) {
    const blockRange = JSON.stringify({ start: startAt, end: endAt });
    await this.execute(
      "INSERT INTO schedule_blocks (id, doctor_id, block_range, reason) VALUES (lower(hex(randomblob(16))), ?, ?, ?)",
      [doctorId, blockRange, reason || 'Bloqueio de agenda']
    );
    return { success: true };
  }

  public async clearAllScheduleBlocks(doctorId?: string) {
    if (doctorId) {
      await this.execute("DELETE FROM schedule_blocks WHERE doctor_id = ?", [doctorId]);
    } else {
      await this.execute("DELETE FROM schedule_blocks WHERE json_extract(block_range, '$.end') < datetime('now')");
    }
    return { success: true };
  }
}
