import { DashboardRepository } from '../repositories/DashboardRepository';
import { AuditRepository } from '../repositories/AuditRepository';

export const handleDashboardRpc = async (env: any, functionName: string, params: any) => {
  const repo = new DashboardRepository(env.DB);
  const auditRepo = new AuditRepository(env.DB);

  if (functionName === 'get_dashboard_bi_snapshot' || functionName === 'get_dashboard_snapshot') {
    const data = await repo.getDashboardSnapshot(params.p_days || 30, params.p_institution_id);
    return { data, error: null };
  }

  if (functionName === 'list_history_snapshot') {
    const data = await repo.listHistorySnapshot(params.p_patient_id, params.p_limit || 50);
    return { data, error: null };
  }

  if (functionName === 'list_system_events_snapshot') {
    const data = await repo.listSystemEvents(params.p_limit || 100);
    return { data, error: null };
  }

  if (functionName === 'list_audit_log_snapshot') {
    const data = await auditRepo.listSnapshot({ limit: params.p_limit || 100 });
    return { data, error: null };
  }

  if (functionName === 'api_clear_audit_and_system_logs') {
    const data = await repo.clearAuditAndSystemLogs();
    return { data, error: null };
  }

  if (functionName === 'list_notifications_snapshot') {
    const data = await repo.listNotifications(params.p_limit || 100);
    return { data, error: null };
  }

  if (functionName === 'get_database_size_stats') {
    const data = await repo.getDatabaseSizeStats();
    return { data, error: null };
  }

  if (functionName === 'get_reports_catalog') {
    return { data: [], error: null };
  }

  if (functionName === 'generate_operational_report_snapshot') {
    return { data: { rows: [] }, error: null };
  }

  return { data: null, error: 'Function not implemented' };
};
