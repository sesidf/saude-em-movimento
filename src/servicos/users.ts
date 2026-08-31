import { api } from './api';

export interface UserManagementItem {
  id: string;
  email: string;
  full_name: string;
  phone?: string | null;
  is_active: number | boolean;
  auth_status: string;
  primary_institution_id?: string | null;
  institution_name?: string | null;
  role_keys?: string;
  role_names?: string;
  created_at: string;
}

export interface RoleItem {
  id: string;
  key: string;
  name: string;
  description?: string;
}

export const userService = {
  async list(): Promise<{ users: UserManagementItem[]; roles: RoleItem[] }> {
    return api.get<{ users: UserManagementItem[]; roles: RoleItem[] }>('/users');
  },

  async create(data: {
    email: string;
    full_name: string;
    phone?: string;
    password?: string;
    role_id?: string;
    primary_institution_id?: string;
  }): Promise<{ id: string }> {
    return api.post<{ id: string }>('/users', data);
  },

  async update(id: string, data: {
    full_name?: string;
    phone?: string;
    is_active?: boolean;
    primary_institution_id?: string;
    role_id?: string;
  }): Promise<void> {
    return api.put(`/users/${id}`, data);
  },

  async resetPassword(id: string, new_password?: string): Promise<void> {
    return api.post(`/users/${id}/reset-password`, { new_password });
  },
};
