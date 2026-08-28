import { BaseRepository } from './BaseRepository';

export class AuditRepository extends BaseRepository {
  constructor(db: any) {
    super(db, 'audit_log');
  }

  public async logAction(
    tableName: string,
    recordId: string,
    action: string,
    changedBy: string = 'system'
  ) {
    const sql = `
      INSERT INTO audit_log (id, table_name, record_id, action, changed_by) 
      VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?)
    `;
    return this.execute(sql, [tableName, recordId, action, changedBy]);
  }

  public async pruneOldLogs(days: number = 30) {
    const sql = `DELETE FROM audit_log WHERE created_at < datetime('now', '-${days} days')`;
    return this.execute(sql);
  }

  public async listSnapshot(params: { limit?: number; offset?: number } = {}) {
    const limit = params.limit || 100;
    const offset = params.offset || 0;
    return this.query(`SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ? OFFSET ?`, [limit, offset]);
  }
}
