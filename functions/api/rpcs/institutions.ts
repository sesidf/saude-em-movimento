import { InstitutionRepository } from '../repositories/InstitutionRepository';

export const handleInstitutionsRpc = async (env: any, functionName: string, params: any) => {
  const repo = new InstitutionRepository(env.DB);

  if (functionName === 'list_institutions_catalog' || functionName === 'get_all_institutions_catalog') {
    const data = await repo.listCatalog(params.p_search);
    return { data, error: null };
  }

  if (functionName === 'upsert_institution') {
    const payloadId = params.p_institution_id || crypto.randomUUID();
    const payload = params.p_payload || {
      id: payloadId,
      name: params.p_name,
      cnpj: params.p_cnpj,
      email: params.p_email,
      phone: params.p_phone,
      address: params.p_address,
      city: params.p_city,
      state: params.p_state,
      is_active: params.p_is_active
    };
    // Ensure id is present even if p_payload was provided but without id
    if (!payload.id) payload.id = payloadId;
    
    const data = await repo.upsert(payload);
    return { data, error: null };
  }
  
  if (functionName === 'set_institution_active') {
    const data = await repo.setActive(params.p_institution_id, params.p_is_active);
    return { data, error: null };
  }

  if (functionName === 'api_excluir_instituicao') {
    const data = await repo.softDeleteInstitution(params.p_institution_id);
    return { data, error: null };
  }

  return { data: null, error: 'Function not implemented' };
};
