"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format, subDays, addDays, parseISO, isValid, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ArrowUpDown, Clock, Database, Download, FileText, Search, ShieldCheck, User, ChevronLeft, ChevronRight, Globe, MonitorSmartphone, Info as InfoIcon, FilePlus, FileMinus, FileEdit, Trash2, AlertTriangle } from 'lucide-react';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import PageHeader from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { QuickFilterButton } from '@/components/ui/quick-filter-button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SimpleTooltip } from '@/components/ui/tooltip';
import { useAuth } from '@/contexts/AuthContext';
import { chamarApiPost, chamarApiGet } from '@/lib/workerApi';
import { generateAndDownloadModuleExport, type ExportFormat } from '@/lib/officialExports';
import { toast } from 'sonner';
import { getErrorMessage } from '@/lib/errors';

interface SystemEventEntry {
  id: string;
  created_at: string;
  institution_id: string | null;
  user_id: string | null;
  user_role: string | null;
  user_name: string | null;
  ip_address: string | null;
  user_agent: string | null;
  module: string;
  action: string;
  event_type: string;
  severity: 'info' | 'warning' | 'error' | 'critical' | string;
  description: string;
  payload: Record<string, unknown> | null;
}

interface AuditLogEntry {
  id: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  table_name: string;
  record_id: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  created_at: string;
  user_id: string;
  user_name: string;
  user_email: string;
}

type AuditMode = 'events' | 'records';

const moduleLabels: Record<string, string> = {
  autenticacao: 'Autenticação',
  configurações: 'Configurações',
  relatorios: 'Relatórios',
  usuarios: 'Usuários',
  pacientes: 'Pacientes',
  agenda: 'Agenda',
  atendimento: 'Atendimento',

  sistema: 'Sistema',
};

const severityLabels: Record<string, string> = {
  info: 'Informativo',
  warning: 'Atenção',
  error: 'Erro',
  critical: 'Crítico',
};

const tableLabels: Record<string, string> = {
  appointments: 'Agendamentos',
  patients: 'Pacientes',
  doctors: 'Profissionais',
  profiles: 'Usuários',
  users: 'Usuários',
  institutions: 'Instituições',
  specialties: 'Especialidades',
  medical_record_entries: 'Prontuário',

  system_config: 'Configurações',
  report_snapshots: 'Relatórios',
  user_roles: 'Perfis de Usuário',
  role_permissions: 'Permissões',
};

