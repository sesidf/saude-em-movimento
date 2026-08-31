import { UserRepository } from '../repositories/UserRepository';

export const handleUsersRpc = async (env: any, functionName: string, params: any) => {
  const repo = new UserRepository(env.DB);

  if (functionName === 'get_access_control_snapshot') {
    const data = await repo.getAccessControlSnapshot(params.p_institution_id);
    return { data, error: null };
  }

  if (functionName === 'get_user_effective_permissions') {
    const data = await repo.getUserEffectivePermissions(params.p_user_id);
    return { data, error: null };
  }

  if (functionName === 'set_user_active') {
    const data = await repo.setUserActive(params.p_user_id, params.p_is_active);
    return { data, error: null };
  }

  if (functionName === 'link_user_institution') {
    const data = await repo.linkUserInstitution(params.p_user_id, params.p_institution_id, params.p_action);
    return { data, error: null };
  }

  if (functionName === 'sync_user_institutions') {
    const data = await repo.syncUserInstitutions(params.p_user_id, params.p_institution_ids);
    return { data, error: null };
  }

  if (functionName === 'set_user_access_profile') {
    let roleId = params.p_role_id;
    if (!roleId && params.p_role_key) {
      const roleRow = await repo.queryFirst("SELECT id FROM roles WHERE key = ?", [params.p_role_key]);
      roleId = (roleRow as any)?.id;
    }
    const data = await repo.setUserAccessProfile(params.p_user_id, roleId, params.p_institution_id);
    return { data, error: null };
  }

  if (functionName === 'set_user_operational_profile') {
    let roleId = params.p_role_id;
    if (!roleId && params.p_role_key) {
      const roleRow = await repo.queryFirst("SELECT id FROM roles WHERE key = ?", [params.p_role_key]);
      roleId = (roleRow as any)?.id;
    }
    
    if (roleId) {
      await repo.setUserAccessProfile(params.p_user_id, roleId, params.p_institution_id);
    }
    
    const metadata = params.p_metadata || {
      professional_registration: params.p_professional_registration,
      professional_council: params.p_professional_council,
      specialty_id: params.p_specialty_id
    };
    
    // Se for promovido a médico e os dados clínicos estiverem preenchidos, também cadastra na tabela doctors
    if (params.p_role_key === 'medico' && (metadata.professional_registration || metadata.specialty_id)) {
      const { DoctorRepository } = await import('../repositories/DoctorRepository');
      const docRepo = new DoctorRepository(env.DB);
      
      const existingDoctor = await repo.queryFirst("SELECT id FROM doctors WHERE user_id = ?", [params.p_user_id]);
      const doctorIdToUse = existingDoctor ? (existingDoctor as any).id : crypto.randomUUID();

      await docRepo.upsertDoctor({
        user_id: params.p_user_id,
        doctor_id: doctorIdToUse,
        specialty_id: metadata.specialty_id || null,
        professional_council: metadata.professional_council || 'CRM',
        crm: metadata.professional_registration || '00'
      });
    }

    const data = await repo.setUserOperationalProfile(params.p_user_id, metadata);
    return { data, error: null };
  }

  if (functionName === 'get_permissions_matrix') {
    const data = await repo.getPermissionsMatrix();
    return { data, error: null };
  }

  if (functionName === 'grant_permission') {
    const data = await repo.grantPermission(params.p_role_id, params.p_permission_id, params.p_institution_id);
    return { data, error: null };
  }

  if (functionName === 'revoke_permission') {
    const data = await repo.revokePermission(params.p_role_id, params.p_permission_id);
    return { data, error: null };
  }

  if (functionName === 'delete_role') {
    const data = await repo.deleteRole(params.p_role_id);
    return { data, error: null };
  }

  if (functionName === 'get_my_access_context') {
    // Retorna contexto genérico - o JWT já contém os dados necessários
    return { data: { success: true }, error: null };
  }



  return { data: null, error: 'Function not implemented' };
};
