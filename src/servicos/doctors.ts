import { api } from './api';

export interface Doctor {
  id: string;
  user_id: string;
  name: string;
  email?: string;
  phone?: string;
  crm: string;
  professional_council: string;
  specialty_id?: string | null;
  specialty_name?: string | null;
  specialty_color?: string | null;
  is_active: number | boolean;
}

export const doctorService = {
  async list(filters: { specialty_id?: string; showAll?: boolean } = {}): Promise<Doctor[]> {
    const params = new URLSearchParams();
    if (filters.specialty_id) params.append('specialty_id', filters.specialty_id);
    if (filters.showAll) params.append('all', 'true');
    const qs = params.toString() ? `?${params.toString()}` : '';
    return api.get<Doctor[]>(`/doctors${qs}`);
  },

  async getById(id: string): Promise<Doctor> {
    return api.get<Doctor>(`/doctors/${id}`);
  },

  async create(data: {
    name: string;
    email?: string;
    phone?: string;
    crm: string;
    professional_council?: string;
    specialty_id?: string;
  }): Promise<{ id: string }> {
    return api.post<{ id: string }>('/doctors', data);
  },

  async update(id: string, data: Partial<Doctor>): Promise<void> {
    return api.put(`/doctors/${id}`, data);
  },

  async remove(id: string): Promise<void> {
    return api.delete(`/doctors/${id}`);
  },
};
