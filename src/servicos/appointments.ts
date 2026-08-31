import { api } from './api';

export type AppointmentStatus =
  | 'agendado'
  | 'confirmado'
  | 'aguardando'
  | 'em_atendimento'
  | 'finalizado'
  | 'cancelado'
  | 'nao_compareceu';

export interface Appointment {
  id: string;
  appointment_code: string;
  institution_id?: string | null;
  institution_name?: string | null;
  patient_id: string;
  patient_name: string;
  patient_cpf?: string;
  patient_phone?: string;
  doctor_id: string;
  doctor_name: string;
  doctor_crm?: string;
  specialty_id?: string | null;
  specialty_name?: string | null;
  specialty_color?: string | null;
  appointment_date: string;
  end_date?: string;
  actual_start_at?: string | null;
  actual_end_at?: string | null;
  status: AppointmentStatus;
  reason: string;
  cancel_reason?: string | null;
  diagnosis?: string | null;
  prescription?: string | null;
  notes?: string | null;
  blood_pressure?: string | null;
  weight?: number | null;
  height?: number | null;
  temperature?: number | null;
}

export interface AppointmentFilters {
  date?: string;
  start_date?: string;
  end_date?: string;
  doctor_id?: string;
  specialty_id?: string;
  status?: string;
  institution_id?: string;
}

export const appointmentService = {
  async list(filters: AppointmentFilters = {}): Promise<Appointment[]> {
    const params = new URLSearchParams();
    if (filters.date) params.append('date', filters.date);
    if (filters.start_date) params.append('start_date', filters.start_date);
    if (filters.end_date) params.append('end_date', filters.end_date);
    if (filters.doctor_id) params.append('doctor_id', filters.doctor_id);
    if (filters.specialty_id) params.append('specialty_id', filters.specialty_id);
    if (filters.status) params.append('status', filters.status);
    if (filters.institution_id) params.append('institution_id', filters.institution_id);

    const qs = params.toString() ? `?${params.toString()}` : '';
    return api.get<Appointment[]>(`/appointments${qs}`);
  },

  async getById(id: string): Promise<Appointment> {
    return api.get<Appointment>(`/appointments/${id}`);
  },

  async create(data: {
    patient_id: string;
    doctor_id: string;
    specialty_id?: string;
    appointment_date: string;
    end_date?: string;
    reason: string;
    institution_id?: string;
  }): Promise<{ id: string; appointment_code: string }> {
    return api.post<{ id: string; appointment_code: string }>('/appointments', data);
  },

  async updateStatus(id: string, status: AppointmentStatus, cancel_reason?: string): Promise<void> {
    return api.patch(`/appointments/${id}/status`, { status, cancel_reason });
  },

  async updateClinicalData(id: string, data: {
    diagnosis?: string;
    prescription?: string;
    notes?: string;
    blood_pressure?: string;
    weight?: number;
    height?: number;
    temperature?: number;
  }): Promise<void> {
    return api.put(`/appointments/${id}/clinical-data`, data);
  },
};
