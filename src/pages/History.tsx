"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { addDays, endOfMonth, format, isValid, parse, startOfMonth, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ArrowUpDown, Calendar, ChevronLeft, ChevronRight, ClipboardList, Download, Loader2, Search, Stethoscope, User, FileText, Eye, AlertTriangle, Clock, CheckCircle, Activity, CheckCheck, XCircle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { CompactDataGrid, type CompactDataGridColumn } from '@/components/CompactDataGrid';
import PageHeader from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { SimpleTooltip } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { ActionButton } from '@/components/ui/action-button';
import { StatusBadge } from '@/components/ui/combobox-helpers';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useAuth } from '@/contexts/AuthContext';
import { generateAndDownloadModuleExport, type ExportFormat } from '@/lib/officialExports';
import { formatOperationalDateTime, formatOperationalDate, formatOperationalTime } from '@/lib/operationalDateTime';
import { isSuspiciousData, capitalizeFirstLetter } from '@/utils/formatters';
import { censorCPF } from '@/utils/masks';
import { chamarApiPost, chamarApiGet } from '@/lib/workerApi';
import MedicalRecordDialog from '@/components/MedicalRecordDialog';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useConfirm } from '@/hooks/useConfirm';
import { buildIdempotencyKey } from '@/lib/idempotency';
import { getOperationalErrorMessage } from '@/lib/errors';
import { normalizarEntradaTexto } from '@/utils/formatters';
import { cn } from '@/lib/utils';
import { QuickFilterButton } from '@/components/ui/quick-filter-button';
import type { HistoryAppointment } from '@/types/history';
import { buscarLimitesConsultas } from '@/servicos/buscarLimitesConsultas';
import { formatarRegistroProfissional } from '@/utils/formatar-registro';
import { SPECIALTY_ICONS } from '@/pages/Specialties';

