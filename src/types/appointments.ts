export interface Appointment {
  id: string;
  created_at: string;
  patient_id: string;
  doctor_id: string;
  ticket_number: string;
  patient_name: string;
  patient_cpf: string;
  patient_gender?: string | null;
  doctor_name: string;
  doctor_crm: string;
  doctor_council?: string | null;
  doctor_registration_label?: string | null;
  appointment_date: string;
  end_date: string;
  reason: string;
  status: string;
  diagnosis?: string;
  anamnesis?: string;
  cancel_reason?: string | null;
  specialty_name?: string;
  specialty_color?: string;
  specialty_icon?: string | null;
  institution_id?: string | null;
  /** ID do novo agendamento criado quando este (com status nao_compareceu) foi reagendado */
  rescheduled_appointment_id?: string | null;
}

export interface SlotAppointment {
  id: string;
  patient_id?: string;
  specialty_id?: string | null;
  specialty_name?: string | null;
  institution_id?: string | null;
  institution_name?: string | null;
  status: string;
  appointment_date: string;
  end_date?: string | null;
  reason: string;
  patient_name?: string;
  patient_cpf?: string;
  doctor_name?: string;
  doctor_crm?: string;
  doctor_council?: string | null;
  doctor_registration_label?: string | null;
  no_show_reason?: string | null;
  cancel_reason?: string | null;
  /** ID do novo agendamento criado quando este (com status nao_compareceu) foi reagendado */
  rescheduled_appointment_id?: string | null;
}

export interface DoctorOption {
  id: string;
  name?: string;
  full_name?: string;
  crm?: string | null;
  professional_council?: string | null;
  professional_registration?: string | null;
  registration_label?: string | null;
  specialty_id: string | null;
  specialty_name?: string;
  specialty_color?: string | null;
  specialty_icon?: string | null;
}

export interface InstitutionOption {
  id: string;
  name: string;
}

export interface SpecialtyOption {
  id: string;
  name: string;
  color?: string | null;
  icon?: string | null;
}

export interface TimeSlot {
  time: string;
  starts_at: string;
  ends_at: string;
  status: 'free' | 'booked' | 'past' | 'blocked' | 'soft_blocked';
  block_reason?: string | null;
  appointment?: SlotAppointment | null;
  is_out_of_hours?: boolean;
  is_subslot?: boolean;
  institution_id?: string | null;
  institution_name?: string | null;
}


export interface PatientOption {
  id: string;
  full_name: string;
  institution_id?: string | null;
  cpf?: string;
  birth_date?: string;
}

interface PatientSchedulingSnapshot {
  id: string;
  ticket_number?: string | null;
  appointment_date?: string | null;
  status?: string | null;
  doctor_name?: string | null;
  specialty_name?: string | null;
}

export interface PatientSchedulingGuard {
  patient_id: string;
  requires_confirmation: boolean;
  has_active_appointment: boolean;
  has_recent_consultation: boolean;
  has_recent_same_specialty: boolean;
  recent_rule?: 'same_specialty' | 'recent_consultation' | null;
  recent_days: number;
  active_appointment?: PatientSchedulingSnapshot | null;
  recent_consultation?: PatientSchedulingSnapshot | null;
}

export interface AppointmentsProps {
  isModalOnly?: boolean;
  modalIntent?: any;
  onModalClose?: () => void;
  onAppointmentSaved?: (info?: {
    doctorId: string;
    appointmentDate: Date;
    originalDoctorId: string | null;
    isReschedule: boolean;
  }) => void;
}

export interface SchedulePolicy {
  model?: string;
  title?: string;
  description?: string;
  global_conflicts?: number;
}
