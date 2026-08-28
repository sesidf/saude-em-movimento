"use client";

import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { parse, isValid, format, subDays, addDays, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ArrowUpDown, Calendar as CalendarIcon, CheckCircle, CheckCircle2, CheckCheck, ChevronLeft, ChevronRight, ChevronDown, Download, FileText, Loader2, Lock, Plus, Search, XCircle, AlertTriangle, Clock, Activity, RefreshCw, Stethoscope, UserX, User, Users, Building2, X, Edit2 } from 'lucide-react';
import { toast } from 'sonner';
import { useLocation, useNavigate } from 'react-router-dom';
import MedicalRecordDialog from '@/components/MedicalRecordDialog';
import PageHeader from '@/components/PageHeader';
import { CompactDataGrid, type CompactDataGridColumn } from '@/components/CompactDataGrid';
import { ActionButton } from '@/components/ui/action-button';
import { FormSectionTitle, FormGrid, FormField } from '@/components/ui/standard-form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { renderDoctorOption, StatusBadge } from '@/components/ui/combobox-helpers';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { SimpleTooltip } from '@/components/ui/tooltip';
import { useAuth } from '@/contexts/AuthContext';
import { getOperationalErrorMessage, getErrorMessage } from '@/lib/errors';
import { useConfirm } from '@/hooks/useConfirm';
import { buildIdempotencyKey, buildStableIdempotencyKey } from '@/lib/idempotency';
import { Logger } from '@/utils/logger';
import { generateAndDownloadModuleExport, type ExportFormat } from '@/lib/officialExports';
import { formatOperationalDateTime, toOperationalDate, formatOperationalDate, formatOperationalTime } from '@/lib/operationalDateTime';
import { censorCPF } from '@/utils/masks';
import { useDoctorsCatalog, useInstitutionsCatalog } from '@/hooks/useCatalogos';
import { QuickPatientModal } from '@/components/agendamento/QuickPatientModal';
import { isSuspiciousData, normalizarEntradaTexto } from '@/utils/formatters';
import { applyDefaultDoctorAvailability } from '@/lib/scheduleBootstrap';
import { buscarSlotsAgenda } from '@/servicos/agendas';
import { chamarApiPost, chamarApiGet } from '@/lib/workerApi';
import { cn } from '@/lib/utils';
import { extrairIntencaoNavegacao } from '@/lib/intencaoNavegacao';
import { SPECIALTY_ICONS } from '@/pages/Specialties';
import { parseDateBR, dateBRToInputValue, inputValueToDateBR } from '@/utils/formatar-data';
import { buscarLimitesConsultas } from '@/servicos/buscarLimitesConsultas';
import { 
  Appointment, 
  DoctorOption, 
  InstitutionOption,
  PatientOption, 
  PatientSchedulingGuard, 
  TimeSlot, 
  AppointmentsProps 
} from '@/types/appointments';

import { QuickFilterButton } from '@/components/ui/quick-filter-button';


import { formatarRegistroProfissional } from '@/utils/formatar-registro';

const getAppointmentRegistration = (appointment: Pick<Appointment, 'doctor_council' | 'doctor_crm' | 'doctor_registration_label'>) => {
  return formatarRegistroProfissional(appointment.doctor_council, appointment.doctor_crm);
};

