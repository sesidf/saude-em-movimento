export const handleUsersRpc = async (env: any, functionName: string, params: any) => {
  if (functionName === 'get_access_control_snapshot') {
    const institutionId = params.p_institution_id || null;
    let instFilter = '';
    const instParams: any[] = [];
    if (institutionId) {
      instFilter = ' WHERE ui.institution_id = ?';
      instParams.push(institutionId);
    }

    const users = await env.DB.prepare(`
      SELECT u.id, u.full_name, u.email, u.phone, u.is_active, u.auth_status,
             u.primary_institution_id, u.created_at
      FROM users u
      ${institutionId ? 'JOIN user_institutions ui ON ui.user_id = u.id' + instFilter : ''}
      ORDER BY u.full_name ASC
    `).bind(...instParams).all();

    const roles = await env.DB.prepare("SELECT * FROM roles").all();
    const userRoles = await env.DB.prepare("SELECT * FROM user_roles").all();
    const userInstitutions = await env.DB.prepare("SELECT * FROM user_institutions").all();
    const institutions = await env.DB.prepare("SELECT * FROM institutions").all();

    return {
      data: {
        users: users?.results || [],
        roles: roles?.results || [],
        user_roles: userRoles?.results || [],
        user_institutions: userInstitutions?.results || [],
        institutions: institutions?.results || [],
      },
      error: null
    };
  }

  if (functionName === 'get_user_effective_permissions') {
    const userId = params.p_user_id;
    const userRoles = await env.DB.prepare(`
      SELECT ur.*, r.name as role_name, r.permissions
      FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = ?
    `).bind(userId).all();
    return { data: userRoles?.results || [], error: null };
  }

  if (functionName === 'set_user_active') {
    const { p_user_id, p_is_active } = params;
    const { success, error } = await env.DB.prepare(
      "UPDATE users SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(p_is_active ? 1 : 0, p_user_id).run();
    if (!success) throw new Error(error || 'Failed to update user');
    return { data: { success: true }, error: null };
  }

  if (functionName === 'link_user_institution') {
    const { p_user_id, p_institution_id, p_action } = params;
    if (p_action === 'remove') {
      await env.DB.prepare("DELETE FROM user_institutions WHERE user_id = ? AND institution_id = ?")
        .bind(p_user_id, p_institution_id).run();
    } else {
      // Upsert
      const existing = await env.DB.prepare("SELECT id FROM user_institutions WHERE user_id = ? AND institution_id = ?")
        .bind(p_user_id, p_institution_id).first();
      if (!existing) {
        await env.DB.prepare(
          "INSERT INTO user_institutions (id, user_id, institution_id) VALUES (lower(hex(randomblob(16))), ?, ?)"
        ).bind(p_user_id, p_institution_id).run();
      }
    }
    return { data: { success: true }, error: null };
  }

  if (functionName === 'sync_user_institutions') {
    const { p_user_id, p_institution_ids } = params;
    // Remove all
    await env.DB.prepare("DELETE FROM user_institutions WHERE user_id = ?").bind(p_user_id).run();
    // Re-add
    if (Array.isArray(p_institution_ids)) {
      for (const instId of p_institution_ids) {
        await env.DB.prepare(
          "INSERT INTO user_institutions (id, user_id, institution_id) VALUES (lower(hex(randomblob(16))), ?, ?)"
        ).bind(p_user_id, instId).run();
      }
    }
    return { data: { success: true }, error: null };
  }

  if (functionName === 'set_user_access_profile') {
    const { p_user_id, p_role_id, p_institution_id } = params;
    // Upsert user role
    const existing = await env.DB.prepare("SELECT id FROM user_roles WHERE user_id = ? AND institution_id = ?")
      .bind(p_user_id, p_institution_id || null).first();
    if (existing) {
      await env.DB.prepare("UPDATE user_roles SET role_id = ? WHERE id = ?")
        .bind(p_role_id, (existing as any).id).run();
    } else {
      await env.DB.prepare(
        "INSERT INTO user_roles (id, user_id, role_id, institution_id) VALUES (lower(hex(randomblob(16))), ?, ?, ?)"
      ).bind(p_user_id, p_role_id, p_institution_id || null).run();
    }
    return { data: { success: true }, error: null };
  }

  if (functionName === 'set_user_operational_profile') {
    const { p_user_id, p_metadata } = params;
    const metaStr = JSON.stringify(p_metadata || {});
    await env.DB.prepare("UPDATE users SET metadata = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(metaStr, p_user_id).run();
    return { data: { success: true }, error: null };
  }

  if (functionName === 'get_permissions_matrix') {
    const roles = await env.DB.prepare("SELECT * FROM roles").all();
    return { data: roles?.results || [], error: null };
  }

  if (functionName === 'get_my_access_context') {
    // Retorna contexto genérico - o JWT já contém os dados necessários
    return { data: { success: true }, error: null };
  }

  if (functionName === 'confirm_password_change') {
    // Placeholder — senha já é gerenciada pelo endpoint de login
    return { data: { success: true }, error: null };
  }

  return { data: null, error: 'Function not implemented' };
};
