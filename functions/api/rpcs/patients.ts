import { PatientRepository } from '../repositories/PatientRepository';

export const handlePatientsRpc = async (env: any, functionName: string, params: any) => {
  const repo = new PatientRepository(env.DB);

  if (functionName === 'list_patients_catalog') {
    const data = await repo.listCatalog({
      search: params.p_search,
      limit: params.p_limit
    });
    return { data, error: null };
  }

  if (functionName === 'upsert_patient') {
    const data = await repo.upsert(params.p_payload, params.p_user_id);
    return { data, error: null };
  }

  return { data: null, error: 'Function not implemented' };
};
