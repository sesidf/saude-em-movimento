import { BaseRepository } from './BaseRepository';

export class InstitutionRepository extends BaseRepository {
  constructor(db: any) {
    super(db, 'institutions');
  }

  public async listCatalog(search?: string | null) {
    let sql = "SELECT * FROM institutions";
    const bindParams: any[] = [];
    
    if (search) {
      sql += " WHERE name LIKE ? OR cnpj LIKE ?";
      const likeSearch = '%' + search + '%';
      bindParams.push(likeSearch, likeSearch);
    }
    sql += " ORDER BY name ASC";
    
    return this.query(sql, bindParams);
  }

  public async upsert(payload: any) {
    if (!payload || !payload.id) throw new Error('Invalid payload');
    
    const existing = await this.findOne(payload.id);
    
    if (existing) {
      await this.update(payload.id, {
        name: payload.name,
        cnpj: payload.cnpj,
        email: payload.email,
        phone: payload.phone,
        address: payload.address,
        city: payload.city,
        state: payload.state,
        is_active: payload.is_active ? 1 : 0
      });
    } else {
      await this.insert({
        id: payload.id,
        name: payload.name,
        cnpj: payload.cnpj,
        email: payload.email,
        phone: payload.phone,
        address: payload.address,
        city: payload.city,
        state: payload.state,
        is_active: payload.is_active ? 1 : 0
      });
    }
    return { success: true };
  }

  public async setActive(institutionId: string, isActive: boolean) {
    await this.update(institutionId, { is_active: isActive ? 1 : 0 });
    return { success: true };
  }

  public async softDeleteInstitution(institutionId: string) {
    // Current RPC uses deleted_at logic but doesn't set deleted_by or is_active=0 directly in the snippet.
    // Our BaseRepository softDelete sets is_active=0 and deleted_at.
    await this.softDelete(institutionId, 'system');
    return { success: true };
  }
}
