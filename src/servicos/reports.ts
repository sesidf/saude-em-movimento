import { api } from './api';

export interface DashboardMetrics {
  today: {
    total: number;
    completed: number;
    inProgress: number;
    waiting: number;
    canceled: number;
    noShow: number;
  };
  system: {
    totalPatients: number;
    totalDoctors: number;
    totalSpecialties: number;
  };
}

export interface AuditLog {
  id: string;
  user_id?: string;
  user_name?: string;
  user_email?: string;
  action: string;
  resource: string;
  resource_id?: string;
  details?: any;
  created_at: string;
}

export const reportService = {
  async getDashboardMetrics(institutionId?: string): Promise<DashboardMetrics> {
    const qs = institutionId ? `?institution_id=${institutionId}` : '';
    return api.get<DashboardMetrics>(`/reports/dashboard-metrics${qs}`);
  },

  async getAuditLogs(limit = 50): Promise<AuditLog[]> {
    return api.get<AuditLog[]>(`/reports/audit-logs?limit=${limit}`);
  },
};
