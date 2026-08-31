import { api } from './api';

export interface Institution {
  id: string;
  name: string;
  cnpj?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  is_active: number | boolean;
  created_at?: string;
  updated_at?: string;
}

export const institutionService = {
  async list(showAll = false): Promise<Institution[]> {
    return api.get<Institution[]>(`/institutions${showAll ? '?all=true' : ''}`);
  },

  async getById(id: string): Promise<Institution> {
    return api.get<Institution>(`/institutions/${id}`);
  },

  async create(data: Partial<Institution>): Promise<{ id: string }> {
    return api.post<{ id: string }>('/institutions', data);
  },

  async update(id: string, data: Partial<Institution>): Promise<void> {
    return api.put(`/institutions/${id}`, data);
  },

  async remove(id: string): Promise<void> {
    return api.delete(`/institutions/${id}`);
  },
};
