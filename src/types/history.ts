export interface HistoryAppointment {
  id: string;
  appointment_id: string;
  encounter_id?: string | null;
  patient_id: string;
  patient_name: string;
  patient_cpf: string;
  doctor_id: string;
  doctor_name: string;
  doctor_crm: string;
  doctor_council?: string | null;
  doctor_registration_label?: string | null;
  specialty_id: string;
  specialty_name: string;
  specialty_color?: string | null;
  appointment_date: string;
  status: 'agendado' | 'confirmado' | 'em_atendimento' | 'concluido' | 'cancelado' | 'nao_compareceu';
  reason: string;
  cancel_reason?: string | null;
  diagnosis: string | null;
  anamnesis: string | null;
  archived_at: string;
}
