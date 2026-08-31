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

  if (functionName === 'upsert_doctor') {
    const payload = {
      user_id: params.p_user_id,
      doctor_id: params.p_doctor_id,
      specialty_id: params.p_specialty_id,
      professional_council: params.p_professional_council,
      crm: params.p_crm
    };
    const data = await repo.upsertDoctor(payload);
    return { data, error: null };
  }

  if (functionName === 'list_specialties_catalog') {
    const data = await repo.listSpecialtiesCatalog(params.p_search);
    return { data, error: null };
  }

  if (functionName === 'upsert_specialty') {
    const payload = params.p_payload || {
      id: params.p_specialty_id || crypto.randomUUID(),
      name: params.p_name,
      description: params.p_description,
      icon: params.p_icon,
      color: params.p_color,
      is_active: params.p_is_active
    };
    const data = await repo.upsertSpecialty(payload);
    return { data, error: null };
  }
  
  if (functionName === 'set_specialty_active') {
    const data = await repo.setSpecialtyActive(params.p_specialty_id, params.p_is_active);
    return { data, error: null };
  }

  return { data: null, error: 'Function not implemented' };
};
