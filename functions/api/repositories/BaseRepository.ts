export class BaseRepository {
  protected db: any;
  protected tableName: string;

  constructor(db: any, tableName: string) {
    this.db = db;
    this.tableName = tableName;
  }

  public async query(sql: string, params: any[] = []) {
    const { results, success, error } = await this.db.prepare(sql).bind(...params).all();
    if (!success) {
      throw new Error(error || `Database error executing query: ${sql}`);
    }
    return results;
  }

  public async queryFirst(sql: string, params: any[] = []) {
    const result = await this.db.prepare(sql).bind(...params).first();
    return result;
  }

  public async execute(sql: string, params: any[] = []) {
    const { success, error } = await this.db.prepare(sql).bind(...params).run();
    if (!success) {
      throw new Error(error || `Database error executing command: ${sql}`);
    }
    return success;
  }

  public async findMany(
    options: { where?: string; params?: any[]; limit?: number; orderBy?: string } = {}
  ) {
    let sql = `SELECT * FROM ${this.tableName}`;
    const bindParams = options.params || [];

    if (options.where) {
      sql += ` WHERE ${options.where}`;
    }

    if (options.orderBy) {
      sql += ` ORDER BY ${options.orderBy}`;
    }

    if (options.limit) {
      sql += ` LIMIT ?`;
      bindParams.push(options.limit);
    }

    return this.query(sql, bindParams);
  }

  public async findOne(id: string) {
    return this.queryFirst(`SELECT * FROM ${this.tableName} WHERE id = ?`, [id]);
  }

  public async findFirst(where: string, params: any[] = []) {
    return this.queryFirst(`SELECT * FROM ${this.tableName} WHERE ${where} LIMIT 1`, params);
  }

  public async count(where?: string, params: any[] = []) {
    let sql = `SELECT count(*) as count FROM ${this.tableName}`;
    if (where) {
      sql += ` WHERE ${where}`;
    }
    const result = await this.queryFirst(sql, params);
    return (result as any)?.count || 0;
  }

  public async insert(payload: Record<string, any>) {
    if (Object.keys(payload).length === 0) throw new Error('Empty payload for insert');
    
    // Ensure id is present or generated if it's typically a UUID, but we rely on the caller to provide it or the DB.
    // In this system, UUIDs are generated via randomblob(16) hex string.
    
    const keys = Object.keys(payload);
    const placeholders = keys.map(() => '?').join(', ');
    const values = Object.values(payload);

    const sql = `INSERT INTO ${this.tableName} (${keys.join(', ')}) VALUES (${placeholders}) RETURNING *`;
    const result = await this.db.prepare(sql).bind(...values).first();
    return result;
  }

  public async update(id: string, payload: Record<string, any>) {
    if (Object.keys(payload).length === 0) return true;

    const keys = Object.keys(payload);
    const setClause = keys.map(k => `${k} = ?`).join(', ');
    const values = [...Object.values(payload), id];

    const sql = `UPDATE ${this.tableName} SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
    return this.execute(sql, values);
  }

  public async delete(id: string) {
    return this.execute(`DELETE FROM ${this.tableName} WHERE id = ?`, [id]);
  }

  public async softDelete(id: string, deletedBy: string = 'system') {
    return this.execute(
      `UPDATE ${this.tableName} SET deleted_at = CURRENT_TIMESTAMP, deleted_by = ?, is_active = 0 WHERE id = ?`,
      [deletedBy, id]
    );
  }
}