const obterLabelStatus = (status?: string | null) => {
  if (!status) return null;
  const statusMap: Record<string, { label: string; className: string }> = {
    agendado: { label: 'Agendado', className: 'bg-blue-50 text-blue-700 border-blue-200' },
    confirmado: { label: 'Confirmado', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    em_atendimento: { label: 'Em Atendimento', className: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
    concluido: { label: 'Realizado', className: 'bg-slate-100 text-slate-600 border-slate-200' },
    finalizado: { label: 'Realizado', className: 'bg-slate-100 text-slate-600 border-slate-200' },
    reagendado: { label: 'Reagendado', className: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
    remarcado: { label: 'Reagendado', className: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
    nao_compareceu: { label: 'Ausente', className: 'bg-amber-50 text-amber-700 border-amber-200' },
    ausente: { label: 'Ausente', className: 'bg-amber-50 text-amber-700 border-amber-200' },
    cancelado: { label: 'Cancelado', className: 'bg-red-50 text-red-700 border-red-200' },
  };
  return statusMap[status] || null;
};

const Appointments = ({ isModalOnly = false, modalIntent = null, onModalClose, onAppointmentSaved }: AppointmentsProps = {}) => {
  const { institutionId, hasPermission, doctorId, userRole, profile } = useAuth();
  const { confirm: confirmDialog, ConfirmationDialog } = useConfirm();
  const location = useLocation();
  const navigate = useNavigate();
  const intencaoAplicadaRef = useRef(false);
  const consumiuIntentRef = useRef(false);
  const dateFromRef = useRef<HTMLInputElement>(null);
  const dateToRef = useRef<HTMLInputElement>(null);
  // Controle para evitar race conditions em chamadas assíncronas concorrentes
  const contadorRequisicaoRef = useRef(0);
  const [appointments, setAppointments] = useState<Appointment[]>([]);

  const { data: cachedDoctors = [] } = useDoctorsCatalog();
  const { data: cachedInstitutions = [] } = useInstitutionsCatalog();

  const [doctors, setDoctors] = useState<DoctorOption[]>([]);
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [isSearchingPatients, setIsSearchingPatients] = useState(false);
  const patientSearchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const patientSearchCacheRef = useRef<Record<string, PatientOption[]>>({});
  const [isQuickPatientModalOpen, setIsQuickPatientModalOpen] = useState(false);
  const [quickPatientSearchTerm, setQuickPatientSearchTerm] = useState('');

  const handleNovoPaciente = useCallback(() => {
    setQuickPatientSearchTerm('');
    setIsQuickPatientModalOpen(true);
  }, []);

  const handleSearchPatients = useCallback((search: string) => {
    if (!search || search.length < 2) return;
    
    if (patientSearchTimeoutRef.current) {
      clearTimeout(patientSearchTimeoutRef.current);
    }
    
    patientSearchTimeoutRef.current = setTimeout(async () => {
      const cleanSearch = normalizarEntradaTexto(search).trim();
      
      if (patientSearchCacheRef.current[cleanSearch]) {
        const cachedResults = patientSearchCacheRef.current[cleanSearch];
        setPatients(prev => {
          const existingIds = new Set(prev.map(p => p.id));
          const newPatients = cachedResults.filter(p => !existingIds.has(p.id));
          return [...prev, ...newPatients];
        });
        return;
      }

      setIsSearchingPatients(true);
      try {
        let query = chamarApiPost('/api/table/patients/select', {});
          
        if (userRole !== 'superadmin' && userRole !== 'admin' && profile?.institution_ids?.length) {
          query = query.in('institution_id', profile.institution_ids);
        }
          
        const { data, error } = await query;
          
        if (error) throw error;
        
        const results = (data || []) as PatientOption[];
        patientSearchCacheRef.current[cleanSearch] = results;

        if (results.length > 0) {
          setPatients(prev => {
            const existingIds = new Set(prev.map(p => p.id));
            const newPatients = results.filter(p => !existingIds.has(p.id));
            return [...prev, ...newPatients];
          });
        }
      } catch (err) {
        console.error('Erro ao buscar pacientes:', err);
      } finally {
        setIsSearchingPatients(false);
      }
    }, 400);
  }, [userRole, profile?.institution_ids]);

  const [institutions, setInstitutions] = useState<InstitutionOption[]>([]);

  useEffect(() => {
    if (cachedDoctors.length > 0) setDoctors(cachedDoctors);
  }, [cachedDoctors]);

  useEffect(() => {
    if (cachedInstitutions.length > 0) setInstitutions(cachedInstitutions);
  }, [cachedInstitutions]);

  const [loading, setLoading] = useState(!isModalOnly);
  const [atendimentoPendente, setAtendimentoPendente] = useState<Appointment | null>(null);
  const [motivoConflito, setMotivoConflito] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [dialogRequestId, setDialogRequestId] = useState<string>('');
  const [isDoctorSelectOpen, setIsDoctorSelectOpen] = useState(false);
  const [isChangingRescheduleDoctor, setIsChangingRescheduleDoctor] = useState(false);
  const [searchTerm, setSearchTerm] = useState(() => {
    const params = new URLSearchParams(location.search);
    return params.get('search') || '';
  });
  const [debouncedSearch, setDebouncedSearch] = useState(() => {
    const params = new URLSearchParams(location.search);
    return params.get('search') || '';
  });
  const [statusFilter, setStatusFilter] = useState(() => {
    const params = new URLSearchParams(location.search);
    return params.get('status') || 'all';
  });

  const [activeFocusId, setActiveFocusId] = useState<string | null>(null);
  const [activeFocusSpecialty, setActiveFocusSpecialty] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState(() => {
    const params = new URLSearchParams(location.search);
    const fromParam = params.get('from');
    if (fromParam) {
      const parsed = parse(fromParam, 'yyyy-MM-dd', new Date());
      if (isValid(parsed)) return format(parsed, 'dd/MM/yyyy');
    }
    return format(new Date(), 'dd/MM/yyyy');
  });

  const [dateTo, setDateTo] = useState(() => {
    const params = new URLSearchParams(location.search);
    const toParam = params.get('to');
    if (toParam) {
      const parsed = parse(toParam, 'yyyy-MM-dd', new Date());
      if (isValid(parsed)) return format(parsed, 'dd/MM/yyyy');
    }
    return format(new Date(), 'dd/MM/yyyy');
  });

  const [limitesDatas, setLimitesDatas] = useState<{ antiga: string; recente: string }>({ antiga: '', recente: '' });

  /**
   * Aplica filtros de atalho rápido (ontem, hoje, amanhã, 7d, 15d, 30d, este mês, tudo).
   * @param type - Tipo de atalho selecionado
   */
  const handleQuickFilter = async (type: 'ontem' | 'hoje' | 'amanha' | '7days' | '15days' | '30days' | 'thisMonth' | 'tudo' | 'clear') => {
    setActiveFocusId(null);
    if (type === 'clear') {
      setActiveFocusSpecialty(null);
    }
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
        console.error('Erro ao obter datas limites para Tudo em Consultas:', err);
      }
      setDateFrom('');
      setDateTo('');
      return;
    }
    setDateFrom('');
    setDateTo('');
  };

  /**
   * Verifica se determinado atalho de período está ativo.
   * @param type - Tipo de filtro a verificar
   * @returns Verdadeiro se as datas atuais baterem com o filtro
   */
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

  /**
   * Limpa todos os filtros aplicados e volta à rota limpa.
   */
  const handleClearAllFilters = () => {
    setSearchTerm('');
    setDebouncedSearch('');
    setStatusFilter('all');

    setActiveFocusId(null);
    setActiveFocusSpecialty(null);
    handleQuickFilter('clear');
    navigate('/appointments', { replace: true });
  };

  useEffect(() => {
    if (isDialogOpen) {
      const novoUuid = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      setDialogRequestId(novoUuid);
    } else {
      setDialogRequestId('');
    }
  }, [isDialogOpen]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    if (userRole !== 'medico' || !doctorId) {
      setAtendimentoPendente(null);
      return;
    }

    const buscarAtendimentoEmAndamento = async () => {
      try {
        const { data, error } = await chamarApiPost('/api/table/appointments/select', {});

        if (!error && data) {
          const appointment = {
            ...data,
            patient_name: (data as any).patients?.full_name || '',
            doctor_name: (data as any).doctors?.users?.full_name || '',
            doctor_crm: (data as any).doctors?.crm || '',
            doctor_council: (data as any).doctors?.professional_council || '',
            doctor_registration_label: `${(data as any).doctors?.professional_council || ''} ${(data as any).doctors?.crm || ''}`.trim()
          };
          setAtendimentoPendente(appointment as unknown as Appointment);
        } else {
          setAtendimentoPendente(null);
        }
      } catch (err) {
        console.error('Erro ao buscar atendimento pendente:', err);
      }
    };

    void buscarAtendimentoEmAndamento();
  }, [doctorId, userRole, appointments]);

  useEffect(() => {
    // Quando a URL muda (ex: navigate('/appointments?search=...')) — sincroniza filtros com a URL.
    // IMPORTANTE: NÃO depende de location.state para evitar limpar filtros quando o WorkspaceShell
    // faz navigate(APP_PUBLIC_PATH) sem state logo após abrir a aba via intenção de navegação.
    if (intencaoAplicadaRef.current) {
      // Consome o "crédito" de pulo — a intenção já foi aplicada, ignora este reset
      intencaoAplicadaRef.current = false;
      return;
    }

    const params = new URLSearchParams(location.search);
    const searchParam = params.get('search');
    const statusParam = params.get('status');
    const fromParam = params.get('from');
    const toParam = params.get('to');

    if (searchParam !== null) {
      setSearchTerm(searchParam);
      setDebouncedSearch(searchParam);
    } else {
      setSearchTerm('');
      setDebouncedSearch('');
    }

    if (statusParam !== null) {
      setStatusFilter(statusParam);
    } else {
      setStatusFilter('all');
    }

    if (fromParam !== null) {
      const parsed = parse(fromParam, 'yyyy-MM-dd', new Date());
      setDateFrom(isValid(parsed) ? format(parsed, 'dd/MM/yyyy') : '');
    } else {
      setDateFrom(format(new Date(), 'dd/MM/yyyy'));
    }

    if (toParam !== null) {
      const parsed = parse(toParam, 'yyyy-MM-dd', new Date());
      setDateTo(isValid(parsed) ? format(parsed, 'dd/MM/yyyy') : '');
    } else {
      setDateTo(format(new Date(), 'dd/MM/yyyy'));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  // Propositalmente SÓ depende de location.search — não de location.state.
  // Depender de location.state causaria limpeza dos filtros quando o WorkspaceShell
  // navega para APP_PUBLIC_PATH sem state após abrir a aba via intent da Agenda.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  const [ordemData, setOrdemData] = useState<'recente' | 'antigo'>('recente');
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const [cancellingAppointmentId, setCancellingAppointmentId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [isMedicalRecordOpen, setIsMedicalRecordOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [reschedulingAppointment, setReschedulingAppointment] = useState<Appointment | null>(null);
  const [bookingDate, setBookingDate] = useState(new Date());
  
  /**
   * Mapa de médicos que têm escala ativa no dia da semana selecionado.
   * institution_id foi removido das disponibilidades — apenas rastreamos se há escala no dia.
   */
  const [dailyScalesMap, setDailyScalesMap] = useState<Map<string, boolean>>(new Map());
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [loadingSmartFinder, setLoadingSmartFinder] = useState(false);
  /** Detecta divergência entre a instituição selecionada e a cadastrada no paciente */
  const [instituicaoDivergente, setInstituicaoDivergente] = useState(false);


  useEffect(() => {
    const buscarEscalasDoDia = async () => {
      const diaDaSemana = bookingDate.getDay();
      try {
        const { data, error } = await chamarApiPost('/api/table/doctor_availability/select', {});

        if (error) throw error;
        const mapa = new Map<string, boolean>();
        (data || []).forEach((linha: any) => {
          if (linha.doctor_id) mapa.set(linha.doctor_id, true);
        });
        setDailyScalesMap(mapa);
      } catch (erro) {
        console.error('Erro ao buscar disponibilidades/escalas do dia:', erro);
      }
    };

    void buscarEscalasDoDia();
  }, [bookingDate]);




  // Nota: institutions são carregadas via useInstitutionsCatalog() com cache de 10min (linhas 93-94).
  // O useEffect anterior que buscava diretamente via chamarApiPost('/api/table/institutions', {}) foi removido
  // para evitar a query duplicada toda vez que o componente monta.


  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [formData, setFormData] = useState({ patient_id: '', doctor_id: '', reason: '', institution_id: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [selectedPatientGuard, setSelectedPatientGuard] = useState<PatientSchedulingGuard | null>(null);
  const [activeAppointmentsList, setActiveAppointmentsList] = useState<any[]>([]);
  const [loadingPatientGuard, setLoadingPatientGuard] = useState(false);
  const [patientSchedulingDialogOpen, setPatientSchedulingDialogOpen] = useState(false);
  const [patientSchedulingAcknowledged, setPatientSchedulingAcknowledged] = useState(false);

  /**
   * Memoriza que o modal foi aberto diretamente da Agenda com horário pré-fixado.
   * Fica em estado React (não em location.state) para sobreviver à limpeza do state da rota.
   * Armazena { horario, data } para exibição informativa apenas.
   */
  const [abertoPorAgenda, setAbertoPorAgenda] = useState<{ horario: string; data: string } | null>(null);

  const [conflitoIndividualModal, setConflitoIndividualModal] = useState<{
    appointment: Appointment;
    novoSlot: TimeSlot | null;
    loading: boolean;
  } | null>(null);



  // Sincronização de escala de instituição removida para que o campo comece vazio e puxe apenas do paciente.

  /**
   * Trata a alteração manual de instituição/unidade.
   * Caso haja divergência com a escala diária do profissional, exibe um diálogo de confirmação.
   * Se o usuário cancelar, a alteração é revertida.
   * 
   * @param newInstId - ID da nova instituição selecionada
   */
  const handleInstitutionChange = async (newInstId: string) => {
    setFormData((prev: typeof formData) => ({ ...prev, institution_id: newInstId }));
    setErrors((prev: typeof errors) => { const next = { ...prev }; delete next.institution_id; return next; });
  };

  // Extrai intenção completa de navegação para scroll + filtros pré-aplicados
  const intencaoFoco = useMemo(() => extrairIntencaoNavegacao(location.state), [location.state]);
  const focusAppointmentId = intencaoFoco?.focarAgendamento || intencaoFoco?.iniciarAtendimento || intencaoFoco?.reagendar;

  useEffect(() => {
    if (!intencaoFoco) {
      if (!consumiuIntentRef.current) {
        setActiveFocusId(null);
      }
      consumiuIntentRef.current = false;
      return;
    }

    // Aplica filtros de busca/data vindos da Agenda (sem usar URL).
    // Marca o ref ANTES de alterar o estado para garantir que o useEffect de URL
    // (que roda na ordem do código) já veja o flag quando disparar no mesmo ciclo.
    if (intencaoFoco.buscarPaciente || intencaoFoco.dataAgendamento) {
      intencaoAplicadaRef.current = true;
    }

    const targetFocusId = intencaoFoco.focarAgendamento || intencaoFoco.iniciarAtendimento || intencaoFoco.reagendar;

    if (intencaoFoco.buscarPaciente) {
      setSearchTerm(intencaoFoco.buscarPaciente);
      setDebouncedSearch(intencaoFoco.buscarPaciente);
    } else if (targetFocusId) {
      setSearchTerm('');
      setDebouncedSearch('');
    }

    if (intencaoFoco.dataAgendamento) {
      const parsed = parse(intencaoFoco.dataAgendamento, 'yyyy-MM-dd', new Date());
      if (isValid(parsed)) {
        const dateBR = format(parsed, 'dd/MM/yyyy');
        setDateFrom(dateBR);
        setDateTo(dateBR);
      }
    }
    
    if (targetFocusId) {
      setActiveFocusId(targetFocusId);
      setActiveFocusSpecialty(intencaoFoco.focarEspecialidade || null);
      setStatusFilter('all');
    } else {
      setActiveFocusId(null);
      if (intencaoFoco.focarEspecialidade) {
        setActiveFocusSpecialty(intencaoFoco.focarEspecialidade);
      }
    }

    // Limpa a intenção do state da rota imediatamente para evitar re-processamento ao voltar/atualizar a página
    consumiuIntentRef.current = true;
    navigate(location.pathname, { replace: true, state: null });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, navigate, location.pathname]);

  useEffect(() => {
    if (focusAppointmentId && !loading && appointments.length > 0) {
      setTimeout(() => {
        const el = document.getElementById(`row-${focusAppointmentId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 150);
    }
  }, [focusAppointmentId, loading, appointments.length]);

  const isSuperadmin = userRole === 'superadmin';
  const canCreateAppointments = hasPermission('appointments', 'create', institutionId) || hasPermission('appointments', 'manage', institutionId);
  const canUpdateAppointments = hasPermission('appointments', 'update', institutionId) || hasPermission('appointments', 'manage', institutionId);

  const canOperateClinicalFlow = userRole === 'medico' || isSuperadmin;
  const canStartEncounter = canOperateClinicalFlow && (hasPermission('encounters', 'create', institutionId) || hasPermission('encounters', 'manage', institutionId) || hasPermission('appointments', 'update', institutionId));
  const canExportAppointments = hasPermission('appointments', 'export', institutionId);

  /**
   * Intenção de navegação vinda de outras páginas (React Router state — memória pura).
   * Todos os campos de intenção chegam via state; apenas filtros de lista (search, from, to, status)
   * ainda usam URL params pois são seguros de exibir na barra de endereço.
   */
  const schedulingIntent = useMemo(() => {
    const intencao = (isModalOnly && modalIntent) ? modalIntent : extrairIntencaoNavegacao(location.state);
    return {
      open: intencao?.abrirNovoAgendamento ?? false,
      patientId: intencao?.pacienteId || '',
      doctorId: intencao?.medicoId || '',
      bookingDate: intencao?.dataAgendamento || '',
      slotStart: intencao?.slotInicio || '',
      institutionId: intencao?.instituicaoId || '',
      override: intencao?.override ?? false,
      // reagendar e iniciarAtendimento via state
      reschedule: intencao?.reagendar || '',
      startEncounter: intencao?.iniciarAtendimento || '',
      directProntuario: intencao?.abrirProntuarioDireto ?? false,
      retornarParaAgenda: intencao?.retornarParaAgenda ?? false,
    };
  }, [location.state, isModalOnly, modalIntent]);

  const bookingDateISO = format(bookingDate, 'yyyy-MM-dd');
  const selectedPatient = patients.find((patient: PatientOption) => patient.id === formData.patient_id);
  const selectedPatientInstitutionId = selectedPatient?.institution_id || null;
  const selectedDoctor = doctors.find((doctor: DoctorOption) => doctor.id === formData.doctor_id);

  // Determina se o paciente já possui um agendamento ativo na mesma especialidade
  const hasSpecialtyConflict = useMemo(() => {
    if (!formData.patient_id || !formData.doctor_id || !selectedDoctor?.specialty_id) return false;
    
    const targetSpecialtyId = selectedDoctor.specialty_id;
    
    return activeAppointmentsList.some((appt: any) => {
      // Faltas e cancelamentos não bloqueiam novo agendamento individual
      if (appt.status === 'cancelado' || appt.status === 'nao_compareceu') return false;
      if (reschedulingAppointment && appt.id === reschedulingAppointment.id) return false;
      const apptSpecialtyId = appt.specialty_id || appt.doctors?.specialty_id;
      return apptSpecialtyId === targetSpecialtyId;
    });
  }, [formData.patient_id, formData.doctor_id, selectedDoctor?.specialty_id, activeAppointmentsList, reschedulingAppointment]);

  // Sincroniza automaticamente a instituição da consulta com a instituição cadastrada no paciente selecionado
  useEffect(() => {
    if (selectedPatient?.institution_id) {
      setFormData((prev: typeof formData) => {
        if (prev.institution_id === selectedPatient.institution_id) return prev;
        return { ...prev, institution_id: selectedPatient.institution_id! };
      });
    }
  }, [selectedPatient?.institution_id]);


  const compatibleSlots = useMemo(() => {
    const targetInstitutionId = selectedPatientInstitutionId || (!isSuperadmin ? institutionId : null);
    const seenTimes = new Set<string>();

    const sortedSlots = [...slots].sort((a, b) => {
      if (schedulingIntent.institutionId) {
        const aMatches = (a.institution_id || '') === schedulingIntent.institutionId;
        const bMatches = (b.institution_id || '') === schedulingIntent.institutionId;
        if (aMatches && !bMatches) return -1;
        if (!aMatches && bMatches) return 1;
      }
      return 0;
    });

    return sortedSlots
      .filter((slot) => {
        const isIntentSlot = Boolean(
          schedulingIntent.slotStart &&
          new Date(slot.starts_at).getTime() === new Date(schedulingIntent.slotStart).getTime()
        );
        if (isIntentSlot) return true;

        if (targetInstitutionId && slot.institution_id && slot.institution_id !== targetInstitutionId) {
          return false;
        }
        return true;
      })
      .filter((slot) => {
        const isIntentSlot = Boolean(
          schedulingIntent.slotStart &&
          new Date(slot.starts_at).getTime() === new Date(schedulingIntent.slotStart).getTime()
        );
        if (isIntentSlot) return true;

        if (seenTimes.has(slot.time)) {
          return false;
        }
        seenTimes.add(slot.time);
        return true;
      })
      .map((slot) => {
        const isIntentSlot = Boolean(
          schedulingIntent.slotStart &&
          new Date(slot.starts_at).getTime() === new Date(schedulingIntent.slotStart).getTime()
        );
        if (isIntentSlot) return slot;

        if (
          selectedPatientInstitutionId
          && slot.institution_id
          && slot.institution_id !== selectedPatientInstitutionId
          && (slot.status === 'free' || slot.status === 'soft_blocked')
        ) {
          return {
            ...slot,
            status: 'blocked' as const,
            block_reason: `Horario pertence a ${slot.institution_name || 'outra unidade'}`,
          };
        }
        return slot;
      });
  }, [selectedPatientInstitutionId, slots, institutionId, isSuperadmin, schedulingIntent.institutionId, schedulingIntent.slotStart, formData.doctor_id]);

  const clearSchedulingIntent = useCallback(() => {
    if (schedulingIntent.retornarParaAgenda) {
      navigate('/agenda', { replace: true });
    } else {
      navigate({ pathname: location.pathname, search: '' }, { replace: true });
    }
  }, [location.pathname, navigate, schedulingIntent.retornarParaAgenda]);

  const hasSchedulingIntent = schedulingIntent.open
    || Boolean(
      schedulingIntent.patientId
      || schedulingIntent.doctorId
      || schedulingIntent.bookingDate
      || schedulingIntent.slotStart
      || schedulingIntent.institutionId
      || schedulingIntent.reschedule
      || schedulingIntent.retornarParaAgenda
    );

  // isFromAgenda: verdadeiro enquanto o modal estiver aberto com horário fixado pela Agenda.
  // abertoPorAgenda é persistido no estado React e não é afetado pela limpeza do location.state.
  const isFromAgenda = Boolean(abertoPorAgenda) || hasSchedulingIntent || Boolean(schedulingIntent.slotStart);

  const openAppointmentDialog = useCallback((options?: {
    patientId?: string;
    doctorId?: string;
    bookingDate?: Date;
  }) => {
    setReschedulingAppointment(null);
    setSelectedSlot(null);
    if (options?.bookingDate) {
      setBookingDate(options.bookingDate);
    }
    setFormData({
      patient_id: options?.patientId || '',
      doctor_id: options?.doctorId || '',
      reason: '',
      institution_id: '',
    });
    setIsDialogOpen(true);
  }, []);

  const isDateAllowed = (date: Date) => {
    if (userRole === 'admin' || userRole === 'superadmin') return true;
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const dataVerificar = new Date(date);
    dataVerificar.setHours(0, 0, 0, 0);
    return dataVerificar >= hoje;
  };

  const handleBookingDateInput = (value: string) => {
    const parsed = parse(value, 'yyyy-MM-dd', new Date());
    if (value && isValid(parsed)) {
      if (!(userRole === 'admin' || userRole === 'superadmin') && !isDateAllowed(parsed)) {
        toast.error(reschedulingAppointment 
          ? 'Não é permitido selecionar uma data anterior a hoje ou anterior à data original.' 
          : 'Não é permitido selecionar uma data anterior a hoje.'
        );
        return;
      }
      setBookingDate(parsed);
      setSelectedSlot(null);
    }
  };

  const fetchAppointments = useCallback(async () => {
    contadorRequisicaoRef.current += 1;
    const idRequisicaoAtual = contadorRequisicaoRef.current;

    setLoading(true);
    try {
      const fromDate = dateFrom ? parseDateBR(dateFrom) : null;
      const toDate = dateTo ? parseDateBR(dateTo) : null;

      if (dateFrom && !fromDate) {
        toast.error('Data inicial inválida. Use DD/MM/AAAA.');
        setLoading(false);
        return;
      }

      if (dateTo && !toDate) {
        toast.error('Data final inválida. Use DD/MM/AAAA.');
        setLoading(false);
        return;
      }

      const { data, error } = await chamarApiPost('/api/rpc/list_appointments_snapshot', {
        p_status: statusFilter,
        p_search: debouncedSearch.trim() || null,
        p_limit: 5000,
        p_start_date: fromDate ? format(fromDate, 'yyyy-MM-dd') : null,
        p_end_date: toDate ? format(toDate, 'yyyy-MM-dd') : null,
      });
      if (error) throw error;

      // Apenas atualiza o estado se esta ainda for a última requisição disparada
      if (idRequisicaoAtual === contadorRequisicaoRef.current) {
        setAppointments((data as unknown as Appointment[] | null) || []);
      }
    } catch (error) {
      console.error('Erro ao buscar consultas:', error);
      if (idRequisicaoAtual === contadorRequisicaoRef.current) {
        toast.error('Erro ao carregar consultas');
        setAppointments([]);
      }
    } finally {
      if (idRequisicaoAtual === contadorRequisicaoRef.current) {
        setLoading(false);
      }
    }
  }, [debouncedSearch, statusFilter, dateFrom, dateTo]);

  const alterarDataDe = (dias: number) => {
    const dataAtual = dateFrom ? parseDateBR(dateFrom) : new Date();
    if (dataAtual && isValid(dataAtual)) {
      const novaData = dias > 0 ? addDays(dataAtual, dias) : subDays(dataAtual, Math.abs(dias));
      const novaDataBR = format(novaData, 'dd/MM/yyyy');
      setDateFrom(novaDataBR);
      setActiveFocusId(null);
      if (dateTo) {
        const toDateObj = parseDateBR(dateTo);
        if (toDateObj && toDateObj < novaData) {
          setDateTo(novaDataBR);
        }
      }
    }
  };

  const alterarDataA = (dias: number) => {
    const dataAtual = dateTo ? parseDateBR(dateTo) : new Date();
    if (dataAtual && isValid(dataAtual)) {
      const novaData = dias > 0 ? addDays(dataAtual, dias) : subDays(dataAtual, Math.abs(dias));
      const fromDateObj = dateFrom ? parseDateBR(dateFrom) : null;
      if (fromDateObj && novaData < fromDateObj) {
        setDateTo(dateFrom);
      } else {
        setDateTo(format(novaData, 'dd/MM/yyyy'));
      }
      setActiveFocusId(null);
    }
  };

  const fetchOptions = useCallback(async () => {
    try {
      if (cachedDoctors.length > 0 && cachedInstitutions.length > 0) {
        setDoctors(cachedDoctors);
        setInstitutions(cachedInstitutions);
      } else {
        const [doctorsRes, instRes] = await Promise.all([
          chamarApiPost('/api/rpc/list_doctors_catalog', {
            p_search: null,
            p_include_inactive: false,
          }),
          chamarApiPost('/api/rpc/list_institutions_catalog', {
            p_search: null,
            p_include_inactive: false,
          })
        ]);
        if (doctorsRes.error) throw doctorsRes.error;

        setDoctors((doctorsRes.data || []) as DoctorOption[]);
        setInstitutions((instRes.data || []) as InstitutionOption[]);
      }

      // Pacientes agora são carregados de forma lazy (async search).
      // Mas se o modal foi aberto com um paciente pré-selecionado, precisamos carregá-lo.
      if (schedulingIntent.patientId) {
        const { data: intentPatient } = await chamarApiPost('/api/table/patients/select', {});
          
        if (intentPatient) {
          setPatients([intentPatient] as PatientOption[]);
        } else {
          setPatients([]);
        }
      } else {
        let initialQuery = chamarApiPost('/api/table/patients/select', {});
          
        if (userRole !== 'superadmin' && userRole !== 'admin' && profile?.institution_ids?.length) {
          initialQuery = initialQuery.in('institution_id', profile.institution_ids);
        }
        
        const { data: initialPatients } = await initialQuery;
        setPatients((initialPatients || []) as PatientOption[]);
      }

      const myDoctorId = doctorId;
      if (myDoctorId) {
        setFormData((current: typeof formData) => current.doctor_id ? current : { ...current, doctor_id: myDoctorId });
      }
    } catch (error) {
      console.error('Erro ao carregar opções:', error);
      toast.error('Erro ao carregar opções de agendamento');
      setDoctors([]);
      setPatients([]);
    }
  }, [bookingDateISO, doctorId, reschedulingAppointment?.id, schedulingIntent.patientId]);

  const fetchPatientSchedulingGuard = useCallback(async () => {
    if (!isDialogOpen || !formData.patient_id) {
      setSelectedPatientGuard(null);
      setActiveAppointmentsList([]);
      return;
    }

    setLoadingPatientGuard(true);
    try {
      const { data, error } = await chamarApiPost('/api/rpc/get_patient_scheduling_guard', {
        p_patient_id: formData.patient_id,
        p_doctor_id: formData.doctor_id || null,
        p_specialty_id: selectedDoctor?.specialty_id || null,
        p_recent_days: 30,
      });
      if (error) throw error;
      setSelectedPatientGuard((data || null) as PatientSchedulingGuard | null);

      // Busca todos os IDs de pacientes com o mesmo CPF para garantir a regra unificada por CPF
      let patientIds = [formData.patient_id];
      const currentPatient = patients.find((p: PatientOption) => p.id === formData.patient_id);
      const cleanCpf = (currentPatient?.cpf || '').replace(/\D/g, '');
      if (cleanCpf) {
        const formattedCpf = cleanCpf.length === 11 
          ? `${cleanCpf.slice(0, 3)}.${cleanCpf.slice(3, 6)}.${cleanCpf.slice(6, 9)}-${cleanCpf.slice(9, 11)}`
          : cleanCpf;
        const { data: sameCpfPatients } = await chamarApiPost('/api/table/patients/select', {});
        if (sameCpfPatients) {
          const matchedIds = sameCpfPatients
            .filter((p: { id: string; cpf?: string | null }) => p.cpf && p.cpf.replace(/\D/g, '') === cleanCpf)
            .map((p: { id: string }) => p.id);
          if (matchedIds.length > 0) {
            patientIds = Array.from(new Set([...patientIds, ...matchedIds]));
          }
        }
      }

      // Busca a lista completa de consultas ativas/concluídas do paciente (e outros com mesmo CPF)
      const { data: listData, error: listError } = await chamarApiPost('/api/table/appointments/select', {});

      if (!listError && listData) {
        const filtradas = listData.filter((apt: any) => apt.status !== 'cancelado' && apt.status !== 'nao_compareceu');
        setActiveAppointmentsList(filtradas);
      } else {
        setActiveAppointmentsList([]);
      }
    } catch (error) {
      console.error('Erro ao avaliar guard de agendamento do paciente:', error);
      setSelectedPatientGuard(null);
      setActiveAppointmentsList([]);
    } finally {
      setLoadingPatientGuard(false);
    }
  }, [formData.doctor_id, formData.patient_id, isDialogOpen, selectedDoctor?.specialty_id, patients]);

  const fetchAvailableSlots = useCallback(async () => {
    if (!formData.doctor_id) {
      setSlots([]);
      return;
    }

    setLoadingSlots(true);
    try {
      // 1. Consulta se o médico possui alguma disponibilidade configurada no banco
      const { data: countData, error: countError } = await chamarApiPost('/api/table/doctor_availability/select', {});

      if (!countError) {
        const hasAvailability = (countData && countData.length > 0) || false;

        // Se NÃO possuir nenhuma disponibilidade cadastrada, cria a agenda padrão automaticamente
        if (!hasAvailability) {
          // Usa a instituição do paciente ou do contexto do usuário — médicos não têm vínculo institucional
          const targetInstitutionId =
            selectedPatientInstitutionId ||
            institutionId ||
            '';

          if (targetInstitutionId) {
            Logger.info(`[autobootstrap] Inicializando agenda padrão automática para o médico ${formData.doctor_id}`);
            await applyDefaultDoctorAvailability({
              doctorId: formData.doctor_id,
              institutionId: targetInstitutionId,
              slotMinutes: 20, // 20 minutos padrão por consulta
            });
          }
        }
      }

      // 2. Busca os slots reais normalmente através do serviço unificado
      const data = await buscarSlotsAgenda(
        formData.doctor_id,
        bookingDateISO,
        formData.institution_id || null
      );
      setSlots(data);
    } catch (error) {
      console.error('Erro ao carregar horários disponíveis:', error);
      toast.error('Erro ao carregar horários disponíveis');
      setSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  }, [bookingDateISO, formData.doctor_id, formData.institution_id, reschedulingAppointment?.id, selectedPatientInstitutionId, selectedDoctor, institutionId]);

  /**
   * Varre os próximos 30 dias a partir da data atual (ou hoje) para encontrar a primeira
   * data com horário livre/flexível disponível para o profissional e unidade selecionados.
   */
  const handleSmartSlotFinder = async () => {
    if (!formData.doctor_id) {
      toast.error('Por favor, selecione um profissional primeiro.');
      return;
    }

    setLoadingSmartFinder(true);
    try {
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      let dataBusca = new Date(bookingDate);
      if (dataBusca < hoje) {
        dataBusca = hoje;
      }
      
      let slotEncontrado: TimeSlot | null = null;
      let dataEncontrada: Date | null = null;
      
      for (let i = 0; i < 30; i++) {
        const dataAlvo = addDays(dataBusca, i);
        const dataISO = format(dataAlvo, 'yyyy-MM-dd');
        
        const slotsDia = await buscarSlotsAgenda(
          formData.doctor_id,
          dataISO,
          formData.institution_id || null
        );
        
        const slotsLivres = slotsDia.filter((slot) => {
          const isOriginal = reschedulingAppointment != null &&
            formData.doctor_id === reschedulingAppointment.doctor_id &&
            new Date(slot.starts_at).getTime() === new Date(reschedulingAppointment.appointment_date).getTime();
          
          if (isOriginal) return false;
          
          const targetInstitutionId = selectedPatientInstitutionId || (!isSuperadmin ? institutionId : null);
          if (targetInstitutionId && slot.institution_id && slot.institution_id !== targetInstitutionId) {
            return false;
          }
          
          return slot.status === 'free' || slot.status === 'soft_blocked';
        });

        if (slotsLivres.length > 0) {
          slotEncontrado = slotsLivres[0];
          dataEncontrada = dataAlvo;
          break;
        }
      }

      if (slotEncontrado && dataEncontrada) {
        setBookingDate(dataEncontrada);
        setSelectedSlot(slotEncontrado);
        toast.success(`✨ Próxima vaga encontrada em ${format(dataEncontrada, 'dd/MM/yyyy')} às ${slotEncontrado.time}!`);
      } else {
        toast.error('Nenhum horário livre encontrado para este profissional nos próximos 30 dias.');
      }
    } catch (err) {
      console.error('Erro ao buscar próxima vaga:', err);
      toast.error('Erro ao buscar próxima vaga disponível.');
    } finally {
      setLoadingSmartFinder(false);
    }
  };

  useEffect(() => {
    if (isModalOnly) return;
    void fetchAppointments();
  }, [fetchAppointments, isModalOnly]);

  useEffect(() => {
    if (isDialogOpen) {
      void fetchOptions();
    }
  }, [fetchOptions, isDialogOpen]);

  useEffect(() => {
    if (isDialogOpen) {
      void fetchAvailableSlots();
    }
  }, [fetchAvailableSlots, isDialogOpen]);

  useEffect(() => {
    if (!isDialogOpen) return;
    setPatientSchedulingAcknowledged(schedulingIntent.override);
  }, [isDialogOpen, schedulingIntent.override]);



  const filteredDoctorOptions = useMemo(() => {
    return doctors;
  }, [doctors]);

  useEffect(() => {
    if (isDialogOpen) {
      void fetchPatientSchedulingGuard();
    }
  }, [fetchPatientSchedulingGuard, isDialogOpen]);

  const intentHandledRef = useRef(false);
  const agendamentoCriadoRef = useRef(false);

  useEffect(() => {
    if (!isDialogOpen && agendamentoCriadoRef.current) {
      agendamentoCriadoRef.current = false;
      void fetchAppointments();
    }
  }, [isDialogOpen, fetchAppointments]);

  useEffect(() => {
    if (!schedulingIntent.open || Boolean(schedulingIntent.reschedule)) {
      intentHandledRef.current = false;
      return;
    }

    if (!canCreateAppointments || isDialogOpen || intentHandledRef.current) return;

    const nextBookingDate = schedulingIntent.bookingDate
      ? parse(schedulingIntent.bookingDate, 'yyyy-MM-dd', new Date())
      : null;

    // Memoriza que este modal foi aberto via Agenda com horário pré-fixado,
    // para que o seletor de slots permaneça oculto mesmo após a limpeza do location.state.
    if (schedulingIntent.slotStart) {
      const horario = format(new Date(schedulingIntent.slotStart), 'HH:mm');
      const dataFormatada = nextBookingDate && isValid(nextBookingDate)
        ? format(nextBookingDate, 'dd/MM/yyyy')
        : schedulingIntent.bookingDate || '';
      setAbertoPorAgenda({ horario, data: dataFormatada });
    }

    intentHandledRef.current = true;
    openAppointmentDialog({
      patientId: schedulingIntent.patientId,
      doctorId: schedulingIntent.doctorId || doctorId || '',
      bookingDate: nextBookingDate && isValid(nextBookingDate) ? nextBookingDate : undefined,
    });
  }, [
    canCreateAppointments,
    doctorId,
    isDialogOpen,
    openAppointmentDialog,
    schedulingIntent.bookingDate,
    schedulingIntent.doctorId,
    schedulingIntent.open,
    schedulingIntent.patientId,
    schedulingIntent.slotStart,
  ]);

  useEffect(() => {
    if (!isDialogOpen || !schedulingIntent.patientId || !patients.some((patient: PatientOption) => patient.id === schedulingIntent.patientId)) return;
    setFormData((current: typeof formData) => (
      current.patient_id === schedulingIntent.patientId
        ? current
        : { ...current, patient_id: schedulingIntent.patientId }
    ));
  }, [isDialogOpen, patients, schedulingIntent.patientId]);

  useEffect(() => {
    if (!isDialogOpen || !schedulingIntent.doctorId || !doctors.some((doctor: DoctorOption) => doctor.id === schedulingIntent.doctorId)) return;
    setFormData((current: typeof formData) => (
      current.doctor_id === schedulingIntent.doctorId
        ? current
        : { ...current, doctor_id: schedulingIntent.doctorId }
    ));
  }, [doctors, isDialogOpen, schedulingIntent.doctorId]);

  useEffect(() => {
    if (!isDialogOpen || !schedulingIntent.slotStart) return;

    const areTimesEqual = (a?: string | null, b?: string | null) => {
      if (!a || !b) return false;
      const normA = a.replace('T', ' ').substring(0, 19);
      const normB = b.replace('T', ' ').substring(0, 19);
      return normA === normB;
    };

    if (areTimesEqual(selectedSlot?.starts_at, schedulingIntent.slotStart)) return;

    const matchedSlot = compatibleSlots.find((slot: TimeSlot) => (
      areTimesEqual(slot.starts_at, schedulingIntent.slotStart)
      && (slot.status === 'free' || slot.status === 'past' || slot.status === 'soft_blocked')
      && (!schedulingIntent.institutionId || (slot.institution_id || '') === schedulingIntent.institutionId)
    ));

    if (matchedSlot) {
      setSelectedSlot(matchedSlot);
    } else if (!selectedSlot) {
      const timeFormatted = format(new Date(schedulingIntent.slotStart), 'HH:mm');
      const startDate = new Date(schedulingIntent.slotStart.replace(' ', 'T'));
      const endDate = new Date(startDate.getTime() + 20 * 60 * 1000);

      const syntheticSlot: TimeSlot = {
        time: timeFormatted,
        starts_at: schedulingIntent.slotStart,
        ends_at: endDate.toISOString(),
        institution_id: schedulingIntent.institutionId || null,
        status: 'free'
      };
      setSelectedSlot(syntheticSlot);
    }
  }, [
    compatibleSlots,
    isDialogOpen,
    schedulingIntent.institutionId,
    schedulingIntent.slotStart,
    selectedSlot,
  ]);

  const resetForm = (keepDate = false) => {
    setFormData({ patient_id: '', doctor_id: doctorId || '', reason: '', institution_id: '' });
    setErrors({});
    setSelectedSlot(null);
    setSelectedPatientGuard(null);
    setPatientSchedulingAcknowledged(false);
    setIsChangingRescheduleDoctor(false);
    setIsDoctorSelectOpen(false);
    // Limpa a flag de "aberto pela agenda" ao fechar/resetar o formulário
    setAbertoPorAgenda(null);
    if (!keepDate) {
      setBookingDate(new Date());
    }
  };

  const fecharModal = () => {
    setIsDialogOpen(false);
    setReschedulingAppointment(null);
    resetForm();
    if (hasSchedulingIntent) {
      clearSchedulingIntent();
    }
    if (onModalClose) onModalClose();
  };

  const persistAppointment = async (forceProceed = false) => {
    const novosErros: Record<string, string> = {};
    if (!formData.patient_id) novosErros.patient_id = 'Selecione o paciente.';
    if (!formData.doctor_id) novosErros.doctor_id = 'Selecione o profissional.';
    if (!selectedSlot) novosErros.selected_slot = 'Selecione um horário.';
    if (!formData.reason.trim()) novosErros.reason = 'Informe o motivo do agendamento.';

    setErrors(novosErros);

    if (Object.keys(novosErros).length > 0) {
      toast.error('Corrija os campos marcados de vermelho.');
      return;
    }

    if (!selectedSlot) return;

    if (hasSpecialtyConflict) {
      toast.error(`Não é permitido duplicar consultas ativas para a mesma especialidade. O paciente já possui um agendamento ativo na especialidade "${selectedDoctor?.specialty_name || 'selecionada'}".`);
      return;
    }

    // Verificar se o CPF do paciente já possui consulta ativa ou concluída na mesma especialidade
    const targetSpecialtyId = selectedDoctor?.specialty_id;
    if (targetSpecialtyId) {
      try {
        let patientCpf = selectedPatient?.cpf;
        if (!patientCpf && formData.patient_id) {
          const { data: pData } = await chamarApiPost('/api/table/patients/select', {});
          patientCpf = pData?.cpf || '';
        }

        let patientIds: string[] = [formData.patient_id];
        const cleanCpf = (patientCpf || '').replace(/\D/g, '');
        if (cleanCpf) {
          const formattedCpf = cleanCpf.length === 11 
            ? `${cleanCpf.slice(0, 3)}.${cleanCpf.slice(3, 6)}.${cleanCpf.slice(6, 9)}-${cleanCpf.slice(9, 11)}`
            : cleanCpf;
          const { data: sameCpfPatients } = await chamarApiPost('/api/table/patients/select', {});
          if (sameCpfPatients) {
            const matchedIds = sameCpfPatients
              .filter((p: { id: string; cpf?: string | null }) => p.cpf && p.cpf.replace(/\D/g, '') === cleanCpf)
              .map((p: { id: string }) => p.id);
            if (matchedIds.length > 0) {
              patientIds = Array.from(new Set([...patientIds, ...matchedIds]));
            }
          }
        }

        const { data: patientAppts, error: checkError } = await chamarApiPost('/api/table/appointments/select', {});

        if (checkError) throw checkError;

        const otherAppts = (patientAppts || []).filter((appt: any) => appt.id !== reschedulingAppointment?.id);
        const alreadyHasSpecialty = otherAppts.some((appt: any) => {
          if (['cancelado', 'nao_compareceu'].includes(appt.status)) return false;
          const specId = appt.specialty_id || appt.doctors?.specialty_id;
          return specId === targetSpecialtyId;
        });

        if (alreadyHasSpecialty) {
          toast.error(`Cada CPF só pode ter 1 consulta ativa por especialidade. Este CPF já possui um agendamento ativo na especialidade "${selectedDoctor?.specialty_name || 'selecionada'}".`);
          return;
        }
      } catch (err) {
        console.error('Erro ao verificar histórico de especialidades do paciente por CPF:', err);
      }
    }

    // Validar restrições de data futura e superior ao agendamento original
    const isAdminOrSuperadmin = userRole === 'admin' || userRole === 'superadmin';

    if (reschedulingAppointment) {
      const originalDate = new Date(reschedulingAppointment.appointment_date);
      const newDate = new Date(selectedSlot.starts_at);
      
      const originalDateOnly = new Date(originalDate.getFullYear(), originalDate.getMonth(), originalDate.getDate());
      const newDateOnly = new Date(newDate.getFullYear(), newDate.getMonth(), newDate.getDate());
      const todayOnly = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());

      if (newDateOnly < todayOnly && !isAdminOrSuperadmin) {
        toast.error('Não é permitido reagendar consultas para datas anteriores ao dia atual.');
        return;
      }

      // Se for uma falta (nao_compareceu), bloqueia horarios iguais ou anteriores ao da falta
      if (reschedulingAppointment.status === 'nao_compareceu') {
        if (newDate <= originalDate) {
          toast.error(
            `Reagendamento de falta deve ser para um horário posterior ao da falta original (${format(originalDate, 'dd/MM/yyyy \u2018às\u2019 HH:mm')}).`
          );
          return;
        }
      } else if (newDateOnly < originalDateOnly) {
        const isConfirmed = await confirmDialog(
          'Você está reagendando para uma data anterior à marcação original. Deseja prosseguir mesmo assim?',
          'Reagendamento'
        );
        if (!isConfirmed) return;
      }

      if (originalDate.getTime() === newDate.getTime()) {
        toast.error('Selecione um novo horário diferente do atual para reagendar.');
        return;
      }
    } else {
      const newDate = new Date(selectedSlot.starts_at);
      const newDateOnly = new Date(newDate.getFullYear(), newDate.getMonth(), newDate.getDate());
      const todayOnly = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());

      if (newDateOnly < todayOnly && !isAdminOrSuperadmin) {
        toast.error('Não é permitido agendar consultas para datas anteriores ao dia atual.');
        return;
      }
    }

    const isDoctorSelected = !!formData.doctor_id;
    const doctorHasHistoryWithPatient = activeAppointmentsList.some(apt => apt.doctors?.id === formData.doctor_id);
    const shouldShowGuardWarning = !isDoctorSelected || doctorHasHistoryWithPatient;

    if (!forceProceed && !reschedulingAppointment && selectedPatientGuard?.requires_confirmation && shouldShowGuardWarning && !patientSchedulingAcknowledged) {
      setPatientSchedulingDialogOpen(true);
      return;
    }

    try {
      const idempotencyKey = await buildStableIdempotencyKey(reschedulingAppointment ? 'reschedule_appointment' : 'schedule_appointment', {
        appointment_id: reschedulingAppointment?.id || null,
        patient_id: formData.patient_id,
        doctor_id: formData.doctor_id,
        starts_at: selectedSlot.starts_at,
        reason: formData.reason,
        request_id: dialogRequestId,
      });

      const slotStartMs = new Date(selectedSlot.starts_at).getTime();
      const slotEndIso = new Date(slotStartMs + 5 * 60000).toISOString();

      if (reschedulingAppointment) {
        const { data, error } = await chamarApiPost('/api/rpc/api_reschedule_appointment', {
          p_appointment_id: reschedulingAppointment.id || null,
          p_doctor_id: formData.doctor_id || null,
          p_start_at: selectedSlot.starts_at || null,
          p_end_at: slotEndIso,
          p_reason: formData.reason || null,
          p_idempotency_key: idempotencyKey || null,
        });
        if (error) throw error;
        const payload = (data || {}) as { success?: boolean; appointment_id?: string | null; id?: string | null };
        if (!payload.id && (!payload.success || !payload.appointment_id)) {
          throw new Error('O backend nao confirmou a persistencia real do reagendamento.');
        }
      } else {
        const appointmentInstitutionId = formData.institution_id || selectedPatient?.institution_id || selectedSlot.institution_id || institutionId;
        if (!appointmentInstitutionId) {
          toast.error('Selecione uma unidade/instituição para realizar o agendamento.');
          return;
        }

        const { data, error } = await chamarApiPost('/api/rpc/api_schedule_appointment', {
          p_institution_id: appointmentInstitutionId || null,
          p_patient_id: formData.patient_id || null,
          p_doctor_id: formData.doctor_id || null,
          p_start_at: selectedSlot.starts_at || null,
          p_end_at: slotEndIso,
          p_reason: formData.reason || null,
          p_idempotency_key: idempotencyKey || null,
        });
        if (error) throw error;
        const payload = (data || {}) as { success?: boolean; appointment_id?: string | null };
        if (!payload.success || !payload.appointment_id) {
          throw new Error('O backend não confirmou a persistência real da consulta.');
        }

        // Registra evento de auditoria — sem expor dados pessoais no log
        // Finalidade: rastreabilidade de novos agendamentos por usuário/módulo
        void (async () => {
          try {
            await chamarApiPost('/api/table/system_events/insert', {
              module: 'agenda',
              action: 'nova_consulta',
              event_type: 'create',
              severity: 'info',
              description: `Nova consulta agendada: ${selectedPatient?.full_name || 'Paciente'} com Dr(a). ${selectedDoctor?.full_name || 'Profissional'} em ${selectedSlot.starts_at}`,
              payload: {
                appointment_id: payload.appointment_id,
                patient_id: formData.patient_id,
                doctor_id: formData.doctor_id,
                doctor_specialty: selectedDoctor?.specialty_name || null,
                starts_at: selectedSlot.starts_at,
                institution_id: appointmentInstitutionId,
                reason: formData.reason || null,
              },
            });
          } catch (auditErr: unknown) {
            // Auditoria é best-effort — falha silenciosa para não bloquear o fluxo principal
            Logger.warn('[Appointments] Falha ao registrar evento de auditoria de nova consulta:', auditErr);
          }
        })();
      }

      toast.success(reschedulingAppointment ? 'Consulta reagendada com sucesso!' : 'Consulta agendada com sucesso!');
      if (onAppointmentSaved) {
        onAppointmentSaved({
          doctorId: formData.doctor_id,
          appointmentDate: selectedSlot ? new Date(selectedSlot.starts_at) : new Date(),
          originalDoctorId: reschedulingAppointment?.doctor_id || null,
          isReschedule: !!reschedulingAppointment,
        });
      }
      agendamentoCriadoRef.current = true;
      fecharModal();
      setPatientSchedulingDialogOpen(false);
      setReschedulingAppointment(null);
      resetForm();
      if (hasSchedulingIntent) {
        clearSchedulingIntent();
      }
    } catch (error) {
      console.error('Erro ao salvar consulta:', error);
      const errMsg = error instanceof Error ? (error as any)?.message || error : typeof error === 'object' && error ? JSON.stringify(error) : String(error);
      if (
        errMsg.toLowerCase().includes('conflito') ||
        errMsg.toLowerCase().includes('ocupado') ||
        errMsg.toLowerCase().includes('trigger_conflict') ||
        errMsg.toLowerCase().includes('overlap')
      ) {
        toast.error('Colisão de Horário: Este horário acabou de ser reservado por outro atendimento. A grade foi atualizada.', {
          duration: 6000,
        });
        void fetchAvailableSlots();
      } else {
        toast.error(await getOperationalErrorMessage(error, 'Erro ao agendar consulta'));
      }
    }
  };

  const handleCreateAppointment = async (event: FormEvent) => {
    event.preventDefault();
    await persistAppointment(false);
  };

  const handleOpenReschedule = (appointment: Appointment) => {
    setReschedulingAppointment(appointment);
    setBookingDate(toOperationalDate(appointment.appointment_date));
    setSelectedSlot(null);
    setFormData({ patient_id: appointment.patient_id, doctor_id: appointment.doctor_id, reason: appointment.reason, institution_id: appointment.institution_id || '' });
    
    // Garante que o paciente esteja na lista de opções do Combobox
    setPatients(prev => {
      if (prev.some(p => p.id === appointment.patient_id)) return prev;
      return [...prev, {
        id: appointment.patient_id,
        full_name: appointment.patient_name || 'Paciente',
        cpf: appointment.patient_cpf || null,
        institution_id: appointment.institution_id || null,
      } as PatientOption];
    });
    
    setIsDialogOpen(true);
  };

  const handleOpenRescheduleById = async (id: string) => {
    try {
      const { data, error } = await chamarApiPost('/api/table/appointments/select', {});
      if (error) throw error;
      if (data) {
        const fullAppointment = {
          ...data,
          doctor_name: (data.doctors as any)?.users?.full_name || '',
          patient_name: selectedPatient?.full_name || '',
          specialty_name: (data.doctors as any)?.specialties?.name || ''
        };
        handleOpenReschedule(fullAppointment as any);
      }
    } catch (e) {
      console.error('Erro ao abrir reagendamento pelo ID:', e);
      toast.error('Não foi possível carregar os dados desta consulta para reagendar.');
    }
  };

  /**
   * Identifica e propõe uma vaga livre automática para reagendar uma consulta em conflito
   * @param appointment - Consulta conflitante
   */
  const handleAutoRescheduleConflict = async (appointment: Appointment) => {
    if (!appointment.appointment_date || !appointment.doctor_id) return;
    
    setConflitoIndividualModal({
      appointment,
      novoSlot: null,
      loading: true,
    });
    
    try {
      let slotEscolhido: TimeSlot | null = null;
      // Inicia a busca a partir da data da consulta e varre até 7 dias seguidos
      let dataBusca = new Date(appointment.appointment_date.replace(' ', 'T'));
      
      for (let i = 0; i < 7; i++) {
        const dataISO = format(dataBusca, 'yyyy-MM-dd');
        const slotsDia = await buscarSlotsAgenda(
          appointment.doctor_id,
          dataISO,
          appointment.institution_id || null
        );
        const slotsLivres = slotsDia.filter(
          (s) => s.status !== 'blocked' && !s.block_reason && (s.status === 'free' || s.status === 'past') && s.starts_at !== appointment.appointment_date
        );
        
        if (slotsLivres.length > 0) {
          // 1. Procura por vaga anterior: vago mais próximo anterior ao do conflito no mesmo dia
          const candidatosAnteriores = slotsLivres.filter(
            (s) => s.starts_at < appointment.appointment_date
          );
          if (candidatosAnteriores.length > 0) {
            candidatosAnteriores.sort((a, b) => b.starts_at.localeCompare(a.starts_at));
            slotEscolhido = candidatosAnteriores[0];
          }
          
          // 2. Procura por vaga posterior: primeiro vago subsequente disponível no mesmo dia
          if (!slotEscolhido) {
            const candidatosPosteriores = slotsLivres.filter(
              (s) => s.starts_at > appointment.appointment_date
            );
            if (candidatosPosteriores.length > 0) {
              candidatosPosteriores.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
              slotEscolhido = candidatosPosteriores[0];
            }
          }
          
          // Se não encontrou mantendo proximidade estrita, pega a primeira vaga livre desse dia
          if (!slotEscolhido && slotsLivres.length > 0) {
            slotsLivres.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
            slotEscolhido = slotsLivres[0];
          }
          
          if (slotEscolhido) {
            break; // Achou uma vaga livre, interrompe a busca
          }
        }
        
        // Passa para o dia seguinte
        dataBusca = addDays(dataBusca, 1);
      }
      
      setConflitoIndividualModal({
        appointment,
        novoSlot: slotEscolhido,
        loading: false,
      });
    } catch (err) {
      console.error('Erro ao buscar slots livres para auto reagendamento:', err);
      toast.error('Erro ao buscar horários disponíveis para o profissional.');
      setConflitoIndividualModal(null);
    }
  };

  /**
   * Confirma o reagendamento automático individual para a vaga proposta
   */
  const handleConfirmIndividualAutoReschedule = async () => {
    if (!conflitoIndividualModal || !conflitoIndividualModal.novoSlot) return;
    
    setConflitoIndividualModal((prev) => prev ? { ...prev, loading: true } : null);
    
    const appt = conflitoIndividualModal.appointment;
    const novoSlot = conflitoIndividualModal.novoSlot;
    
    try {
      const { error } = await chamarApiPost('/api/rpc/api_reschedule_appointment', {
        p_appointment_id: appt.id || null,
        p_start_at: novoSlot.starts_at || null,
        p_end_at: novoSlot.ends_at || null,
        p_reason: motivoConflito.trim() || 'Reagendamento de conflito',
        p_idempotency_key: await buildStableIdempotencyKey('reschedule_conflict_auto_indiv', {
          appointment_id: appt.id,
          new_slot: novoSlot.starts_at,
        }) || null,
        p_doctor_id: null,
      });
      if (error) throw error;
      
      toast.success(`Consulta de ${appt.patient_name} reorganizada com sucesso para às ${novoSlot.time}!`);
      setConflitoIndividualModal(null);
      setMotivoConflito('');
      void fetchAppointments();
    } catch (err) {
      console.error('Erro ao executar auto reagendamento individual:', err);
      toast.error(await getOperationalErrorMessage(err, 'Erro ao reorganizar consulta automaticamente.'));
      setConflitoIndividualModal((prev) => prev ? { ...prev, loading: false } : null);
    }
  };

  const handleConfirm = async (id: string) => {
    const confirmed = await confirmDialog('Confirmar esta consulta agora?');
    if (!confirmed) return;

    // Optimistic Update: atualiza o status na grade imediatamente em 0ms
    const previousAppointments = [...appointments];
    setAppointments(prev => prev.map(a => a.id === id ? { ...a, status: 'confirmado' } : a));

    try {
      const { error } = await chamarApiPost('/api/rpc/api_set_appointment_status', {
        p_appointment_id: id,
        p_status: 'confirmado',
        p_reason: null,
        p_idempotency_key: await buildIdempotencyKey('confirm_appointment', { appointment_id: id }),
      });
      if (error) throw error;
      toast.success('Consulta confirmada com sucesso!');
      void fetchAppointments();
    } catch (error) {
      setAppointments(previousAppointments);
      console.error('Erro ao confirmar:', error);
      toast.error(await getOperationalErrorMessage(error, 'Erro ao confirmar consulta'));
    }
  };

  const handleNoShow = async (id: string) => {
    const ok = await confirmDialog('Registrar falta (não comparecimento) para este paciente?');
    if (!ok) return;

    // Optimistic Update: atualiza o status na grade imediatamente em 0ms
    const previousAppointments = [...appointments];
    setAppointments(prev => prev.map(a => a.id === id ? { ...a, status: 'nao_compareceu' } : a));

    try {
      const { error } = await chamarApiPost('/api/rpc/api_set_appointment_status', {
        p_appointment_id: id,
        p_status: 'nao_compareceu',
        p_reason: 'Registrado pela recepção por não comparecimento.',
        p_idempotency_key: await buildIdempotencyKey('no_show_appointment', { appointment_id: id }),
      });
      if (error) throw error;
      toast.success('Falta registrada com sucesso!');
      void fetchAppointments();
    } catch (error) {
      setAppointments(previousAppointments);
      console.error('Erro ao registrar falta:', error);
      toast.error(await getOperationalErrorMessage(error, 'Erro ao registrar falta'));
    }
  };

  const handleConfirmCancel = async () => {
    if (!cancellingAppointmentId || !cancelReason.trim()) {
      toast.error('Informe o motivo do cancelamento.');
      return;
    }

    const confirmed = await confirmDialog('Confirmar cancelamento desta consulta?');
    if (!confirmed) return;

    const targetAptId = cancellingAppointmentId;
    const previousAppointments = [...appointments];
    setAppointments(prev => prev.map(a => a.id === targetAptId ? { ...a, status: 'cancelado' } : a));

    try {
      const { error } = await chamarApiPost('/api/rpc/api_set_appointment_status', {
        p_appointment_id: cancellingAppointmentId,
        p_status: 'cancelado',
        p_reason: cancelReason,
        p_idempotency_key: await buildIdempotencyKey('cancel_appointment', { appointment_id: cancellingAppointmentId, reason: cancelReason }),
      });
      if (error) throw error;
      toast.success('Consulta cancelada com sucesso.', {
        duration: 6000,
        action: {
          label: 'Desfazer',
          onClick: async () => {
            if (!targetAptId) return;
            const undoKey = await buildIdempotencyKey('uncancel_appointment', { appointment_id: targetAptId });
            await chamarApiPost('/api/rpc/api_set_appointment_status', {
              p_appointment_id: targetAptId,
              p_status: 'agendado',
              p_reason: 'Cancelamento desfeito pelo usuário',
              p_idempotency_key: undoKey,
            });
            toast.info('Cancelamento desfeito.');
            void fetchAppointments();
          },
        },
      });
      setTimeout(() => {
        setIsCancelDialogOpen(false);
        setCancelReason('');
        setCancellingAppointmentId(null);
      }, 0);
      void fetchAppointments();
    } catch (error) {
      setAppointments(previousAppointments);
      console.error('Erro ao cancelar:', error);
      toast.error(await getOperationalErrorMessage(error, 'Erro ao cancelar consulta'));
    }
  };

  const handleStartConsultation = async (appointment: Appointment, skipConfirm = false) => {
    if (skipConfirm) {
      setSelectedAppointment({ ...appointment, status: 'em_atendimento' });
      setIsMedicalRecordOpen(true);
      void fetchAppointments();
      return;
    }

    const isPast = new Date(appointment.appointment_date) < new Date(new Date().setHours(0,0,0,0));
    const precisaConfirmarPresenca = ['agendado', 'reagendado', 'remarcado'].includes(appointment.status);
    
    let mensagemConfirmacao = precisaConfirmarPresenca
      ? 'Confirmar a presença do paciente e iniciar o atendimento agora?'
      : 'Deseja iniciar o atendimento agora?';
      
    if (isPast) {
      mensagemConfirmacao = `Atenção: Esta consulta é de uma data passada. ${mensagemConfirmacao}`;
    }

    const confirmed = await confirmDialog(mensagemConfirmacao);
    if (!confirmed) return;

    try {
      // 1.  Se o paciente não tiver presença confirmada (status 'agendado', 'reagendado', 'remarcado'), realiza a confirmação primeiro (apenas se não for médico, pois médicos não tem permissão para editar agendamentos diretamente)
      if (precisaConfirmarPresenca && userRole !== 'medico') {
        const { error: confirmError } = await chamarApiPost('/api/rpc/api_set_appointment_status', {
          p_appointment_id: appointment.id,
          p_status: 'confirmado',
          p_reason: null,
          p_idempotency_key: await buildIdempotencyKey('confirm_appointment_from_start', { appointment_id: appointment.id }),
        });
        if (confirmError) throw confirmError;
      }

      // 2. Inicia o atendimento clínico
      const { error } = await chamarApiPost('/api/rpc/api_start_encounter', {
        p_appointment_id: appointment.id,
        p_idempotency_key: await buildIdempotencyKey('start_encounter', { appointment_id: appointment.id }),
      });
      if (error) throw error;

      toast.success(precisaConfirmarPresenca ? 'Presença confirmada e atendimento iniciado!' : 'Atendimento iniciado!');
      setSelectedAppointment({ ...appointment, status: 'em_atendimento' });
      setIsMedicalRecordOpen(true);
      void fetchAppointments();
    } catch (error) {
      console.error('Erro ao iniciar atendimento:', error);
      toast.error(await getOperationalErrorMessage(error, 'Erro ao iniciar atendimento'));
    }
  };

  useEffect(() => {
    const handleUrlIntents = async () => {
      if (schedulingIntent.reschedule) {
        const apptId = schedulingIntent.reschedule;
        
        try {
          const { data, error } = await chamarApiPost('/api/table/appointments/select', {});

          if (error) throw error;
          if (data) {
            const doctorProfile = Array.isArray((data.doctor as any)?.profiles)
              ? (data.doctor as any)?.profiles[0]
              : (data.doctor as any)?.profiles;
            const doctorName = doctorProfile?.full_name || (data as any).doctor_name || 'Médico';
            const appt: Appointment = {
              id: data.id,
              created_at: data.created_at,
              patient_id: data.patient_id,
              doctor_id: data.doctor_id,
              ticket_number: data.ticket_number || '',
              patient_name: (data.patient as any)?.full_name || (data as any).patient_name || 'Paciente',
              patient_cpf: (data.patient as any)?.cpf || (data as any).patient_cpf || '',
              doctor_name: doctorName,
              doctor_crm: (data.doctor as any)?.crm || (data as any).doctor_crm || '',
              doctor_council: (data.doctor as any)?.professional_council || (data as any).doctor_council || '',
              appointment_date: data.appointment_date,
              end_date: data.end_date,
              status: data.status,
              reason: data.reason || '',
              institution_id: data.institution_id || '',
            };
            if (data.appointment_date) {
              const parsed = new Date(data.appointment_date);
              if (isValid(parsed)) {
                const dateBR = format(parsed, 'dd/MM/yyyy');
                setDateFrom(dateBR);
                setDateTo(dateBR);
              }
            }
            if (data.ticket_number) {
              setSearchTerm(data.ticket_number);
              setDebouncedSearch(data.ticket_number);
            }
            setStatusFilter('all');
            setActiveFocusId(data.id);
            handleOpenReschedule(appt);
          }
        } catch (err) {
          console.error('Erro ao buscar consulta para reagendamento:', err);
          toast.error('Não foi possível carregar os detalhes da consulta para reagendamento.');
        }
      }

      if (schedulingIntent.startEncounter) {
        const apptId = schedulingIntent.startEncounter;

        try {
          const { data, error } = await chamarApiPost('/api/table/appointments/select', {});

          if (error) throw error;
          if (data) {
            if (data.appointment_date) {
              const parsed = new Date(data.appointment_date);
              if (isValid(parsed)) {
                const dateBR = format(parsed, 'dd/MM/yyyy');
                setDateFrom(dateBR);
                setDateTo(dateBR);
              }
            }
            if (data.ticket_number) {
              setSearchTerm(data.ticket_number);
              setDebouncedSearch(data.ticket_number);
            }
            setStatusFilter('all');
            setActiveFocusId(data.id);
          }
        } catch (err) {
          console.error('Erro ao buscar consulta para iniciar atendimento:', err);
          toast.error('Não foi possível carregar os detalhes da consulta para iniciar o atendimento.');
        }
      }
    };

    void handleUrlIntents();
  }, [schedulingIntent.reschedule, schedulingIntent.startEncounter]);

  const handleOpenMedicalRecord = (appointment: Appointment) => {
    const isSuperAdmin = userRole === 'superadmin';
    const isOwnDoctor = Boolean(doctorId && appointment.doctor_id && doctorId === appointment.doctor_id);
    if (!isSuperAdmin && !isOwnDoctor) {
      toast.error('Prontuário clínico disponível apenas para o próprio médico da consulta ou superadmin.');
      return;
    }
    setSelectedAppointment(appointment);
    setIsMedicalRecordOpen(true);
  };

  const handleExport = async (exportFormat: ExportFormat) => {
    const fromDate = dateFrom ? parseDateBR(dateFrom) : null;
    const toDate = dateTo ? parseDateBR(dateTo) : null;
    if (dateFrom && !fromDate) return toast.error('Data inicial inválida. Use DD/MM/AAAA.');
    if (dateTo && !toDate) return toast.error('Data final inválida. Use DD/MM/AAAA.');

    setExporting(exportFormat);
    try {
      await generateAndDownloadModuleExport('appointments', exportFormat, {
        status: statusFilter,
        search: debouncedSearch.trim() || null,
        date_from: fromDate ? format(fromDate, 'yyyy-MM-dd') : null,
        date_to: toDate ? format(toDate, 'yyyy-MM-dd') : null,
      });
    } catch (error) {
      toast.error(await getOperationalErrorMessage(error, 'Não foi possível gerar a exportação.'));
    } finally {
      setExporting(null);
    }
  };

  const appointmentsOrdenados = useMemo(() => {
    let list = [...appointments];
    if (activeFocusId) {
      list = list.filter((a) => a.id === activeFocusId);
    } else if (activeFocusSpecialty) {
      list = list.filter((a) => a.specialty_name?.toUpperCase() === activeFocusSpecialty.toUpperCase());
    }


    return list.sort((a, b) => {
      const dateA = a.appointment_date ? new Date(a.appointment_date).getTime() : 0;
      const dateB = b.appointment_date ? new Date(b.appointment_date).getTime() : 0;

      // Ordem padrão: mais recente -> mais antigo (dateB - dateA)
      return ordemData === 'recente' ? dateB - dateA : dateA - dateB;
    });
  }, [appointments, ordemData, activeFocusId, activeFocusSpecialty]);

  const consultasConflitantes = useMemo(() => {
    const mapa = new Map<string, { patientKeys: Set<string>; apptIds: string[] }>();
    const statusAtivos = ['agendado', 'confirmado', 'reagendado', 'remarcado', 'em_atendimento'];
    
    for (const appt of appointments) {
      if (!statusAtivos.includes(appt.status)) continue;
      // Consultas conflitantes: mesmo profissional, mesmo horário, paciente diferente
      const dataHora = appt.appointment_date;
      if (!dataHora) continue;
      const chave = `${appt.doctor_id}:${dataHora}`;
      
      const patientKey = appt.patient_cpf || appt.patient_id || appt.id;
      
      if (!mapa.has(chave)) {
        mapa.set(chave, { patientKeys: new Set(), apptIds: [] });
      }
      
      const entry = mapa.get(chave)!;
      entry.patientKeys.add(patientKey);
      entry.apptIds.push(appt.id);
    }
    
    const conjuntoConflitos = new Set<string>();
    for (const entry of mapa.values()) {
      if (entry.patientKeys.size > 1) {
        for (const id of entry.apptIds) {
          conjuntoConflitos.add(id);
        }
      }
    }
    
    return conjuntoConflitos;
  }, [appointments]);


  const getStatusBadge = (status: string) => {
    const map: Record<string, string> = {
      agendado:       'bg-amber-100 text-amber-800 border-amber-300',
      confirmado:     'bg-sky-100 text-sky-800 border-sky-300',
      em_atendimento: 'bg-purple-100 text-purple-800 border-purple-300',
      concluido:      'bg-emerald-100 text-emerald-800 border-emerald-300',
      cancelado:      'bg-red-100 text-red-700 border-red-300',
      nao_compareceu: 'bg-slate-100 text-slate-600 border-slate-300',
      reagendado:     'bg-indigo-100 text-indigo-800 border-indigo-300',
      remarcado:      'bg-indigo-100 text-indigo-800 border-indigo-300',
    };
    return `font-bold text-[11px] px-2 py-0.5 rounded-md border inline-flex items-center w-fit whitespace-nowrap tracking-wide ${map[status] || 'bg-gray-100 text-gray-700 border-gray-300'}`;
  };

  const getStatusContent = (status: string) => {
    const textMap: Record<string, string> = {
      agendado: 'Agendado',
      confirmado: 'Confirmado',
      em_atendimento: 'Em Atendimento',
      concluido: 'Concluído',
      cancelado: 'Cancelado',
      nao_compareceu: 'Faltou',
      reagendado: 'Reagendado',
      remarcado: 'Reagendado',
    };
    
    const iconMap: Record<string, ReactNode> = {
      agendado: <Clock className="h-3 w-3 mr-1.5 shrink-0" />,
      confirmado: <CheckCircle className="h-3 w-3 mr-1.5 shrink-0" />,
      em_atendimento: <Activity className="h-3 w-3 mr-1.5 shrink-0" />,
      concluido: <CheckCheck className="h-3 w-3 mr-1.5 shrink-0" />,
      cancelado: <XCircle className="h-3 w-3 mr-1.5 shrink-0" />,
      nao_compareceu: <UserX className="h-3 w-3 mr-1.5 shrink-0" />,
      reagendado: <RefreshCw className="h-3 w-3 mr-1.5 shrink-0" />,
      remarcado: <RefreshCw className="h-3 w-3 mr-1.5 shrink-0" />,
    };

    const text = textMap[status] || status.charAt(0).toUpperCase() + status.slice(1);
    const icon = iconMap[status] || null;

    return (
      <>
        {icon}
        {text}
      </>
    );
  };

  const appointmentColumns: Array<CompactDataGridColumn<Appointment>> = [
    {
      key: 'date',
      header: (
        <button
          type="button"
          onClick={() => setOrdemData((prev: string) => prev === 'recente' ? 'antigo' : 'recente')}
          title={ordemData === 'recente' ? 'Mais recente primeiro — clique para mais antigo' : 'Mais antigo primeiro — clique para mais recente'}
          className="flex items-center gap-1.5 font-semibold uppercase tracking-wider text-xs hover:text-blue-600 transition-colors group"
        >
          Data/Hora
          <span className={`transition-transform duration-200 ${ordemData === 'antigo' ? 'rotate-180' : ''}`}>
            <ArrowUpDown className="h-3.5 w-3.5 text-slate-400 group-hover:text-blue-500" />
          </span>
        </button>
      ) ,
      className: 'w-[15%] min-w-[150px]',
      render: (appointment) => (
        <div className="flex flex-col py-0.5">
          <span className="font-extrabold text-sm text-[#00427A]">{formatOperationalTime(appointment.appointment_date)}</span>
          <span className="text-[11px] text-slate-500 font-bold">{formatOperationalDate(appointment.appointment_date)}</span>
        </div>
      ),
    },
    {
      key: 'patient',
      header: 'Paciente',
      className: 'w-[20%] min-w-[200px]',
      filterable: true,
      filterValue: (appointment) => appointment.patient_name || 'N/A',
      render: (appointment) => {
        const suspicious = isSuspiciousData(appointment.patient_cpf);
        return (
          <div className="max-w-[170px]">
            <p className="truncate font-semibold text-slate-900 uppercase" title={appointment.patient_name?.toUpperCase()}>{appointment.patient_name}</p>
            <div className="flex items-center gap-1.5">
              <p className="text-[11px] text-slate-500">{appointment.patient_cpf ? censorCPF(appointment.patient_cpf) : 'CPF nao informado'}</p>
              {suspicious && <span title="CPF possivelmente genérico ou inválido"><AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" /></span>}
            </div>
          </div>
        );
      },
    },
    {
      key: 'professional',
      header: 'Profissional',
      className: 'w-[20%] min-w-[200px]',
      filterable: true,
      filterValue: (appointment) => appointment.doctor_name || 'N/A',
      render: (appointment) => (
        <div className="max-w-[190px]">
          <p className="truncate font-medium text-slate-900 uppercase" title={appointment.doctor_name?.toUpperCase()}>{appointment.doctor_name}</p>
          <p className="text-[11px] text-slate-500">{getAppointmentRegistration(appointment) || 'Registro nao informado'}</p>
        </div>
      ),
    },
    {
      key: 'specialty',
      header: 'Especialidade',
      className: 'w-[15%] min-w-[130px]',
      filterable: true,
      filterValue: (appointment) => appointment.specialty_name || 'N/A',
      filterLabel: (val: string) => {
        const appt = appointments.find((a: Appointment) => (a.specialty_name || 'N/A') === val);
        const iconKey = appt?.specialty_icon;
        const IconComp = iconKey ? SPECIALTY_ICONS[iconKey] : null;
        return (
          <span className="flex items-center gap-2">
            {IconComp ? (
              <IconComp className="h-3.5 w-3.5 text-slate-500 shrink-0" />
            ) : (
              <span className="h-3.5 w-3.5 shrink-0" />
            )}
            <span className="truncate text-slate-700 font-medium">{val}</span>
          </span>
        );
      },
      render: (appointment) => {
        const bgHex = appointment.specialty_color || '#e2e8f0';
        const textHex = appointment.specialty_color || '#475569';
        return (
          <span
            className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider shadow-2xs"
            style={{ backgroundColor: `${bgHex}15`, color: textHex, border: `1px solid ${bgHex}50` }}
          >
            {appointment.specialty_name || '-'}
          </span>
        );
      },
    },

    {
      key: 'status',
      header: 'Situação',
      className: 'w-[10%] min-w-[140px]',
      filterable: true,
      filterValue: (appointment) => appointment.status,
      filterLabel: (val) => getStatusContent(val),
      render: (appointment) => {
        const badgeElement = (
          <Badge className={getStatusBadge(appointment.status)}>{getStatusContent(appointment.status)}</Badge>
        );
        return (
          <div className="flex flex-wrap items-center gap-1.5 py-0.5">
            {appointment.status === 'cancelado' && appointment.cancel_reason ? (
              <SimpleTooltip content={`Motivo: ${appointment.cancel_reason}`}>
                <span className="cursor-help inline-block">{badgeElement}</span>
              </SimpleTooltip>
            ) : (
              badgeElement
            )}

          </div>
        );
      },
    },

    {
      key: 'actions',
      header: 'Ações',
      className: 'w-[10%] min-w-[220px]',
      cellClassName: '',
      sticky: 'right',
      render: (appointment) => {
        const isMedicoAndOwn = userRole === 'medico' && Boolean(doctorId) && doctorId === appointment.doctor_id;
        const isMedicoButNotOwn = userRole === 'medico' && (!doctorId || doctorId !== appointment.doctor_id);

        const canStart = (appointment.status === 'agendado' || appointment.status === 'confirmado' || appointment.status === 'reagendado' || appointment.status === 'remarcado') && canStartEncounter && !isMedicoButNotOwn;
        const canContinue = appointment.status === 'em_atendimento' && canOperateClinicalFlow && !isMedicoButNotOwn;
        const canViewRecord = appointment.status === 'concluido' && (userRole === 'superadmin' || isMedicoAndOwn);
        const canRescheduleNoShow = appointment.status === 'nao_compareceu' && canUpdateAppointments && !appointment.rescheduled_appointment_id;
        const canShowOptions = (
          ['agendado', 'confirmado', 'reagendado', 'remarcado'].includes(appointment.status) || 
          (appointment.status === 'nao_compareceu' && (userRole === 'admin' || userRole === 'superadmin')) ||
          (appointment.status === 'concluido' && (userRole === 'superadmin' || isMedicoAndOwn))
        ) && (canUpdateAppointments || (canStartEncounter && !isMedicoButNotOwn) || userRole === 'superadmin' || isMedicoAndOwn);

        const hasAnyAction = canStart || canContinue || canViewRecord || canRescheduleNoShow || canShowOptions;

        if (!hasAnyAction) {
          return (
            <div className="flex items-center justify-start pl-3 text-slate-300 font-bold select-none text-xs">
              —
            </div>
          );
        }

        return (
          <div className="flex items-center gap-1.5">
            {canStart && (
              <ActionButton 
                onClick={() => { void handleStartConsultation(appointment); }} 
                icon={<Activity className="h-4 w-4" />} 
                label="Iniciar" 
                titleTooltip="Iniciar atendimento médico agora" 
                className="bg-purple-50/50 hover:bg-purple-100/70 text-purple-700 border-purple-200/80 hover:border-purple-300 font-bold text-xs shadow-sm transition-all"
              />
            )}
            {canContinue && (
              <>
                <ActionButton 
                  onClick={() => handleOpenMedicalRecord(appointment)} 
                  icon={<span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse shrink-0" /><Stethoscope className="h-4 w-4 text-emerald-700" /></span>} 
                  label="Continuar Atendimento" 
                  titleTooltip="Continuar atendimento médico ativo" 
                  className="bg-emerald-50 hover:bg-emerald-100/80 text-emerald-800 border-emerald-300 font-bold text-xs shadow-sm transition-all" 
                />
                {(canUpdateAppointments || canStartEncounter) && (
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => { setCancellingAppointmentId(appointment.id); setCancelReason(''); setIsCancelDialogOpen(true); }}
                    className="h-9 w-9 bg-white border-rose-200 hover:bg-rose-50 hover:border-rose-300 hover:text-rose-600 text-rose-500 shadow-sm transition-all shrink-0 flex items-center justify-center rounded-md border"
                    title="Cancelar consulta em atendimento"
                  >
                    <XCircle className="h-4 w-4 shrink-0" />
                  </Button>
                )}
              </>
            )}
            {canViewRecord && (
              <ActionButton 
                onClick={() => handleOpenMedicalRecord(appointment)} 
                icon={<FileText className="h-4 w-4 text-slate-600" />} 
                label="Ver Prontuário" 
                titleTooltip="Visualizar prontuário eletrônico concluído" 
                className="bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200 font-bold text-xs shadow-sm transition-all" 
              />
            )}
            {canRescheduleNoShow && (
              <ActionButton
                onClick={() => handleOpenReschedule(appointment)}
                icon={<RefreshCw className="h-3.5 w-3.5" />}
                label="Reagendar"
                titleTooltip="Reagendar paciente que faltou à consulta"
                className="bg-amber-50 hover:bg-amber-100/80 text-amber-800 border-amber-200 font-bold text-xs shadow-2xs transition-all"
              />
            )}
            {canShowOptions && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 px-3 bg-white border-slate-200 hover:bg-slate-50 hover:border-slate-300 text-slate-700 font-medium shadow-sm transition-all shrink-0 flex items-center gap-1.5 rounded-md"
                    title="Mais opções de ação"
                  >
                    <span className="text-xs font-semibold">Opções</span>
                    <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 shadow-lg border-slate-100">
                  {(appointment.status === 'agendado' || appointment.status === 'reagendado' || appointment.status === 'remarcado') && canUpdateAppointments && (
                    <DropdownMenuItem onClick={() => { void handleConfirm(appointment.id); }} className="cursor-pointer py-2 gap-2 text-emerald-600 focus:text-emerald-700 focus:bg-emerald-50">
                      <CheckCircle className="h-4 w-4 shrink-0" />
                      <span className="font-medium">Confirmar</span>
                    </DropdownMenuItem>
                  )}
                  {consultasConflitantes.has(appointment.id) && ['agendado', 'confirmado', 'reagendado', 'remarcado'].includes(appointment.status) && canUpdateAppointments && (
                    <DropdownMenuItem 
                      onClick={() => { void handleAutoRescheduleConflict(appointment); }} 
                      className="cursor-pointer py-2 gap-2 text-red-700 font-bold focus:bg-red-50 focus:text-red-800"
                    >
                      <AlertTriangle className="h-4 w-4 shrink-0 text-red-600 animate-pulse" />
                      <span className="font-medium">Resolver Conflito Auto</span>
                    </DropdownMenuItem>
                  )}
                  {['agendado', 'confirmado', 'reagendado', 'remarcado'].includes(appointment.status) && canUpdateAppointments && (
                    <>
                      <DropdownMenuItem onClick={() => handleOpenReschedule(appointment)} className="cursor-pointer py-2 gap-2 text-amber-600 focus:text-amber-700 focus:bg-amber-50">
                        <RefreshCw className="h-4 w-4 shrink-0" />
                        <span className="font-medium">Reagendar</span>
                      </DropdownMenuItem>
                    </>
                  )}
                  {['agendado', 'confirmado', 'reagendado', 'remarcado'].includes(appointment.status) && canUpdateAppointments && (
                    <DropdownMenuItem onClick={() => { void handleNoShow(appointment.id); }} className="cursor-pointer py-2 gap-2 text-slate-600 focus:text-slate-700 focus:bg-slate-100">
                      <UserX className="h-4 w-4 shrink-0" />
                      <span className="font-medium">Registrar Falta</span>
                    </DropdownMenuItem>
                  )}
                  {['agendado', 'confirmado', 'reagendado', 'remarcado'].includes(appointment.status) && (canUpdateAppointments || canStartEncounter) && (
                    <DropdownMenuItem 
                      onClick={() => { setCancellingAppointmentId(appointment.id); setCancelReason(''); setIsCancelDialogOpen(true); }} 
                      className="cursor-pointer py-2 gap-2 text-rose-600 focus:text-rose-700 focus:bg-rose-50"
                    >
                      <XCircle className="h-4 w-4 shrink-0" />
                      <span className="font-medium">Cancelar / Desistiu</span>
                    </DropdownMenuItem>
                  )}
                  {appointment.status === 'nao_compareceu' && (userRole === 'admin' || userRole === 'superadmin') && (
                    <DropdownMenuItem 
                      onClick={() => { setCancellingAppointmentId(appointment.id); setCancelReason(''); setIsCancelDialogOpen(true); }} 
                      className="cursor-pointer py-2 gap-2 text-rose-600 focus:text-rose-700 focus:bg-rose-50"
                    >
                      <XCircle className="h-4 w-4 shrink-0 text-rose-500" />
                      <span className="font-medium">Cancelar Consulta</span>
                    </DropdownMenuItem>
                  )}
                  {appointment.status === 'concluido' && (userRole === 'superadmin' || (userRole === 'medico' && doctorId && appointment.doctor_id === doctorId)) && (
                    <DropdownMenuItem 
                      onClick={() => handleOpenMedicalRecord(appointment)} 
                      className="cursor-pointer py-2 gap-2 text-amber-600 focus:text-amber-700 focus:bg-amber-50"
                    >
                      <Edit2 className="h-4 w-4 shrink-0" />
                      <span className="font-medium">Editar Prontuário</span>
                    </DropdownMenuItem>
                  )}
                  {appointment.status === 'concluido' && userRole === 'superadmin' && (
                    <DropdownMenuItem 
                      onClick={() => { setCancellingAppointmentId(appointment.id); setCancelReason(''); setIsCancelDialogOpen(true); }} 
                      className="cursor-pointer py-2 gap-2 text-rose-600 focus:text-rose-700 focus:bg-rose-50"
                    >
                      <XCircle className="h-4 w-4 shrink-0 text-rose-500" />
                      <span className="font-medium">Cancelar Consulta</span>
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <>
      {!isModalOnly && (
        <div className="h-full min-h-0 bg-slate-100 px-3 pb-3 relative">
      {atendimentoPendente && (
        <div className="mb-3.5 bg-gradient-to-r from-purple-50 via-indigo-50/50 to-purple-50 border border-purple-200/80 rounded-lg p-3 shadow-2xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex items-start gap-2.5">
            <span className="relative flex h-3 w-3 shrink-0 mt-1">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-purple-600"></span>
            </span>
            <div className="space-y-0.5">
              <p className="text-xs font-extrabold text-purple-950 uppercase tracking-tight">Atendimento não Finalizado</p>
              <p className="text-[11px] text-purple-800 leading-normal">
                Você possui um prontuário em andamento para o paciente <span className="font-extrabold uppercase">{atendimentoPendente.patient_name}</span> iniciado em {formatOperationalDateTime(atendimentoPendente.appointment_date)}.
              </p>
            </div>
          </div>
          <Button 
            onClick={() => {
              setSelectedAppointment(atendimentoPendente);
              setIsMedicalRecordOpen(true);
            }}
            className="shrink-0 h-8 text-xs font-extrabold bg-purple-600 hover:bg-purple-700 text-white shadow-2xs hover:shadow-xs transition-all flex items-center gap-1.5 self-end sm:self-center"
          >
            <Activity className="h-3.5 w-3.5" />
            Retomar Atendimento
          </Button>
        </div>
      )}
      <div className="flex h-full min-h-0 w-full flex-col">
        <PageHeader title="Consultas" description="Agendamento, acompanhamento e histórico de atendimentos" compact actionsClassName="lg:flex-1" loading={loading}>
          <div className="flex w-full flex-col md:flex-row flex-wrap items-stretch md:items-center gap-2">
            <div className="relative flex-1 w-full min-w-[200px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Buscar paciente, CPF, ticket, profissional ou especialidade..."
                value={searchTerm}
                onChange={(event: { target: { value: string } }) => {
                  const valor = event.target.value;
                  setSearchTerm(valor);
                  setActiveFocusId(null);
                  if (valor.trim() !== '') {
                    handleQuickFilter('tudo');
                  }
                }}
                className="delphi-input h-9 pl-10 w-full"
              />
            </div>
            <div className="w-full md:w-auto md:min-w-[150px] shrink-0">
              <Select value={statusFilter} onValueChange={(val: string) => {
                setStatusFilter(val);
                setActiveFocusId(null);
              }}>
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
              <div className="flex items-center bg-white border border-slate-200/90 rounded-xl px-1.5 shadow-2xs gap-1.5 h-9 w-auto">
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
                <div className="flex items-center justify-between flex-1 gap-2">
                  <Input
                    ref={dateFromRef}
                    type="date"
                    value={dateBRToInputValue(dateFrom)}
                    onChange={(event: { target: { value: string } }) => {
                      const novaDataDe = event.target.value;
                      const novaDateFromBR = inputValueToDateBR(novaDataDe);
                      setDateFrom(novaDateFromBR);
                      setActiveFocusId(null);
                      if (dateTo && novaDataDe && dateBRToInputValue(dateTo) < novaDataDe) {
                        setDateTo(novaDateFromBR);
                      }
                    }}
                    className="border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 h-7 w-[95px] text-xs font-semibold text-slate-700 bg-transparent px-0 text-center cursor-pointer"
                    onClick={(e) => {
                      try { e.currentTarget.showPicker(); } catch (err) { void err; }
                    }}
                    aria-label="Data inicial das consultas"
                  />
                  <CalendarIcon 
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
                        <span className="rounded-lg bg-blue-50 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-[#003B71] border border-blue-100/80 shrink-0 select-none">
                          {format(parsed, "EEEE", { locale: ptBR })}
                        </span>
                      );
                    }
                    return null;
                  })()}
                </div>
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
              <div className="flex items-center bg-white border border-slate-200/90 rounded-xl px-1.5 shadow-2xs gap-1.5 h-9 w-auto">
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
                <div className="flex items-center justify-between flex-1 gap-2">
                  <Input
                    ref={dateToRef}
                    type="date"
                    value={dateBRToInputValue(dateTo)}
                    min={dateBRToInputValue(dateFrom) || undefined}
                    onChange={(event: { target: { value: string } }) => {
                      const novaDataA = event.target.value;
                      setActiveFocusId(null);
                      const fromISO = dateBRToInputValue(dateFrom);
                      if (fromISO && novaDataA && novaDataA < fromISO) {
                        toast.error('A data final não pode ser anterior à data inicial.');
                        return;
                      }
                      setDateTo(inputValueToDateBR(novaDataA));
                    }}
                    className="border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 h-7 w-[95px] text-xs font-semibold text-slate-700 bg-transparent px-0 text-center cursor-pointer"
                    onClick={(e) => {
                      try { e.currentTarget.showPicker(); } catch (err) { void err; }
                    }}
                    aria-label="Data final das consultas"
                  />
                  <CalendarIcon 
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
                        <span className="rounded-lg bg-blue-50 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-[#003B71] border border-blue-100/80 shrink-0 select-none">
                          {format(parsed, "EEEE", { locale: ptBR })}
                        </span>
                      );
                    }
                    return null;
                  })()}
                </div>
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
              {canExportAppointments && (
                <Button variant="outline" className="h-9 w-9 p-0" disabled={exporting !== null} onClick={() => { void handleExport('excel'); }}>
                  {exporting !== null ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                </Button>
              )}

              {canCreateAppointments && (
                <Button onClick={() => { openAppointmentDialog(); }} className="h-9 px-5 text-[13px]">
                  <Plus className="h-4 w-4" />
                  <span>Nova Consulta</span>
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

            <QuickFilterButton variant="clear" onClick={handleClearAllFilters} label="Limpar" />
          </div>
        </PageHeader>

        <main className="flex-1 flex flex-col min-h-0 overflow-hidden pt-2">
          <CompactDataGrid
            className="flex-1"
            columns={appointmentColumns}
            rows={appointmentsOrdenados}
            getRowKey={(appointment) => appointment.id}
            loading={loading}
            emptyMessage={
              <div className="flex flex-col items-center justify-center p-8 text-center">
                <div className="bg-blue-50 p-4 rounded-full mb-4">
                  <CalendarIcon className="h-8 w-8 text-blue-400" />
                </div>
                <p className="text-lg font-bold text-slate-700">
                  {statusFilter === 'all' && 'Nenhuma consulta encontrada'}
                  {statusFilter === 'agendado' && 'Nenhuma consulta agendada'}
                  {statusFilter === 'confirmado' && 'Nenhuma consulta confirmada'}
                  {statusFilter === 'em_atendimento' && 'Nenhuma consulta em atendimento'}
                  {statusFilter === 'concluido' && 'Nenhuma consulta concluída'}
                  {statusFilter === 'cancelado' && 'Nenhuma consulta cancelada'}
                  {statusFilter === 'reagendado' && 'Nenhuma consulta reagendada'}
                </p>
                <p className="text-sm text-slate-500 max-w-sm mt-1">
                  {statusFilter === 'all' && 'Não encontramos consultas para o período.'}
                  {statusFilter === 'agendado' && 'Não há consultas aguardando atendimento na agenda para este período.'}
                  {statusFilter === 'confirmado' && 'Não existem consultas confirmadas no período selecionado.'}
                  {statusFilter === 'em_atendimento' && 'Nenhum paciente está em atendimento neste momento.'}
                  {statusFilter === 'concluido' && 'Nenhuma consulta foi finalizada no período selecionado.'}
                  {statusFilter === 'cancelado' && 'Não há registros de consultas canceladas neste período.'}
                  {statusFilter === 'reagendado' && 'Nenhum agendamento foi reagendado para este período.'}
                  {' '}Clique em "Nova Consulta" para começar.
                </p>
              </div>
            }
            rowClassName={(row) => row.id === focusAppointmentId ? 'bg-blue-50/60 border-y border-blue-200/50 transition-all duration-500' : ''}
            minWidth="1000px"
            pagination={true}
            itemsPerPage={15}
            resetPaginationDependency={searchTerm + statusFilter + dateFrom + dateTo}
          />
        </main>
      </div>
      </div>
      )}


      {canCreateAppointments && (
        <Dialog
          open={isDialogOpen}
          onOpenChange={(open: boolean) => {
            if (!open) {
              fecharModal();
            } else {
              setIsDialogOpen(open);
            }
          }}
        >
          <DialogContent className="max-w-4xl lg:max-w-5xl p-0 bg-white rounded-2xl shadow-2xl border-0 overflow-hidden max-h-[90vh] flex flex-col gap-0">
            {/* Cabeçalho do Modal (Fixo no topo) */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 p-6 pb-4 pr-12 shrink-0 bg-white">
              <div className="flex flex-col space-y-1">
                <DialogTitle className="text-2xl font-bold text-slate-800 tracking-tight">
                  {reschedulingAppointment
                    ? 'Reagendar Consulta'
                    : 'Agendar Consulta'}
                </DialogTitle>
                <DialogDescription className="text-slate-500 font-medium text-xs sm:text-sm">
                  {'Preencha as informações necessárias. O agendamento é validado em tempo real.'}
                </DialogDescription>
              </div>

            </div>

            {/* Conteúdo Rolável (Scrollable Body) */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">

              {reschedulingAppointment && (
                <div className="rounded-2xl border border-slate-200/90 bg-gradient-to-b from-slate-50/80 to-white p-4 sm:p-5 shadow-2xs relative overflow-hidden">
                  {/* Destaque do Paciente no Topo do Banner */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 mb-4 border-b border-slate-200/70">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-100 text-blue-700 border border-blue-200 shadow-3xs shrink-0">
                        <User className="h-4 w-4" />
                      </div>
                      <div>
                        <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 block leading-none">
                          Paciente em Reagendamento
                        </span>
                        <h4 className="text-sm font-bold text-slate-900 uppercase tracking-tight mt-0.5">
                          {reschedulingAppointment.patient_name || selectedPatient?.full_name || 'Paciente'}
                        </h4>
                      </div>
                    </div>

                    {(reschedulingAppointment.patient_cpf || selectedPatient?.cpf) && (
                      <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 bg-white px-3 py-1 rounded-lg border border-slate-200 shadow-3xs self-start sm:self-auto">
                        <span className="text-slate-400 text-[10px] font-bold uppercase">CPF:</span>
                        <span className="font-mono">{censorCPF(reschedulingAppointment.patient_cpf || selectedPatient?.cpf || '')}</span>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-center gap-4 md:gap-6">
                    
                    {/* ORIGEM (ANTES) */}
                    <div className="flex flex-col items-center text-center space-y-2 p-2 bg-slate-50/70 rounded-xl border border-slate-100">
                      <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500 bg-white px-3 py-0.5 rounded-full border border-slate-200 shadow-3xs">
                        Consulta Original (Origem)
                      </span>
                      <div className="flex flex-col items-center space-y-1">
                        <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-slate-800 uppercase tracking-tight">
                          <Stethoscope className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                          <span>Dr(a). {reschedulingAppointment.doctor_name || 'Profissional'}</span>
                        </div>
                        <div className="flex items-center justify-center gap-1.5 text-xs text-slate-600 font-medium">
                          <CalendarIcon className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <span>{formatOperationalDateTime(reschedulingAppointment.appointment_date)}</span>
                        </div>
                        {(() => {
                          const instName = institutions.find(i => i.id === reschedulingAppointment.institution_id)?.name;
                          if (!instName) return null;
                          return (
                            <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500 font-medium max-w-[280px]">
                              <Building2 className="h-3 w-3 text-slate-400 shrink-0" />
                              <span className="truncate">{instName}</span>
                            </div>
                          );
                        })()}
                      </div>
                    </div>

                    {/* DIVISOR CENTRAL COM LINHA ACIMA E ABAIXO */}
                    <div className="hidden md:flex flex-col items-center justify-center self-stretch relative px-2">
                      <div className="w-[1.5px] flex-1 bg-gradient-to-b from-transparent via-slate-200 to-blue-200 min-h-[16px]" />
                      <div className="my-2 h-9 w-9 flex items-center justify-center rounded-full bg-white border border-blue-200/80 text-blue-600 shadow-2xs ring-4 ring-blue-50/70 transition-transform duration-300 hover:rotate-180">
                        <RefreshCw className="h-4 w-4" />
                      </div>
                      <div className="w-[1.5px] flex-1 bg-gradient-to-b from-blue-200 via-slate-200 to-transparent min-h-[16px]" />
                    </div>

                    {/* DESTINO (DEPOIS) */}
                    <div className="flex flex-col items-center text-center space-y-2 p-2 bg-blue-50/40 rounded-xl border border-blue-100">
                      <span className="text-[10px] font-extrabold uppercase tracking-widest text-blue-700 bg-white px-3 py-0.5 rounded-full border border-blue-200/80 shadow-3xs">
                        Novo Agendamento (Destino)
                      </span>
                      <div className="flex flex-col items-center space-y-1">
                        <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-[#003B71] uppercase tracking-tight">
                          <Stethoscope className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                          <span>Dr(a). {selectedDoctor?.full_name || 'Selecione o profissional...'}</span>
                        </div>
                        <div className="flex items-center justify-center gap-1.5 text-xs text-slate-700 font-medium">
                          <CalendarIcon className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                          <span className={selectedSlot ? "font-bold text-[#003B71]" : "text-slate-500"}>
                            {selectedSlot 
                              ? `${format(bookingDate, "dd/MM/yyyy", { locale: ptBR })} às ${selectedSlot.time}`
                              : 'Selecione data e horário...'
                            }
                          </span>
                        </div>
                        {(() => {
                          const targetInstId = formData.institution_id || selectedSlot?.institution_id || reschedulingAppointment?.institution_id;
                          const instName = institutions.find(i => i.id === targetInstId)?.name;
                          if (!instName) return null;
                          return (
                            <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500 font-medium max-w-[280px]">
                              <Building2 className="h-3 w-3 text-slate-400 shrink-0" />
                              <span className="truncate">{instName}</span>
                            </div>
                          );
                        })()}
                      </div>
                    </div>

                  </div>
                </div>
              )}

              {/* Banner Inteligente de Horário Pré-selecionado (Vindo da Agenda) */}
              {!reschedulingAppointment && (isFromAgenda || (schedulingIntent.slotStart && selectedSlot)) && (
                <div className="rounded-xl px-4 py-2.5 flex items-center justify-between shadow-2xs transition-all mb-1 border bg-blue-50/90 border-blue-200/90">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg text-white shadow-2xs shrink-0 bg-[#003B71]">
                      <CalendarIcon className="h-4 w-4" />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-blue-900">Horário Confirmado da Agenda:</span>
                      <span className="text-sm font-black bg-white px-2.5 py-0.5 rounded-md border shadow-3xs text-[#003B71] border-blue-200">
                        {abertoPorAgenda
                          ? `${abertoPorAgenda.data} às ${abertoPorAgenda.horario}`
                          : `${format(bookingDate, "dd/MM/yyyy", { locale: ptBR })} às ${selectedSlot?.time || (schedulingIntent.slotStart ? format(new Date(schedulingIntent.slotStart), 'HH:mm') : '')}`
                        }
                      </span>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1.5 bg-emerald-100 text-emerald-800 text-[11px] font-extrabold px-3 py-1 rounded-full border border-emerald-300 shadow-3xs shrink-0">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    Pré-carregado
                  </span>
                </div>
              )}

                            <form id="form-individual-agendamento" onSubmit={handleCreateAppointment} className="flex flex-col gap-5 pb-2">
                
                {/* Layout Grid (Tela Única Inteligente) */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  
                  {/* COLUNA ESQUERDA: Paciente, Profissional & Motivo */}
                  <div className={cn((isFromAgenda && !reschedulingAppointment) ? "lg:col-span-12" : "lg:col-span-6", "space-y-5")}>
                    
                    {/* Seção 1: Identificação */}
                    <FormSectionTitle>1. Identificação do Paciente, Profissional e Unidade</FormSectionTitle>
                      
                    <FormGrid>
                      <FormField label="Paciente" required className="md:col-span-6" error={errors.patient_id}>
                        <Combobox
                          className={`h-11 bg-white border-slate-200 shadow-2xs ${errors.patient_id ? 'border-red-500' : ''}`}
                          isLoading={loading || isSearchingPatients}
                          onSearch={handleSearchPatients}
                          options={patients.map((patient) => ({
                            value: patient.id,
                            label: (patient.full_name || 'Paciente').toUpperCase(),
                            searchText: patient.cpf || undefined,
                            render: (
                              <div className="flex flex-col gap-0.5">
                                <span className="font-semibold text-slate-800 uppercase">
                                  {patient.full_name || 'PACIENTE'}
                                </span>
                                {patient.birth_date && (
                                  <span className="text-[10px] text-slate-500">
                                    {`Idade: ${new Date().getFullYear() - new Date(patient.birth_date).getFullYear()} anos`}
                                  </span>
                                )}
                              </div>
                            )
                          }))}
                          value={formData.patient_id}
                          onChange={(value) => { 
                            const pat = patients.find(p => p.id === value);
                            setFormData(prev => ({
                              ...prev,
                              patient_id: value,
                              institution_id: pat?.institution_id || ''
                            }));
                            // Ao trocar paciente, a instituição é preenchida automaticamente — sem divergência
                            setInstituicaoDivergente(false);
                            if (!abertoPorAgenda) setSelectedSlot(null); 
                            setPatientSchedulingAcknowledged(false); 
                            setErrors(prev => { const next = { ...prev }; delete next.patient_id; delete next.institution_id; return next; });
                          }}
                          placeholder="Selecione um paciente..."
                          searchPlaceholder="Filtre para encontrar o paciente desejado..."
                          emptyText={
                            <div className="flex flex-col items-center justify-center p-2 text-center gap-3">
                              <span className="text-sm text-slate-500 font-medium">Nenhum paciente encontrado.</span>
                              <Button 
                                size="sm" 
                                type="button"
                                variant="outline" 
                                className="w-full text-blue-600 border-blue-200 hover:bg-blue-50"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleNovoPaciente();
                                }}
                              >
                                <Plus className="h-4 w-4 mr-2" />
                                Cadastrar Novo Paciente
                              </Button>
                            </div>
                          }
                          disabled={!!reschedulingAppointment}
                        />
                      </FormField>

                      <FormField label="Profissional" required className="md:col-span-6" error={errors.doctor_id}>
                        <Combobox
                          className={`h-11 bg-white border-slate-200 shadow-2xs ${errors.doctor_id ? 'border-red-500' : ''}`}
                          options={filteredDoctorOptions.map(renderDoctorOption)}
                          value={formData.doctor_id}
                          onChange={(value) => { 
                            setFormData({ ...formData, doctor_id: value }); 
                            if (!abertoPorAgenda) setSelectedSlot(null); 
                            setPatientSchedulingAcknowledged(false); 
                            setErrors(prev => { const next = { ...prev }; delete next.doctor_id; return next; });
                          }}
                          placeholder="Selecione um profissional..."
                          searchPlaceholder="Buscar profissional..."
                          emptyText="Nenhum profissional encontrado."
                          disabled={!!abertoPorAgenda || (!!reschedulingAppointment && !isChangingRescheduleDoctor)}
                          open={isDoctorSelectOpen}
                          onOpenChange={setIsDoctorSelectOpen}
                        />
                        {/* Aviso de bloqueio: profissional fixado pela Agenda */}
                        {abertoPorAgenda && (
                          <p className="mt-1 text-[11px] text-slate-500 flex items-center gap-1">
                            <Lock className="h-3 w-3 text-slate-400 shrink-0" />
                            Profissional fixado pela agenda. Feche e abra um novo agendamento para alterar.
                          </p>
                        )}
                        {reschedulingAppointment && !isChangingRescheduleDoctor && (
                          <div className="mt-1.5 flex items-center justify-end">
                            <button
                              type="button"
                              onClick={() => {
                                setIsChangingRescheduleDoctor(true);
                                setFormData(prev => ({ ...prev, doctor_id: '' }));
                                setSelectedSlot(null);
                                setTimeout(() => {
                                  setIsDoctorSelectOpen(true);
                                }, 50);
                              }}
                              className="text-xs text-blue-600 hover:text-blue-700 font-bold hover:underline flex items-center gap-1 focus:outline-none"
                            >
                              <span>Deseja alterar o profissional para este reagendamento?</span>
                            </button>
                          </div>
                        )}
                        {formData.doctor_id && !loadingSlots && slots.length === 0 && !dailyScalesMap.has(formData.doctor_id) && (
                          <div className="mt-2 p-2.5 bg-amber-50/70 border border-amber-200 rounded-md text-[11px] text-amber-800 flex items-start gap-1.5 leading-relaxed">
                            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                            <div>
                              <span className="font-bold">Aviso de Escala:</span> Este profissional não possui escala de plantão ou atendimento ativa cadastrada para a data selecionada.
                            </div>
                          </div>
                        )}
                      </FormField>

                      <FormField label="Unidade / Instituição de Atendimento" required className="md:col-span-12" error={errors.institution_id}>
                        <Combobox
                          className={`h-11 bg-white border-slate-200 shadow-2xs ${errors.institution_id ? 'border-red-500' : ''}`}
                          options={institutions.map((inst) => {
                            const isPatientInstitution = selectedPatient?.institution_id === inst.id;
                            return {
                              value: inst.id,
                              label: inst.name,
                              render: (
                                <div className="flex items-center justify-between gap-2 w-full">
                                  <span className="truncate">{inst.name}</span>
                                  {isPatientInstitution && (
                                    <span className="shrink-0 inline-flex items-center gap-0.5 rounded bg-blue-50 border border-blue-200 text-blue-700 text-[9px] font-bold px-1.5 py-0.2">
                                      📍 Vinculado ao Paciente
                                    </span>
                                  )}
                                </div>
                              )
                            };
                          })}
                          value={formData.institution_id || ''}
                          onChange={(value) => {
                            void handleInstitutionChange(value);
                            // Detecta divergência entre a unidade selecionada e a cadastrada no paciente
                            if (selectedPatient?.institution_id && value !== selectedPatient.institution_id) {
                              setInstituicaoDivergente(true);
                            } else {
                              setInstituicaoDivergente(false);
                            }
                          }}
                          placeholder="Selecione a unidade de atendimento..."
                          searchPlaceholder="Buscar unidade..."
                          emptyText="Nenhuma unidade encontrada."
                        />
                        {/* Aviso de divergência de instituição — não bloqueia, apenas adverte */}
                        {instituicaoDivergente && selectedPatient && (() => {
                          const nomeInstPaciente = institutions.find(i => i.id === selectedPatient.institution_id)?.name || 'a unidade cadastrada no paciente';
                          return (
                            <div className="mt-2 p-2.5 bg-orange-50 border border-orange-200 rounded-md text-[11px] text-orange-900 flex items-start gap-1.5 leading-relaxed">
                              <AlertTriangle className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />
                              <div>
                                <span className="font-bold">Atenção:</span> A unidade selecionada é diferente da unidade cadastrada no prontuário deste paciente (<strong>{nomeInstPaciente}</strong>). O agendamento será salvo normalmente, mas verifique se isso está correto.
                              </div>
                            </div>
                          );
                        })()}

                      </FormField>

                      {/* Avisos do Guard do Paciente */}
                      {(() => {
                        const isDoctorSelected = !!selectedDoctor?.id;
                        const doctorHasHistoryWithPatient = activeAppointmentsList.some(apt => apt.doctors?.id === selectedDoctor?.id);
                        const shouldShowGuardWarning = !isDoctorSelected || doctorHasHistoryWithPatient;
                        
                        if (!((selectedPatientGuard?.requires_confirmation && shouldShowGuardWarning) || hasSpecialtyConflict)) {
                          return null;
                        }

                        const isRed = hasSpecialtyConflict;
                        
                        return (
                          <div className={cn(
                            "md:col-span-12 rounded-xl border p-4 text-xs shadow-sm flex flex-col gap-4 transition-all",
                            isRed 
                              ? "border-red-200 bg-red-50 text-red-950"
                              : "border-amber-200/80 bg-amber-50 text-amber-950"
                          )}>
                            <div className="flex items-start gap-3">
                              <AlertTriangle className={cn("h-5 w-5 shrink-0 mt-0.5", isRed ? "text-red-600" : "text-amber-500")} />
                              <div className="flex-1 space-y-1.5">
                                <h4 className={cn(
                                  "font-bold text-[13px] tracking-tight",
                                  isRed ? "text-red-900" : "text-amber-900"
                                )}>
                                  {isRed 
                                    ? "Bloqueio: Especialidade Duplicada" 
                                    : (reschedulingAppointment ? 'Atenção ao Reagendamento' : 'Paciente com Consultas Ativas')
                                  }
                                </h4>
                                
                                {isRed ? (
                                  <p className="text-red-800 text-[12px] leading-relaxed opacity-90">
                                    Este paciente já possui uma consulta ativa nesta especialidade. O sistema permite apenas um agendamento ativo por especialidade. Por favor, cancele ou reagende a consulta existente.
                                  </p>
                                ) : reschedulingAppointment ? (
                                  <p className="text-amber-800 text-[12px] leading-relaxed opacity-90">
                                    Abaixo constam os demais agendamentos confirmados para este paciente. Ao escolher o novo horário, certifique-se de não sobrepor com as agendas listadas.
                                  </p>
                                ) : (
                                  <p className="text-amber-800 text-[12px] leading-relaxed opacity-90">
                                    Verifique os horários listados abaixo para evitar conflitos. Este paciente já possui outras consultas ativas cadastradas na rede.
                                  </p>
                                )}
                              </div>
                            </div>

                            {(activeAppointmentsList.filter((apt) => apt.status !== 'cancelado' && apt.status !== 'nao_compareceu').length > 0 || (selectedPatientGuard?.has_active_appointment && selectedPatientGuard.active_appointment && selectedPatientGuard.active_appointment.status !== 'cancelado')) && (
                              <div className={cn(
                                "p-3 rounded-lg border",
                                isRed ? "bg-red-100/40 border-red-200/60" : "bg-amber-100/40 border-amber-200/50"
                              )}>
                                {activeAppointmentsList.filter((apt) => apt.status !== 'cancelado' && apt.status !== 'nao_compareceu').length > 0 ? (
                                  <ul className="space-y-2">
                                    {activeAppointmentsList.filter((apt) => apt.status !== 'cancelado' && apt.status !== 'nao_compareceu').map((apt) => {
                                      const docName = (apt.doctors?.users?.full_name || 'Profissional').toUpperCase();
                                      const specName = apt.doctors?.specialties?.name || '';
                                      const aptSpecialtyId = apt.specialty_id || apt.doctors?.specialty_id;
                                      const isThisSpecialtyConflict = aptSpecialtyId === selectedDoctor?.specialty_id;
                                      
                                      return (
                                        <li key={apt.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-1.5 rounded-lg hover:bg-slate-100/50 transition-colors">
                                          <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-1 min-w-0">
                                            <span className={cn(
                                              "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold border whitespace-nowrap shadow-xs",
                                              isThisSpecialtyConflict 
                                                ? "bg-red-100 text-red-800 border-red-200"
                                                : "bg-white text-amber-900 border-amber-200"
                                            )}>
                                              <CalendarIcon className="h-3.5 w-3.5 shrink-0 opacity-70" />
                                              {formatOperationalDateTime(apt.appointment_date)}
                                            </span>
                                            <span className={cn(
                                              "font-medium flex items-center flex-wrap gap-2 text-[12px] truncate",
                                              isThisSpecialtyConflict ? "text-red-950" : "text-amber-950"
                                            )}>
                                              <span className="opacity-70 font-normal">com</span>
                                              <strong className="truncate">{docName}</strong>
                                              {specName && (
                                                <span className={cn(
                                                  "text-[10px] font-bold px-1.5 py-0.5 rounded shadow-xs uppercase tracking-wider border shrink-0",
                                                  isThisSpecialtyConflict 
                                                    ? "text-red-700 bg-red-50 border-red-200"
                                                    : "text-amber-700 bg-white border-amber-200"
                                                )}>
                                                  {specName}
                                                </span>
                                              )}
                                              {(() => {
                                                const cfg = obterLabelStatus(apt.status);
                                                if (!cfg) return null;
                                                return (
                                                  <span className={cn(
                                                    "text-[10px] font-extrabold px-1.5 py-0.5 rounded shadow-xs uppercase tracking-wide border shrink-0",
                                                    cfg.className
                                                  )}>
                                                    {cfg.label}
                                                  </span>
                                                );
                                              })()}
                                            </span>
                                          </div>
                                          {apt.id === reschedulingAppointment?.id ? (
                                            <span className="h-7 px-2.5 text-[10px] font-bold border border-blue-200 bg-blue-50 text-blue-700 rounded-lg flex items-center gap-1.5 shrink-0 shadow-3xs cursor-default">
                                              <RefreshCw className="h-3 w-3 opacity-70" />
                                              <span>Sendo Reagendada</span>
                                            </span>
                                          ) : apt.status === 'agendado' && (
                                            <Button
                                              type="button"
                                              variant="outline"
                                              size="sm"
                                              onClick={() => {
                                                const fullAppointment = {
                                                  ...apt,
                                                  doctor_name: apt.doctors?.users?.full_name || '',
                                                  patient_name: selectedPatient?.full_name || '',
                                                  specialty_name: specName
                                                };
                                                handleOpenReschedule(fullAppointment as any);
                                              }}
                                              className="h-7 px-2.5 text-[10px] font-bold border border-[#00427A]/20 bg-white hover:bg-slate-50 text-[#00427A] rounded-lg transition-all flex items-center gap-1 shrink-0 cursor-pointer shadow-3xs hover:scale-102 active:scale-98"
                                              title="Reagendar esta consulta"
                                            >
                                              <RefreshCw className="h-3 w-3" />
                                              <span>Reagendar</span>
                                            </Button>
                                          )}
                                        </li>
                                      );
                                    })}
                                  </ul>
                                ) : selectedPatientGuard?.has_active_appointment && selectedPatientGuard.active_appointment && selectedPatientGuard.active_appointment.status !== 'cancelado' ? (
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-1.5 rounded-lg hover:bg-slate-100/50 transition-colors w-full">
                                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-1 min-w-0">
                                      <span className="inline-flex items-center gap-1.5 bg-white text-amber-900 px-2.5 py-1 rounded-md text-[11px] font-semibold border border-amber-200 shadow-xs whitespace-nowrap">
                                        <CalendarIcon className="h-3.5 w-3.5 shrink-0 opacity-70" />
                                        {formatOperationalDateTime(selectedPatientGuard.active_appointment.appointment_date || '')}
                                      </span>
                                      <span className="text-amber-950 text-[12px] font-medium flex items-center flex-wrap gap-2 truncate">
                                        <span className="opacity-70 font-normal">com</span>
                                        <strong className="uppercase truncate">{(selectedPatientGuard.active_appointment.doctor_name || 'Profissional').toUpperCase()}</strong>
                                        {selectedPatientGuard.active_appointment.specialty_name && (
                                          <span className="text-[10px] font-bold text-amber-700 bg-white px-1.5 py-0.5 rounded shadow-xs uppercase tracking-wider border border-amber-200 shrink-0">
                                            {selectedPatientGuard.active_appointment.specialty_name}
                                          </span>
                                        )}
                                        {(() => {
                                          const cfg = obterLabelStatus(selectedPatientGuard.active_appointment.status);
                                          if (!cfg) return null;
                                          return (
                                            <span className={cn(
                                              "text-[10px] font-extrabold px-1.5 py-0.5 rounded shadow-xs uppercase tracking-wide border shrink-0",
                                              cfg.className
                                            )}>
                                              {cfg.label}
                                            </span>
                                          );
                                        })()}
                                      </span>
                                    </div>
                                    {selectedPatientGuard.active_appointment.id === reschedulingAppointment?.id ? (
                                      <span className="h-7 px-2.5 text-[10px] font-bold border border-blue-200 bg-blue-50 text-blue-700 rounded-lg flex items-center gap-1.5 shrink-0 shadow-3xs cursor-default">
                                        <RefreshCw className="h-3 w-3 opacity-70" />
                                        <span>Sendo Reagendada</span>
                                      </span>
                                    ) : selectedPatientGuard.active_appointment.status === 'agendado' && (
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleOpenRescheduleById(selectedPatientGuard.active_appointment!.id)}
                                        className="h-7 px-2.5 text-[10px] font-bold border border-[#00427A]/20 bg-white hover:bg-slate-50 text-[#00427A] rounded-lg transition-all flex items-center gap-1 shrink-0 cursor-pointer shadow-3xs hover:scale-102 active:scale-98"
                                        title="Reagendar esta consulta"
                                      >
                                        <RefreshCw className="h-3 w-3" />
                                        <span>Reagendar</span>
                                      </Button>
                                    )}
                                  </div>
                                ) : null}
                              </div>
                            )}

                            {selectedPatientGuard?.has_recent_consultation && selectedPatientGuard.recent_consultation && selectedPatientGuard.recent_consultation.status !== 'cancelado' && (
                              <p className={cn(
                                "font-medium flex items-center gap-1.5 text-[11px] p-2 rounded-lg border",
                                isRed ? "bg-red-100/30 text-red-800 border-red-200/50" : "bg-white/50 text-amber-800 border-amber-200/50"
                              )}>
                                <Clock className={cn("h-4 w-4 shrink-0", isRed ? "text-red-500" : "text-amber-500")} />
                                {selectedPatientGuard.recent_rule === 'same_specialty'
                                  ? `Consulta finalizada recentemente na mesma especialidade (${formatOperationalDateTime(selectedPatientGuard.recent_consultation.appointment_date || '')})`
                                  : `Consulta recente registrada em ${formatOperationalDateTime(selectedPatientGuard.recent_consultation.appointment_date || '')}`}
                              </p>
                            )}
                            
                            {loadingPatientGuard && (
                              <p className={cn("text-[11px] flex items-center gap-1.5 font-medium", isRed ? "text-red-700" : "text-amber-700")}>
                                <Loader2 className={cn("h-3.5 w-3.5 animate-spin", isRed ? "text-red-500" : "text-amber-500")} /> Consultando histórico na rede...
                              </p>
                            )}
                          </div>
                        );
                      })()}
                    </FormGrid>


                  </div>

                  {/* COLUNA DIREITA: Data, Horário e Unidade (Exibida somente se NÃO tiver sido selecionado pela Agenda) */}
                  {(!isFromAgenda || !!reschedulingAppointment) && (
                    <div className="lg:col-span-6 space-y-5">
                      <FormSectionTitle>2. Data e Horário</FormSectionTitle>
                        
                        <FormField label="Data e Horário" required className="md:col-span-12" error={errors.selected_slot}>
                          <div className="flex flex-col gap-3">
                            
                            {/* Seletor de Data */}
                            <div className="flex items-center justify-between gap-2 bg-white p-2 rounded-xl border border-slate-200 shadow-2xs">
                              <Button 
                                type="button" 
                                variant="outline" 
                                size="icon" 
                                className="h-9 w-9 shrink-0 bg-slate-50 hover:bg-slate-100 hover:text-slate-900 border-slate-200" 
                                onClick={() => {
                                  const prevDay = subDays(bookingDate, 1);
                                  if (isDateAllowed(prevDay)) {
                                    setBookingDate(prevDay);
                                  }
                                }}
                                disabled={!isDateAllowed(subDays(bookingDate, 1))}
                              >
                                <ChevronLeft className="h-4 w-4 text-slate-600" />
                              </Button>
                              
                              <div className="flex flex-1 flex-row items-center justify-center gap-2">
                                <Input
                                  type="date"
                                  value={bookingDateISO}
                                  min={(userRole === 'admin' || userRole === 'superadmin') ? undefined : format(new Date(), 'yyyy-MM-dd')}
                                  onChange={(event) => handleBookingDateInput(event.target.value)}
                                  className="h-9 w-[145px] text-center font-bold bg-white shadow-2xs border-slate-200 focus-visible:ring-1 focus-visible:ring-[#003B71] text-slate-700 text-xs"
                                  aria-label="Data do agendamento"
                                />
                                <span className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[10px] font-extrabold uppercase tracking-widest text-[#003B71] border border-slate-200/80">
                                  {format(bookingDate, "EEEE", { locale: ptBR })}
                                </span>
                              </div>

                              <Button 
                                type="button" 
                                variant="outline" 
                                size="icon" 
                                className="h-9 w-9 shrink-0 bg-slate-50 hover:bg-slate-100 hover:text-slate-900 border-slate-200" 
                                onClick={() => setBookingDate(addDays(bookingDate, 1))}
                              >
                                <ChevronRight className="h-4 w-4 text-slate-600" />
                              </Button>
                            </div>

                            {formData.doctor_id && compatibleSlots.length > 0 && (
                              <div className="flex justify-end pr-1.5 -mt-1">
                                <button
                                  type="button"
                                  disabled={loadingSmartFinder}
                                  onClick={handleSmartSlotFinder}
                                  className="text-xs text-[#003B71] hover:text-[#002850] font-bold hover:underline flex items-center gap-1 focus:outline-none"
                                >
                                  {loadingSmartFinder ? (
                                    <>
                                      <Loader2 className="h-3 w-3 animate-spin text-[#003B71]" />
                                      <span>Buscando vaga...</span>
                                    </>
                                  ) : (
                                    <span>✨ Buscar próxima vaga livre</span>
                                  )}
                                </button>
                              </div>
                            )}

                            {/* Grid de Horários Disponíveis */}
                            <div className="relative">
                              {loadingSlots && compatibleSlots.length > 0 && (
                                <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60 backdrop-blur-[1px] rounded-xl">
                                  <Loader2 className="h-6 w-6 animate-spin text-[#003B71]" />
                                </div>
                              )}
                              
                              {loadingSlots && compatibleSlots.length === 0 ? (
                                <div className="py-8 text-center text-xs text-slate-500 flex items-center justify-center gap-2 bg-white rounded-xl border border-slate-200">
                                  <Loader2 className="h-4 w-4 animate-spin text-[#003B71]" />
                                  <span>Buscando horários disponíveis na agenda...</span>
                                </div>
                              ) : !formData.doctor_id ? (
                                <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-xs text-slate-500">
                                  👈 Selecione um profissional para visualizar os horários disponíveis.
                                </div>
                              ) : compatibleSlots.length === 0 ? (
                                <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 text-xs text-slate-600 text-center shadow-2xs">
                                  <p className="font-bold text-slate-700 text-sm">Nenhum horário disponível para esta data.</p>
                                  <p className="text-[11px] text-slate-500 leading-relaxed">
                                    O profissional selecionado não possui disponibilidade cadastrada ou todos os horários estão ocupados para este dia.
                                  </p>
                                  
                                  {/* Botão de Localizador Inteligente de Vagas */}
                                  <div className="pt-2">
                                    <Button
                                      type="button"
                                      disabled={loadingSmartFinder}
                                      onClick={handleSmartSlotFinder}
                                      className="w-full bg-[#003B71] hover:bg-[#002850] text-white border border-[#003B71] h-9 font-bold text-xs flex items-center justify-center gap-1.5 shadow-2xs transition-all"
                                    >
                                      {loadingSmartFinder ? (
                                        <>
                                          <Loader2 className="h-3.5 w-3.5 animate-spin text-white" />
                                          Buscando vaga livre...
                                        </>
                                      ) : (
                                        <>
                                          <span>✨ Buscar próxima vaga livre</span>
                                        </>
                                      )}
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <div className="grid grid-cols-4 gap-2 max-h-[200px] overflow-y-auto p-1.5 border border-slate-200 rounded-xl bg-white shadow-inner">
                                  {compatibleSlots
                                    .map((slot) => {
                                      const isOriginal = reschedulingAppointment != null &&
                                        formData.doctor_id === reschedulingAppointment.doctor_id &&
                                        new Date(slot.starts_at).getTime() === new Date(reschedulingAppointment.appointment_date).getTime();
                                      const isBooked = slot.status === 'booked' && !isOriginal;
                                      const isBlocked = slot.status === 'blocked' && !isOriginal;
                                      const isSoftBlocked = slot.status === 'soft_blocked' && !isOriginal;
                                      const isFree = (slot.status === 'free' || slot.status === 'past' || slot.status === 'soft_blocked') && !isOriginal;
                                      const isSelected = selectedSlot?.starts_at === slot.starts_at && (selectedSlot.institution_id || null) === (slot.institution_id || null);
                                      const isDisabled = isBooked || isBlocked || isOriginal;

                                      return (
                                        <button
                                          key={`${slot.starts_at}:${slot.institution_id || 'global'}`}
                                          type="button"
                                          disabled={isDisabled}
                                          onClick={() => {
                                            if (isDisabled) return;
                                            setSelectedSlot(slot);
                                            setFormData(prev => ({ ...prev, institution_id: slot.institution_id || '' }));
                                            setErrors(prev => { const next = { ...prev }; delete next.selected_slot; return next; });
                                          }}
                                          title={
                                            isOriginal ? 'Horário atual da consulta' :
                                            isBooked ? (slot.block_reason || 'Horário já agendado') :
                                            isBlocked ? (slot.block_reason || 'Horário bloqueado') :
                                            isSoftBlocked ? `Horário flexível: ${slot.block_reason || 'Reservado'} (Permite agendamento)` :
                                            slot.institution_name || slot.time
                                          }
                                          className={cn(
                                            'relative flex flex-col items-center justify-center h-11 rounded-lg border text-[11px] font-bold transition-all',
                                            isOriginal
                                              ? 'bg-amber-50 text-amber-700 border-amber-200 cursor-not-allowed opacity-80'
                                              : isBooked
                                                ? 'bg-red-50 text-red-700 border-red-200 cursor-not-allowed'
                                                : isBlocked
                                                  ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-70'
                                                  : isSelected
                                                    ? 'bg-blue-50 text-[#003B71] border-blue-300 shadow-sm ring-1 ring-[#003B71]/30 scale-[1.02]'
                                                    : isSoftBlocked
                                                      ? 'bg-amber-50/70 text-amber-800 border-dashed border-amber-300 hover:bg-amber-100 hover:border-amber-400 hover:shadow-sm cursor-pointer'
                                                      : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300 hover:shadow-sm cursor-pointer'
                                          )}
                                        >
                                          <span className="z-10 text-[13px] tracking-tight">{slot.time}</span>

                                          {isOriginal && (
                                            <span className="text-[8px] text-amber-600 uppercase tracking-widest font-extrabold leading-none mt-0.5">Atual</span>
                                          )}
                                          {isBooked && (
                                            <span className="text-[8px] text-red-500 uppercase tracking-widest font-extrabold leading-none mt-0.5">Ocupado</span>
                                          )}
                                          {isBlocked && (
                                            <span className="text-[8px] text-slate-500 uppercase tracking-widest font-extrabold leading-none mt-0.5">Bloqueado</span>
                                          )}
                                          {isFree && !isSelected && !isSoftBlocked && (
                                            <span className="text-[8px] text-emerald-600/80 uppercase tracking-widest font-extrabold leading-none mt-0.5">Livre</span>
                                          )}
                                          {isSoftBlocked && !isSelected && (
                                            <span className="text-[8px] text-amber-700/95 uppercase tracking-widest font-extrabold leading-none mt-0.5" title={slot.block_reason || 'Bloqueio Flexível'}>
                                              {slot.block_reason ? (slot.block_reason.length > 8 ? 'Flexível' : slot.block_reason) : 'Flexível'}
                                            </span>
                                          )}
                                          {isSelected && !isOriginal && (
                                            <span className="text-[8px] text-[#003B71]/80 uppercase tracking-widest font-extrabold leading-none mt-0.5">Selecionado</span>
                                          )}
                                        </button>
                                      );
                                    })}
                                </div>

                              )}
                            </div>

           

                        </div>
                      </FormField>
                    </div>
                  )}

                  {/* SEÇÃO INFERIOR: Motivo da Consulta */}
                  <div className="lg:col-span-12 space-y-5">
                    <FormSectionTitle>{(isFromAgenda && !reschedulingAppointment) ? '2. Motivo do Agendamento' : '3. Motivo do Agendamento'}</FormSectionTitle>
                      
                    <FormField label="Motivo" required className="md:col-span-12" error={errors.reason}>
                      <div className="flex flex-col gap-2">
                        <div className="flex flex-wrap gap-1.5 mb-1">
                          {(reschedulingAppointment 
                            ? ["Imprevisto", "Problemas de saúde", "Atraso", "A pedido do paciente", "Conflito de agenda"] 
                            : ["Consulta", "Retorno", "Exames", "Check-up", "Avaliação"]
                          ).map((reason) => (
                            <button
                              key={reason}
                              type="button"
                              onClick={() => {
                                setFormData(prev => ({ ...prev, reason: reason.toUpperCase() }));
                                setErrors(prev => { const next = { ...prev }; delete next.reason; return next; });
                              }}
                              className="rounded-full bg-white border border-slate-200 px-3 py-1 text-[10px] font-bold tracking-wider uppercase text-slate-700 hover:bg-[#003B71]/10 hover:text-[#003B71] hover:border-[#003B71]/30 transition-colors shadow-2xs"
                            >
                              + {reason}
                            </button>
                          ))}
                        </div>
                        <Textarea 
                          value={formData.reason} 
                          onChange={(event) => {
                            setFormData({ ...formData, reason: event.target.value.toUpperCase() });
                            setErrors(prev => { const next = { ...prev }; delete next.reason; return next; });
                          }}
                          onBlur={(event) => {
                            setFormData({ ...formData, reason: normalizarEntradaTexto(event.target.value) });
                          }}
                          placeholder="Descreva o motivo do agendamento..." 
                          required 
                          rows={3}
                          style={{ textTransform: 'uppercase' }}
                          className={`delphi-input bg-white border-slate-200 w-full focus:border-blue-400 text-xs shadow-2xs ${errors.reason ? 'border-red-500' : ''}`} 
                        />
                      </div>
                    </FormField>
                  </div>
                </div>
              </form>
            </div>

            {/* Rodapé Fixo na Base do Modal (fora do container de rolagem) */}
            
              <div className="border-t border-slate-100 p-4 px-6 shrink-0 bg-slate-50/95 backdrop-blur-sm flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
                <div className="flex items-center gap-2 text-xs text-slate-600 font-medium">
                  {selectedPatient && selectedDoctor && selectedSlot ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-800">Resumo:</span>
                      <span className="bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs font-semibold uppercase">
                        👤 {selectedPatient.full_name.split(' ')[0].toUpperCase()}
                      </span>
                      <span className="bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs font-semibold uppercase">
                        🩺 {(selectedDoctor.full_name?.split(' ')[0] || 'Médico').toUpperCase()}
                      </span>
                      <span className="bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs font-bold text-[#003B71]">
                        📅 {format(bookingDate, "dd/MM")} às {selectedSlot.time}
                      </span>
                    </div>
                  ) : (
                    <span className="text-slate-400">
                      {reschedulingAppointment 
                        ? 'Selecione uma nova vaga na grade ao lado para confirmar o reagendamento.' 
                        : 'Preencha os campos obrigatórios para confirmar.'}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto justify-end shrink-0">
                  <Button 
                    type="button" 
                    variant="outline" 
                    className="h-10 px-5 font-semibold rounded-xl text-xs hover:bg-slate-100" 
                    onClick={() => { 
                      fecharModal(); 
                    }}
                  >
                    Cancelar
                  </Button>

                  <Button 
                    type="submit" 
                    form="form-individual-agendamento"
                    disabled={hasSpecialtyConflict || !selectedSlot}
                    className="h-10 px-7 font-bold bg-[#003B71] hover:bg-[#002850] text-white rounded-xl shadow-md transition-all text-xs flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {reschedulingAppointment ? 'Confirmar Reagendamento' : 'Confirmar Agendamento'}
                  </Button>
                </div>
              </div>
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={patientSchedulingDialogOpen} onOpenChange={setPatientSchedulingDialogOpen}>
        <DialogContent className="max-w-lg bg-white">
          <DialogTitle className="text-slate-900">Confirmar novo agendamento</DialogTitle>
          <DialogDescription>
            O paciente possui contexto assistencial recente. Revise a informacao antes de prosseguir com um novo ticket.
          </DialogDescription>
          <div className="space-y-4">
            {selectedPatientGuard?.has_active_appointment && selectedPatientGuard.active_appointment && (
              <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <p className="font-semibold">Consulta ativa/agendada encontrada</p>
                <p>{formatOperationalDateTime(selectedPatientGuard.active_appointment.appointment_date || '')}</p>
                {selectedPatientGuard.active_appointment.doctor_name && <p>Profissional: <span className="uppercase font-bold">{selectedPatientGuard.active_appointment.doctor_name.toUpperCase()}</span></p>}
                {selectedPatientGuard.active_appointment.specialty_name && <p>Especialidade: {selectedPatientGuard.active_appointment.specialty_name.toUpperCase()}</p>}
                {selectedPatientGuard.active_appointment.status && <p>Status: {selectedPatientGuard.active_appointment.status}</p>}
              </div>
            )}
            {selectedPatientGuard?.has_recent_consultation && selectedPatientGuard.recent_consultation && (
              <div className="rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
                <p className="font-semibold">
                  {selectedPatientGuard.recent_rule === 'same_specialty'
                    ? 'Consulta recente na mesma especialidade'
                    : 'Consulta recente encontrada'}
                </p>
                <p>{formatOperationalDateTime(selectedPatientGuard.recent_consultation.appointment_date || '')}</p>
                {selectedPatientGuard.recent_consultation.doctor_name && <p>Profissional: <span className="uppercase font-bold">{selectedPatientGuard.recent_consultation.doctor_name.toUpperCase()}</span></p>}
                {selectedPatientGuard.recent_consultation.specialty_name && <p>Especialidade: {selectedPatientGuard.recent_consultation.specialty_name}</p>}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPatientSchedulingDialogOpen(false)}>Cancelar</Button>
              <Button
                onClick={() => {
                  setPatientSchedulingAcknowledged(true);
                  void persistAppointment(true);
                }}
              >
                Prosseguir com novo agendamento
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isCancelDialogOpen} onOpenChange={setIsCancelDialogOpen}>
        <DialogContent className="max-w-md bg-white">
          <DialogTitle className="text-red-900">Cancelar Consulta</DialogTitle>
          <DialogDescription className="text-sm text-slate-600 mb-2">Informe o motivo do cancelamento. A ação será registrada.</DialogDescription>
          <div className="space-y-4">
            <Textarea
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value.toUpperCase())}
              onBlur={(event) => setCancelReason(normalizarEntradaTexto(event.target.value))}
              placeholder="Motivo..."
              style={{ textTransform: 'uppercase' }}
              className="delphi-input border-red-200 focus:border-red-500"
              rows={3}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsCancelDialogOpen(false)}>Voltar</Button>
              <Button onClick={(e) => { e.currentTarget.blur(); void handleConfirmCancel(); }} className="bg-red-600 hover:bg-red-700 text-white">Confirmar Cancelamento</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {selectedAppointment && (
        <MedicalRecordDialog
          open={isMedicalRecordOpen}
          onClose={() => { setIsMedicalRecordOpen(false); setSelectedAppointment(null); }}
          appointmentId={selectedAppointment.id}
          onSuccess={fetchAppointments}
          initialData={selectedAppointment}
          mode={selectedAppointment.status === 'concluido'
            ? (isSuperadmin || (userRole === 'medico' && doctorId && selectedAppointment.doctor_id === doctorId) ? 'edit' : 'view')
            : 'create'}
          allowClinicalActions={canOperateClinicalFlow}
        />
      )}
      {/* Dialog de Reagendamento Automático de Conflito Individual */}
      <Dialog open={!!conflitoIndividualModal} onOpenChange={(open) => { 
        if (!open) {
          setConflitoIndividualModal(null);
          setMotivoConflito('');
        }
      }}>
        <DialogContent className="max-w-md bg-white p-0 border-slate-200" aria-describedby={undefined}>
          <div className="flex flex-col">
            <div className="flex items-start gap-3 p-4 bg-[#003B71]/5 border-b border-slate-200">
              <RefreshCw className="h-5 w-5 text-[#003B71] shrink-0 mt-0.5" />
              <div>
                <DialogTitle className="text-base font-bold text-[#003B71]">Reorganizar Conflito Automaticamente</DialogTitle>
                <p className="text-xs text-slate-500 mt-1">
                  Propomos realocar esta consulta conflitante para o horário livre mais próximo na mesma data.
                </p>
              </div>
            </div>

            <div className="p-4 space-y-4">
              <div className="flex flex-col gap-2.5 p-3.5 rounded-lg border border-slate-100 bg-slate-50/50 text-xs">
                <div className="flex justify-between border-b border-slate-100 pb-2">
                  <span className="font-bold text-slate-500">PACIENTE:</span>
                  <span className="font-extrabold text-slate-800 uppercase">{conflitoIndividualModal?.appointment.patient_name}</span>
                </div>
                <div className="flex justify-between border-b border-slate-100 pb-2">
                  <span className="font-bold text-slate-500">MÉDICO:</span>
                  <span className="font-extrabold text-slate-800 uppercase">{conflitoIndividualModal?.appointment.doctor_name?.toUpperCase()}</span>
                </div>
                <div className="flex justify-between border-b border-slate-100 pb-2">
                  <span className="font-bold text-slate-500">HORÁRIO ORIGINAL:</span>
                  <span className="font-extrabold text-red-600">
                    {conflitoIndividualModal?.appointment.appointment_date 
                      ? formatOperationalTime(conflitoIndividualModal.appointment.appointment_date) 
                      : ''} (Data: {conflitoIndividualModal?.appointment.appointment_date 
                      ? formatOperationalDate(conflitoIndividualModal.appointment.appointment_date) 
                      : ''})
                  </span>
                </div>
                <div className="flex justify-between pt-1">
                  <span className="font-bold text-slate-500">NOVO HORÁRIO PROPOSTO:</span>
                  {conflitoIndividualModal?.novoSlot ? (
                    <span className="inline-flex items-center gap-1 bg-green-50 border border-green-200 text-green-700 font-extrabold px-2 py-0.5 rounded-full">
                      <Clock className="h-3 w-3 shrink-0" />
                      {conflitoIndividualModal.novoSlot.time}
                      {conflitoIndividualModal.novoSlot.starts_at && (() => {
                        const originalD = conflitoIndividualModal.appointment.appointment_date.substring(0, 10);
                        const novoD = conflitoIndividualModal.novoSlot.starts_at.substring(0, 10);
                        if (originalD !== novoD) {
                          return ` (${formatOperationalDate(conflitoIndividualModal.novoSlot.starts_at)})`;
                        }
                        return '';
                      })()}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 bg-amber-50 border border-amber-200 text-amber-700 font-extrabold px-2 py-0.5 rounded-full">
                      ⚠️ Nenhuma vaga disponível
                    </span>
                  )}
                </div>
              </div>

              {!conflitoIndividualModal?.novoSlot && !conflitoIndividualModal?.loading && (
                <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-xs text-amber-800 leading-normal">
                  Não foi encontrada nenhuma vaga livre para este profissional nos próximos 7 dias. Por favor, tente um reagendamento manual completo.
                </div>
              )}

              {conflitoIndividualModal?.novoSlot && (
                <div className="space-y-1 mt-1 bg-slate-50/70 p-3 rounded-lg border border-slate-200">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Motivo do Reagendamento *</label>
                  <Input
                    placeholder="Digite o motivo real do reagendamento..."
                    value={motivoConflito}
                    onChange={(e) => setMotivoConflito(e.target.value)}
                    className="h-9 text-xs bg-white border-slate-200"
                    required
                  />
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 p-4 border-t border-slate-200 bg-slate-50 rounded-b-lg">
              <Button
                variant="outline"
                disabled={conflitoIndividualModal?.loading}
                onClick={() => {
                  setConflitoIndividualModal(null);
                  setMotivoConflito('');
                }}
                className="h-9 font-semibold text-xs"
              >
                Voltar
              </Button>
              <Button
                disabled={conflitoIndividualModal?.loading || !conflitoIndividualModal?.novoSlot || !motivoConflito.trim()}
                onClick={() => { void handleConfirmIndividualAutoReschedule(); }}
                className="h-9 font-bold bg-[#003B71] hover:bg-[#002850] text-white text-xs shadow-md transition-all flex items-center gap-1"
              >
                {conflitoIndividualModal?.loading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    Confirmar Reagendamento
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmationDialog />

      <QuickPatientModal
        isOpen={isQuickPatientModalOpen}
        onOpenChange={setIsQuickPatientModalOpen}
        initialSearch={quickPatientSearchTerm}
        onSuccess={(newPatient) => {
          setPatients(prev => {
            if (!prev.some(p => p.id === newPatient.id)) {
              return [newPatient, ...prev];
            }
            return prev;
          });
          setFormData(prev => ({
            ...prev,
            patient_id: newPatient.id,
            institution_id: newPatient.institution_id || prev.institution_id
          }));
        }}
      />

    </>
  );
};

export default Appointments;
