import { api } from './api';

export interface DoctorAvailability {
  id: string;
  doctor_id: string;
  doctor_name?: string;
  specialty_name?: string;
  weekday: number;
  starts_at: string;
  ends_at: string;
  slot_minutes: number;
  is_active: number | boolean;
}

export const scheduleService = {
  async listAvailability(doctorId?: string): Promise<DoctorAvailability[]> {
    const qs = doctorId ? `?doctor_id=${doctorId}` : '';
    return api.get<DoctorAvailability[]>(`/schedules/availability${qs}`);
  },

  async createAvailability(data: {
    doctor_id: string;
    weekday: number;
    starts_at: string;
    ends_at: string;
    slot_minutes?: number;
  }): Promise<{ id: string }> {
    return api.post<{ id: string }>('/schedules/availability', data);
  },

  async removeAvailability(id: string): Promise<void> {
    return api.delete(`/schedules/availability/${id}`);
  },
};
