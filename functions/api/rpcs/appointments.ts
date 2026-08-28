import { AppointmentRepository } from '../repositories/AppointmentRepository';
import { PatientRepository } from '../repositories/PatientRepository';
import { AuditRepository } from '../repositories/AuditRepository';

export const handleAppointmentsRpc = async (env: any, functionName: string, params: any) => {
  const repo = new AppointmentRepository(env.DB);
  const patientRepo = new PatientRepository(env.DB);
  const auditRepo = new AuditRepository(env.DB);

  if (functionName === 'list_appointments_snapshot') {
    const data = await repo.listAppointmentsSnapshot({
      limit: params.p_limit,
      institutionId: params.p_institution_id,
      doctorId: params.p_doctor_id,
      patientId: params.p_patient_id,
      startDate: params.p_start_date,
      endDate: params.p_end_date
    });
    return { data, error: null };
  }

  if (functionName === 'api_schedule_appointment') {
    const data = await repo.scheduleAppointment(params.p_payload);
    return { data, error: null };
  }

  if (functionName === 'api_set_appointment_status') {
    const data = await repo.setAppointmentStatus(params.p_appointment_id, params.p_status, params.p_reason);
    await auditRepo.logAction('appointments', params.p_appointment_id, 'STATUS_CHANGE', params.p_user_id);
    return { data, error: null };
  }

  if (functionName === 'api_reschedule_appointment') {
    const data = await repo.rescheduleAppointment(params.p_appointment_id, params.p_new_start, params.p_new_end, params.p_reason);
    return { data, error: null };
  }

  if (functionName === 'api_start_encounter') {
    const data = await repo.startEncounter(params.p_appointment_id, params.p_user_id);
    return { data, error: null };
  }

  if (functionName === 'api_finalize_encounter') {
    const data = await repo.finalizeEncounter(params.p_appointment_id, params.p_notes, params.p_diagnosis, params.p_treatment_plan);
    return { data, error: null };
  }

  if (functionName === 'api_reorganize_schedule_conflicts') {
    const data = await repo.reorganizeScheduleConflicts(params.p_doctor_id, params.p_date);
    return { data, error: null };
  }

  if (functionName === 'get_patient_scheduling_guard') {
    const data = await repo.getPatientSchedulingGuard(params.p_patient_id);
    return { data, error: null };
  }

  if (functionName === 'get_schedule_admin_snapshot') {
    const data = await repo.getScheduleAdminSnapshot(params.p_doctor_id, params.p_start_date, params.p_end_date);
    return { data, error: null };
  }

  if (functionName === 'api_set_doctor_availability') {
    const data = await repo.setDoctorAvailability(params.p_doctor_id, params.p_weekday, params.p_payload);
    return { data, error: null };
  }

  if (functionName === 'api_archive_schedule_block') {
    const data = await repo.archiveScheduleBlock(params.p_block_id);
    return { data, error: null };
  }

  if (functionName === 'list_patients_catalog') {
    const data = await patientRepo.listCatalog({ search: params.p_search, limit: params.p_limit });
    return { data, error: null };
  }

  if (functionName === 'importar_dados_planilha') {
    const data = await repo.importarDadosPlanilha(params.p_rows, params.p_table);
    return { data, error: null };
  }

  if (functionName === 'add_medical_record_entry') {
    const data = await repo.addMedicalRecordEntry(params.p_encounter_id, params.p_entry_type, params.p_clinical_data, params.p_user_id, params.p_institution_id);
    return { data, error: null };
  }

  if (functionName === 'api_create_schedule_block') {
    const data = await repo.createScheduleBlock(params.p_doctor_id, params.p_start_at, params.p_end_at, params.p_reason);
    return { data, error: null };
  }

  if (functionName === 'api_clear_all_schedule_blocks') {
    const data = await repo.clearAllScheduleBlocks(params.p_doctor_id);
    return { data, error: null };
  }

  return { data: null, error: `RPC '${functionName}' não implementado` };
};
