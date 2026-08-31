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
      const existing = await this.queryFirst("SELECT user_id FROM user_institutions WHERE user_id = ? AND institution_id = ?", [userId, institutionId]);
      if (!existing) {
        await this.execute(
          "INSERT INTO user_institutions (user_id, institution_id) VALUES (?, ?)",
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
          "INSERT INTO user_institutions (user_id, institution_id) VALUES (?, ?)",
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
    const roles = await this.query("SELECT * FROM roles WHERE deleted_at IS NULL");
    const permissions = await this.query("SELECT * FROM permissions WHERE deleted_at IS NULL");
    const rolePermissions = await this.query("SELECT * FROM role_permissions WHERE revoked_at IS NULL");

    const matrix = [];
    
    for (const role of roles as any[]) {
      for (const permission of permissions as any[]) {
        const isGranted = (rolePermissions as any[]).some(
          rp => rp.role_id === role.id && rp.permission_id === permission.id
        );
        
        matrix.push({
          role_id: role.id,
          role_key: role.key,
          role_name: role.name,
          permission_id: permission.id,
          resource: permission.resource,
          resource_label: permission.resource,
          action: permission.action,
          action_label: permission.action,
          scope: 'global',
          granted: isGranted,
          applicable: true,
          effective_allowed: isGranted,
          editable: role.is_system ? false : true,
          locked: role.is_system ? true : false
        });
      }
    }

    return {
      roles,
      resources: Array.from(new Set((permissions as any[]).map((p: any) => p.resource))),
      actions: Array.from(new Set((permissions as any[]).map((p: any) => p.action))),
      matrix,
      role_permissions: rolePermissions
    };
  }

  public async grantPermission(roleId: string, permissionId: string, institutionId?: string) {
    const existing = await this.queryFirst(
      "SELECT id FROM role_permissions WHERE role_id = ? AND permission_id = ? AND revoked_at IS NULL", 
      [roleId, permissionId]
    );
    if (!existing) {
      await this.execute(
        "INSERT INTO role_permissions (id, role_id, permission_id, institution_id) VALUES (lower(hex(randomblob(16))), ?, ?, ?)",
        [roleId, permissionId, institutionId || null]
      );
    }
    return { success: true };
  }

  public async revokePermission(roleId: string, permissionId: string) {
    await this.execute(
      "UPDATE role_permissions SET revoked_at = CURRENT_TIMESTAMP WHERE role_id = ? AND permission_id = ? AND revoked_at IS NULL",
      [roleId, permissionId]
    );
    return { success: true };
  }

  public async deleteRole(roleId: string) {
    await this.execute("UPDATE roles SET deleted_at = CURRENT_TIMESTAMP, is_active = false WHERE id = ?", [roleId]);
    return { success: true };
  }
}
