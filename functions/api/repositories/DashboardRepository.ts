import { BaseRepository } from './BaseRepository';

export class DashboardRepository extends BaseRepository {
  constructor(db: any) {
    super(db, 'dashboard');
  }

  public async getDashboardSnapshot(days: number, institutionId?: string | null) {
    let instFilter = '';
    const instParams: any[] = [];
    if (institutionId) {
      instFilter = ' AND institution_id = ?';
      instParams.push(institutionId);
    }

    const totalPacientes = await this.queryFirst(
      `SELECT COUNT(*) as total FROM patients WHERE deleted_at IS NULL${instFilter}`,
      instParams
    );

    const totalConsultas = await this.queryFirst(
      `SELECT COUNT(*) as total FROM appointments WHERE appointment_date >= datetime('now', '-${days} days') AND deleted_at IS NULL${instFilter}`,
      instParams
    );

    const porStatus = await this.query(
      `SELECT status, COUNT(*) as total FROM appointments WHERE appointment_date >= datetime('now', '-${days} days') AND deleted_at IS NULL${instFilter} GROUP BY status`,
      instParams
    );

    const porDia = await this.query(
      `SELECT date(appointment_date) as dia, COUNT(*) as total FROM appointments WHERE appointment_date >= datetime('now', '-${days} days') AND deleted_at IS NULL${instFilter} GROUP BY date(appointment_date) ORDER BY dia ASC`,
      instParams
    );

    const totalProfissionais = await this.queryFirst(
      `SELECT COUNT(*) as total FROM doctors WHERE is_active = 1`
    );

    return {
      total_pacientes: (totalPacientes as any)?.total || 0,
      total_consultas: (totalConsultas as any)?.total || 0,
      total_profissionais: (totalProfissionais as any)?.total || 0,
      consultas_por_status: porStatus || [],
      consultas_por_dia: porDia || [],
    };
  }

  public async listHistorySnapshot(patientId: string | null, limit: number) {
    let sql = `
      SELECT 
        a.id, a.appointment_date, a.status, a.reason,
        u.full_name as doctor_name,
        s.name as specialty_name,
        a.notes, a.diagnosis, a.prescription as treatment_plan, e.finalized_at
      FROM appointments a
      LEFT JOIN doctors d ON a.doctor_id = d.id
      LEFT JOIN users u ON d.user_id = u.id
      LEFT JOIN specialties s ON a.specialty_id = s.id
      LEFT JOIN encounters e ON a.id = e.appointment_id
      WHERE 1=1
    `;
    const bindParams: any[] = [];
    
    if (patientId) {
      sql += " AND a.patient_id = ?";
      bindParams.push(patientId);
    }
    sql += " ORDER BY a.appointment_date DESC LIMIT ?";
    bindParams.push(limit);
    
    return this.query(sql, bindParams);
  }

  public async listSystemEvents(limit: number) {
    return this.query("SELECT * FROM system_events ORDER BY created_at DESC LIMIT ?", [limit]);
  }

  public async listNotifications(limit: number) {
    return this.query("SELECT * FROM notifications ORDER BY created_at DESC LIMIT ?", [limit]);
  }

  public async clearAuditAndSystemLogs() {
    await this.execute("DELETE FROM audit_log WHERE created_at < datetime('now', '-30 days')");
    await this.execute("DELETE FROM system_events WHERE created_at < datetime('now', '-30 days')");
    return { success: true };
  }

  public async getDatabaseSizeStats() {
    const tables = ['patients', 'appointments', 'doctors', 'users', 'institutions', 'audit_log'];
    const counts: Record<string, number> = {};
    for (const table of tables) {
      const row = await this.queryFirst(`SELECT COUNT(*) as total FROM ${table}`);
      counts[table] = (row as any)?.total || 0;
    }
    return counts;
  }
}