const AuditLog = () => {
  const { hasPermission, institutionId, userRole, profile } = useAuth();
  const isSuperAdmin = userRole === 'superadmin' || profile?.role === 'superadmin';

  const [searchParams, setSearchParams] = useSearchParams();
  const mode = (searchParams.get('tab') as AuditMode) || 'events';
  const setMode = (tab: AuditMode) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', tab);
      return next;
    });
  };
  const [events, setEvents] = useState<SystemEventEntry[]>([]);
  const [records, setRecords] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState('all');

  const [isClearDialogOpen, setIsClearDialogOpen] = useState(false);
  const [clearTarget, setClearTarget] = useState<'all' | 'events' | 'records'>('all');
  const [confirmText, setConfirmText] = useState('');
  const [isClearing, setIsClearing] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);
  const [actionFilter, setActionFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [tableFilter, setTableFilter] = useState('all');
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  const [initialDatesLoaded, setInitialDatesLoaded] = useState(false);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);

  const canReadAudit = hasPermission('audit', 'read', institutionId);
  const canExportAudit = hasPermission('audit', 'export', institutionId);

  const handleClearLogs = async () => {
    if (confirmText.trim().toUpperCase() !== 'LIMPAR') {
      toast.error('Digite a palavra "LIMPAR" para confirmar a exclusão.');
      return;
    }

    setIsClearing(true);
    try {
      const { data, error } = await chamarApiPost('/api/rpc/api_clear_audit_and_system_logs', {
        p_target: clearTarget,
      });
      if (error) throw error;

      const res = (data || {}) as { success?: boolean; deleted_system_events?: number; deleted_audit_logs?: number };
      const totalDeleted = (res?.deleted_system_events || 0) + (res?.deleted_audit_logs || 0);

      toast.success(`Logs limpos com sucesso! ${totalDeleted} registro(s) excluído(s).`);
      setIsClearDialogOpen(false);
      setConfirmText('');
      await fetchGovernance();
    } catch (error) {
      console.error('Erro ao limpar logs:', error);
      toast.error(getErrorMessage(error, 'Falha ao limpar logs de governança.'));
    } finally {
      setIsClearing(false);
    }
  };

  const fetchGovernance = useCallback(async () => {
    if (!canReadAudit) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      if (mode === 'events') {
        const { data, error } = await chamarApiPost('/api/rpc/list_system_events_snapshot', {
          p_module: moduleFilter === 'all' ? null : moduleFilter,
          p_action: actionFilter === 'all' ? null : actionFilter,
          p_severity: severityFilter === 'all' ? null : severityFilter,
          p_search: debouncedSearch.trim() || null,
          p_date_from: dateRange.from || null,
          p_date_to: dateRange.to || null,
          p_user_id: null,
          p_limit: 300,
        });

        if (error) throw error;
        setEvents(Array.isArray(data) ? (data as SystemEventEntry[]) : []);
      } else {
        const { data, error } = await chamarApiPost('/api/rpc/list_audit_log_snapshot', {
          p_search: debouncedSearch.trim() || null,
          p_action: actionFilter === 'all' ? null : actionFilter,
          p_table_name: tableFilter === 'all' ? null : tableFilter,
          p_limit: 300,
        });

        if (error) throw error;
        setRecords(Array.isArray(data) ? (data as AuditLogEntry[]) : []);
      }
    } catch (error) {
      console.error('Erro ao carregar governança:', error);
      setEvents([]);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [actionFilter, canReadAudit, dateRange.from, dateRange.to, mode, moduleFilter, debouncedSearch, severityFilter, tableFilter]);

  useEffect(() => {
    if (initialDatesLoaded) {
      void fetchGovernance();
    }
  }, [fetchGovernance, initialDatesLoaded]);

  const handleLoadAllDates = useCallback(async () => {
    try {
      setLoading(true);
      const tableName = mode === 'events' ? 'system_events' : 'audit_log';
      const { data: firstRecord } = await cloudflare
        .from(tableName)
        .select('created_at')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
        
      const { data: lastRecord } = await cloudflare
        .from(tableName)
        .select('created_at')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
        
      if (firstRecord?.created_at && lastRecord?.created_at) {
        setDateRange({
          from: format(parseISO(firstRecord.created_at), 'yyyy-MM-dd'),
          to: format(parseISO(lastRecord.created_at), 'yyyy-MM-dd')
        });
      } else {
        setDateRange({ from: '', to: '' });
      }
    } catch (error) {
      console.error('Erro ao buscar datas limites:', error);
      setDateRange({ from: '', to: '' });
    } finally {
      setLoading(false);
      setInitialDatesLoaded(true);
    }
  }, [mode]);

  useEffect(() => {
    void handleLoadAllDates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const uniqueModules = useMemo(() => Array.from(new Set(events.map((event) => event.module))).sort(), [events]);
  const uniqueEventActions = useMemo(() => Array.from(new Set(events.map((event) => event.action))).sort(), [events]);
  const uniqueTables = useMemo(() => Array.from(new Set(records.map((log) => log.table_name))).sort(), [records]);

  const exportGovernance = async (formatType: ExportFormat) => {
    if (!canExportAudit) {
      toast.error('Exportação exige permissão efetiva de auditoria.');
      return;
    }

    setExporting(formatType);
    try {
      await generateAndDownloadModuleExport('audit', formatType, {
        mode,
        search: debouncedSearch.trim() || null,
        module: moduleFilter === 'all' ? null : moduleFilter,
        action: actionFilter === 'all' ? null : actionFilter,
        severity: severityFilter === 'all' ? null : severityFilter,
        table: tableFilter === 'all' ? null : tableFilter,
        date_from: dateRange.from || null,
        date_to: dateRange.to || null,
        institution_id: institutionId || null,
      });
    } catch (error) {
      toast.error(getErrorMessage(error, 'Não foi possível gerar a exportação oficial.'));
    } finally {
      setExporting(null);
    }
  };

  if (!canReadAudit) {
    return (
      <div className="pt-20 pb-16 px-4 min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="text-center text-slate-500">
          <ShieldCheck className="h-12 w-12 mx-auto mb-4 text-slate-400" />
          <p className="font-bold text-lg">Acesso Restrito</p>
          <p>Os registros oficiais exigem permissão efetiva de auditoria.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 bg-slate-100 px-3 pb-3">
      <Tabs value={mode} onValueChange={(value) => setMode(value as AuditMode)} className="flex h-full min-h-0 w-full flex-col">
        <PageHeader
          title="Governança e Auditoria"
          titleClassName="flex items-center gap-2"
          description="EVENTOS OFICIAIS, TRILHA DE ALTERAÇÕES E VALIDAÇÃO OPERACIONAL"
          className="mb-3"
          compact loading={loading}
          actions={
            <TabsList className="bg-slate-100/80 p-1 rounded-lg border border-slate-200/60 shadow-sm backdrop-blur-md w-fit">
              <TabsTrigger value="events" className="rounded-md data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-blue-700 font-medium px-3 py-1 text-[13px] transition-all">Log de Sistema</TabsTrigger>
              <TabsTrigger value="records" className="rounded-md data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-blue-700 font-medium px-3 py-1 text-[13px] transition-all">Auditoria de Dados</TabsTrigger>
            </TabsList>
          }
        >
          <div className="flex flex-col gap-3 w-full">

            <div className="flex flex-col md:flex-row flex-wrap w-full items-end gap-2 justify-end">
              <div className="relative min-w-0 flex-1 w-full md:min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder={mode === 'events' ? 'Buscar usuário, módulo ou ação...' : 'Buscar usuário, e-mail ou tabela...'}
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  className="delphi-input h-9 pl-10"
                />
              </div>

              {mode === 'events' ? (
                <>
                  <Select value={moduleFilter} onValueChange={setModuleFilter}>
                    <SelectTrigger className="delphi-input h-9 w-full md:w-auto md:min-w-[150px] [&>span]:line-clamp-none"><SelectValue placeholder="Módulo" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os Módulos</SelectItem>
                      {uniqueModules.map((moduleName) => <SelectItem key={moduleName} value={moduleName}>{moduleLabels[moduleName] || moduleName}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={actionFilter} onValueChange={setActionFilter}>
                    <SelectTrigger className="delphi-input h-9 w-full md:w-auto md:min-w-[150px] [&>span]:line-clamp-none"><SelectValue placeholder="Ação" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas as Ações</SelectItem>
                      {uniqueEventActions.map((action) => <SelectItem key={action} value={action}>{action.replace(/_/g, ' ')}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={severityFilter} onValueChange={setSeverityFilter}>
                    <SelectTrigger className="delphi-input h-9 w-full md:w-auto md:min-w-[150px] [&>span]:line-clamp-none"><SelectValue placeholder="Criticidade" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas as Criticidades</SelectItem>
                      <SelectItem value="info">Informativo</SelectItem>
                      <SelectItem value="warning">Atenção</SelectItem>
                      <SelectItem value="error">Erro</SelectItem>
                      <SelectItem value="critical">Crítico</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-1">
                    <DateControl 
                      label="De" 
                      value={dateRange.from} 
                      onChange={(val) => setDateRange({ ...dateRange, from: val })} 
                    />
                    <DateControl 
                      label="A" 
                      value={dateRange.to} 
                      onChange={(val) => setDateRange({ ...dateRange, to: val })} 
                    />

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="icon" className="h-9 w-9 ml-2 rounded-xl bg-white border border-slate-200/90 shadow-2xs" title="Exportar relatório de governança">
                          {exporting ? <Clock className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4 text-slate-600" />}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem onClick={() => { void exportGovernance('pdf'); }} disabled={exporting !== null || !canExportAudit} className="flex items-center gap-2 font-medium">
                          <FileText className="h-4 w-4" />
                          Exportar para PDF
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => { void exportGovernance('excel'); }} disabled={exporting !== null || !canExportAudit} className="flex items-center gap-2 font-medium">
                          <Download className="h-4 w-4" />
                          Exportar para Excel
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>

                    {isSuperAdmin && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setClearTarget('events');
                          setConfirmText('');
                          setIsClearDialogOpen(true);
                        }}
                        className="h-9 px-3 rounded-xl border border-red-200 bg-red-50/80 text-red-700 hover:bg-red-100 hover:border-red-300 font-bold text-xs flex items-center gap-1.5 shadow-2xs transition-all shrink-0 ml-1"
                        title="Limpar logs de sistema (Superadmin)"
                      >
                        <Trash2 className="h-4 w-4 text-red-600" />
                        <span className="hidden xl:inline">Limpar Logs</span>
                      </Button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <Select value={actionFilter} onValueChange={setActionFilter}>
                    <SelectTrigger className="delphi-input h-9 w-full md:w-auto md:min-w-[150px] [&>span]:line-clamp-none"><SelectValue placeholder="Ação" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas as Ações</SelectItem>
                      <SelectItem value="INSERT">Criação</SelectItem>
                      <SelectItem value="UPDATE">Atualização</SelectItem>
                      <SelectItem value="DELETE">Exclusão</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={tableFilter} onValueChange={setTableFilter}>
                    <SelectTrigger className="delphi-input h-9 w-full md:w-auto md:min-w-[150px] [&>span]:line-clamp-none"><SelectValue placeholder="Tabela" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas as Tabelas</SelectItem>
                      {uniqueTables.map((table) => <SelectItem key={table} value={table}>{tableLabels[table] || table}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-0">
                    <DateControl 
                       label="De" 
                       value={dateRange.from} 
                       onChange={(val) => setDateRange({ ...dateRange, from: val })} 
                     />
                     <DateControl 
                       label="A" 
                       value={dateRange.to} 
                       onChange={(val) => setDateRange({ ...dateRange, to: val })} 
                     />

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="icon" className="h-9 w-9 ml-2 rounded-xl bg-white border border-slate-200/90 shadow-2xs" title="Exportar relatório de governança">
                          {exporting ? <Clock className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4 text-slate-600" />}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem onClick={() => { void exportGovernance('pdf'); }} disabled={exporting !== null || !canExportAudit} className="flex items-center gap-2 font-medium">
                          <FileText className="h-4 w-4" />
                          Exportar para PDF
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => { void exportGovernance('excel'); }} disabled={exporting !== null || !canExportAudit} className="flex items-center gap-2 font-medium">
                          <Download className="h-4 w-4" />
                          Exportar para Excel
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>

                    {isSuperAdmin && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setClearTarget('records');
                          setConfirmText('');
                          setIsClearDialogOpen(true);
                        }}
                        className="h-9 px-3 rounded-xl border border-red-200 bg-red-50/80 text-red-700 hover:bg-red-100 hover:border-red-300 font-bold text-xs flex items-center gap-1.5 shadow-2xs transition-all shrink-0 ml-1"
                        title="Limpar trilha de auditoria (Superadmin)"
                      >
                        <Trash2 className="h-4 w-4 text-red-600" />
                        <span className="hidden xl:inline">Limpar Logs</span>
                      </Button>
                    )}
                  </div>
                </>
              )}
            </div>
            
            {/* Quick date filters */}
            <div className="flex flex-wrap items-center gap-2 mt-2 w-full justify-start">
              <QuickFilterButton 
                active={dateRange.from === format(subDays(new Date(), 7), 'yyyy-MM-dd') && dateRange.to === format(new Date(), 'yyyy-MM-dd')}
                label="7 dias"
                onClick={() => setDateRange({ from: format(subDays(new Date(), 7), 'yyyy-MM-dd'), to: format(new Date(), 'yyyy-MM-dd') })}
              />
              <QuickFilterButton 
                active={dateRange.from === format(subDays(new Date(), 15), 'yyyy-MM-dd') && dateRange.to === format(new Date(), 'yyyy-MM-dd')}
                label="15 dias"
                onClick={() => setDateRange({ from: format(subDays(new Date(), 15), 'yyyy-MM-dd'), to: format(new Date(), 'yyyy-MM-dd') })}
              />
              <QuickFilterButton 
                active={dateRange.from === format(subDays(new Date(), 30), 'yyyy-MM-dd') && dateRange.to === format(new Date(), 'yyyy-MM-dd')}
                label="30 dias"
                onClick={() => setDateRange({ from: format(subDays(new Date(), 30), 'yyyy-MM-dd'), to: format(new Date(), 'yyyy-MM-dd') })}
              />
              <QuickFilterButton 
                active={dateRange.from === format(startOfMonth(new Date()), 'yyyy-MM-dd') && dateRange.to === format(endOfMonth(new Date()), 'yyyy-MM-dd')}
                label="Este mês"
                onClick={() => setDateRange({ from: format(startOfMonth(new Date()), 'yyyy-MM-dd'), to: format(endOfMonth(new Date()), 'yyyy-MM-dd') })}
              />
              <div className="h-5 w-[1px] bg-slate-300 shrink-0 mx-0.5 self-center" />
              <QuickFilterButton 
                active={!dateRange.from && !dateRange.to}
                label="Tudo"
                onClick={handleLoadAllDates}
              />
              <QuickFilterButton 
                variant="clear"
                onClick={() => {
                  setSearchTerm('');
                  setModuleFilter('all');
                  setActionFilter('all');
                  setSeverityFilter('all');
                  setDateRange({ from: '', to: '' });
                }}
                label="Limpar"
              />
            </div>
          </div>
        </PageHeader>
        <main className="flex-1 min-h-0 overflow-y-auto pt-2 px-1">
          <TabsContent value="events" className="space-y-4 m-0 p-2 md:p-4">
            {loading ? <LoadingState /> : events.length === 0 ? <EmptyState label="Nenhum evento encontrado com os filtros atuais" /> : (
              <div className="relative border-l-2 border-slate-200 ml-2 md:ml-4 space-y-6 pb-6">
                {events.map((event) => <SystemEventCard key={event.id} event={event} />)}
              </div>
            )}
          </TabsContent>

          <TabsContent value="records" className="space-y-4 m-0 p-2 md:p-4">
            {loading ? <LoadingState /> : records.length === 0 ? <EmptyState label="Nenhuma alteração encontrada com os filtros atuais" /> : (
              <div className="relative border-l-2 border-slate-200 ml-2 md:ml-4 space-y-6 pb-6">
                {records.map((record) => <AuditRecordCard key={record.id} record={record} />)}
              </div>
            )}
          </TabsContent>
        </main>
      </Tabs>

      <Dialog open={isClearDialogOpen} onOpenChange={setIsClearDialogOpen}>
        <DialogContent className="max-w-md p-6 bg-white rounded-2xl shadow-2xl border border-slate-100">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-3 bg-red-100 text-red-600 rounded-xl">
                <Trash2 className="h-6 w-6" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold text-slate-800">
                  Limpar Registros de Logs
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500 font-medium">
                  Ação restrita e irreversível para manutenção do banco
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="bg-amber-50 border border-amber-200/80 rounded-xl p-3.5 text-xs text-amber-900 leading-relaxed font-medium">
              <div className="flex items-center gap-1.5 font-bold mb-1 text-amber-950">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                <span>Atenção: Ação Permanente</span>
              </div>
              Os registros excluídos não poderão ser recuperados. Um evento de manutenção será registrado no sistema com a identificação do seu usuário.
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                Alvo da Limpeza
              </label>
              <Select value={clearTarget} onValueChange={(val: any) => setClearTarget(val)}>
                <SelectTrigger className="delphi-input h-10 w-full bg-slate-50 border-slate-200">
                  <SelectValue placeholder="Selecione o que deseja limpar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Limpar Tudo (Logs de Sistema + Auditoria de Dados)</SelectItem>
                  <SelectItem value="events">Apenas Log de Sistema (Eventos e Sessões)</SelectItem>
                  <SelectItem value="records">Apenas Auditoria de Dados (Trilha de Alterações)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 block">
                Para confirmar, digite <span className="font-extrabold text-red-600 uppercase">LIMPAR</span> no campo abaixo:
              </label>
              <Input
                placeholder="LIMPAR"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
                className="delphi-input h-10 border-red-200 focus-visible:ring-red-500 font-mono text-center tracking-widest font-bold"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 mt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsClearDialogOpen(false)}
              disabled={isClearing}
              className="rounded-xl"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => { void handleClearLogs(); }}
              disabled={isClearing || confirmText.trim().toUpperCase() !== 'LIMPAR'}
              className="rounded-xl font-bold bg-red-600 hover:bg-red-700 text-white shadow-sm"
            >
              {isClearing ? 'Limpando...' : 'Excluir Permanentemente'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const SeverityBadge = ({ severity }: { severity: string }) => {
  const classes: Record<string, string> = {
    info: 'bg-blue-100 text-blue-800 border-blue-200',
    warning: 'bg-amber-100 text-amber-800 border-amber-200',
    error: 'bg-red-100 text-red-800 border-red-200',
    critical: 'bg-red-700 text-white border-red-800',
  };
  return <Badge className={`font-semibold tracking-wide ${classes[severity] || 'bg-slate-100 text-slate-800 border-slate-200'}`}>{severityLabels[severity] || severity}</Badge>;
};

const formatUserAgent = (ua: string | null) => {
  if (!ua || ua === 'N/D') return 'N/D';
  let browser = 'Desconhecido';
  let os = 'Desconhecido';
  
  if (ua.includes('Edg/')) browser = 'Edge';
  else if (ua.includes('OPR/') || ua.includes('Opera')) browser = 'Opera';
  else if (ua.includes('Chrome/')) browser = 'Chrome';
  else if (ua.includes('Safari/') && !ua.includes('Chrome')) browser = 'Safari';
  else if (ua.includes('Firefox/')) browser = 'Firefox';
  
  if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Mac OS X')) os = 'macOS';
  else if (ua.includes('Linux')) os = 'Linux';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iOS') || ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
  
  if (browser === 'Desconhecido' && os === 'Desconhecido') return 'Navegador Padrão';
  return `${browser} no ${os}`;
};

const formatKey = (key: string) => {
  const map: Record<string, string> = {
    patient_id: 'ID do Paciente',
    patient_name: 'Paciente',
    doctor_id: 'ID do Médico',
    appointment_id: 'ID do Agendamento',
    reason: 'Motivo',
    invalid_password: 'Senha inválida',
    user_not_found: 'Usuário não encontrado',
    email: 'E-mail',
    status: 'Status',
    error: 'Erro',
    details: 'Detalhes',
    target_user_id: 'ID do Usuário Alvo',
    role: 'Perfil',
    institution_id: 'ID da Instituição',
  };
  return map[key] || key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
};

const formatValue = (value: unknown) => {
  if (value === null || value === undefined) return 'N/D';
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (typeof value === 'object') return JSON.stringify(value);
  const str = String(value);
  const map: Record<string, string> = {
    invalid_password: 'Senha incorreta',
    user_not_found: 'Usuário não encontrado',
    invalid_credentials: 'Credenciais inválidas'
  };
  return map[str] || str;
};

const PayloadDetails = ({ title, data }: { title: string; data: Record<string, unknown> }) => {
  const entries = Object.entries(data);
  if (entries.length === 0) return null;
  
  return (
    <details className="group bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mt-2">
      <summary className="cursor-pointer p-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 transition-colors list-none flex items-center justify-between select-none">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-slate-400" />
          <span>{title}</span>
        </div>
        <ArrowUpDown className="h-4 w-4 text-slate-400 group-open:rotate-180 transition-transform duration-200" />
      </summary>
      <div className="p-4 pt-0 border-t border-slate-100 bg-slate-50/50">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3 mt-4">
          {entries.map(([key, value]) => (
            <div key={key} className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{formatKey(key)}</span>
              <span className="text-sm text-slate-800 font-medium break-words bg-white px-2.5 py-1.5 rounded-md border border-slate-200 shadow-sm">
                {formatValue(value)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </details>
  );
};

const TraceabilityItem = ({ icon, label, value, helpText, technicalDetail }: { icon: React.ReactNode, label: string, value: string, helpText: string, technicalDetail?: string | null }) => (
  <div className="bg-white border border-slate-200 rounded-lg p-3.5 relative group shadow-2xs">
    <div className="flex items-center gap-1.5 mb-2">
      <div className="text-slate-400">{icon}</div>
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
      <SimpleTooltip content={<span className="text-[11px] font-medium leading-tight block max-w-xs">{helpText}</span>}>
        <div className="cursor-help ml-auto">
          <InfoIcon className="h-3.5 w-3.5 text-slate-300 hover:text-blue-500 transition-colors" />
        </div>
      </SimpleTooltip>
    </div>
    <div className="font-semibold text-sm text-slate-800 break-words leading-tight">{value}</div>
    {technicalDetail && technicalDetail !== 'N/D' && (
      <div className="mt-1.5 text-[10px] font-mono text-slate-400 truncate opacity-0 group-hover:opacity-100 transition-opacity" title={technicalDetail}>
        {technicalDetail}
      </div>
    )}
  </div>
);

const SystemEventCard = ({ event }: { event: SystemEventEntry }) => {
  const isCritical = event.severity === 'critical';
  const isError = event.severity === 'error';
  const dotColor = isCritical ? 'bg-red-500 ring-red-100' : isError ? 'bg-amber-500 ring-amber-100' : 'bg-blue-500 ring-blue-100';

  return (
    <div className="relative pl-6 md:pl-8 group">
      <div className={`absolute -left-[9px] top-7 h-4 w-4 rounded-full ${dotColor} ring-4 shadow-sm z-10 transition-transform group-hover:scale-110`} />
      <Card className="border-slate-200 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden bg-white">
        <div className="bg-slate-50/80 border-b border-slate-100 px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-blue-600" />
            <span className="font-bold text-slate-700 text-xs uppercase tracking-wider">Registro de Segurança e Sistema</span>
          </div>
          <SeverityBadge severity={event.severity} />
        </div>
        
        <div className="p-5">
          <div className="mb-6">
            <h3 className="text-lg font-extrabold text-slate-900 mb-2 leading-tight">{event.description}</h3>
            <div className="text-[13px] text-slate-600 leading-relaxed bg-slate-50 p-3.5 rounded-lg border border-slate-100">
              O usuário <strong className="text-slate-900">{event.user_name || event.user_id || 'Sistema'}</strong> (com o perfil de <strong className="text-slate-900">{event.user_role || 'N/D'}</strong>) executou esta operação no módulo de <strong className="text-slate-900">{moduleLabels[event.module] || event.module}</strong> em <strong className="text-slate-900">{format(new Date(event.created_at), "dd/MM/yyyy 'às' HH:mm:ss")}</strong>.
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <Globe className="h-3.5 w-3.5" />
              Rastreabilidade de Acesso (LGPD)
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 bg-slate-50/50 p-4 rounded-xl border border-slate-100">
              <TraceabilityItem 
                icon={<Clock className="h-4 w-4" />}
                label="Data e Hora Exata"
                value={format(new Date(event.created_at), "dd/MM/yyyy HH:mm:ss")}
                helpText="Carimbo de tempo oficial do servidor. Garante quando a ação ocorreu exatamanete."
              />
              <TraceabilityItem 
                icon={<User className="h-4 w-4" />}
                label="Perfil de Acesso"
                value={event.user_role || 'N/D'}
                helpText="Qual era a permissão do usuário no momento desta ação."
              />
              <TraceabilityItem 
                icon={<Globe className="h-4 w-4" />}
                label="Endereço IP"
                value={event.ip_address || 'Não identificado'}
                helpText="Endereço da rede (internet) de onde o usuário acessou o sistema."
              />
              <TraceabilityItem 
                icon={<MonitorSmartphone className="h-4 w-4" />}
                label="Dispositivo"
                value={formatUserAgent(event.user_agent)}
                helpText="O navegador e o sistema operacional que o usuário estava usando (passe o mouse na caixa para ver o metadado real)."
                technicalDetail={event.user_agent}
              />
            </div>
          </div>

          {event.payload && Object.keys(event.payload).length > 0 && (
            <div className="mt-6 pt-5 border-t border-slate-100">
              <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-wider mb-3">Informações Adicionais / Modificadas</h4>
              <PayloadDetails title="Explorar Dados do Evento" data={event.payload} />
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};

const AuditRecordCard = ({ record }: { record: AuditLogEntry }) => {
  const isDelete = record.action === 'DELETE';
  const isInsert = record.action === 'INSERT';
  
  const dotColor = isDelete ? 'bg-rose-500 ring-rose-100' : isInsert ? 'bg-emerald-500 ring-emerald-100' : 'bg-blue-500 ring-blue-100';
  const badgeClass = isDelete ? 'bg-rose-100 text-rose-800 border-rose-200' : isInsert ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-blue-100 text-blue-800 border-blue-200';
  const actionLabel = isInsert ? 'Criação de registro' : isDelete ? 'Exclusão de registro' : 'Atualização de registro';
  const IconComp = isInsert ? FilePlus : isDelete ? FileMinus : FileEdit;

  return (
    <div className="relative pl-6 md:pl-8 group">
      <div className={`absolute -left-[9px] top-7 h-4 w-4 rounded-full ${dotColor} ring-4 shadow-sm z-10 transition-transform group-hover:scale-110`} />
      <Card className="border-slate-200 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden bg-white">
        <div className="bg-slate-50/80 border-b border-slate-100 px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-emerald-600" />
            <span className="font-bold text-slate-700 text-xs uppercase tracking-wider">Auditoria de Banco de Dados</span>
          </div>
          <Badge className={`font-semibold tracking-wide ${badgeClass}`}>
            <IconComp className="h-3.5 w-3.5 mr-1.5 inline-block -mt-0.5" />
            {actionLabel}
          </Badge>
        </div>

        <div className="p-5">
          <div className="mb-6">
            <h3 className="text-lg font-extrabold text-slate-900 mb-2 leading-tight">
              Alteração de dados em <span className="text-blue-600">{tableLabels[record.table_name] || record.table_name}</span>
            </h3>
            <div className="text-[13px] text-slate-600 leading-relaxed bg-slate-50 p-3.5 rounded-lg border border-slate-100">
              O usuário associado ao e-mail <strong className="text-slate-900">{record.user_email || 'Não identificado'}</strong> alterou diretamente o banco de dados em <strong className="text-slate-900">{format(new Date(record.created_at), "dd/MM/yyyy 'às' HH:mm:ss")}</strong> (ID Único do Registro afetado: <code className="bg-slate-200 px-1.5 py-0.5 rounded text-slate-800">{record.record_id}</code>).
            </div>
          </div>

          {(record.old_data || record.new_data) && (
            <div className="space-y-3">
              <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <FileText className="h-3.5 w-3.5" />
                Evidências da Alteração (Antes e Depois)
              </h4>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 bg-slate-50/50 p-4 rounded-xl border border-slate-100">
                {record.old_data && <PayloadDetails title="O que tinha antes (Dados Antigos)" data={record.old_data} />}
                {record.new_data && <PayloadDetails title="Como ficou agora (Dados Novos)" data={record.new_data} />}
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};

const LoadingState = () => (
  <div className="py-16 flex items-center justify-center">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
  </div>
);

const EmptyState = ({ label }: { label: string }) => (
  <Card className="border-slate-300">
    <CardContent className="py-10 text-center text-slate-500">
      <Database className="h-12 w-12 mx-auto mb-4 text-slate-400" />
      <p>{label}</p>
    </CardContent>
  </Card>
);

const DateControl = ({ 
  label, 
  value, 
  onChange 
}: { 
  label: string; 
  value: string; 
  onChange: (val: string) => void;
}) => (
  <div className="flex items-center gap-2 w-full md:w-auto shrink-0 mr-1">
    <span className="text-xs font-bold uppercase text-slate-500">{label}</span>
    <div className="flex items-center bg-white border border-slate-200/90 rounded-xl px-1.5 shadow-2xs gap-1.5 h-9">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => {
          const d = value ? parseISO(value) : new Date();
          if (isValid(d)) onChange(format(subDays(d, 1), 'yyyy-MM-dd'));
        }}
        className="h-7 w-7 text-slate-500 hover:text-slate-800 rounded-lg cursor-pointer shrink-0"
        title="Dia anterior"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      
      <Input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 h-7 w-[105px] text-xs font-semibold text-slate-700 bg-transparent px-0 text-center"
        aria-label={`Data ${label}`}
      />
      
      {value && (() => {
        const d = parseISO(value);
        if (isValid(d)) {
          return (
            <span className="rounded-lg bg-blue-50 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-[#003B71] border border-blue-100/80 shrink-0 select-none ml-0.5">
              {format(d, "EEEE", { locale: ptBR })}
            </span>
          );
        }
        return null;
      })()}

      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => {
          const d = value ? parseISO(value) : new Date();
          if (isValid(d)) onChange(format(addDays(d, 1), 'yyyy-MM-dd'));
        }}
        className="h-7 w-7 text-slate-500 hover:text-slate-800 rounded-lg cursor-pointer shrink-0"
        title="Próximo dia"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  </div>
);

export default AuditLog;
