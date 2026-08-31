import { api, setStoredToken } from './api';

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: string;
  roles?: string[];
  primaryInstitutionId?: string | null;
  institutionId?: string | null;
  institutionName?: string | null;
  authStatus?: string;
  requiresPasswordChange?: boolean;
  isRoot?: boolean;
}

export interface Institution {
  id: string;
  name: string;
  cnpj?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  is_active: number | boolean;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export const authService = {
  async login(email: string, password: string): Promise<AuthResponse> {
    const data = await api.post<AuthResponse>('/auth/login', { email, password });
    if (data && data.token) {
      setStoredToken(data.token);
    }
    return data;
  },

  async logout(): Promise<void> {
    try {
      await api.post('/auth/logout');
    } finally {
      setStoredToken(null);
    }
  },

  async getMe(): Promise<{ user: User; institutions: Institution[] }> {
    return api.get<{ user: User; institutions: Institution[] }>('/auth/me');
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    return api.post('/auth/change-password', { currentPassword, newPassword });
  },
};
