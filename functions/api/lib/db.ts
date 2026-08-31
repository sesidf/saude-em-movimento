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

  public async logAudit(_params: {
    userId?: string | null;
    action: string;
    resource: string;
    resourceId?: string | null;
    details?: any;
    institutionId?: string | null;
    ipAddress?: string | null;
  }) {
    // Governança e auditoria desativadas a pedido do usuário (zero consumo de storage e I/O no D1)
    return;
  }
}
