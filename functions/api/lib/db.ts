import { D1Database } from '../types';

export class DatabaseClient {
  private db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  public async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    try {
      const stmt = this.db.prepare(sql);
      const bound = params.length > 0 ? stmt.bind(...params) : stmt;
      const res = await bound.all<T>();
      if (res.error) {
        throw new Error(res.error);
      }
      return (res.results || []) as T[];
    } catch (err: any) {
      console.error(`[DB Error in query] SQL: ${sql} | Params: ${JSON.stringify(params)} | Error:`, err);
      throw err;
    }
  }

  public async first<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    try {
      const stmt = this.db.prepare(sql);
      const bound = params.length > 0 ? stmt.bind(...params) : stmt;
      const res = await bound.first<T>();
      return res || null;
    } catch (err: any) {
      console.error(`[DB Error in first] SQL: ${sql} | Params: ${JSON.stringify(params)} | Error:`, err);
      throw err;
    }
  }

  public async run(sql: string, params: any[] = []): Promise<{ success: boolean; meta: any }> {
    try {
      const stmt = this.db.prepare(sql);
      const bound = params.length > 0 ? stmt.bind(...params) : stmt;
      const res = await bound.run();
      if (res.error) {
        throw new Error(res.error);
      }
      return { success: res.success, meta: res.meta };
    } catch (err: any) {
      console.error(`[DB Error in run] SQL: ${sql} | Params: ${JSON.stringify(params)} | Error:`, err);
      throw err;
    }
  }

  public async logAudit(params: {
    userId?: string | null;
    action: string;
    resource: string;
    resourceId?: string | null;
    details?: any;
    institutionId?: string | null;
    ipAddress?: string | null;
  }) {
    try {
      const id = crypto.randomUUID();
      const sql = `
        INSERT INTO audit_logs (
          id, user_id, action, resource, resource_id, details, institution_id, ip_address, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `;
      await this.run(sql, [
        id,
        params.userId || null,
        params.action,
        params.resource,
        params.resourceId || null,
        params.details ? JSON.stringify(params.details) : null,
        params.institutionId || null,
        params.ipAddress || null,
      ]);
    } catch (e) {
      console.warn('[Audit Log Warning] Failed to insert audit entry:', e);
    }
  }
}
