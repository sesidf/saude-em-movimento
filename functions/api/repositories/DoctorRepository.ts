import { BaseRepository } from './BaseRepository';

export class DoctorRepository extends BaseRepository {
  constructor(db: any) {
    super(db, 'doctors');
  }

  public async listDoctorsCatalog(search?: string | null) {
    let sql = `
      SELECT d.*, u.full_name as user_full_name, u.email 
      FROM doctors d 
      LEFT JOIN users u ON d.user_id = u.id
    `;
    const bindParams: any[] = [];
    
    if (search) {
      sql += " WHERE u.full_name LIKE ? OR d.crm LIKE ?";
      const likeSearch = '%' + search + '%';
      bindParams.push(likeSearch, likeSearch);
    }
    sql += " ORDER BY u.full_name ASC";
    
    return this.query(sql, bindParams);
  }

  public async setDoctorActive(doctorId: string, isActive: boolean) {
    return this.update(doctorId, { is_active: isActive ? 1 : 0 });
  }

  public async listSpecialtiesCatalog(search?: string | null) {
    let sql = "SELECT * FROM specialties";
    const bindParams: any[] = [];
    
    if (search) {
      sql += " WHERE name LIKE ?";
      bindParams.push('%' + search + '%');
    }
    sql += " ORDER BY name ASC";
    
    return this.query(sql, bindParams);
  }

  public async upsertSpecialty(payload: any) {
    if (!payload || !payload.id) throw new Error('Invalid payload');
    
    const existing = await this.queryFirst("SELECT id FROM specialties WHERE id = ?", [payload.id]);
    
    if (existing) {
      await this.execute("UPDATE specialties SET name = ?, description = ?, is_active = ? WHERE id = ?", [
        payload.name,
        payload.description,
        payload.is_active ? 1 : 0,
        payload.id
      ]);
    } else {
      await this.execute("INSERT INTO specialties (id, name, description, is_active) VALUES (?, ?, ?, ?)", [
        payload.id,
        payload.name,
        payload.description,
        payload.is_active ? 1 : 0
      ]);
    }
    return { success: true };
  }

  public async setSpecialtyActive(specialtyId: string, isActive: boolean) {
    await this.execute("UPDATE specialties SET is_active = ? WHERE id = ?", [isActive ? 1 : 0, specialtyId]);
    return { success: true };
  }
}