const History = () => {
  const { hasPermission, institutionId, userRole, doctorId } = useAuth();
  const isSuperadmin = userRole === 'superadmin';
  const isOwnRecord = (apptDoctorId: string) => userRole === 'medico' && Boolean(doctorId) && apptDoctorId === doctorId;
  const dateFromRef = useRef<HTMLInputElement>(null);
  const dateToRef = useRef<HTMLInputElement>(null);
  const [appointments, setAppointments] = useState<HistoryAppointment[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [mapaIconesEspecialidades, setMapaIconesEspecialidades] = useState<Record<string, string>>({});

  useEffect(() => {
    const obterIconesEspecialidades = async () => {
      try {
        const { data, error } = await chamarApiPost('/api/table/specialties/select', {});
        if (error) {
          console.error('[obterIconesEspecialidades] Erro ao buscar especialidades:', error);
          return;
        }
        if (data) {
          const mapa: Record<string, string> = {};
          data.forEach((especialidade: { name: string | null; icon: string | null }) => {
            if (especialidade.name && especialidade.icon) {
              mapa[especialidade.name.toUpperCase()] = especialidade.icon;
            }
          });
          setMapaIconesEspecialidades(mapa);
        }
      } catch (erro) {
        console.error('[obterIconesEspecialidades] Falha ao carregar ícones:', erro);
      }
    };
    void obterIconesEspecialidades();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);
  // Padrão: últimos 30 dias para evitar buscar o histórico inteiro na primeira carga
  const [dateFrom, setDateFrom] = useState(() => format(subDays(new Date(), 29), 'dd/MM/yyyy'));
  const [dateTo, setDateTo] = useState(() => format(new Date(), 'dd/MM/yyyy'));
  // Limites de datas encontrados no histórico (primeira e última consulta)
  const [limitesDatas, setLimitesDatas] = useState<{ antiga: string; recente: string }>({ antiga: '', recente: '' });
  const [ordemData, setOrdemData] = useState<'recente' | 'antigo'>('recente');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<HistoryAppointment | null>(null);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const canExportHistory = hasPermission('appointments', 'export', institutionId);
  const { confirm: confirmDialog, ConfirmationDialog } = useConfirm();
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const [cancellingAppointmentId, setCancellingAppointmentId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const handleConfirmCancel = async () => {
    if (!cancellingAppointmentId || !cancelReason.trim()) {
      toast.error('Informe o motivo do cancelamento.');
      return;
    }

    const confirmed = await confirmDialog('Confirmar cancelamento desta consulta?');
    if (!confirmed) return;

    try {
      const { error } = await chamarApiPost('/api/rpc/api_set_appointment_status', {
        p_appointment_id: cancellingAppointmentId,
        p_status: 'cancelado',
        p_reason: cancelReason,
        p_idempotency_key: await buildIdempotencyKey('cancel_appointment_history', { appointment_id: cancellingAppointmentId, reason: cancelReason }),
      });
      if (error) throw error;
      toast.success('Consulta cancelada com sucesso.');
      setIsCancelDialogOpen(false);
      setCancelReason('');
      setCancellingAppointmentId(null);
      void refetchHistory();
    } catch (error) {
      console.error('Erro ao cancelar:', error);
      toast.error(await getOperationalErrorMessage(error, 'Erro ao cancelar consulta'));
    }
  };

  const getProfessionalRegistration = (appointment: Pick<HistoryAppointment, 'doctor_council' | 'doctor_crm' | 'doctor_registration_label'>) => {
    return formatarRegistroProfissional(appointment.doctor_council, appointment.doctor_crm);
  };

  const parseDateBR = (value: string): Date | null => {
    const parsed = parse(value, 'dd/MM/yyyy', new Date());
    return isValid(parsed) ? parsed : null;
  };

  const dateBRToInputValue = (value: string) => {
    const parsed = value ? parseDateBR(value) : null;
    return parsed ? format(parsed, 'yyyy-MM-dd') : '';
  };

  const inputValueToDateBR = (value: string) => {
    const parsed = parse(value, 'yyyy-MM-dd', new Date());
    return value && isValid(parsed) ? format(parsed, 'dd/MM/yyyy') : '';
  };

  const alterarDataDe = (dias: number) => {
    const dataBase = dateFrom || limitesDatas.antiga;
    const dataAtual = dataBase ? parseDateBR(dataBase) : new Date();
    if (dataAtual && isValid(dataAtual)) {
      const novaData = dias > 0 ? addDays(dataAtual, dias) : subDays(dataAtual, Math.abs(dias));
      const novaDataBR = format(novaData, 'dd/MM/yyyy');
      setDateFrom(novaDataBR);
      const limiteA = dateTo || limitesDatas.recente;
      if (limiteA) {
        const toDateObj = parseDateBR(limiteA);
        if (toDateObj && toDateObj < novaData) {
          setDateTo(novaDataBR);
        }
      }
    }
  };

  const alterarDataA = (dias: number) => {
    const dataBase = dateTo || limitesDatas.recente;
    const dataAtual = dataBase ? parseDateBR(dataBase) : new Date();
    if (dataAtual && isValid(dataAtual)) {
      const novaData = dias > 0 ? addDays(dataAtual, dias) : subDays(dataAtual, Math.abs(dias));
      const limiteDe = dateFrom || limitesDatas.antiga;
      const fromDateObj = limiteDe ? parseDateBR(limiteDe) : null;
      if (fromDateObj && novaData < fromDateObj) {
        setDateTo(limiteDe);
      } else {
        setDateTo(format(novaData, 'dd/MM/yyyy'));
      }
    }
  };

  const handleQuickFilter = async (type: 'ontem' | 'hoje' | 'amanha' | '7days' | '15days' | '30days' | 'thisMonth' | 'tudo' | 'clear') => {
    const now = new Date();
    if (type === 'ontem') {
      const yesterday = subDays(now, 1);
      setDateFrom(format(yesterday, 'dd/MM/yyyy'));
      setDateTo(format(yesterday, 'dd/MM/yyyy'));
      return;
    }
    if (type === 'hoje') {
      setDateFrom(format(now, 'dd/MM/yyyy'));
      setDateTo(format(now, 'dd/MM/yyyy'));
      return;
    }
    if (type === 'amanha') {
      const tomorrow = addDays(now, 1);
      setDateFrom(format(tomorrow, 'dd/MM/yyyy'));
      setDateTo(format(tomorrow, 'dd/MM/yyyy'));
      return;
    }
    if (type === '7days') {
      setDateFrom(format(subDays(now, 6), 'dd/MM/yyyy'));
      setDateTo(format(now, 'dd/MM/yyyy'));
      return;
    }
    if (type === '15days') {
      setDateFrom(format(subDays(now, 14), 'dd/MM/yyyy'));
      setDateTo(format(now, 'dd/MM/yyyy'));
      return;
    }
    if (type === '30days') {
      setDateFrom(format(subDays(now, 29), 'dd/MM/yyyy'));
      setDateTo(format(now, 'dd/MM/yyyy'));
      return;
    }
    if (type === 'thisMonth') {
      setDateFrom(format(startOfMonth(now), 'dd/MM/yyyy'));
      setDateTo(format(endOfMonth(now), 'dd/MM/yyyy'));
      return;
    }
    if (type === 'tudo') {
      if (limitesDatas.antiga && limitesDatas.recente) {
        setDateFrom(limitesDatas.antiga);
        setDateTo(limitesDatas.recente);
        return;
      }
      try {
        const limites = await buscarLimitesConsultas();
        if (limites) {
          setLimitesDatas({ antiga: limites.antiga, recente: limites.recente });
          setDateFrom(limites.antiga);
          setDateTo(limites.recente);
          return;
        }
      } catch (err) {
        console.error('Erro ao buscar limites de data para Tudo:', err);
      }
      setDateFrom('');
      setDateTo('');
      return;
    }
    setDateFrom('');
    setDateTo('');
  };

  const isFilterActive = useCallback((type: 'ontem' | 'hoje' | 'amanha' | '7days' | '15days' | '30days' | 'thisMonth' | 'tudo') => {
    const now = new Date();
    switch (type) {
      case 'tudo':
        return (
          (!dateFrom && !dateTo) ||
          (Boolean(limitesDatas.antiga) && Boolean(limitesDatas.recente) && dateFrom === limitesDatas.antiga && dateTo === limitesDatas.recente)
        );
      case 'ontem': {
        const yesterday = subDays(now, 1);
        return dateFrom === format(yesterday, 'dd/MM/yyyy') && dateTo === format(yesterday, 'dd/MM/yyyy');
      }
      case 'hoje':
        return dateFrom === format(now, 'dd/MM/yyyy') && dateTo === format(now, 'dd/MM/yyyy');
      case 'amanha': {
        const tomorrow = addDays(now, 1);
        return dateFrom === format(tomorrow, 'dd/MM/yyyy') && dateTo === format(tomorrow, 'dd/MM/yyyy');
      }
      case '7days':
        return dateFrom === format(subDays(now, 6), 'dd/MM/yyyy') && dateTo === format(now, 'dd/MM/yyyy');
      case '15days':
        return dateFrom === format(subDays(now, 14), 'dd/MM/yyyy') && dateTo === format(now, 'dd/MM/yyyy');
      case '30days':
        return dateFrom === format(subDays(now, 29), 'dd/MM/yyyy') && dateTo === format(now, 'dd/MM/yyyy');
      case 'thisMonth':
        return dateFrom === format(startOfMonth(now), 'dd/MM/yyyy') && dateTo === format(endOfMonth(now), 'dd/MM/yyyy');
      default:
        return false;
    }
  }, [dateFrom, dateTo, limitesDatas]);

  const fromDateObj = dateFrom ? parseDateBR(dateFrom) : null;
  const toDateObj = dateTo ? parseDateBR(dateTo) : null;

  const { data: historyData, isLoading: loadingHistory, refetch: refetchHistory } = useQuery({
    queryKey: ['history', statusFilter, dateFrom, dateTo, debouncedSearch],
    queryFn: async () => {
      if (dateFrom && !fromDateObj) throw new Error('Data inicial inválida. Use DD/MM/AAAA.');
      if (dateTo && !toDateObj) throw new Error('Data final inválida. Use DD/MM/AAAA.');

      const { data, error } = await chamarApiPost('/api/rpc/list_history_snapshot', {
        p_status: statusFilter,
        p_date_from: fromDateObj ? fromDateObj.toISOString().slice(0, 10) : null,
        p_date_to: toDateObj ? toDateObj.toISOString().slice(0, 10) : null,
        p_search: debouncedSearch.trim() || null,
        // Limite aumentado para 5000 — garante que todo o histórico seja exibido
        p_limit: 5000,
      });

      if (error) throw error;
      const listaConsultas = (data as unknown as HistoryAppointment[] | null) || [];

      // Atualiza limites de datas usando reduce (seguro para listas grandes — sem spread)
      if (listaConsultas.length > 0) {
        const timestamps = listaConsultas
          .map((c) => new Date(c.appointment_date).getTime())
          .filter((t) => !isNaN(t));

        if (timestamps.length > 0) {
          const menorTimestamp = timestamps.reduce((min, t) => (t < min ? t : min), timestamps[0]);
          const maiorTimestamp = timestamps.reduce((max, t) => (t > max ? t : max), timestamps[0]);
          setLimitesDatas({
            antiga: format(new Date(menorTimestamp), 'dd/MM/yyyy'),
            recente: format(new Date(maiorTimestamp), 'dd/MM/yyyy'),
          });
        }
      }

      return listaConsultas;
    },
    // Cache de 2 minutos — evita refetch desnecessário ao trocar de aba e voltar
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (historyData) setAppointments(historyData);
  }, [historyData]);

  const loading = loadingHistory;

  const getStatusBadge = (status: string) => {
    const map: Record<string, string> = {
      agendado: 'bg-amber-50 text-amber-700 border-amber-200 shadow-sm',
      confirmado: 'bg-blue-50 text-blue-700 border-blue-200 shadow-sm',
      em_atendimento: 'bg-purple-50 text-purple-700 border-purple-200 shadow-sm',
      concluido: 'bg-emerald-50 text-emerald-700 border-emerald-200 shadow-sm',
      cancelado: 'bg-rose-50 text-rose-700 border-rose-200 shadow-sm',
      reagendado: 'bg-indigo-50 text-indigo-700 border-indigo-200 shadow-sm',
      remarcado: 'bg-indigo-50 text-indigo-700 border-indigo-200 shadow-sm',
      nao_compareceu: 'bg-slate-50 text-slate-700 border-slate-200 shadow-sm',
    };
    return `font-semibold text-xs px-2.5 py-0.5 rounded-full border flex items-center w-fit whitespace-nowrap ${map[status] || 'bg-gray-100 text-gray-700 border-gray-300'}`;
  };

  const getStatusContent = (status: string) => {
    const textMap: Record<string, string> = {
      agendado: 'Agendado',
      confirmado: 'Confirmado',
      em_atendimento: 'Em Atendimento',
      concluido: 'Concluído',
      cancelado: 'Cancelado',
      reagendado: 'Reagendado',
      remarcado: 'Reagendado',
      nao_compareceu: 'Faltou',
    };
    
    const iconMap: Record<string, React.ReactNode> = {
      agendado: <Clock className="h-3 w-3 mr-1.5 shrink-0" />,
      confirmado: <CheckCircle className="h-3 w-3 mr-1.5 shrink-0" />,
      em_atendimento: <Activity className="h-3 w-3 mr-1.5 shrink-0" />,
      concluido: <CheckCheck className="h-3 w-3 mr-1.5 shrink-0" />,
      cancelado: <XCircle className="h-3 w-3 mr-1.5 shrink-0" />,
      reagendado: <RefreshCw className="h-3 w-3 mr-1.5 shrink-0" />,
      remarcado: <RefreshCw className="h-3 w-3 mr-1.5 shrink-0" />,
      nao_compareceu: <AlertTriangle className="h-3 w-3 mr-1.5 shrink-0" />,
    };

    const text = textMap[status] || status.replace('_', ' ').charAt(0).toUpperCase() + status.replace('_', ' ').slice(1);
    const icon = iconMap[status] || null;

    return (
      <>
        {icon}
        {text}
      </>
    );
  };

  const handleExport = async (format: ExportFormat) => {
    const fromDate = dateFrom ? parseDateBR(dateFrom) : null;
    const toDate = dateTo ? parseDateBR(dateTo) : null;
    if (dateFrom && !fromDate) return toast.error('Data inicial inválida. Use DD/MM/AAAA.');
    if (dateTo && !toDate) return toast.error('Data final inválida. Use DD/MM/AAAA.');

    setExporting(format);
    try {
      await generateAndDownloadModuleExport('history', format, {
        status: statusFilter,
        search: debouncedSearch.trim() || null,
        date_from: fromDate ? fromDate.toISOString().slice(0, 10) : null,
        date_to: toDate ? toDate.toISOString().slice(0, 10) : null,
      });
    } catch (error) {
      toast.error(error instanceof Error ? (error as any)?.message || error : 'Não foi possível gerar a exportação.');
    } finally {
      setExporting(null);
    }
  };

  const formatCensoredCPF = (cpf: string | null | undefined) => {
    if (!cpf) return '-';
    return censorCPF(cpf);
  };

  const filteredAppointments = useMemo(() => {
    return [...appointments].sort((a, b) => {
      const diff = new Date(a.appointment_date).getTime() - new Date(b.appointment_date).getTime();
      return ordemData === 'recente' ? -diff : diff;
    });
  }, [appointments, ordemData]);

  const historyColumns: Array<CompactDataGridColumn<HistoryAppointment>> = useMemo(() => [
    {
      key: 'patient',
      header: 'Paciente',
      filterable: true,
      filterValue: (appointment: HistoryAppointment) => appointment.patient_name || 'N/A',
      render: (appointment: HistoryAppointment) => {
        const suspicious = isSuspiciousData(appointment.patient_cpf);
        return (
          <div className="min-w-[240px]">
            <p className="truncate font-semibold text-slate-900" title={appointment.patient_name}>{appointment.patient_name}</p>
            <div className="flex items-center gap-1.5">
              <p className="font-mono text-[11px] text-slate-500">{formatCensoredCPF(appointment.patient_cpf)}</p>
              {suspicious && <span title="CPF possivelmente genérico ou inválido"><AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" /></span>}
            </div>
          </div>
        );
      },
    },
    {
      key: 'professional',
      header: 'Profissional',
      filterable: true,
      filterValue: (appointment: HistoryAppointment) => appointment.doctor_name || 'N/A',
      render: (appointment: HistoryAppointment) => (
        <div className="min-w-[240px]">
          <p className="truncate font-medium text-slate-900" title={appointment.doctor_name}>{appointment.doctor_name}</p>
          <p className="text-[11px] text-slate-500">{getProfessionalRegistration(appointment) || '-'}</p>
        </div>
      ),
    },
    {
      key: 'date',
      header: (
        <button
          type="button"
          onClick={() => setOrdemData((prev: 'recente' | 'antigo') => prev === 'recente' ? 'antigo' : 'recente')}
          title={ordemData === 'recente' ? 'Mais recente primeiro — clique para mais antigo' : 'Mais antigo primeiro — clique para mais recente'}
          className="flex items-center gap-1.5 font-semibold uppercase tracking-wider text-xs hover:text-blue-600 transition-colors group"
        >
          Data
          <span className={`transition-transform duration-200 ${ordemData === 'antigo' ? 'rotate-180' : ''}`}>
            <ArrowUpDown className="h-3.5 w-3.5 text-slate-400 group-hover:text-blue-500" />
          </span>
        </button>
      ),
      render: (appointment: HistoryAppointment) => (
        <div className="flex flex-col py-0.5">
          <span className="font-extrabold text-sm text-[#00427A]">{formatOperationalTime(appointment.appointment_date)}</span>
          <span className="text-[11px] text-slate-500 font-bold">{formatOperationalDate(appointment.appointment_date)}</span>
        </div>
      ),
    },
    { 
      key: 'specialty', 
      header: 'Especialidade', 
      filterable: true,
      filterValue: (appointment: HistoryAppointment) => appointment.specialty_name || 'N/A',
      filterLabel: (val: string) => {
        const chaveIcone = mapaIconesEspecialidades[val.toUpperCase()];
        const ComponenteIcone = chaveIcone ? SPECIALTY_ICONS[chaveIcone] : Stethoscope;
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-800 uppercase tracking-wider">
            {ComponenteIcone && <ComponenteIcone className="h-3.5 w-3.5 text-slate-700 shrink-0" />}
            {val}
          </span>
        );
      },
      render: (appointment: HistoryAppointment) => {
        const bgHex = appointment.specialty_color || '#e2e8f0';
        const textHex = appointment.specialty_color || '#475569';
        return (
          <span 
            className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider shadow-2xs" 
            style={{ backgroundColor: `${bgHex}15`, color: textHex, border: `1px solid ${bgHex}50` }}
          >
            {appointment.specialty_name || 'N/A'}
          </span>
        );
      }
    },
    { 
      key: 'status', 
      header: 'Situação', 
      className: 'w-[130px]', 
      filterable: true,
      filterValue: (appointment: HistoryAppointment) => appointment.status,
      filterLabel: (status: string) => <span className="flex items-center text-slate-700 font-medium">{getStatusContent(status)}</span>,
      render: (appointment: HistoryAppointment) => {
        const badgeElement = (
          <Badge className={getStatusBadge(appointment.status)}>{getStatusContent(appointment.status)}</Badge>
        );
        return (
          <div className="flex items-center py-0.5">
            {appointment.status === 'cancelado' && appointment.cancel_reason ? (
              <SimpleTooltip content={`Motivo: ${appointment.cancel_reason}`}>
                <span className="cursor-help inline-block">{badgeElement}</span>
              </SimpleTooltip>
            ) : (
              badgeElement
            )}
          </div>
        );
      }
    },
    { key: 'reason', header: 'Motivo', render: (appointment: HistoryAppointment) => <span className="block max-w-[300px] truncate" title={appointment.reason}>{capitalizeFirstLetter(appointment.reason) || '-'}</span> },
    {
      key: 'actions',
      header: 'Ações',
      className: 'w-[180px]',
      cellClassName: '',
      sticky: 'right',
      render: (appointment: HistoryAppointment) => {
        const isSuperAdmin = userRole === 'superadmin';
        const isOwnDoctor = Boolean(doctorId && appointment.doctor_id && doctorId === appointment.doctor_id);
        const canViewMedicalRecord = isSuperAdmin || isOwnDoctor;

        if (!canViewMedicalRecord && !isSuperAdmin) return null;

        return (
          <div className="flex flex-nowrap gap-1.5">
            {canViewMedicalRecord && (
              <ActionButton 
                onClick={() => {
                  setSelectedAppointment(appointment); 
                  setIsDialogOpen(true);
                }} 
                icon={<ClipboardList className="h-4 w-4" />}
                label="Prontuário"
                titleTooltip="Ver Prontuário"
                primary
              />
            )}
            {isSuperAdmin && appointment.status !== 'cancelado' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setCancellingAppointmentId(appointment.id);
                  setCancelReason('');
                  setIsCancelDialogOpen(true);
                }}
                className="h-8 px-2.5 bg-white border-rose-200 hover:bg-rose-50 hover:border-rose-300 hover:text-rose-600 text-rose-500 text-xs font-semibold shadow-2xs flex items-center gap-1"
                title="Cancelar consulta"
              >
                <XCircle className="h-3.5 w-3.5 shrink-0" />
                <span>Cancelar</span>
              </Button>
            )}
          </div>
        );
      },
    },
  ], [ordemData, appointments, mapaIconesEspecialidades, userRole, doctorId]);


  return (
    <div className="h-full min-h-0 bg-slate-100 px-3 pb-3 relative">
      <div className="flex h-full min-h-0 w-full flex-col">
        <PageHeader title="Histórico de Consultas" description="Atendimentos finalizados, cancelados e ausências registradas" compact actionsClassName="lg:flex-1" loading={loading}>
          <div className="flex w-full flex-col md:flex-row items-end md:items-center gap-2">
            <div className="relative flex-1 w-full min-w-[200px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input placeholder="Buscar paciente, CPF, profissional, registro ou especialidade..." value={searchTerm} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(event.target.value)} className="delphi-input h-9 pl-10 w-full" />
            </div>
            <div className="w-full md:w-[185px] shrink-0">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="delphi-input h-9 w-full"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  {['all', 'agendado', 'confirmado', 'em_atendimento', 'concluido', 'cancelado', 'nao_compareceu', 'reagendado'].map(statusId => (
                    <SelectItem key={statusId} value={statusId}>
                      <div className="flex items-center gap-2">
                        <StatusBadge statusId={statusId} />
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-1.5 w-full md:w-auto shrink-0">
              <span className="text-xs font-bold uppercase text-slate-500">De</span>
              <div className="flex items-center bg-white border border-slate-200/90 rounded-xl px-1.5 shadow-2xs gap-1.5 h-9">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => alterarDataDe(-1)}
                  className="h-7 w-7 text-slate-500 hover:text-slate-800 rounded-lg cursor-pointer shrink-0"
                  title="Dia anterior"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Input
                  ref={dateFromRef}
                  type="date"
                  value={dateBRToInputValue(dateFrom)}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                    const novaDataDe = event.target.value;
                    const novaDateFromBR = inputValueToDateBR(novaDataDe);
                    setDateFrom(novaDateFromBR);
                    // Se o "a" atual for anterior ao novo "De", iguala ao "De"
                    const dataA = dateTo;
                    if (dataA && novaDataDe && dateBRToInputValue(dataA) < novaDataDe) {
                      setDateTo(novaDateFromBR);
                    }
                  }}
                  className="border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 h-7 w-[105px] text-xs font-semibold text-slate-700 bg-transparent px-0 text-center cursor-pointer"
                  onClick={(e) => {
                    try { e.currentTarget.showPicker(); } catch (err) { void err; }
                  }}
                  aria-label="Data inicial do histórico"
                />
                <Calendar
                  className="h-3.5 w-3.5 text-slate-400 shrink-0 cursor-pointer hover:text-slate-600 transition-colors"
                  onClick={() => {
                    if (dateFromRef.current && 'showPicker' in HTMLInputElement.prototype) {
                      try { dateFromRef.current.showPicker(); } catch (e) { dateFromRef.current.focus(); }
                    } else {
                      dateFromRef.current?.focus();
                    }
                  }}
                />
                {dateFrom && (() => {
                  const parsed = parseDateBR(dateFrom);
                  if (parsed && isValid(parsed)) {
                    return (
                      <span className="rounded-lg bg-blue-50 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-[#003B71] border border-blue-100/80 shrink-0 select-none ml-0.5">
                        {format(parsed, "EEEE", { locale: ptBR })}
                      </span>
                    );
                  }
                  return null;
                })()}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => alterarDataDe(1)}
                  className="h-7 w-7 text-slate-500 hover:text-slate-800 rounded-lg cursor-pointer shrink-0"
                  title="Próximo dia"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <span className="text-xs font-bold uppercase text-slate-500 mx-1">a</span>
              <div className="flex items-center bg-white border border-slate-200/90 rounded-xl px-1.5 shadow-2xs gap-1.5 h-9">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => alterarDataA(-1)}
                  className="h-7 w-7 text-slate-500 hover:text-slate-800 rounded-lg cursor-pointer shrink-0"
                  title="Dia anterior"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Input
                  ref={dateToRef}
                  type="date"
                  value={dateBRToInputValue(dateTo)}
                  min={dateBRToInputValue(dateFrom) || undefined}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                    const novaDataA = event.target.value;
                    const dataDe = dateFrom;
                    const fromISO = dateBRToInputValue(dataDe);
                    // Bloqueia data anterior ao De — mesmo se digitada manualmente
                    if (fromISO && novaDataA && novaDataA < fromISO) {
                      setDateTo(dataDe);
                    } else {
                      setDateTo(inputValueToDateBR(novaDataA));
                    }
                  }}
                  className="border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 h-7 w-[105px] text-xs font-semibold text-slate-700 bg-transparent px-0 text-center cursor-pointer"
                  onClick={(e) => {
                    try { e.currentTarget.showPicker(); } catch (err) { void err; }
                  }}
                  aria-label="Data final do histórico"
                />
                <Calendar
                  className="h-3.5 w-3.5 text-slate-400 shrink-0 cursor-pointer hover:text-slate-600 transition-colors"
                  onClick={() => {
                    if (dateToRef.current && 'showPicker' in HTMLInputElement.prototype) {
                      try { dateToRef.current.showPicker(); } catch (e) { dateToRef.current.focus(); }
                    } else {
                      dateToRef.current?.focus();
                    }
                  }}
                />
                {dateTo && (() => {
                  const parsed = parseDateBR(dateTo);
                  if (parsed && isValid(parsed)) {
                    return (
                      <span className="rounded-lg bg-blue-50 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-[#003B71] border border-blue-100/80 shrink-0 select-none ml-0.5">
                        {format(parsed, "EEEE", { locale: ptBR })}
                      </span>
                    );
                  }
                  return null;
                })()}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => alterarDataA(1)}
                  className="h-7 w-7 text-slate-500 hover:text-slate-800 rounded-lg cursor-pointer shrink-0"
                  title="Próximo dia"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="flex flex-nowrap gap-1.5 w-full md:w-auto shrink-0">
              {canExportHistory && (
                <Button variant="outline" className="h-9 w-9 p-0" disabled={exporting !== null} onClick={() => { void handleExport('excel'); }}>
                  {exporting !== null ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                </Button>
              )}
            </div>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2">
            {/* Atalhos: Ontem / Hoje / Amanhã */}
            <div className="inline-flex items-center h-8 bg-slate-100/80 border border-slate-200/80 p-0.5 rounded-xl gap-0.5 shadow-2xs box-border shrink-0">
              <Button 
                type="button"
                variant="ghost" 
                size="sm" 
                onClick={() => handleQuickFilter('ontem')} 
                className={cn(
                  "h-full px-2.5 sm:px-3 text-xs font-bold transition-all duration-200 rounded-lg flex items-center gap-1 leading-none border border-transparent",
                  isFilterActive('ontem') 
                    ? "bg-white text-blue-600 shadow-2xs border-slate-200/60 font-black" 
                    : "text-slate-600 hover:text-slate-900 hover:bg-white/60 font-bold"
                )}
              >
                <ChevronLeft className="h-3.5 w-3.5" /> 
                <span>Ontem</span>
              </Button>
              
              <Button 
                type="button"
                variant="ghost" 
                size="sm" 
                onClick={() => handleQuickFilter('hoje')} 
                className={cn(
                  "h-full px-3 text-xs font-bold transition-all duration-200 rounded-lg flex items-center leading-none border border-transparent",
                  isFilterActive('hoje') 
                    ? "bg-white text-blue-600 shadow-2xs border-slate-200/60 font-black" 
                    : "text-slate-600 hover:text-slate-900 hover:bg-white/60 font-bold"
                )}
              >
                Hoje
              </Button>

              <Button 
                type="button"
                variant="ghost" 
                size="sm" 
                onClick={() => handleQuickFilter('amanha')} 
                className={cn(
                  "h-full px-2.5 sm:px-3 text-xs font-bold transition-all duration-200 rounded-lg flex items-center gap-1 leading-none border border-transparent",
                  isFilterActive('amanha') 
                    ? "bg-white text-blue-600 shadow-2xs border-slate-200/60 font-black" 
                    : "text-slate-600 hover:text-slate-900 hover:bg-white/60 font-bold"
                )}
              >
                <span>Amanhã</span>
                <ChevronRight className="h-3.5 w-3.5" /> 
              </Button>
            </div>

            <div className="h-5 w-[1px] bg-slate-300 shrink-0 mx-0.5 self-center" />

            {/* Atalhos: períodos */}
            <QuickFilterButton active={isFilterActive('7days')} label="7 dias" onClick={() => handleQuickFilter('7days')} />
            <QuickFilterButton active={isFilterActive('15days')} label="15 dias" onClick={() => handleQuickFilter('15days')} />
            <QuickFilterButton active={isFilterActive('30days')} label="30 dias" onClick={() => handleQuickFilter('30days')} />
            <QuickFilterButton active={isFilterActive('thisMonth')} label="Este mês" onClick={() => handleQuickFilter('thisMonth')} />
            
            <div className="h-5 w-[1px] bg-slate-300 shrink-0 mx-0.5 self-center" />
            
            <QuickFilterButton active={isFilterActive('tudo')} label="Tudo" onClick={() => { void handleQuickFilter('tudo'); }} />

            <QuickFilterButton variant="clear" onClick={() => { setSearchTerm(''); setStatusFilter('all'); handleQuickFilter('clear'); }} label="Limpar" />
          </div>
        </PageHeader>

        <main className="flex-1 flex flex-col min-h-0 overflow-hidden pt-2">
          <CompactDataGrid
            className="flex-1"
            columns={historyColumns}
            rows={filteredAppointments}
            getRowKey={(appointment) => appointment.id}
            emptyMessage={
              <div className="flex flex-col items-center justify-center p-8 text-center">
                <div className="bg-slate-100 p-4 rounded-full mb-4">
                  <FileText className="h-8 w-8 text-slate-400" />
                </div>
                <p className="text-lg font-bold text-slate-700">
                  {statusFilter === 'all' && 'Nenhuma consulta no histórico'}
                  {statusFilter === 'agendado' && 'Nenhuma consulta agendada'}
                  {statusFilter === 'confirmado' && 'Nenhuma consulta confirmada'}
                  {statusFilter === 'em_atendimento' && 'Nenhuma consulta em atendimento'}
                  {statusFilter === 'concluido' && 'Nenhuma consulta concluída'}
                  {statusFilter === 'cancelado' && 'Nenhuma consulta cancelada'}
                  {statusFilter === 'nao_compareceu' && 'Nenhuma ausência registrada'}
                </p>
                <p className="text-sm text-slate-500 max-w-sm mt-1">
                  {statusFilter === 'all' && 'Não encontramos registros de consultas no histórico para o período.'}
                  {statusFilter === 'agendado' && 'Não há consultas agendadas arquivadas no período selecionado.'}
                  {statusFilter === 'confirmado' && 'Não existem consultas confirmadas registradas para o período.'}
                  {statusFilter === 'em_atendimento' && 'Não há registros de atendimentos em andamento para este período.'}
                  {statusFilter === 'concluido' && 'Nenhuma consulta finalizada foi encontrada no período selecionado.'}
                  {statusFilter === 'cancelado' && 'Nenhuma consulta cancelada foi encontrada no período selecionado.'}
                  {statusFilter === 'nao_compareceu' && 'Nenhuma ausência de paciente foi registrada no período selecionado.'}
                </p>
              </div>
            }
            minWidth="1320px"

            loading={loading}
            pagination={true}
            resetPaginationDependency={searchTerm + statusFilter}
          />
        </main>
        <div className="hidden">
          {filteredAppointments.length === 0 ? (
            <Card className="border-slate-300">
              <CardContent className="py-8 text-center text-slate-500">
                <FileText className="h-12 w-12 mx-auto mb-4 text-slate-400" />
                <p>Nenhuma consulta encontrada no histórico</p>
              </CardContent>
            </Card>
          ) : (
            filteredAppointments.map((appointment: HistoryAppointment) => (
              <Card key={appointment.id} className="hover:shadow-md transition-shadow border-slate-300">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="flex items-center gap-2">
                          <User className="h-5 w-5 text-slate-400" />
                          <span className="font-semibold text-slate-900">{appointment.patient_name}</span>
                          <span className="text-sm text-slate-500">({appointment.patient_cpf ? censorCPF(appointment.patient_cpf) : 'CPF não informado'})</span>
                        </div>
                        <Badge className={getStatusBadge(appointment.status)}>{getStatusContent(appointment.status)}</Badge>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                        <Info icon={<Stethoscope className="h-4 w-4 text-slate-400" />} label="Profissional" value={`${appointment.doctor_name} - ${getProfessionalRegistration(appointment)}`} />
                        <Info icon={<Calendar className="h-4 w-4 text-slate-400" />} label="Data" value={formatOperationalDateTime(appointment.appointment_date)} />
                        <Info label="Especialidade" value={appointment.specialty_name || 'N/A'} />
                      </div>

                      <div className="mt-4">
                        <p className="text-sm text-slate-600">Motivo</p>
                        <p className="text-slate-900">{appointment.reason}</p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => { setSelectedAppointment(appointment); setIsDialogOpen(true); }} className="ml-4">
                      <Eye className="h-4 w-4" />
                      Ver
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {selectedAppointment && (
          <MedicalRecordDialog 
            open={isDialogOpen} 
            onClose={() => { setIsDialogOpen(false); setSelectedAppointment(null); }} 
            appointmentId={selectedAppointment.id} 
            initialData={selectedAppointment}
            mode={isSuperadmin || isOwnRecord(selectedAppointment.doctor_id) ? 'edit' : 'view'}
            allowClinicalActions={isSuperadmin || isOwnRecord(selectedAppointment.doctor_id)}
            onSuccess={() => {}}
          />
        )}

        <Dialog open={isCancelDialogOpen} onOpenChange={setIsCancelDialogOpen}>
          <DialogContent className="max-w-md bg-white">
            <DialogTitle className="text-red-900">Cancelar Consulta</DialogTitle>
            <DialogDescription className="text-sm text-slate-600 mb-2">Informe o motivo do cancelamento. A ação será registrada.</DialogDescription>
            <div className="space-y-4">
              <Textarea
                value={cancelReason}
                onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => setCancelReason(event.target.value.toUpperCase())}
                onBlur={(event: React.FocusEvent<HTMLTextAreaElement>) => setCancelReason(normalizarEntradaTexto(event.target.value))}
                placeholder="Motivo..."
                style={{ textTransform: 'uppercase' }}
                className="delphi-input border-red-200 focus:border-red-500"
                rows={3}
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsCancelDialogOpen(false)}>Voltar</Button>
                <Button onClick={(e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.blur(); void handleConfirmCancel(); }} className="bg-red-600 hover:bg-red-700 text-white">Confirmar Cancelamento</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <ConfirmationDialog />
      </div>
    </div>
  );
};

const Info = ({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) => (
  <div className="flex items-center gap-2">
    {icon}
    <div>
      <p className="text-slate-600 text-sm">{label}</p>
      <p className="font-medium text-slate-900">{value}</p>
    </div>
  </div>
);

export default History;
