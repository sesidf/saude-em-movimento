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
    const data = await repo.setUserAccessProfile(params.p_user_id, params.p_role_id, params.p_institution_id);
    return { data, error: null };
  }

  if (functionName === 'set_user_operational_profile') {
    const data = await repo.setUserOperationalProfile(params.p_user_id, params.p_metadata);
    return { data, error: null };
  }

  if (functionName === 'get_permissions_matrix') {
    const data = await repo.getPermissionsMatrix();
    return { data, error: null };
  }

  if (functionName === 'get_my_access_context') {
    // Retorna contexto genérico - o JWT já contém os dados necessários
    return { data: { success: true }, error: null };
  }



  return { data: null, error: 'Function not implemented' };
};
