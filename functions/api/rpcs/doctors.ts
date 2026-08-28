import { DoctorRepository } from '../repositories/DoctorRepository';

export const handleDoctorsRpc = async (env: any, functionName: string, params: any) => {
  const repo = new DoctorRepository(env.DB);

  if (functionName === 'list_doctors_catalog') {
    const data = await repo.listDoctorsCatalog(params.p_search);
    return { data, error: null };
  }

  if (functionName === 'set_doctor_active') {
    await repo.setDoctorActive(params.p_doctor_id, params.p_is_active);
    return { data: { success: true }, error: null };
  }

  if (functionName === 'list_specialties_catalog') {
    const data = await repo.listSpecialtiesCatalog(params.p_search);
    return { data, error: null };
  }

  if (functionName === 'upsert_specialty') {
    const data = await repo.upsertSpecialty(params.p_payload);
    return { data, error: null };
  }
  
  if (functionName === 'set_specialty_active') {
    const data = await repo.setSpecialtyActive(params.p_specialty_id, params.p_is_active);
    return { data, error: null };
  }

  return { data: null, error: 'Function not implemented' };
};
