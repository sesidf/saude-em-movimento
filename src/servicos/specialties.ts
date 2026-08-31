import { api } from './api';

export interface Specialty {
  id: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  color?: string | null;
  is_active: number | boolean;
  created_at?: string;
  updated_at?: string;
}

export const specialtyService = {
  async list(showAll = false): Promise<Specialty[]> {
    return api.get<Specialty[]>(`/specialties${showAll ? '?all=true' : ''}`);
  },

  async create(data: Partial<Specialty>): Promise<{ id: string }> {
    return api.post<{ id: string }>('/specialties', data);
  },

  async update(id: string, data: Partial<Specialty>): Promise<void> {
    return api.put(`/specialties/${id}`, data);
  },

  async remove(id: string): Promise<void> {
    return api.delete(`/specialties/${id}`);
  },
};
