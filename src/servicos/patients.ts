import { api } from './api';

export interface Patient {
  id: string;
  patient_code?: string;
  institution_id?: string | null;
  institution_name?: string | null;
  full_name: string;
  phone?: string | null;
  cpf: string;
  birth_date: string;
  is_active: number | boolean;
  created_at?: string;
}

export const patientService = {
  async list(filters: { search?: string; institution_id?: string; limit?: number; offset?: number } = {}): Promise<Patient[]> {
    const params = new URLSearchParams();
    if (filters.search) params.append('search', filters.search);
    if (filters.institution_id) params.append('institution_id', filters.institution_id);
    if (filters.limit) params.append('limit', String(filters.limit));
    if (filters.offset) params.append('offset', String(filters.offset));
    const qs = params.toString() ? `?${params.toString()}` : '';
    return api.get<Patient[]>(`/patients${qs}`);
  },

  async getById(id: string): Promise<Patient> {
    return api.get<Patient>(`/patients/${id}`);
  },

  async getHistory(id: string): Promise<any[]> {
    return api.get<any[]>(`/patients/${id}/history`);
  },

  async create(data: {
    full_name: string;
    cpf: string;
    birth_date: string;
    phone?: string;
    institution_id?: string;
  }): Promise<{ id: string; patient_code: string }> {
    return api.post<{ id: string; patient_code: string }>('/patients', data);
  },

  async update(id: string, data: Partial<Patient>): Promise<void> {
    return api.put(`/patients/${id}`, data);
  },

  async remove(id: string): Promise<void> {
    return api.delete(`/patients/${id}`);
  },
};
