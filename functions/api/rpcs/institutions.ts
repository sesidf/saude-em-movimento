import { InstitutionRepository } from '../repositories/InstitutionRepository';

export const handleInstitutionsRpc = async (env: any, functionName: string, params: any) => {
  const repo = new InstitutionRepository(env.DB);

  if (functionName === 'list_institutions_catalog' || functionName === 'get_all_institutions_catalog') {
    const data = await repo.listCatalog(params.p_search);
    return { data, error: null };
  }

  if (functionName === 'upsert_institution') {
    const data = await repo.upsert(params.p_payload);
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
