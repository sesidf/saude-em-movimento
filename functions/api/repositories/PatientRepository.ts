import { BaseRepository } from './BaseRepository';
import { AuditRepository } from './AuditRepository';

export class PatientRepository extends BaseRepository {
  private auditRepo: AuditRepository;

  constructor(db: any) {
    super(db, 'patients');
    this.auditRepo = new AuditRepository(db);
  }

  public async listCatalog(params: { search?: string | null; limit?: number }) {
    const search = params.search || null;
    const limit = params.limit || 100;
    
    let sql = "SELECT * FROM patients WHERE deleted_at IS NULL";
    const bindParams: any[] = [];
    
    if (search) {
      sql += " AND (full_name LIKE ? OR cpf LIKE ? OR phone LIKE ?)";
      const likeSearch = '%' + search + '%';
      bindParams.push(likeSearch, likeSearch, likeSearch);
    }
    sql += " ORDER BY full_name ASC LIMIT ?";
    bindParams.push(limit);
    
    return this.query(sql, bindParams);
  }

  public async upsert(payload: any, userId: string = 'system') {
    if (!payload || !payload.id) throw new Error('Invalid payload');
    
    const existing = await this.findOne(payload.id);
    let action = 'INSERT';
    
    if (existing) {
      action = 'UPDATE';
      await this.update(payload.id, payload);
    } else {
      await this.insert(payload);
    }
    
    await this.auditRepo.logAction('patients', payload.id, action, userId);
    return { success: true, id: payload.id };
  }

  public async checkCpf(cpf: string, excludeId?: string) {
    if (!cpf) return [];
    let sql = 'SELECT id, full_name FROM patients WHERE cpf = ? AND deleted_at IS NULL';
    const bindParams: any[] = [cpf];
    if (excludeId) {
      sql += ' AND id != ?';
      bindParams.push(excludeId);
    }
    return this.query(sql, bindParams);
  }

  public async setActive(patientId: string, isActive: boolean) {
    return this.update(patientId, { is_active: isActive ? 1 : 0 });
  }

  public async softDeletePatient(patientId: string, deletedBy: string) {
    await this.softDelete(patientId, deletedBy);
    await this.auditRepo.logAction('patients', patientId, 'SOFT_DELETE', deletedBy);
    return { success: true };
  }
}
