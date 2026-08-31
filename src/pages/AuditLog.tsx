"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Clock,
  Database,
  Search,
  ShieldCheck,
  User,
} from 'lucide-react';
import { toast } from 'sonner';
import PageHeader from '@/components/PageHeader';
import { CompactDataGrid, type CompactDataGridColumn } from '@/components/CompactDataGrid';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { reportService, AuditLog as AuditLogType } from '@/servicos/reports';

const AuditLog = () => {
  const { hasRole } = useAuth();
  const [logs, setLogs] = useState<AuditLogType[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      const data = await reportService.getAuditLogs(100);
      setLogs(data || []);
    } catch (err) {
      console.error('Erro ao buscar logs de auditoria:', err);
      toast.error('Erro ao carregar logs de auditoria');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const filteredLogs = logs.filter((log) => {
    const term = searchTerm.toLowerCase();
    return (
      (log.action && log.action.toLowerCase().includes(term)) ||
      (log.resource && log.resource.toLowerCase().includes(term)) ||
      (log.user_name && log.user_name.toLowerCase().includes(term)) ||
      (log.user_email && log.user_email.toLowerCase().includes(term))
    );
  });

  const columns: Array<CompactDataGridColumn<AuditLogType>> = useMemo(
    () => [
      {
        key: 'created_at',
        header: 'Data / Hora',
        className: 'w-[20%] min-w-[160px]',
        render: (item) => (
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
            <Clock className="w-3.5 h-3.5 text-blue-600" />
            <span>
              {item.created_at ? item.created_at.split('T')[0].split('-').reverse().join('/') : '-'}
            </span>
            <span className="text-slate-400 font-mono">
              {item.created_at ? item.created_at.split('T')[1]?.substring(0, 8) : ''}
            </span>
          </div>
        ),
      },
      {
        key: 'user',
        header: 'Operador / Usuário',
        className: 'w-[30%] min-w-[200px]',
        render: (item) => (
          <div className="flex items-center gap-2">
            <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <div className="flex flex-col min-w-0">
              <span className="font-bold text-slate-900 truncate">{item.user_name || 'Sistema'}</span>
              <span className="text-xs text-slate-400 truncate">{item.user_email}</span>
            </div>
          </div>
        ),
      },
      {
        key: 'action',
        header: 'Ação Realizada',
        className: 'w-[25%] min-w-[180px]',
        render: (item) => (
          <span className="px-2.5 py-1 rounded-md text-xs font-bold font-mono bg-blue-50 text-blue-700 border border-blue-200">
            {item.action}
          </span>
        ),
      },
      {
        key: 'resource',
        header: 'Recurso Afetado',
        className: 'w-[25%] min-w-[160px]',
        render: (item) => (
          <div className="flex items-center gap-2 text-xs text-slate-700">
            <Database className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="font-semibold">{item.resource}</span>
            {item.resource_id && (
              <span className="text-slate-400 font-mono text-[10px]">
                ({item.resource_id.substring(0, 8)}...)
              </span>
            )}
          </div>
        ),
      },
    ],
    []
  );

  return (
    <div className="h-full min-h-0 bg-slate-100 px-3 pb-3 flex flex-col">
      <PageHeader
        title="Trilha de Auditoria & Conformidade"
        description="Registro imutável de todas as operações e alterações no sistema (LGPD)"
        className="mb-3"
        compact
        loading={loading}
      >
        <div className="flex flex-col md:flex-row flex-wrap w-full items-end gap-2 justify-end">
          <div className="relative min-w-0 flex-1 w-full md:min-w-[240px]">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Buscar por usuário, ação ou recurso..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="delphi-input h-9 pl-10 w-full"
            />
          </div>
        </div>
      </PageHeader>

      <CompactDataGrid
        className="flex-1"
        columns={columns}
        rows={filteredLogs}
        getRowKey={(item) => item.id}
        emptyMessage="Nenhum registro de auditoria encontrado"
        minWidth="800px"
        loading={loading}
        pagination={true}
        resetPaginationDependency={searchTerm}
      />
    </div>
  );
};

export default AuditLog;
