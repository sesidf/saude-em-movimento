import { BaseRepository } from './BaseRepository';

export class UserRepository extends BaseRepository {
  constructor(db: any) {
    super(db, 'users');
  }

  public async getAccessControlSnapshot(institutionId?: string | null) {
    let instFilter = '';
    const instParams: any[] = [];
    if (institutionId) {
      instFilter = ' WHERE ui.institution_id = ?';
      instParams.push(institutionId);
    }

    const usersSql = `
      SELECT u.id, u.full_name, u.email, u.phone, u.is_active, u.auth_status,
             u.primary_institution_id, u.created_at
      FROM users u
      ${institutionId ? 'JOIN user_institutions ui ON ui.user_id = u.id' + instFilter : ''}
      ORDER BY u.full_name ASC
    `;
    const users = await this.query(usersSql, instParams);
    
    const roles = await this.query("SELECT * FROM roles");
    const userRoles = await this.query("SELECT * FROM user_roles");
    const userInstitutions = await this.query("SELECT * FROM user_institutions");
    const institutions = await this.query("SELECT * FROM institutions");

    return {
      users: users || [],
      roles: roles || [],
      user_roles: userRoles || [],
      user_institutions: userInstitutions || [],
      institutions: institutions || []
    };
  }

  public async getUserEffectivePermissions(userId: string) {
    const sql = `
      SELECT ur.*, r.name as role_name, r.permissions
      FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = ?
    `;
    return this.query(sql, [userId]);
  }

  public async setUserActive(userId: string, isActive: boolean) {
    await this.update(userId, { is_active: isActive ? 1 : 0 });
    return { success: true };
  }

  public async linkUserInstitution(userId: string, institutionId: string, action: string) {
    if (action === 'remove') {
      await this.execute("DELETE FROM user_institutions WHERE user_id = ? AND institution_id = ?", [userId, institutionId]);
    } else {
      const existing = await this.queryFirst("SELECT id FROM user_institutions WHERE user_id = ? AND institution_id = ?", [userId, institutionId]);
      if (!existing) {
        await this.execute(
          "INSERT INTO user_institutions (id, user_id, institution_id) VALUES (lower(hex(randomblob(16))), ?, ?)",
          [userId, institutionId]
        );
      }
    }
    return { success: true };
  }

  public async syncUserInstitutions(userId: string, institutionIds: string[]) {
    await this.execute("DELETE FROM user_institutions WHERE user_id = ?", [userId]);
    if (Array.isArray(institutionIds)) {
      for (const instId of institutionIds) {
        await this.execute(
          "INSERT INTO user_institutions (id, user_id, institution_id) VALUES (lower(hex(randomblob(16))), ?, ?)",
          [userId, instId]
        );
      }
    }
    return { success: true };
  }

  public async setUserAccessProfile(userId: string, roleId: string, institutionId?: string) {
    const existing = await this.queryFirst("SELECT id FROM user_roles WHERE user_id = ? AND institution_id = ?", [userId, institutionId || null]);
    if (existing) {
      await this.execute("UPDATE user_roles SET role_id = ? WHERE id = ?", [roleId, (existing as any).id]);
    } else {
      await this.execute(
        "INSERT INTO user_roles (id, user_id, role_id, institution_id) VALUES (lower(hex(randomblob(16))), ?, ?, ?)",
        [userId, roleId, institutionId || null]
      );
    }
    return { success: true };
  }

  public async setUserOperationalProfile(userId: string, metadata: any) {
    const metaStr = JSON.stringify(metadata || {});
    await this.execute("UPDATE users SET metadata = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [metaStr, userId]);
    return { success: true };
  }

  public async getPermissionsMatrix() {
    return this.query("SELECT * FROM roles");
  }
}
