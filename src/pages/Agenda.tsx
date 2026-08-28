"use client";

import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import type { ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { addDays, format, isValid, parse, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Clock, Download, FileText, Info, Loader2, Lock, ShieldAlert, User, Calendar, Activity, CheckCircle, XCircle, UserX, RefreshCcw, MoreVertical, FilterX, Stethoscope, AlertTriangle, Building2, CheckCircle2, Coffee, Users, ArrowRightLeft, CheckSquare, Square } from 'lucide-react';
import { toast } from 'sonner';
import MedicalRecordDialog from '@/components/MedicalRecordDialog';
import { Button } from '@/components/ui/button';
import { QuickFilterButton } from '@/components/ui/quick-filter-button';
import { Combobox } from '@/components/ui/combobox';
import { renderDoctorOption, renderSpecialtyOption } from '@/components/ui/combobox-helpers';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { 
  DropdownMenu, 
  DropdownMenuTrigger, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuArrow 
} from '@/components/ui/dropdown-menu';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { chamarApiPost, chamarApiGet } from '@/lib/workerApi';
import { getOperationalErrorMessage, getErrorMessage } from '@/lib/errors';
import { generateAndDownloadModuleExport, type ExportFormat } from '@/lib/officialExports';
import { formatOperationalDateTime, formatOperationalTime } from '@/lib/operationalDateTime';
import { censorCPF } from '@/utils/masks';
import { buildIdempotencyKey, buildStableIdempotencyKey } from '@/lib/idempotency';
import { useConfirm } from '@/hooks/useConfirm';
import { criarEstadoNavegacao } from '@/lib/intencaoNavegacao';
import PageHeader from '@/components/PageHeader';
import { SPECIALTY_ICONS } from '@/pages/Specialties';
import Appointments from '@/pages/Appointments';
import BloqueiosAgendaDialog from '@/components/BloqueiosAgendaDialog';

import ModalTransferirConsultas from '@/components/ModalTransferirConsultas';
import BarraTransferenciaAgenda, { ConsultaSelecionadaTransferencia } from '@/components/agendamento/BarraTransferenciaAgenda';

import {
  analisarConflitosTransferencia,
  transferirConsultasProfissional,
  buscarSugestoesProfissionaisCompativeis,
  transferirConsultasComAutoAjuste,
  buscarDadosAgendaComPolitica,
  obterChaveQueryAgenda,
  ResultadoAnaliseConflito,
  SugestaoProfissionalDestino,
  AjusteHorarioSugerido
} from '@/servicos/agendas';

import { 
  DoctorOption, 
  InstitutionOption, 
  SpecialtyOption, 
  SlotAppointment, 
  TimeSlot, 
  SchedulePolicy 
} from '@/types/appointments';

const Agenda = () => {
  const queryClient = useQueryClient();
  const { doctorId, institutionId, hasPermission, userRole } = useAuth();
  const navigate = useNavigate();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDoctorId, setSelectedDoctorId] = useState('');
  const [selectedInstitutionId, setSelectedInstitutionId] = useState('');
  const [selectedSpecialtyId, setSelectedSpecialtyId] = useState('all');
  const [doctors, setDoctors] = useState<DoctorOption[]>([]);
  const [institutions, setInstitutions] = useState<InstitutionOption[]>([]);
  const [specialties, setSpecialties] = useState<SpecialtyOption[]>([]);
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [isMedicalRecordOpen, setIsMedicalRecordOpen] = useState(false);
  const [medicalRecordAppointment, setMedicalRecordAppointment] = useState<SlotAppointment | null>(null);
  const [isAppointmentPreviewOpen, setIsAppointmentPreviewOpen] = useState(false);
  const [appointmentPreview, setAppointmentPreview] = useState<SlotAppointment | null>(null);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [schedulePolicy, setSchedulePolicy] = useState<SchedulePolicy | null>(null);
  const [isBloqueiosOpen, setIsBloqueiosOpen] = useState(false);

  const [isTransferirConsultasOpen, setIsTransferirConsultasOpen] = useState(false);
  const [transferirConsultaIdPadrao, setTransferirConsultaIdPadrao] = useState<string | undefined>(undefined);
  const [conflictRescheduleModal, setConflictRescheduleModal] = useState<{

    appointmentId: string;
    patientName: string;
    currentTime: string;
    freeSlots: TimeSlot[];
    loading: boolean;
    isConflict: boolean;
  } | null>(null);

  const [propostaReorganizacaoModal, setPropostaReorganizacaoModal] = useState<{
    propostas: Array<{
      idAgendamento: string;
      nomePaciente: string;
      horarioOriginal: string;
      startsAtOriginal: string;
      endsAtOriginal: string;
      novoHorario: string | null;
      startsAtNovo: string | null;
      endsAtNovo: string | null;
    }>;
    loading: boolean;
  } | null>(null);

  const [agendaModalIntent, setAgendaModalIntent] = useState<any>(null);

  const [activeDropdownSlotKey, setActiveDropdownSlotKey] = useState<string | null>(null);
  const [atendimentoPendente, setAtendimentoPendente] = useState<any | null>(null);
  const [conflictRescheduleSelectedSlot, setConflictRescheduleSelectedSlot] = useState<TimeSlot | null>(null);
  const [conflictRescheduleReason, setConflictRescheduleReason] = useState('');
  const [propostaReorganizacaoReason, setPropostaReorganizacaoReason] = useState('');

  // Estados para Transferência Inteligente e Autônoma Inline na Agenda
  const [modoTransferencia, setModoTransferencia] = useState(false);
  const [consultasSelecionadasIds, setConsultasSelecionadasIds] = useState<Set<string>>(new Set());
  const [medicoDestinoId, setMedicoDestinoId] = useState<string>('');
  const [analiseConflitos, setAnaliseConflitos] = useState<ResultadoAnaliseConflito | null>(null);
  const [carregandoAnalise, setCarregandoAnalise] = useState(false);
  const [transferindoConsultas, setTransferindoConsultas] = useState(false);
  const [sugestoesCompativeis, setSugestoesCompativeis] = useState<SugestaoProfissionalDestino[]>([]);
  const [carregandoSugestoes, setCarregandoSugestoes] = useState(false);


  const bookingDate = format(currentDate, 'yyyy-MM-dd');
  const isSuperadmin = userRole === 'superadmin';
  const isDoctorScoped = userRole === 'medico' && Boolean(doctorId);
  const canInspectClinicalFlow = isDoctorScoped || isSuperadmin;
  const canExportAgenda = hasPermission('appointments', 'export', institutionId);
  const canManageAvailability = hasPermission('doctor_availability', 'create', institutionId) || hasPermission('doctor_availability', 'update', institutionId);
  const canUpdateAppointments = hasPermission('appointments', 'update', institutionId) || hasPermission('appointments', 'manage', institutionId);
  const canStartEncounter = (userRole === 'medico' || isSuperadmin) && (hasPermission('encounters', 'create', institutionId) || hasPermission('encounters', 'manage', institutionId) || hasPermission('appointments', 'update', institutionId));

  const { confirm: confirmDialog, ConfirmationDialog } = useConfirm();

  /** Alterna a ativação do modo de transferência inline */
  const toggleModoTransferencia = () => {
    if (modoTransferencia) {
      setModoTransferencia(false);
      setConsultasSelecionadasIds(new Set());
      setMedicoDestinoId('');
      setAnaliseConflitos(null);
    } else {
      if (!selectedDoctorId) {
        toast.info('Selecione um profissional para transferir suas consultas.');
        return;
      }
      setModoTransferencia(true);
      setConsultasSelecionadasIds(new Set());
      setMedicoDestinoId('');
      setAnaliseConflitos(null);
    }
  };

  /** Inicia a transferência a partir de um agendamento individual */
  const handleIniciarTransferenciaIndividual = (appointmentId: string) => {
    setModoTransferencia(true);
    setConsultasSelecionadasIds(new Set([appointmentId]));
    setMedicoDestinoId('');
    setAnaliseConflitos(null);
  };

  /** Alterna a seleção de uma consulta específica */
  const toggleConsultaSelecionada = (appointmentId: string) => {
    setConsultasSelecionadasIds((prev) => {
      const next = new Set(prev);
      if (next.has(appointmentId)) {
        next.delete(appointmentId);
      } else {
        next.add(appointmentId);
      }
      return next;
    });
  };

  /** Seleciona todas as consultas elegíveis do dia atual */
  const handleSelecionarTodasConsultasDoDia = () => {
    const idsElegiveis = filteredSlots
      .filter(
        (s) =>
          s.status === 'booked' &&
          s.appointment?.id &&
          (s.appointment.status === 'agendado' ||
            s.appointment.status === 'confirmado' ||
            s.appointment.status === 'reagendado')
      )
      .map((s) => s.appointment!.id);

    setConsultasSelecionadasIds(new Set(idsElegiveis));
  };

  /** Limpa a seleção atual */
  const handleLimparSelecaoConsultas = () => {
    setConsultasSelecionadasIds(new Set());
  };

  /** Desmarca uma consulta específica */
  const handleDesmarcarConsulta = (appointmentId: string) => {
    setConsultasSelecionadasIds((prev) => {
      const next = new Set(prev);
      next.delete(appointmentId);
      return next;
    });
  };

  /** Executa a transferência inline após validação inteligente */
  const handleExecutarTransferenciaInline = async (idsParaTransferir: string[]) => {
    if (!selectedDoctorId || !medicoDestinoId || idsParaTransferir.length === 0) {
      toast.error('Selecione ao menos uma consulta e o profissional de destino.');
      return;
    }

    const medicoDestino = doctors.find((d) => d.id === medicoDestinoId);
    const nomeDestino = medicoDestino?.full_name || 'Profissional de Destino';

    const confirmou = await confirmDialog(
      `Deseja realmente transferir ${idsParaTransferir.length} ${idsParaTransferir.length === 1 ? 'consulta' : 'consultas'} para Dr(a). ${nomeDestino}?`
    );
    if (!confirmou) return;

    setTransferindoConsultas(true);
    try {
      const chaveIdempotencia = await buildIdempotencyKey('transferir_consultas_inline', {
        doctorOrigemId: selectedDoctorId,
        doctorDestinoId: medicoDestinoId,
        appointmentIds: idsParaTransferir,
      });

      const resultado = await transferirConsultasProfissional({
        doctorOrigemId: selectedDoctorId,
        doctorDestinoId: medicoDestinoId,
        appointmentIds: idsParaTransferir,
        idempotencyKey: chaveIdempotencia,
      });

      toast.success(
        `🎉 ${resultado.transferred_count} ${resultado.transferred_count === 1 ? 'consulta transferida' : 'consultas transferidas'} com sucesso para Dr(a). ${nomeDestino}!`,
        { duration: 5000 }
      );

      // Reseta modo de transferência e recarrega slots
      setConsultasSelecionadasIds(new Set());
      setMedicoDestinoId('');
      setAnaliseConflitos(null);
      setSugestoesCompativeis([]);
      setModoTransferencia(false);
      void refetchSlots();
    } catch (err: any) {
      console.error('Erro ao transferir consultas:', err);
      toast.error(getErrorMessage(err, 'Ocorreu um erro ao transferir as consultas.'));
    } finally {
      setTransferindoConsultas(false);
    }
  };

  /** Executa a transferência inteligente com auto-ajuste de horários conflitantes para vagas livres */
  const handleExecutarTransferenciaComAutoAjuste = async (
    idsDiretos: string[],
    ajustes: AjusteHorarioSugerido[]
  ) => {
    if (!selectedDoctorId || !medicoDestinoId) {
      toast.error('Selecione o profissional de destino.');
      return;
    }

    const totalTotal = idsDiretos.length + ajustes.length;
    if (totalTotal === 0) {
      toast.error('Nenhuma consulta selecionada para transferir.');
      return;
    }

    const nomeDestino = doctors.find((d) => d.id === medicoDestinoId)?.full_name || 'novo profissional';

    const confirmou = await confirmDialog(
      `Deseja transferir ${totalTotal} consulta(s) para Dr(a). ${nomeDestino}? ${
        ajustes.length > 0
          ? `${idsDiretos.length} serão transferidas nos horários originais e ${ajustes.length} serão auto-ajustadas para vagas livres disponíveis.`
          : 'Todas serão transferidas mantendo os horários originais.'
      }`
    );

    if (!confirmou) return;

    try {
      setTransferindoConsultas(true);
      const chaveIdempotencia = await buildIdempotencyKey('transferencia_auto_ajuste', {
        origem: selectedDoctorId,
        destino: medicoDestinoId,
        data: bookingDate,
        consultas: [...idsDiretos, ...ajustes.map((a) => a.idConsultaOrigem)].sort().join('-'),
      });

      const resultado = await transferirConsultasComAutoAjuste({
        doctorOrigemId: selectedDoctorId,
        doctorDestinoId: medicoDestinoId,
        idsDiretos,
        ajustesHorarios: ajustes,
        motivo: 'Transferência inteligente autônoma de consultas',
        idempotencyKey: chaveIdempotencia,
      });

      toast.success(
        `🎉 Transferência concluída! ${resultado.totalTransferidas} consulta(s) transferida(s)${
          resultado.totalAjustadas > 0 ? ` (${resultado.totalAjustadas} horários auto-ajustados para vagas livres)` : ''
        } para Dr(a). ${nomeDestino}!`,
        { duration: 5000 }
      );

      // Limpa estados e recarrega
      setModoTransferencia(false);
      setConsultasSelecionadasIds(new Set());
      setMedicoDestinoId('');
      setAnaliseConflitos(null);
      setSugestoesCompativeis([]);
      void refetchSlots();
    } catch (err: any) {
      console.error('Erro na transferência inteligente com auto-ajuste:', err);
      toast.error(getOperationalErrorMessage(err, 'Falha ao executar transferência de consultas.'));
    } finally {
      setTransferindoConsultas(false);
    }
  };

  /** Confirma um agendamento pelo ID com Optimistic Update instantâneo */
  const handleAgendaConfirm = async (appointmentId: string) => {
    const ok = await confirmDialog('Confirmar esta consulta agora?');
    if (!ok) return;

    // 1. Atualização Otimista Imediata na UI (0ms de resposta)
    const backupSlots = [...slots];
    setSlots((prev) =>
      prev.map((s) => {
        if (s.appointment?.id === appointmentId) {
          return {
            ...s,
            appointment: {
              ...s.appointment,
              status: 'confirmado',
            },
          };
        }
        return s;
      })
    );

    try {
      const { error } = await chamarApiPost('/api/rpc/api_set_appointment_status', {
        p_appointment_id: appointmentId,
        p_status: 'confirmado',
        p_reason: null,
        p_idempotency_key: await buildIdempotencyKey('confirm_appointment', { appointment_id: appointmentId }),
      });
      if (error) throw error;
      toast.success('Consulta confirmada!');
      void refetchSlots();
    } catch (err) {
      // Reverte para o estado anterior em caso de erro de rede
      setSlots(backupSlots);
      toast.error(await getOperationalErrorMessage(err, 'Erro ao confirmar consulta'));
    }
  };

  /** Abre o fluxo completo de reagendamento de consultas unificado */
  const handleAgendaReschedule = (appointmentId: string) => {
    setAgendaModalIntent({
      abrirNovoAgendamento: true,
      reagendar: appointmentId,
      retornarParaAgenda: true,
    });
  };

  /** Abre o mesmo fluxo completo de reagendamento para tratar consultas com conflito */
  const handleOpenConflictReschedule = async (slot: TimeSlot, _isConflict: boolean = true) => {
    if (!slot.appointment) return;
    handleAgendaReschedule(slot.appointment.id);
  };

  /** Realiza a remarcação do agendamento para o novo horário selecionado */
  const handleConflictRescheduleConfirm = async (novoSlot: TimeSlot) => {
    if (!conflictRescheduleModal) return;
    setConflictRescheduleModal((prev) => prev ? { ...prev, loading: true } : null);
    try {
      const { error } = await chamarApiPost('/api/rpc/api_reschedule_appointment', {
        p_appointment_id: conflictRescheduleModal.appointmentId,
        p_start_at: novoSlot.starts_at,
        p_end_at: novoSlot.ends_at,
        p_reason: conflictRescheduleReason.trim() || 'Reagendamento de conflito',
        p_idempotency_key: await buildStableIdempotencyKey('reschedule_conflict', {
          appointment_id: conflictRescheduleModal.appointmentId,
          new_slot: novoSlot.starts_at,
        }),
      });
      if (error) throw error;
      toast.success(`Consulta de ${conflictRescheduleModal.patientName} remarcada para ${novoSlot.time}!`);
      setConflictRescheduleModal(null);
      setConflictRescheduleSelectedSlot(null);
      setConflictRescheduleReason('');
      void refetchSlots();
    } catch (err) {
      toast.error(await getOperationalErrorMessage(err, 'Erro ao remarcar consulta'));
      setConflictRescheduleModal((prev) => prev ? { ...prev, loading: false } : null);
    }
  };

  /**
   * Calcula a reorganização automática de todos os conflitos do dia
   * buscando horários vagos (anterior mais próximo ou subsequente posterior)
   * para cada agendamento conflitante.
   */
  const handleAutoResolveConflicts = () => {
    // Função auxiliar para verificar se uma consulta pode ter o horário alterado (qualquer status ativo/concluído, exceto cancelado e faltas já reagendadas)
    const ehReagendavel = (appt: SlotAppointment) => {
      if (appt.status === 'cancelado') return false;
      if (appt.status === 'nao_compareceu' && appt.rescheduled_appointment_id) return false;
      return true;
    };

    // 1. Mapeia consultas por horário de início e identifica horários bloqueados (tanto na lista bruta quanto na filtrada)
    const consultasPorHorario = new Map<string, SlotAppointment[]>();
    const startsAtBloqueados = new Set<string>();

    for (const slot of slots) {
      if (slot.status === 'blocked' || slot.block_reason) {
        startsAtBloqueados.add(slot.starts_at);
      }
    }

    for (const slot of filteredSlots) {
      if (slot.status === 'blocked' || slot.block_reason) {
        startsAtBloqueados.add(slot.starts_at);
      }
      if (slot.appointment) {
        if (!consultasPorHorario.has(slot.starts_at)) {
          consultasPorHorario.set(slot.starts_at, []);
        }
        consultasPorHorario.get(slot.starts_at)!.push(slot.appointment);
      }
    }

    // 2. Classifica consultas em mantidas e consultas para mover
    const consultasParaMover: SlotAppointment[] = [];
    const startsAtMantidas = new Set<string>();

    for (const [startsAt, consultas] of consultasPorHorario.entries()) {
      if (startsAtBloqueados.has(startsAt)) {
        // Se o horário está bloqueado, nenhuma consulta pode permanecer.
        for (const consulta of consultas) {
          if (ehReagendavel(consulta)) {
            consultasParaMover.push(consulta);
          }
        }
      } else {
        // Se o horário não está bloqueado, mantemos a 1ª consulta neste horário
        startsAtMantidas.add(startsAt);

        // Todas as demais consultas do horário conflitante entram na lista para mover
        for (let i = 1; i < consultas.length; i++) {
          if (ehReagendavel(consultas[i])) {
            consultasParaMover.push(consultas[i]);
          }
        }
      }
    }

    if (consultasParaMover.length === 0) {
      toast.info('Nenhum conflito de horário ou pendência encontrado no dia.');
      return;
    }

    // 3. Inicializa o conjunto de horários reservados (bloqueados, mantidos ou já ocupados por consultas sem conflito)
    const startsAtReservados = new Set<string>();
    
    // Adiciona horários de bloqueios
    for (const startsAt of startsAtBloqueados) {
      startsAtReservados.add(startsAt);
    }
    
    // Adiciona horários de consultas mantidas
    for (const startsAt of startsAtMantidas) {
      startsAtReservados.add(startsAt);
    }

    // Adiciona outros horários ocupados por consultas normais sem conflito
    for (const slot of filteredSlots) {
      if (slot.status === 'booked' && slot.appointment) {
        startsAtReservados.add(slot.starts_at);
      }
    }

    // Função auxiliar para restringir o horário estritamente entre 08:00 e 16:50
    const eHorarioValido081650 = (s: TimeSlot) => {
      if (!s.time) return false;
      const t = s.time.trim();
      return t >= '08:00' && t <= '16:50';
    };

    // 4. Identifica todos os slots livres originais no intervalo das 08:00 às 16:50 (não bloqueados e sem consultas)
    const slotsLivresOriginais = filteredSlots.filter(
      (s: TimeSlot) =>
        eHorarioValido081650(s) &&
        s.status !== 'blocked' &&
        !s.block_reason &&
        !s.appointment &&
        !startsAtBloqueados.has(s.starts_at) &&
        (s.status === 'free' || s.status === 'past')
    );

    const propostas: Array<{
      idAgendamento: string;
      nomePaciente: string;
      horarioOriginal: string;
      startsAtOriginal: string;
      endsAtOriginal: string;
      novoHorario: string | null;
      startsAtNovo: string | null;
      endsAtNovo: string | null;
    }> = [];

    // 5. Encontra vagas adequadas para cada consulta que precisa ser movida, uma por uma, procurando entre 08:00 e 16:50
    for (const appt of consultasParaMover) {
      const startsAtOriginal = appt.appointment_date;
      
      // Filtra os candidatos disponíveis no intervalo de 08:00 a 16:50 que não estejam reservados
      const slotCandidatos = slotsLivresOriginais.filter(
        (s: TimeSlot) => s.starts_at !== startsAtOriginal && !startsAtReservados.has(s.starts_at)
      );

      let slotEscolhido: TimeSlot | null = null;

      // Procura primeiro por vaga anterior mais próxima no intervalo 08:00-16:50
      const candidatosAnteriores = slotCandidatos.filter(
        (s: TimeSlot) => s.starts_at < startsAtOriginal
      );
      if (candidatosAnteriores.length > 0) {
        candidatosAnteriores.sort((a: TimeSlot, b: TimeSlot) => b.starts_at.localeCompare(a.starts_at));
        slotEscolhido = candidatosAnteriores[0];
      }

      // Se não houver vaga anterior, procura por vaga posterior no mesmo intervalo 08:00-16:50
      if (!slotEscolhido) {
        const candidatosPosteriores = slotCandidatos.filter(
          (s: TimeSlot) => s.starts_at > startsAtOriginal
        );
        if (candidatosPosteriores.length > 0) {
          candidatosPosteriores.sort((a: TimeSlot, b: TimeSlot) => a.starts_at.localeCompare(b.starts_at));
          slotEscolhido = candidatosPosteriores[0];
        }
      }

      // Se ainda assim não encontrou mantendo proximidade, pega a primeira vaga livre no dia (a partir das 08:00)
      if (!slotEscolhido && slotCandidatos.length > 0) {
        slotCandidatos.sort((a: TimeSlot, b: TimeSlot) => a.starts_at.localeCompare(b.starts_at));
        slotEscolhido = slotCandidatos[0];
      }

      if (slotEscolhido) {
        startsAtReservados.add(slotEscolhido.starts_at);
        propostas.push({
          idAgendamento: appt.id,
          nomePaciente: appt.patient_name || 'Paciente',
          horarioOriginal: formatOperationalTime(startsAtOriginal) || '',
          startsAtOriginal,
          endsAtOriginal: appt.end_date || '',
          novoHorario: slotEscolhido.time,
          startsAtNovo: slotEscolhido.starts_at,
          endsAtNovo: slotEscolhido.ends_at,
        });
      } else {
        propostas.push({
          idAgendamento: appt.id,
          nomePaciente: appt.patient_name || 'Paciente',
          horarioOriginal: formatOperationalTime(startsAtOriginal) || '',
          startsAtOriginal,
          endsAtOriginal: appt.end_date || '',
          novoHorario: null,
          startsAtNovo: null,
          endsAtNovo: null,
        });
      }
    }

    setPropostaReorganizacaoModal({ propostas, loading: false });
  };

  /**
   * Executa os reagendamentos automáticos após confirmação do usuário estritamente UM POR VEZ
   */
  const handleConfirmReorganizacao = async () => {
    if (!propostaReorganizacaoModal) return;
    setPropostaReorganizacaoModal((prev) => prev ? { ...prev, loading: true } : null);

    try {
      const dateStr = format(currentDate, 'yyyy-MM-dd');
      const { data, error } = await chamarApiPost('/api/rpc/api_reorganize_schedule_conflicts', {
        p_doctor_id: selectedDoctorId,
        p_booking_date: dateStr,
        p_idempotency_key: await buildStableIdempotencyKey('reorganize_schedule_conflicts', {
          doctor_id: selectedDoctorId,
          date: dateStr,
        }),
      });

      if (!error && data) {
        const res = data as { reorganized_count?: number; failed_count?: number };
        if ((res.reorganized_count || 0) > 0) {
          toast.success(`${res.reorganized_count} consulta(s) reorganizada(s) com inteligência instantânea!`);
        } else {
          toast.info('Processamento concluído.');
        }
        setPropostaReorganizacaoModal(null);
        setPropostaReorganizacaoReason('');
        void refetchSlots();
        return;
      }
    } catch (rpcErr) {
      console.warn('Fallback para reorganização cliente:', rpcErr);
    }

    let sucessos = 0;
    let falhas = 0;

    // Executa a realocação sequencialmente (UM POR VEZ) com pausa de isolamento para evitar interferências
    for (const proposta of propostaReorganizacaoModal.propostas) {
      if (!proposta.startsAtNovo || !proposta.endsAtNovo) continue;

      try {
        const { error } = await chamarApiPost('/api/rpc/api_reschedule_appointment', {
          p_appointment_id: proposta.idAgendamento,
          p_start_at: proposta.startsAtNovo,
          p_end_at: proposta.endsAtNovo,
          p_reason: propostaReorganizacaoReason.trim() || 'Reorganização de conflito',
          p_idempotency_key: await buildStableIdempotencyKey('reschedule_conflict_auto', {
            appointment_id: proposta.idAgendamento,
            new_slot: proposta.startsAtNovo,
          }),
        });

        if (error) {
          console.error(`Erro ao reagendar consulta de ${proposta.nomePaciente}:`, error);
          toast.error(`Falha em ${proposta.nomePaciente}: ${getErrorMessage(error, 'Erro no reagendamento')}`);
          falhas++;
        } else {
          sucessos++;
        }

        // Aguarda 250ms entre requisições para garantir execução limpa um por vez sem nenhuma interferência
        await new Promise((resolve) => setTimeout(resolve, 250));
      } catch (err: any) {
        console.error(`Exceção ao reagendar consulta de ${proposta.nomePaciente}:`, err);
        toast.error(`Erro em ${proposta.nomePaciente}: ${getErrorMessage(err, 'Falha ao processar')}`);
        falhas++;
      }
    }

    if (sucessos > 0) {
      toast.success(`${sucessos} consulta(s) reorganizada(s) com sucesso!`);
    }
    if (falhas > 0) {
      toast.error(`Falha ao reorganizar ${falhas} consulta(s).`);
    }

    setPropostaReorganizacaoModal(null);
    setPropostaReorganizacaoReason('');
    void refetchSlots();
  };

  /** Inicia atendimento com confirmação e redireciona para a tela de consultas SOMENTE se a persistência no backend for bem-sucedida com total certeza */
  const handleAgendaStartEncounter = async (
    appointmentId: string,
    status?: string,
    patientName?: string,
    appointmentDate?: string
  ) => {
    const isPast = appointmentDate ? new Date(appointmentDate) < new Date(new Date().setHours(0,0,0,0)) : false;
    let confirmMsg = `Iniciar o atendimento de ${patientName || 'este paciente'} agora?`;
    if (isPast) {
      confirmMsg = `Atenção: Esta consulta é de uma data passada. ${confirmMsg}`;
    }

    const ok = await confirmDialog(confirmMsg);
    if (!ok) return;

    try {
      if (status === 'agendado' && userRole !== 'medico') {
        const { error: confirmError } = await chamarApiPost('/api/rpc/api_set_appointment_status', {
          p_appointment_id: appointmentId,
          p_status: 'confirmado',
          p_reason: null,
          p_idempotency_key: await buildIdempotencyKey('confirm_appointment', { appointment_id: appointmentId }),
        });
        if (confirmError) throw confirmError;
      }

      const { data, error } = await chamarApiPost('/api/rpc/api_start_encounter', {
        p_appointment_id: appointmentId,
        p_idempotency_key: await buildIdempotencyKey('start_encounter', { appointment_id: appointmentId }),
      });
      if (error) throw error;

      const payload = (data || {}) as { success?: boolean; appointment_id?: string | null };
      if (payload && payload.success === false) {
        throw new Error('O backend não confirmou a inicialização do atendimento.');
      }

      toast.success('Atendimento iniciado com sucesso!');

      let apptDateStr = format(currentDate, 'yyyy-MM-dd');
      if (appointmentDate) {
        const parsed = new Date(appointmentDate);
        if (isValid(parsed)) {
          apptDateStr = format(parsed, 'yyyy-MM-dd');
        }
      }

      // Redireciona para Consultas SOMENTE após ter certeza total que a consulta iniciou sem erros
      navigate('/appointments', {
        state: criarEstadoNavegacao({
          iniciarAtendimento: appointmentId,
          focarAgendamento: appointmentId,
          dataAgendamento: apptDateStr,
          buscarPaciente: patientName || '',
          abrirProntuarioDireto: true,
        }),
      });
    } catch (err) {
      console.error('Erro ao iniciar atendimento na agenda:', err);
      toast.error(await getOperationalErrorMessage(err, 'Erro ao iniciar atendimento'));
    }
  };

  /** Cancela um agendamento após confirmar com o operador com resposta otimista instantânea */
  const handleAgendaCancel = async (appointmentId: string) => {
    const ok = await confirmDialog('Confirmar cancelamento por desistência do paciente?');
    if (!ok) return;

    // 1. Atualização Otimista Imediata na UI (0ms de resposta)
    const backupSlots = [...slots];
    setSlots((prev) =>
      prev.map((s) => {
        if (s.appointment?.id === appointmentId) {
          return {
            ...s,
            status: 'free',
            appointment: null,
          };
        }
        return s;
      })
    );

    try {
      const { error } = await chamarApiPost('/api/rpc/api_set_appointment_status', {
        p_appointment_id: appointmentId,
        p_status: 'cancelado',
        p_reason: 'Paciente desistiu / Cancelado',
        p_idempotency_key: await buildIdempotencyKey('cancel_appointment', { appointment_id: appointmentId }),
      });
      if (error) throw error;
      
      toast.success('Consulta cancelada.', {
        duration: 6000,
        action: {
          label: 'Desfazer',
          onClick: async () => {
            const undoKey = await buildIdempotencyKey('uncancel_appointment', { appointment_id: appointmentId });
            await chamarApiPost('/api/rpc/api_set_appointment_status', {
              p_appointment_id: appointmentId,
              p_status: 'agendado',
              p_reason: 'Cancelamento desfeito pelo usuário',
              p_idempotency_key: undoKey,
            });
            toast.info('Cancelamento desfeito.');
            void refetchSlots();
          },
        },
      });
      void refetchSlots();
    } catch (err) {
      setSlots(backupSlots);
      toast.error(await getOperationalErrorMessage(err, 'Erro ao cancelar consulta'));
    }
  };

  /** Registra falta do paciente (não compareceu) com resposta otimista instantânea */
  const handleAgendaNoShow = async (appointmentId: string, currentStatus?: string) => {
    const isConfirmed = currentStatus === 'confirmado';
    const confirmMessage = isConfirmed 
      ? 'Atenção: Este paciente já havia CONFIRMADO a consulta. Deseja mesmo registrar a falta (Não Compareceu)?'
      : 'Confirmar registro de falta (Não Compareceu) para este paciente?';

    const ok = await confirmDialog(confirmMessage);
    if (!ok) return;

    // 1. Atualização Otimista Imediata na UI (0ms de resposta)
    const backupSlots = [...slots];
    setSlots((prev) =>
      prev.map((s) => {
        if (s.appointment?.id === appointmentId) {
          return {
            ...s,
            appointment: {
              ...s.appointment,
              status: 'nao_compareceu',
            },
          };
        }
        return s;
      })
    );

    try {
      const reason = isConfirmed ? 'Confirmou, mas não compareceu' : 'Paciente faltou';
      const previousStatus = currentStatus || 'agendado';
      const { error } = await chamarApiPost('/api/rpc/api_set_appointment_status', {
        p_appointment_id: appointmentId,
        p_status: 'nao_compareceu',
        p_reason: reason,
        p_idempotency_key: await buildIdempotencyKey('no_show_appointment', { appointment_id: appointmentId }),
      });
      if (error) throw error;

      toast.success('Falta registrada com sucesso.', {
        duration: 6000,
        action: {
          label: 'Desfazer',
          onClick: async () => {
            const undoKey = await buildIdempotencyKey('noshow_undo', { appointment_id: appointmentId, previousStatus });
            await chamarApiPost('/api/rpc/api_set_appointment_status', {
              p_appointment_id: appointmentId,
              p_status: previousStatus,
              p_reason: 'Registro de falta desfeito',
              p_idempotency_key: undoKey,
            });
            toast.info('Registro de falta desfeito.');
            void refetchSlots();
          },
        },
      });
      void refetchSlots();
    } catch (err) {
      setSlots(backupSlots);
      toast.error(await getOperationalErrorMessage(err, 'Erro ao registrar falta'));
    }
  };


  const getAgendaProfessionalRegistration = (appointment?: SlotAppointment | null) => {
    if (!appointment) return 'Não informado';
    const value = (appointment.doctor_crm || '').trim();
    const council = (appointment.doctor_council || '').trim();
    const label = (appointment.doctor_registration_label || '').trim();

    // Marcador de "sem registro": council=NAO_INFORMADO e crm=00
    const eNaoInformado =
      (council.toLowerCase() === 'nao_informado' || council.toLowerCase() === 'nao-informado') &&
      (value === '00' || value === '');

    if (eNaoInformado) return 'Não Informado';

    const isNotFilled = (val: string) => {
      const lower = val.toLowerCase().trim();
      return (
        lower === 'nao_informado' ||
        lower === 'nao-informado' ||
        lower === 'não informado' ||
        lower === 'não-informado' ||
        lower === 'n/a' ||
        lower === '00' ||
        lower === ''
      );
    };

    if (isNotFilled(value) || isNotFilled(council) || isNotFilled(label)) {
      return 'Não informado';
    }

    return label || (value ? `${council || 'Registro'} ${value}` : 'Não informado');
  };



  const handleDateInput = (value: string) => {
    const parsed = parse(value, 'yyyy-MM-dd', new Date());
    if (value && isValid(parsed)) {
      setCurrentDate(parsed);
    }
  };

  const { data: agendaOptions, isLoading: loadingOptions } = useQuery({
    queryKey: ['agendaOptions', institutionId],
    queryFn: async () => {
      const [doctorsResponse, institutionsResponse, specialtiesResponse, activeAvailabilitiesResponse] = await Promise.all([
        chamarApiPost('/api/rpc/list_doctors_catalog', {
          p_search: null,
          p_include_inactive: false,
        }),
        chamarApiPost('/api/rpc/list_institutions_catalog', {
          p_search: null,
          p_include_inactive: false,
        }),
        chamarApiPost('/api/rpc/list_specialties_catalog', {
          p_search: null,
          p_include_inactive: false,
        }),
        chamarApiPost('/api/table/doctor_availability', {}).select('doctor_id').eq('is_active', true).is('deleted_at', null),
      ]);
      if (doctorsResponse.error) throw doctorsResponse.error;

      const activeDoctorIds = new Set((activeAvailabilitiesResponse.data || []).map((a: { doctor_id: string }) => a.doctor_id));
      const fullCatalog = Array.isArray(doctorsResponse.data) ? (doctorsResponse.data as DoctorOption[]) : [];
      
      const currentSelectedId = selectedDoctorId || doctorId || '';
      
      // Recepcionistas não possuem acesso de leitura direta à tabela doctor_availability via RLS,
      // o que faz a query retornar [] silenciosamente. Nesse caso, exibimos todos os médicos do catálogo.
      const isReceptionist = userRole === 'recepcao';
      
      const doctorsWithAvailability = isReceptionist 
        ? fullCatalog 
        : fullCatalog.filter(doc => activeDoctorIds.has(doc.id) || doc.id === currentSelectedId);

      return {
        doctors: doctorsWithAvailability,
        institutions: Array.isArray(institutionsResponse.data) ? (institutionsResponse.data as InstitutionOption[]) : [],
        specialties: Array.isArray(specialtiesResponse.data) ? (specialtiesResponse.data as SpecialtyOption[]) : [],
      };
    },
    staleTime: 1000 * 60 * 60, // 1 hour cache
  });

  useEffect(() => {
    if (agendaOptions) {
      setDoctors(agendaOptions.doctors);
      setInstitutions(agendaOptions.institutions);
      setSpecialties(agendaOptions.specialties);

      if (userRole === 'recepcao' && !selectedInstitutionId && institutionId && agendaOptions.institutions.some((inst: InstitutionOption) => inst.id === institutionId)) {
        setSelectedInstitutionId(institutionId);
      }
    }
  }, [agendaOptions, userRole, selectedInstitutionId, institutionId]);

  const { data: slotsData, isLoading: loadingSlots, refetch: refetchSlots } = useQuery({
    queryKey: obterChaveQueryAgenda(selectedDoctorId, bookingDate, selectedInstitutionId),
    queryFn: () => buscarDadosAgendaComPolitica(selectedDoctorId, bookingDate, selectedInstitutionId),
    enabled: !!selectedDoctorId,
    staleTime: 1000 * 60 * 5, // 5 minutos de cache fresco (navegação instantânea entre datas)
    gcTime: 1000 * 60 * 30, // 30 minutos em memória
  });

  // Pré-carregamento preditivo em segundo plano (Prefetching) para navegação instantânea (0ms)
  useEffect(() => {
    if (!selectedDoctorId) return;

    // Datas adjacentes para pré-carregar (Ontem, Amanhã, +2d, -2d)
    const datasAdjacentes = [
      subDays(currentDate, 1),
      addDays(currentDate, 1),
      addDays(currentDate, 2),
      subDays(currentDate, 2),
    ];

    for (const dataRef of datasAdjacentes) {
      const dataStr = format(dataRef, 'yyyy-MM-dd');
      void queryClient.prefetchQuery({
        queryKey: obterChaveQueryAgenda(selectedDoctorId, dataStr, selectedInstitutionId),
        queryFn: () => buscarDadosAgendaComPolitica(selectedDoctorId, dataStr, selectedInstitutionId),
        staleTime: 1000 * 60 * 5,
        gcTime: 1000 * 60 * 30,
      });
    }
  }, [selectedDoctorId, currentDate, selectedInstitutionId, queryClient]);

  // Sincronização em tempo real (removida na migração Cloudflare)
  useEffect(() => {
    if (!selectedDoctorId) return;

    let timeoutRef: ReturnType<typeof setTimeout> | null = null;
    const invalidarComDebounce = () => {
      if (timeoutRef) clearTimeout(timeoutRef);
      timeoutRef = setTimeout(() => {
        void queryClient.invalidateQueries({
          queryKey: ['agendaSlots', selectedDoctorId],
        });
      }, 200);
    };

    

    return () => {
      if (timeoutRef) clearTimeout(timeoutRef);
      
    };
  }, [selectedDoctorId, queryClient]);

  useEffect(() => {
    if (slotsData) {
      setSlots(slotsData.slots);
      setSchedulePolicy(slotsData.policy);
    } else if (!selectedDoctorId) {
      setSlots([]);
      setSchedulePolicy(null);
    }
  }, [slotsData, selectedDoctorId]);

  const loading = loadingOptions || loadingSlots;

  const filteredSlots = useMemo(() => {
    const slotMap = new Map<string, TimeSlot>();
    
    for (const slot of slots) {
      const isBooked = slot.status === 'booked' || Boolean(slot.appointment);

      // Apenas slots totalmente livres de outras unidades são omitidos quando um filtro de unidade está ativo.
      // Consultas agendadas do médico PERMANECEM VISÍVEIS na agenda para garantir integridade e evitar duplo agendamento.
      if (!isBooked && selectedInstitutionId !== '' && slot.institution_id !== selectedInstitutionId) {
        continue;
      }
      
      const apptId = slot.appointment?.id;

      if (slot.status === 'booked' && apptId) {
        slotMap.set(slot.starts_at + '-' + apptId, slot);
      } else {
        const existing = slotMap.get(slot.starts_at + '-free');
        if (!existing || existing.status === 'free') {
          slotMap.set(slot.starts_at + '-' + (apptId || 'free'), slot);
        }
      }
    }
    // Identifica todos os horários que possuem algum agendamento ocupado no mapa
    const startsAtOcupados = new Set<string>();
    for (const value of slotMap.values()) {
      if (value.status === 'booked' && value.appointment?.id) {
        startsAtOcupados.add(value.starts_at);
      }
    }

    // Remove slots livres (com sufixo '-free') dos horários que estão ocupados por consultas
    for (const startsAt of startsAtOcupados) {
      slotMap.delete(startsAt + '-free');
    }
    
    return Array.from(slotMap.values()).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  }, [slots, selectedInstitutionId]);

  const duplicatedCpfs = useMemo(() => {
    const slotsByCpf: Record<string, { time: string; specialty: string }[]> = {};
    for (const slot of filteredSlots) {
      // Faltas (nao_compareceu) são registros históricos — não contam como agendamentos ativos duplicados
      if (slot.status === 'booked' && slot.appointment?.patient_cpf && slot.appointment.status !== 'nao_compareceu') {
        const cpf = slot.appointment.patient_cpf;
        if (!slotsByCpf[cpf]) slotsByCpf[cpf] = [];
        slotsByCpf[cpf].push({
          time: slot.time,
          specialty: slot.appointment.specialty_name || 'Especialidade principal'
        });
      }
    }
    const duplicates = new Map<string, { time: string; specialty: string }[]>();
    for (const [cpf, cpSlots] of Object.entries(slotsByCpf)) {
      if (cpSlots.length > 1) {
        duplicates.set(cpf, cpSlots);
      }
    }
    return duplicates;
  }, [filteredSlots]);

  const majorityInstitutionId = useMemo(() => {
    const counts = new Map<string, number>();
    let maxId = '';
    let maxCount = 0;
    
    for (const slot of filteredSlots) {
      const instId = slot.appointment?.institution_id;
      if (instId) {
        const newCount = (counts.get(instId) || 0) + 1;
        counts.set(instId, newCount);
        if (newCount > maxCount) {
          maxCount = newCount;
          maxId = instId;
        }
      }
    }
    
    return maxId || selectedInstitutionId;
  }, [filteredSlots, selectedInstitutionId]);

  const conflictingTimes = useMemo(() => {
    const patientsPerSlot = new Map<string, Set<string>>();
    for (const slot of filteredSlots) {
      if (slot.status === 'booked' && slot.appointment?.id) {
        const patientKey = slot.appointment.patient_cpf || slot.appointment.patient_id || slot.appointment.id;
        if (patientKey) {
          if (!patientsPerSlot.has(slot.starts_at)) {
            patientsPerSlot.set(slot.starts_at, new Set());
          }
          patientsPerSlot.get(slot.starts_at)!.add(patientKey);
        }
      }
    }
    const conflicts = new Set<string>();
    for (const [startsAt, patientSet] of patientsPerSlot.entries()) {
      if (patientSet.size > 1) {
        conflicts.add(startsAt);
      }
    }
    return conflicts;
  }, [filteredSlots]);

  // Fecha o dropdown ativo de 3 pontinhos ao clicar fora dele
  useEffect(() => {
    const handleDocumentClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.dropdown-tres-pontinhos-container')) {
        setActiveDropdownSlotKey(null);
      }
    };
    document.addEventListener('click', handleDocumentClick);
    return () => {
      document.removeEventListener('click', handleDocumentClick);
    };
  }, []);

  const visibleDoctors = useMemo(() => (
    doctors.filter((doctor: DoctorOption) => {
      // O médico atualmente selecionado sempre aparece na lista (não some ao trocar filtros)
      if (doctor.id === selectedDoctorId) return true;
      const matchesSpecialty = selectedSpecialtyId === 'all' || doctor.specialty_id === selectedSpecialtyId;
      return matchesSpecialty;
    })
  ), [doctors, selectedSpecialtyId, selectedDoctorId]);



  const visibleInstitutions = useMemo(() => {
    return institutions;
  }, [institutions]);

  const visibleSpecialties = useMemo(() => {
    const specialtyIds = new Set(
      doctors
        .map((doctor: DoctorOption) => doctor.specialty_id)
        .filter((value: string | null): value is string => Boolean(value)),
    );
    return specialties.filter((specialty: SpecialtyOption) => specialtyIds.has(specialty.id));
  }, [doctors, specialties]);

  useEffect(() => {
    if (selectedSpecialtyId === 'all') return;
    if (visibleSpecialties.some((specialty: SpecialtyOption) => specialty.id === selectedSpecialtyId)) return;
    setSelectedSpecialtyId('all');
  }, [selectedSpecialtyId, visibleSpecialties]);

  useEffect(() => {
    if (selectedInstitutionId === '') return;
    if (visibleInstitutions.some((inst: InstitutionOption) => inst.id === selectedInstitutionId)) return;
    setSelectedInstitutionId('');
  }, [selectedInstitutionId, visibleInstitutions]);

  // Médico atualmente selecionado
  const selectedDoctor = useMemo(() => {
    return doctors.find((doc: DoctorOption) => doc.id === selectedDoctorId);
  }, [doctors, selectedDoctorId]);

  // Lista de médicos disponíveis para destino (excluindo o médico de origem atual)
  const medicosDestinoDisponiveis = useMemo(() => {
    return doctors.filter((doc: DoctorOption) => doc.id !== selectedDoctorId);
  }, [doctors, selectedDoctorId]);

  // Lista formatada das consultas atualmente selecionadas para transferência
  const consultasSelecionadasLista = useMemo<ConsultaSelecionadaTransferencia[]>(() => {
    return filteredSlots
      .filter((s) => s.appointment?.id && consultasSelecionadasIds.has(s.appointment.id))
      .map((s) => ({
        id: s.appointment!.id,
        patient_name: s.appointment!.patient_name,
        time: s.time,
        starts_at: s.starts_at,
      }));
  }, [filteredSlots, consultasSelecionadasIds]);

  // Total de consultas ativas transferíveis no dia
  const totalConsultasElegiveisNoDia = useMemo(() => {
    return filteredSlots.filter(
      (s) =>
        s.status === 'booked' &&
        s.appointment?.id &&
        (s.appointment.status === 'agendado' ||
          s.appointment.status === 'confirmado' ||
          s.appointment.status === 'reagendado')
    ).length;
  }, [filteredSlots]);

  // Efeito para disparar análise de conflitos em tempo real ao selecionar o médico de destino
  useEffect(() => {
    if (!modoTransferencia || !medicoDestinoId || consultasSelecionadasIds.size === 0) {
      setAnaliseConflitos(null);
      setCarregandoAnalise(false);
      return;
    }

    let cancelado = false;
    setCarregandoAnalise(true);

    const consultasParaAnalisar = filteredSlots
      .filter((s) => s.appointment?.id && consultasSelecionadasIds.has(s.appointment.id))
      .map((s) => ({
        id: s.appointment!.id,
        starts_at: s.starts_at,
        ends_at: s.ends_at,
        patient_name: s.appointment!.patient_name,
        time: s.time,
      }));

    analisarConflitosTransferencia(medicoDestinoId, bookingDate, consultasParaAnalisar)
      .then((resultado) => {
        if (!cancelado) {
          setAnaliseConflitos(resultado);
          setCarregandoAnalise(false);
        }
      })
      .catch((err) => {
        console.error('Erro ao analisar conflitos de transferência:', err);
        if (!cancelado) {
          setCarregandoAnalise(false);
        }
      });

    return () => {
      cancelado = true;
    };
  }, [modoTransferencia, medicoDestinoId, consultasSelecionadasIds, bookingDate, filteredSlots]);

  // Efeito autônomo para calcular ranking de profissionais mais compatíveis
  useEffect(() => {
    if (!modoTransferencia || consultasSelecionadasIds.size === 0 || !selectedDoctorId) {
      setSugestoesCompativeis([]);
      setCarregandoSugestoes(false);
      return;
    }

    let cancelado = false;
    setCarregandoSugestoes(true);

    const consultasParaAnalisar = filteredSlots
      .filter((s) => s.appointment?.id && consultasSelecionadasIds.has(s.appointment.id))
      .map((s) => ({
        id: s.appointment!.id,
        starts_at: s.starts_at,
        ends_at: s.ends_at,
        patient_name: s.appointment!.patient_name,
        time: s.time,
      }));

    buscarSugestoesProfissionaisCompativeis(
      selectedDoctorId,
      selectedDoctor?.specialty_id,
      bookingDate,
      consultasParaAnalisar,
      doctors
    )
      .then((sugestoes) => {
        if (!cancelado) {
          setSugestoesCompativeis(sugestoes);
          setCarregandoSugestoes(false);
        }
      })
      .catch((err) => {
        console.warn('Erro ao buscar sugestões autônomas de profissionais:', err);
        if (!cancelado) {
          setCarregandoSugestoes(false);
        }
      });

    return () => {
      cancelado = true;
    };
  }, [modoTransferencia, consultasSelecionadasIds, selectedDoctorId, selectedDoctor?.specialty_id, bookingDate, filteredSlots, doctors]);



  useEffect(() => {
    void refetchSlots();
  }, [refetchSlots]);

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
          setAtendimentoPendente(appointment);
        } else {
          setAtendimentoPendente(null);
        }
      } catch (err) {
        console.error('Erro ao buscar atendimento pendente:', err);
      }
    };

    void buscarAtendimentoEmAndamento();
  }, [doctorId, userRole, slots]);

  const handleBookSlot = (slot: TimeSlot, e?: { target: any; preventDefault?: () => void }) => {
    if (e) {
      const target = e.target as HTMLElement;
      // Se o clique foi originado dentro do botão de 3 pontinhos, ignora para permitir que o dropdown seja aberto normalmente
      if (target.closest('.botao-tres-pontinhos')) {
        return;
      }
    }

    // Se estiver no Modo de Transferência Inteligente, o clique no slot seleciona/deseleciona a consulta
    if (modoTransferencia) {
      const ehTransferivel =
        slot.status === 'booked' &&
        Boolean(slot.appointment?.id) &&
        (slot.appointment?.status === 'agendado' ||
          slot.appointment?.status === 'confirmado' ||
          slot.appointment?.status === 'reagendado');

      if (ehTransferivel && slot.appointment?.id) {
        toggleConsultaSelecionada(slot.appointment.id);
      } else {
        toast.info('Apenas consultas agendadas ativas individuais podem ser transferidas.');
      }
      return;
    }

    if (slot.status === 'booked' && slot.appointment) {
      const appt = slot.appointment;
      
      let apptDateStr = '';
      try {
        const apptDateObj = new Date(appt.appointment_date);
        if (isValid(apptDateObj)) {
          apptDateStr = format(apptDateObj, 'yyyy-MM-dd');
        }
      } catch (err) {
        console.error('Erro ao formatar data do agendamento:', err);
      }
      
      const searchVal = appt.patient_cpf || appt.patient_name || '';

      // Navega para Consultas sem expor dados na URL — tudo via React Router state
      navigate('/appointments', {
        state: criarEstadoNavegacao({
          focarAgendamento: appt.id,
          focarEspecialidade: appt.specialty_name || undefined,
          buscarPaciente: searchVal || undefined,
          dataAgendamento: apptDateStr || undefined,
        }),
      });
      return;
    }

    if (slot.status !== 'free' && slot.status !== 'past' && slot.status !== 'soft_blocked') return;

    if (isDoctorScoped) {
      toast.info('Horarios livres ficam disponiveis apenas para consulta visual. O agendamento e feito pela recepcao ou gestao.');
      return;
    }

    const slotInstitutionId = slot.institution_id || institutionId || null;
    if (!hasPermission('appointments', 'create', slotInstitutionId)) {
      toast.error('Seu perfil nao pode agendar consultas neste contexto.');
      return;
    }

    if (!selectedDoctorId) {
      toast.error('Selecione o profissional antes de agendar.');
      return;
    }

    // Abre o modal de agendamento diretamente na página de Agenda
    setAgendaModalIntent({
      abrirNovoAgendamento: true,
      medicoId: selectedDoctorId,
      dataAgendamento: bookingDate,
      slotInicio: slot.starts_at,
      instituicaoId: slot.institution_id || undefined,
      retornarParaAgenda: true,
    });
  };

  const handleExport = async (formatType: ExportFormat) => {
    setExporting(formatType);
    try {
      await generateAndDownloadModuleExport('agenda', formatType, {
        date_from: bookingDate,
        date_to: bookingDate,
        doctor_id: selectedDoctorId || null,
      });
    } catch (error) {
      toast.error(await getOperationalErrorMessage(error, 'Não foi possível gerar a exportação.'));
    } finally {
      setExporting(null);
    }
  };

  return (
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
              setMedicalRecordAppointment({
                id: atendimentoPendente.id,
                patient_name: atendimentoPendente.patient_name,
                appointment_date: atendimentoPendente.appointment_date,
                status: atendimentoPendente.status,
                reason: atendimentoPendente.reason,
                patient_id: atendimentoPendente.patient_id,
                doctor_id: atendimentoPendente.doctor_id,
                doctor_name: atendimentoPendente.doctor_name,
                doctor_crm: atendimentoPendente.doctor_crm,
                doctor_council: atendimentoPendente.doctor_council,
                doctor_registration_label: atendimentoPendente.doctor_registration_label,
                end_date: atendimentoPendente.end_date,
                institution_id: atendimentoPendente.institution_id
              } as SlotAppointment);
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
        <PageHeader 
          title="Agenda" 
          description="VISUALIZAÇÃO DA AGENDA E DISPONIBILIDADE MÉDICA" 
          className="mb-3" 
          compact 
          actionsClassName="shrink-0"
          loading={loading}
        >
          <div className="flex flex-col gap-2 w-full">
            <div className="flex w-full flex-col md:flex-row flex-wrap items-stretch md:items-end gap-2">
              {/* IIFE para computar safeSpecialtyId sem criar estado extra */}
              {(() => {
                const safeSpecialtyId = selectedSpecialtyId === 'all' || visibleSpecialties.some((s: SpecialtyOption) => s.id === selectedSpecialtyId) ? selectedSpecialtyId : 'all';

                return (
                  <>
                    <div className="flex h-9 items-center gap-1.5 rounded-xl border border-slate-200/90 bg-white px-1.5 w-auto shrink-0 shadow-2xs">
                      <Button variant="ghost" size="icon" onClick={() => setCurrentDate(subDays(currentDate, 1))} className="h-7 w-7 text-slate-500 hover:bg-slate-100 hover:text-slate-800 shrink-0 rounded-lg" title="Dia anterior"><ChevronLeft className="h-4 w-4" /></Button>
                      <Input type="date" value={bookingDate} onChange={(event: { target: { value: string } }) => handleDateInput(event.target.value)} className="delphi-input h-7 w-[105px] border-0 bg-transparent px-0 text-center text-xs font-semibold shadow-none" aria-label="Data da agenda" />
                      <span className="rounded-lg bg-blue-50 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-[#003B71] border border-blue-100/80 shrink-0 select-none ml-0.5">
                        {format(currentDate, "EEEE", { locale: ptBR })}
                      </span>
                      <Button variant="ghost" size="icon" onClick={() => setCurrentDate(addDays(currentDate, 1))} className="h-7 w-7 text-slate-500 hover:bg-slate-100 hover:text-slate-800 shrink-0 rounded-lg" title="Próximo dia"><ChevronRight className="h-4 w-4" /></Button>
                    </div>



                    <div className="w-full md:w-auto md:flex-1 md:min-w-[110px]">
                      <Combobox
                        options={[
                          { value: 'all', label: visibleSpecialties.length === 0 ? "Nenhuma especialidade" : "Todas as especialidades" },
                          ...visibleSpecialties.map(renderSpecialtyOption)
                        ]}
                        value={safeSpecialtyId}
                        onChange={setSelectedSpecialtyId}
                        disabled={isDoctorScoped || visibleSpecialties.length === 0}
                        placeholder={visibleSpecialties.length === 0 ? "Nenhuma especialidade" : "Especialidade"}
                        searchPlaceholder="Buscar especialidade..."
                        emptyText="Nenhuma especialidade"
                        className={`h-9 text-xs font-semibold rounded-xl border-slate-200/90 shadow-2xs ${visibleSpecialties.length === 0 ? 'bg-slate-50 text-slate-400' : 'bg-white'}`}
                      />
                    </div>

                    <div className="w-full md:w-auto md:flex-1 md:min-w-[180px]">
                      <Combobox
                        options={[
                          { value: '', label: visibleDoctors.length === 0 ? 'Nenhum profissional disponível' : 'Selecione o profissional...' },
                          ...visibleDoctors.map((doctor: DoctorOption) => renderDoctorOption(doctor))
                        ]}
                        value={selectedDoctorId || ''}
                        onChange={(newDoctorId) => {
                          setSelectedDoctorId(newDoctorId || '');
                          setModoTransferencia(false);
                          setConsultasSelecionadasIds(new Set());
                          setMedicoDestinoId('');
                          setAnaliseConflitos(null);
                          setSugestoesCompativeis([]);
                        }}
                        disabled={isDoctorScoped || visibleDoctors.length === 0}
                        placeholder={visibleDoctors.length === 0 ? 'Nenhum profissional disponível' : 'Selecione o profissional'}
                        searchPlaceholder="Buscar profissional..."
                        emptyText="Nenum profissional encontrado"
                        className={`h-9 text-xs font-semibold rounded-xl border-slate-200/90 shadow-2xs ${visibleDoctors.length === 0 ? 'bg-slate-50 text-slate-400' : 'bg-white'}`}
                      />
                    </div>


                    <div className="flex gap-2 w-full md:w-auto shrink-0">


                      {(isSuperadmin || userRole === 'admin') && (
                        <Button
                          variant="outline"
                          onClick={() => setIsBloqueiosOpen(true)}
                          className="h-9 px-3 border-slate-200/90 text-slate-700 hover:border-rose-200 hover:text-rose-600 hover:bg-rose-50/50 font-bold text-xs flex items-center gap-1.5 shadow-2xs rounded-xl transition-all bg-white"
                          title="Gerenciar e registrar bloqueios oficiais da agenda"
                        >
                          <Lock className="h-3.5 w-3.5" />
                          Bloqueios
                        </Button>
                      )}



                      {/* Botões de Transferência Inteligente — visíveis APENAS quando um médico estiver selecionado */}
                      {canUpdateAppointments && isSuperadmin && Boolean(selectedDoctorId) && (
                        <Button
                          variant={modoTransferencia ? "default" : "outline"}
                          onClick={toggleModoTransferencia}
                          className={cn(
                            "h-9 px-3 font-bold text-xs flex items-center gap-1.5 shadow-2xs rounded-xl transition-all",
                            modoTransferencia
                              ? "bg-blue-600 text-white hover:bg-blue-700 border-blue-600 ring-2 ring-blue-300"
                              : "border-blue-200/90 text-blue-700 hover:border-blue-300 hover:text-blue-800 hover:bg-blue-50/60 bg-white"
                          )}
                          title="Transferir consultas agendadas para outro profissional de saúde diretamente na grade"
                          id="btn-transferir-consultas"
                        >
                          <ArrowRightLeft className="h-3.5 w-3.5" />
                          <span>{modoTransferencia ? "Sair do Modo Transferir" : "Transferir Consultas"}</span>
                        </Button>
                      )}
                    </div>

                    {schedulePolicy && (
                      <div
                        className="flex h-9 w-9 cursor-help items-center justify-center rounded-xl bg-blue-50 text-blue-700 border border-blue-100 shadow-2xs transition-colors hover:bg-blue-100"
                        title={`${schedulePolicy.title || 'Agenda profissional global'}: ${schedulePolicy.description || 'Conflitos de horário do profissional são validados pelo backend.'}${Number(schedulePolicy.global_conflicts || 0) > 0 ? ` ${schedulePolicy.global_conflicts} bloqueio(s) em outra unidade.` : ''}`}
                      >
                        <Info className="h-5 w-5" />
                      </div>
                    )}

                    {isSuperadmin && (
                      <div
                        className="flex h-9 w-9 cursor-help items-center justify-center rounded-xl bg-amber-100 text-amber-700 border border-amber-200 shadow-2xs transition-colors hover:bg-amber-200"
                        title="Modo de verificação superadmin: seleção de profissional e abertura de atendimento para validação clínica."
                      >
                        <ShieldAlert className="h-5 w-5" />
                      </div>
                    )}


                  </>
                );
              })()}
            </div>

            {/* Linha de Filtros Rápidos */}
            <div className="flex flex-wrap items-center gap-2 mt-1 w-fit">
              <div className="inline-flex items-center h-8 bg-slate-100/80 border border-slate-200/80 p-0.5 rounded-xl gap-0.5 shadow-2xs box-border shrink-0">
                <Button 
                  type="button"
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setCurrentDate(subDays(new Date(), 1))} 
                  className={cn(
                    "h-full px-2.5 sm:px-3 text-xs font-bold transition-all duration-200 rounded-lg flex items-center gap-1 leading-none border border-transparent",
                    format(currentDate, 'yyyy-MM-dd') === format(subDays(new Date(), 1), 'yyyy-MM-dd')
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
                  onClick={() => setCurrentDate(new Date())} 
                  className={cn(
                    "h-full px-3 text-xs font-bold transition-all duration-200 rounded-lg flex items-center leading-none border border-transparent",
                    format(currentDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')
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
                  onClick={() => setCurrentDate(addDays(new Date(), 1))} 
                  className={cn(
                    "h-full px-2.5 sm:px-3 text-xs font-bold transition-all duration-200 rounded-lg flex items-center gap-1 leading-none border border-transparent",
                    format(currentDate, 'yyyy-MM-dd') === format(addDays(new Date(), 1), 'yyyy-MM-dd')
                      ? "bg-white text-blue-600 shadow-2xs border-slate-200/60 font-black" 
                      : "text-slate-600 hover:text-slate-900 hover:bg-white/60 font-bold"
                  )}
                >
                  <span>Amanhã</span>
                  <ChevronRight className="h-3.5 w-3.5" /> 
                </Button>
              </div>

              <div className="h-5 w-[1px] bg-slate-300 shrink-0 mx-0.5 self-center" />

              <QuickFilterButton
                variant="clear"
                onClick={() => {
                  setSelectedInstitutionId('all');
                  setSelectedSpecialtyId('all');
                  setSelectedDoctorId('');
                  setCurrentDate(new Date());
                }}
                icon={<FilterX className="h-3.5 w-3.5" />}
                label="Limpar"
              />
            </div>
          </div>
        </PageHeader>

        <div className="min-h-0 flex-1 pt-2 pb-2">
        <section className="flex h-full min-h-0 flex-col rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-slate-200 bg-slate-100/95 backdrop-blur-sm px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-3 truncate">
              <h2 className="truncate text-[11px] font-bold uppercase tracking-wider text-slate-600">
                Horários Disponíveis {selectedDoctor?.full_name ? `- ${selectedDoctor.full_name}` : ''}
              </h2>

              {modoTransferencia && (
                <div className="inline-flex items-center gap-1.5 bg-blue-100/90 text-blue-800 border border-blue-300/80 px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider animate-in fade-in-50">
                  <ArrowRightLeft className="h-3 w-3 text-blue-700" />
                  <span>Modo Transferência Ativo • Clique nas consultas para selecionar</span>
                </div>
              )}
            </div>

            {conflictingTimes.size > 0 && canUpdateAppointments && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleAutoResolveConflicts}
                className="h-7 px-2.5 border-red-200 text-red-700 hover:bg-red-50 hover:border-red-300 font-bold text-[10px] uppercase tracking-wider flex items-center gap-1 shadow-sm rounded-md transition-colors"
                title="Resolver conflitos de horário do dia automaticamente"
              >
                <AlertTriangle className="h-3.5 w-3.5 text-red-600 shrink-0" />
                <span>Reorganizar Conflitos</span>
              </Button>
            )}
          </div>
          <div className="grid-scroll relative min-h-0 flex-1 overflow-auto p-4 bg-slate-50/30">
            {loading && filteredSlots.length === 0 ? (
              <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
            ) : !selectedDoctorId ? (
              <div className="flex flex-col items-center w-full py-6 px-4">

                {/* Título */}
                <div className="flex flex-col items-center mb-6 text-center max-w-xl">
                  <div className="bg-blue-50 p-3 rounded-full mb-3 border border-blue-100/80">
                    <User className="h-6 w-6 text-blue-600" />
                  </div>
                  <h3 className="text-xl font-extrabold text-slate-800 tracking-tight">Selecione o Profissional</h3>
                  <p className="text-slate-500 text-[13px] mt-1.5 leading-relaxed max-w-md">
                    Clique em um profissional abaixo para visualizar sua grade de horários, gerenciar consultas ou realizar novos agendamentos para a data selecionada.
                  </p>
                </div>

                {visibleDoctors.length === 0 ? (
                  <div className="flex flex-col items-center py-8 text-slate-400">
                    <User className="h-10 w-10 mb-2 opacity-30" />
                    <p className="text-sm">Nenhum profissional disponível para esta data.</p>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-center gap-2.5 w-full">
                    {visibleDoctors.map((doctor: DoctorOption) => {
                      const bgHex = doctor.specialty_color || '#64748b';
                      const Icon = doctor.specialty_icon && SPECIALTY_ICONS[doctor.specialty_icon]
                        ? SPECIALTY_ICONS[doctor.specialty_icon]
                        : Stethoscope;

                      return (
                        <button
                          key={doctor.id}
                          type="button"
                          onClick={(e: { preventDefault: () => void; stopPropagation: () => void }) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setSelectedDoctorId(doctor.id);
                          }}
                          className="group inline-flex items-center gap-3 bg-slate-50/80 hover:bg-[#003B71]/5 border border-slate-200/65 hover:border-[#003B71]/35 active:scale-[0.99] transition-all duration-150 rounded-xl py-2.5 px-4 cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#003B71]/40 shadow-3xs hover:shadow-xs w-auto shrink-0 text-left"
                        >
                          {/* Mini-ícone redondo da especialidade redimensionado */}
                          <div
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border shadow-3xs group-hover:scale-105 transition-transform duration-150"
                            style={{
                              backgroundColor: `${bgHex}12`,
                              color: bgHex,
                              borderColor: `${bgHex}30`,
                            }}
                          >
                            <Icon className="h-4 w-4 shrink-0" />
                          </div>

                          {/* Nome + Especialidade à direita em tamanho natural */}
                          <div className="flex flex-col leading-snug whitespace-nowrap">
                            <span className="text-xs font-extrabold text-slate-800 group-hover:text-[#003B71] uppercase tracking-tight transition-colors">
                              {doctor.full_name}
                            </span>
                            <span className="text-[10px] font-semibold text-slate-400 group-hover:text-slate-500 uppercase tracking-wide mt-0.5">
                              {doctor.specialty_name || 'Especialista'}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : filteredSlots.length === 0 ? (
              (() => {
                const diaSemana = currentDate.getDay();
                const ehFimDeSemana = diaSemana === 0 || diaSemana === 6;

                return (
                  <div className="flex flex-col items-center justify-center py-20 text-center max-w-xl mx-auto animate-in fade-in zoom-in-95 duration-500">
                    <div className={cn(
                      "w-20 h-20 rounded-full flex items-center justify-center mb-6 shadow-sm ring-8 ring-opacity-30",
                      ehFimDeSemana ? "bg-amber-50 ring-amber-50" : "bg-slate-50 ring-slate-50 border border-slate-100"
                    )}>
                      {ehFimDeSemana ? (
                        <Coffee className="h-9 w-9 text-amber-500" />
                      ) : (
                        <Calendar className="h-9 w-9 text-slate-400" />
                      )}
                    </div>
                    <h3 className="text-lg font-extrabold text-slate-800 mb-2 tracking-tight">
                      {ehFimDeSemana ? 'Pausa de Fim de Semana' : 'Agenda não disponível'}
                    </h3>
                    <p className="text-sm text-slate-500 max-w-sm leading-relaxed mb-4">
                      {ehFimDeSemana 
                        ? `O profissional não possui expedientes configurados para ${diaSemana === 6 ? 'sábado' : 'domingo'}.`
                        : 'Não foram encontrados horários para este profissional hoje. A escala pode estar inativa ou um bloqueio oficial está vigente.'}
                    </p>
                    
                    {!ehFimDeSemana && canManageAvailability && (
                      <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4 flex flex-col items-center max-w-md w-full">
                        <p className="text-xs text-blue-800 font-medium leading-relaxed">
                          Deseja habilitar este dia da semana? Configure na <strong className="font-bold">Gestão Administrativa da Agenda</strong> clicando no ícone do dia.
                        </p>
                      </div>
                    )}
                  </div>
                );
              })()
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12 2xl:grid-cols-16 mt-2">
                  {filteredSlots.map((slot: TimeSlot) => {
                        const slotKey = `${slot.starts_at}:${slot.appointment?.id || 'free'}`;
                        let bookedBg = 'bg-slate-50 border-slate-200 hover:bg-slate-100'; // Default
                        let iconColor = 'text-slate-600';
                        let StatusIcon = Clock; // default
                        
                        const isConflictTime = conflictingTimes.has(slot.starts_at);
                        const isDifferentInstitution = majorityInstitutionId !== '' && !!slot.appointment?.institution_id && slot.appointment.institution_id !== majorityInstitutionId;

                        let isDuplicateCpf = false;
                        let duplicateInfo = '';
                        if (slot.status === 'booked' && slot.appointment?.patient_cpf) {
                          const cpSlots = duplicatedCpfs.get(slot.appointment.patient_cpf);
                          if (cpSlots) {
                            isDuplicateCpf = true;
                            duplicateInfo = `\nConsultas duplicadas:\n` + cpSlots.map((s: { time: string; specialty?: string }) => `- ${s.time} (${s.specialty})`).join('\n');
                          }
                        }

                        // Identifica se este slot é transferível no modo de transferência
                        const ehTransferivel = slot.status === 'booked' &&
                          Boolean(slot.appointment?.id) &&
                          (slot.appointment?.status === 'agendado' ||
                            slot.appointment?.status === 'confirmado' ||
                            slot.appointment?.status === 'reagendado');

                        const estaSelecionada = Boolean(slot.appointment?.id && consultasSelecionadasIds.has(slot.appointment.id));
                        const infoConflito = slot.appointment?.id
                          ? analiseConflitos?.detalhes.find((d) => d.idConsulta === slot.appointment?.id)
                          : undefined;

                        if (slot.status === 'booked' && slot.appointment?.status) {
                          const s = slot.appointment.status;
                          if (s === 'agendado') {
                            bookedBg = 'bg-blue-50/90 border-l-4 border-l-blue-600 border-t border-r border-b border-blue-200 hover:bg-blue-100/90 shadow-2xs';
                            iconColor = 'text-blue-700';
                            StatusIcon = Calendar;
                          }
                          else if (s === 'confirmado') {
                            bookedBg = 'bg-emerald-50/90 border-l-4 border-l-emerald-600 border-t border-r border-b border-emerald-200 hover:bg-emerald-100/90 shadow-2xs';
                            iconColor = 'text-emerald-700';
                            StatusIcon = CheckCircle;
                          }
                          else if (s === 'em_atendimento') {
                            bookedBg = 'bg-indigo-50 border-l-4 border-l-indigo-600 border-t border-r border-b border-indigo-200 hover:bg-indigo-100/90 shadow-2xs';
                            iconColor = 'text-indigo-700';
                            StatusIcon = Activity;
                          }
                          else if (s === 'concluido') {
                            bookedBg = 'bg-teal-50/80 border-l-4 border-l-teal-600 border-t border-r border-b border-teal-200 hover:bg-teal-100/80 shadow-2xs';
                            iconColor = 'text-teal-700';
                            StatusIcon = CheckCircle2;
                          }
                          else if (s === 'cancelado') {
                            bookedBg = 'bg-rose-50/70 border-l-4 border-l-rose-400 border-t border-r border-b border-rose-200 hover:bg-rose-100/70 opacity-75 shadow-2xs';
                            iconColor = 'text-rose-500';
                            StatusIcon = XCircle;
                          }
                          else if (s === 'nao_compareceu') {
                            bookedBg = 'bg-red-50/70 border-l-4 border-l-red-400 border-t border-r border-b border-red-200 hover:bg-red-100/70 opacity-75 shadow-2xs';
                            iconColor = 'text-red-500';
                            StatusIcon = UserX;
                          }
                          else if (s === 'reagendado') {
                            bookedBg = 'bg-amber-50/90 border-l-4 border-l-amber-600 border-t border-r border-b border-amber-200 hover:bg-amber-100/90 shadow-2xs';
                            iconColor = 'text-amber-700';
                            StatusIcon = RefreshCcw;
                          }

                          if (slot.is_out_of_hours) {
                            bookedBg = 'bg-purple-50/80 border-2 border-dashed border-purple-400 hover:bg-purple-100/80 shadow-2xs text-purple-900';
                            iconColor = 'text-purple-700';
                          }

                          if (isDifferentInstitution) {
                            bookedBg = 'bg-amber-50/90 border-2 border-dashed border-amber-500 hover:bg-amber-100/90 shadow-2xs text-amber-900';
                            iconColor = 'text-amber-800';
                          }

                          if (isDuplicateCpf) {
                            bookedBg = 'bg-rose-50 border-l-4 border-l-rose-500 border-t border-r border-b border-rose-300 hover:bg-rose-100 shadow-2xs';
                            iconColor = 'text-rose-600';
                          }

                          if (isConflictTime) {
                            bookedBg = 'bg-rose-100 border-l-4 border-l-rose-600 border-t border-r border-b border-rose-400 hover:bg-rose-200 shadow-xs animate-pulse';
                            iconColor = 'text-rose-700';
                            StatusIcon = AlertTriangle;
                          }

                          // Estilo especial dinâmico durante o Modo de Transferência Inteligente
                          if (modoTransferencia && ehTransferivel) {
                            if (estaSelecionada) {
                              if (infoConflito?.temConflito) {
                                bookedBg = 'bg-rose-50 border-2 border-rose-500 ring-2 ring-rose-400 shadow-md text-rose-950';
                                iconColor = 'text-rose-700';
                              } else if (medicoDestinoId && !infoConflito?.temConflito) {
                                bookedBg = 'bg-emerald-50 border-2 border-emerald-500 ring-2 ring-emerald-400 shadow-md text-emerald-950';
                                iconColor = 'text-emerald-700';
                              } else {
                                bookedBg = 'bg-blue-50 border-2 border-blue-600 ring-2 ring-blue-400 shadow-md text-blue-950';
                                iconColor = 'text-blue-700';
                              }
                            } else {
                              bookedBg = 'bg-slate-50/90 border border-slate-300 hover:border-blue-400 hover:bg-blue-50/60 cursor-pointer shadow-3xs';
                              iconColor = 'text-slate-700';
                            }
                          }
                        }

                        const isLunch = slot.block_reason && (
                          slot.block_reason.toLowerCase().includes('almoço') ||
                          slot.block_reason.toLowerCase().includes('almoco')
                        );

                        return (
                        <div key={`${slot.starts_at}:${slot.appointment?.id || 'free'}:${slot.institution_id || 'global'}`} className={cn("relative", activeDropdownSlotKey === slotKey && "z-50")}>
                          <button
                            type="button"
                            onClick={(e: { target: any; preventDefault?: () => void }) => handleBookSlot(slot, e)}
                            className={`relative rounded-lg px-2 py-1 transition-all flex flex-col items-center justify-center h-16 w-full overflow-hidden ${
                              modoTransferencia && !ehTransferivel
                                ? 'bg-slate-100/60 border border-slate-200 opacity-30 cursor-not-allowed pointer-events-none'
                                : slot.status === 'free' || slot.status === 'past'
                                  ? 'bg-slate-50 border border-slate-200 hover:bg-slate-100/90 hover:border-slate-300 cursor-pointer shadow-3xs'
                                  : slot.status === 'soft_blocked'
                                    ? 'bg-amber-50/40 border border-dashed border-amber-300 hover:bg-amber-100/60 hover:border-amber-400 cursor-pointer shadow-3xs'
                                    : slot.status === 'booked'
                                      ? `${bookedBg} cursor-pointer`
                                      : isLunch
                                          ? 'bg-orange-50/80 border border-orange-200 text-orange-850 shadow-3xs cursor-not-allowed opacity-90'
                                          : 'bg-slate-100 border border-slate-300 cursor-not-allowed opacity-50'
                            }`}
                          >
                              {/* Indicador de Checkbox no Modo de Transferência */}
                              {modoTransferencia && ehTransferivel && (
                                <div className="absolute top-1 left-1.5 z-20 pointer-events-none">
                                  {estaSelecionada ? (
                                    <CheckSquare className={cn("h-3.5 w-3.5", infoConflito?.temConflito ? "text-rose-600" : medicoDestinoId ? "text-emerald-600" : "text-blue-600")} />
                                  ) : (
                                    <Square className="h-3.5 w-3.5 text-slate-400 opacity-60" />
                                  )}
                                </div>
                              )}

                              <div className="flex items-center gap-1 mb-0.5">
                                {slot.status === 'free' || slot.status === 'past' ? (
                                  <Clock className="h-3.5 w-3.5 text-slate-400" />
                                ) : slot.status === 'soft_blocked' ? (
                                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500 animate-pulse" />
                                ) : slot.status === 'booked' ? (
                                  <StatusIcon className={`h-3.5 w-3.5 ${iconColor}`} />
                                ) : isLunch ? (
                                  <Coffee className="h-3.5 w-3.5 text-orange-600 animate-bounce" style={{ animationDuration: '3s' }} />
                                ) : (
                                  <Lock className="h-3.5 w-3.5 text-slate-400" />
                                )}
                                <span className={`font-bold text-xs ${slot.status === 'free' || slot.status === 'past' || slot.status === 'soft_blocked' ? 'text-slate-700' : isLunch ? 'text-orange-800' : 'text-slate-800'}`}>{slot.time}</span>
                              </div>
                              {(slot.status === 'free' || slot.status === 'past') && <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Livre</span>}
                              {slot.status === 'soft_blocked' && (
                                <span 
                                  className="text-[9px] text-amber-800 font-extrabold uppercase tracking-wide truncate max-w-full px-1"
                                  title={`Bloqueio Flexível: ${slot.block_reason || 'Horário reservado'}`}
                                >
                                  {slot.block_reason || 'Almoço'}
                                </span>
                              )}
                              {slot.status === 'booked' && (
                                <div className="flex flex-col w-full px-0.5 mt-0.5">
                                  <div className="flex items-center justify-center gap-1 w-full">
                                    {isDuplicateCpf || isConflictTime ? (
                                      <AlertTriangle className="h-3 w-3 shrink-0 text-rose-600" />
                                    ) : (
                                      <User className={`h-3 w-3 shrink-0 ${iconColor}`} />
                                    )}
                                    <span 
                                      className={`text-[10px] uppercase tracking-wide truncate font-bold ${isDuplicateCpf || isConflictTime ? 'text-rose-700 font-black' : iconColor}`} 
                                      title={
                                        isConflictTime 
                                          ? `ALERTA: CONFLITO DE HORÁRIO - DOIS PACIENTES AGENDADOS NO MESMO HORÁRIO\n\nPaciente: ${slot.appointment?.patient_name || ''}` 
                                          : isDuplicateCpf 
                                            ? `ALERTA: UM CPF NÃO PODE TER MAIS DE UMA CONSULTA NA MESMA ESPECIALIDADE\n\nPaciente: ${slot.appointment?.patient_name || ''}${duplicateInfo}` 
                                            : slot.appointment?.patient_name || ''
                                      }
                                    >
                                      {slot.appointment?.patient_name || 'Pac.'}
                                    </span>
                                  </div>
                                  
                                  {/* Badge de Análise Inteligente de Conflitos no Card */}
                                  {modoTransferencia && estaSelecionada && infoConflito && (
                                    <div className="w-full mt-0.5 flex justify-center">
                                      {infoConflito.temConflito ? (
                                        <span className="text-[7.5px] uppercase tracking-wider font-black bg-rose-600 text-white px-1 py-0.2 rounded-xs shadow-3xs truncate max-w-full">
                                          ❌ Conflito
                                        </span>
                                      ) : (
                                        <span className="text-[7.5px] uppercase tracking-wider font-black bg-emerald-600 text-white px-1 py-0.2 rounded-xs shadow-3xs truncate max-w-full">
                                          ✅ Disponível
                                        </span>
                                      )}
                                    </div>
                                  )}

                                  {(slot.appointment?.institution_name || slot.institution_name) && !modoTransferencia && (
                                    <div className="flex items-center justify-center gap-1 w-full mt-0.5">
                                      <span 
                                        className={cn(
                                          "text-[8px] uppercase tracking-tight truncate font-extrabold px-1 py-0.2 rounded flex items-center gap-0.5 max-w-full",
                                          isDifferentInstitution 
                                            ? "bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs font-black" 
                                            : `${iconColor} opacity-80`
                                        )}
                                        title={slot.appointment?.institution_name || slot.institution_name || ''}
                                      >
                                        {isDifferentInstitution ? <Building2 className="h-2.5 w-2.5 shrink-0 text-amber-700" /> : <Building2 className="h-2.5 w-2.5 shrink-0 opacity-75" />}
                                        <span className="truncate">{slot.appointment?.institution_name || slot.institution_name}</span>
                                      </span>
                                    </div>
                                  )}
                                  {slot.appointment?.status === 'nao_compareceu' && slot.appointment?.no_show_reason?.toLowerCase().includes('confirmou') && (
                                    <div className="flex items-center justify-center w-full mt-0.5">
                                      <span className="text-[7.5px] uppercase tracking-wider font-extrabold text-rose-700 bg-rose-50 px-1 py-0.2 rounded border border-rose-200 shadow-3xs truncate max-w-full">
                                        Confirmou e Faltou
                                      </span>
                                    </div>
                                  )}
                                </div>
                              )}
                              {slot.status === 'blocked' && (
                                <span className={cn(
                                  "text-[10px] font-extrabold text-center leading-tight uppercase tracking-wider truncate max-w-full px-1",
                                  isLunch ? "text-orange-700 font-black" : "text-slate-500 font-medium"
                                )}>
                                  {isLunch ? 'Almoço' : slot.block_reason || 'Bloqueado'}
                                </span>
                              )}
                            </button>

                          {/* Menu de 3 pontos para slots agendados (desabilitado durante modo de transferência para seleção com 1 clique) */}
                          {!modoTransferencia && slot.status === 'booked' && slot.appointment?.id && (canUpdateAppointments || canStartEncounter) && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  type="button"
                                  onClick={(e: { stopPropagation: () => void }) => e.stopPropagation()}
                                  className="absolute top-1.5 right-1.5 h-6 w-6 flex items-center justify-center rounded-md transition-all z-30 botao-tres-pontinhos text-slate-500 bg-transparent border border-transparent hover:bg-white hover:border-slate-200 hover:shadow-2xs active:bg-slate-100 cursor-pointer"
                                  title="Mais ações"
                                >
                                  <MoreVertical className="h-3.5 w-3.5 shrink-0 opacity-80" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" side="bottom" sideOffset={8} className="w-56 z-[99999] bg-white border border-slate-200 shadow-xl py-1 text-slate-700 animate-in fade-in-50 zoom-in-95 duration-100 flex flex-col items-stretch text-left rounded-xl">
                                <DropdownMenuArrow className="fill-white stroke-slate-200" />
                                <div className="px-3 py-1.5 border-b border-slate-100 text-[10px] font-extrabold uppercase tracking-widest text-[#00427A] bg-slate-50/50 flex items-center justify-between select-none rounded-t-xl">
                                  <span>Consulta às {slot.time}</span>
                                </div>
                                {slot.appointment.status === 'concluido' && (
                                  <div className="p-2 flex flex-col gap-1.5">
                                    <div className="px-2.5 py-2 text-xs font-bold text-slate-500 bg-slate-50 border border-slate-200/80 flex items-center gap-2 select-none rounded-lg">
                                      <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
                                      <span>Consulta já finalizada</span>
                                    </div>
                                    {userRole === 'superadmin' && (
                                      <DropdownMenuItem
                                        onClick={(e: { stopPropagation: () => void }) => {
                                          e.stopPropagation();
                                          void handleAgendaCancel(slot.appointment!.id);
                                        }}
                                        className="w-full text-left px-2.5 py-1.5 text-xs flex items-center gap-2 transition-colors cursor-pointer rounded-md text-rose-600 hover:bg-rose-50 hover:text-rose-700 font-bold"
                                      >
                                        <XCircle className="h-3.5 w-3.5 shrink-0 text-rose-500" />
                                        <span>Cancelar Consulta</span>
                                      </DropdownMenuItem>
                                    )}
                                  </div>
                                )}
                                {slot.appointment.status === 'em_atendimento' && (
                                  <div className="px-3 py-2 text-xs font-bold text-purple-700 bg-purple-50 flex items-center gap-2 select-none rounded-md">
                                    <Activity className="h-4 w-4 text-purple-600 shrink-0 animate-pulse" />
                                    <span>Em atendimento</span>
                                  </div>
                                )}
                                {slot.appointment.status === 'nao_compareceu' && (() => {
                                  const jaReagendado = !!slot.appointment.rescheduled_appointment_id;
                                  return (
                                  <div className="p-2 flex flex-col gap-1.5">

                                    <div className={`px-2.5 py-2.5 text-xs rounded-lg flex flex-col gap-2 select-none ${jaReagendado ? 'bg-amber-50/60 border border-amber-200/80' : 'bg-rose-50/50 border border-rose-100'}`}>
                                      <div className="flex flex-col gap-1.5">
                                        <div className={`flex items-center gap-1.5 font-extrabold text-[12px] ${jaReagendado ? 'text-amber-800' : 'text-rose-700'}`}>
                                          <UserX className={`h-4 w-4 shrink-0 ${jaReagendado ? 'text-amber-600' : 'text-rose-600'}`} />
                                          <span>Falta registrada</span>
                                        </div>
                                        {jaReagendado && (
                                          <div className="flex">
                                            <span className="inline-flex items-center gap-1 text-[9px] font-extrabold uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-200/85 text-amber-900 border border-amber-300/80 shadow-3xs select-none">
                                              <RefreshCcw className="h-2.5 w-2.5 shrink-0" />
                                              Reagendado
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                      <span className="text-[10px] text-slate-550 font-medium leading-relaxed">
                                        {jaReagendado
                                          ? 'O paciente faltou, mas já foi reagendado para outro horário.'
                                          : 'O paciente não compareceu a este horário.'}
                                      </span>
                                    </div>
                                    {canUpdateAppointments && !jaReagendado && (
                                      <DropdownMenuItem
                                        onClick={(e: { stopPropagation: () => void }) => {
                                          e.stopPropagation();
                                          handleAgendaReschedule(slot.appointment!.id);
                                        }}
                                        className="w-full text-left px-2.5 py-1.5 text-xs flex items-center gap-2 transition-colors cursor-pointer rounded-md text-amber-700 hover:bg-amber-50 hover:text-amber-800 font-bold"
                                      >
                                        <RefreshCcw className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                                        <span>Reagendar Paciente</span>
                                      </DropdownMenuItem>
                                    )}
                                    {(userRole === 'admin' || userRole === 'superadmin') && (
                                      <DropdownMenuItem
                                        onClick={(e: { stopPropagation: () => void }) => {
                                          e.stopPropagation();
                                          void handleAgendaCancel(slot.appointment!.id);
                                        }}
                                        className="w-full text-left px-2.5 py-1.5 text-xs flex items-center gap-2 transition-colors cursor-pointer rounded-md text-rose-600 hover:bg-rose-50 hover:text-rose-700 font-bold"
                                      >
                                        <XCircle className="h-3.5 w-3.5 shrink-0 text-rose-500" />
                                        <span>Cancelar Consulta</span>
                                      </DropdownMenuItem>
                                    )}
                                  </div>
                                  );
                                })()}
                                {slot.appointment.status === 'cancelado' && (
                                  <div className="p-2 flex flex-col gap-1.5">
                                    <div className="px-2.5 py-2 text-xs bg-slate-50 border border-slate-200/80 rounded-lg flex flex-col gap-1 select-none">
                                      <div className="flex items-center gap-1.5 font-bold text-slate-700">
                                        <XCircle className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                                        <span>Consulta cancelada</span>
                                      </div>
                                      <span className="text-[10px] text-slate-500 font-medium leading-tight">
                                        {slot.appointment.cancel_reason ? `Motivo: ${slot.appointment.cancel_reason}` : 'Horário cancelado no sistema.'}
                                      </span>
                                    </div>
                                    {canUpdateAppointments && (
                                      <DropdownMenuItem
                                        onClick={(e: { stopPropagation: () => void }) => {
                                          e.stopPropagation();
                                          handleAgendaReschedule(slot.appointment!.id);
                                        }}
                                        className="w-full text-left px-2.5 py-1.5 text-xs flex items-center gap-2 transition-colors cursor-pointer rounded-md text-blue-700 hover:bg-blue-50 hover:text-blue-800 font-bold"
                                      >
                                        <RefreshCcw className="h-3.5 w-3.5 shrink-0 text-blue-600" />
                                        <span>Novo Agendamento</span>
                                      </DropdownMenuItem>
                                    )}
                                  </div>
                                )}
                                {(slot.appointment.status === 'agendado' || slot.appointment.status === 'confirmado' || slot.appointment.status === 'reagendado') && canStartEncounter && (userRole !== 'medico' || selectedDoctorId === doctorId) && (
                                  <DropdownMenuItem
                                    onClick={(e: { stopPropagation: () => void }) => {
                                      e.stopPropagation();
                                      void handleAgendaStartEncounter(slot.appointment!.id, slot.appointment!.status, slot.appointment!.patient_name, slot.appointment!.appointment_date);
                                    }}
                                    className="w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 flex items-center gap-2 transition-colors cursor-pointer text-indigo-700 font-medium rounded-md"
                                  >
                                    <Activity className="h-4 w-4 text-indigo-600 shrink-0" />
                                    <span>Iniciar atendimento</span>
                                  </DropdownMenuItem>
                                )}
                                {(slot.appointment.status === 'agendado' || slot.appointment.status === 'reagendado' || slot.appointment.status === 'remarcado') && canUpdateAppointments && (
                                   <DropdownMenuItem
                                     onClick={(e: { stopPropagation: () => void }) => {
                                       e.stopPropagation();
                                       void handleAgendaConfirm(slot.appointment!.id);
                                     }}
                                     className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors cursor-pointer rounded-md text-emerald-600 focus:text-emerald-700 focus:bg-emerald-50 hover:bg-emerald-50 hover:text-emerald-700 font-medium"
                                   >
                                     <CheckCircle className="h-4 w-4 shrink-0" />
                                     <span>Confirmar</span>
                                   </DropdownMenuItem>
                                )}
                                {(slot.appointment.status === 'agendado' || slot.appointment.status === 'confirmado' || slot.appointment.status === 'reagendado') && canUpdateAppointments && (
                                  <>
                                    <DropdownMenuItem
                                      onClick={(e: { stopPropagation: () => void }) => {
                                        e.stopPropagation();
                                        handleAgendaReschedule(slot.appointment!.id);
                                      }}
                                      className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors cursor-pointer rounded-md text-amber-600 focus:text-amber-700 focus:bg-amber-50 hover:bg-amber-50 hover:text-amber-700 font-medium"
                                    >
                                      <RefreshCcw className="h-4 w-4 shrink-0" />
                                      <span>Reagendar</span>
                                    </DropdownMenuItem>

                                    {canUpdateAppointments && isSuperadmin && (
                                      <DropdownMenuItem
                                        onClick={(e: { stopPropagation: () => void }) => {
                                          e.stopPropagation();
                                          handleIniciarTransferenciaIndividual(slot.appointment!.id);
                                        }}
                                        className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors cursor-pointer rounded-md text-blue-600 focus:text-blue-700 focus:bg-blue-50 hover:bg-blue-50 hover:text-blue-700 font-medium"
                                      >
                                        <ArrowRightLeft className="h-4 w-4 shrink-0" />
                                        <span>Transferir Profissional</span>
                                      </DropdownMenuItem>
                                    )}
                                  </>
                                )}

                                {conflictingTimes.has(slot.starts_at) && (slot.appointment.status === 'agendado' || slot.appointment.status === 'confirmado' || slot.appointment.status === 'reagendado') && canUpdateAppointments && (
                                  <DropdownMenuItem
                                    onClick={(e: { stopPropagation: () => void }) => {
                                      e.stopPropagation();
                                      void handleOpenConflictReschedule(slot);
                                    }}
                                    className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 flex items-center gap-2 transition-colors cursor-pointer text-rose-700 font-bold rounded-md"
                                  >
                                    <AlertTriangle className="h-4 w-4 shrink-0" />
                                    <span>Corrigir conflito</span>
                                  </DropdownMenuItem>
                                )}
                                {(slot.appointment.status === 'agendado' || slot.appointment.status === 'confirmado' || slot.appointment.status === 'reagendado') && canUpdateAppointments && (
                                  <>
                                    <DropdownMenuItem
                                      onClick={(e: { stopPropagation: () => void }) => {
                                        e.stopPropagation();
                                        void handleAgendaNoShow(slot.appointment!.id, slot.appointment!.status);
                                      }}
                                      className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors cursor-pointer border-t border-slate-100 rounded-md text-slate-600 focus:text-slate-700 focus:bg-slate-100 hover:bg-slate-100 hover:text-slate-700 font-medium"
                                    >
                                      <UserX className="h-4 w-4 shrink-0" />
                                      <span>Registrar Falta</span>
                                    </DropdownMenuItem>
                                    
                                    <DropdownMenuItem
                                      onClick={(e: { stopPropagation: () => void }) => {
                                        e.stopPropagation();
                                        void handleAgendaCancel(slot.appointment!.id);
                                      }}
                                      className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors cursor-pointer rounded-md text-rose-600 focus:text-rose-700 focus:bg-rose-50 hover:bg-rose-50 hover:text-rose-700 font-medium"
                                    >
                                      <XCircle className="h-4 w-4 shrink-0" />
                                      <span>Cancelar / Desistiu</span>
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                        );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Legenda de cores/status em rodapé compacto do card */}
          {selectedDoctorId && filteredSlots.length > 0 && (
            <div className="shrink-0 border-t border-slate-200 bg-slate-50/90 backdrop-blur-xs px-4 py-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[11px] font-bold text-slate-600 shadow-2xs">
              <div className="flex items-center gap-1.5" title="Horário livre para agendamento">
                <span className="h-3 w-3 rounded bg-slate-50 border border-slate-300"></span>
                <span className="text-slate-600">Livre</span>
              </div>
              <div className="flex items-center gap-1.5" title="Consulta agendada">
                <span className="h-3 w-3 rounded bg-blue-50 border border-blue-200 border-l-4 border-l-blue-600"></span>
                <span className="text-blue-900">Agendado</span>
              </div>
              <div className="flex items-center gap-1.5" title="Consulta confirmada">
                <span className="h-3 w-3 rounded bg-emerald-50 border border-emerald-200 border-l-4 border-l-emerald-600"></span>
                <span className="text-emerald-900">Confirmado</span>
              </div>
              <div className="flex items-center gap-1.5" title="Consulta iniciada e em atendimento">
                <span className="h-3 w-3 rounded bg-indigo-50 border border-indigo-200 border-l-4 border-l-indigo-600"></span>
                <span className="text-indigo-900">Em Atendimento</span>
              </div>
              <div className="flex items-center gap-1.5" title="Consulta concluída">
                <span className="h-3 w-3 rounded bg-teal-50 border border-teal-200 border-l-4 border-l-teal-600"></span>
                <span className="text-teal-900">Concluído</span>
              </div>
              <div className="flex items-center gap-1.5" title="Consulta reagendada">
                <span className="h-3 w-3 rounded bg-amber-50 border border-amber-200 border-l-4 border-l-amber-600"></span>
                <span className="text-amber-900">Reagendado</span>
              </div>

              <div className="flex items-center gap-1.5" title="Conflito de horários ou CPF duplicado">
                <span className="h-3 w-3 rounded bg-rose-100 border border-rose-300 border-l-4 border-l-rose-600 animate-pulse"></span>
                <span className="text-rose-900 font-black">Conflito / Duplicado</span>
              </div>
              <div className="flex items-center gap-1.5" title="Consulta agendada em outra unidade hospitalar (borda pontilhada)">
                <span className="h-3.5 w-4 rounded bg-amber-50 border-2 border-dashed border-amber-500 text-amber-900 font-extrabold flex items-center justify-center text-[7px] shrink-0">📍</span>
                <span className="text-amber-900 font-bold">Outra Unidade (Pontilhada)</span>
              </div>
              <div className="flex items-center gap-1.5" title="Horário extra fora do expediente padrão (borda pontilhada)">
                <span className="h-3.5 w-4 rounded bg-purple-50 border-2 border-dashed border-purple-400 shrink-0"></span>
                <span className="text-purple-900 font-bold">Fora do Horário</span>
              </div>
            </div>
          )}
        </section>
        </div>
      </div>

      <Dialog open={isAppointmentPreviewOpen} onOpenChange={setIsAppointmentPreviewOpen}>
        <DialogContent className="max-w-lg bg-slate-50 p-0 border-slate-300" aria-describedby={undefined}>
          <div className="delphi-panel">
            <div className="delphi-panel-header bg-slate-100 border-b-2 border-slate-200">
              <DialogTitle className="delphi-panel-title text-blue-900">Detalhes do agendamento</DialogTitle>
            </div>
            <div className="delphi-panel-body bg-slate-50 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div className="space-y-1"><p className="text-xs font-bold text-slate-600 uppercase">Paciente</p><p className="text-slate-900">{appointmentPreview?.patient_name || 'Não informado'}</p></div>
                <div className="space-y-1"><p className="text-xs font-bold text-slate-600 uppercase">CPF</p><p className="text-slate-900">{appointmentPreview?.patient_cpf ? censorCPF(appointmentPreview.patient_cpf) : 'Não informado'}</p></div>
                <div className="space-y-1"><p className="text-xs font-bold text-slate-600 uppercase">Profissional</p><p className="text-slate-900">{appointmentPreview?.doctor_name || 'Não informado'}</p></div>
                <div className="space-y-1"><p className="text-xs font-bold text-slate-600 uppercase">Registro</p><p className="text-slate-900">{getAgendaProfessionalRegistration(appointmentPreview)}</p></div>
                <div className="space-y-1"><p className="text-xs font-bold text-slate-600 uppercase">Status</p><p className="text-slate-900">{appointmentPreview?.status || 'Não informado'}</p></div>
                <div className="space-y-1"><p className="text-xs font-bold text-slate-600 uppercase">Horário</p><p className="text-slate-900">{appointmentPreview?.appointment_date ? formatOperationalDateTime(appointmentPreview.appointment_date) : 'Não informado'}</p></div>
              </div>
              <div className="space-y-1"><p className="text-xs font-bold text-slate-600 uppercase">Motivo</p><p className="text-slate-900 whitespace-pre-wrap">{appointmentPreview?.reason || 'Nao informado'}</p></div>
              <div className="flex justify-end gap-2 pt-4 border-t border-slate-300">
                <Button variant="outline" onClick={() => { setIsAppointmentPreviewOpen(false); setAppointmentPreview(null); }} >Fechar</Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {medicalRecordAppointment && (
        <MedicalRecordDialog
          open={isMedicalRecordOpen}
          onClose={() => { setIsMedicalRecordOpen(false); setMedicalRecordAppointment(null); }}
          appointmentId={medicalRecordAppointment.id}
          onSuccess={() => { void refetchSlots(); }}
          mode={medicalRecordAppointment.status === 'concluido' ? (isSuperadmin || (userRole === 'medico' && doctorId && selectedDoctorId === doctorId) ? 'edit' : 'view') : 'create'}
          allowClinicalActions={canInspectClinicalFlow}
          initialData={{
            appointment_date: medicalRecordAppointment.appointment_date,
            patient_name: medicalRecordAppointment.patient_name,
            patient_cpf: medicalRecordAppointment.patient_cpf,
            doctor_name: medicalRecordAppointment.doctor_name,
            doctor_crm: medicalRecordAppointment.doctor_crm,
            doctor_council: medicalRecordAppointment.doctor_council,
            doctor_registration_label: medicalRecordAppointment.doctor_registration_label,
          }}
        />
      )}

      <ConfirmationDialog />

      <BloqueiosAgendaDialog
        open={isBloqueiosOpen}
        onClose={() => setIsBloqueiosOpen(false)}
        onSuccess={() => { void refetchSlots(); }}
      />

      <ModalTransferirConsultas
        aberto={isTransferirConsultasOpen}
        aoFechar={() => {
          setIsTransferirConsultasOpen(false);
          setTransferirConsultaIdPadrao(undefined);
        }}
        aoSucesso={() => {
          void refetchSlots();
        }}
        profissionalOrigemIdPadrao={selectedDoctorId || undefined}
        consultaIdPadrao={transferirConsultaIdPadrao}
        dataPadrao={bookingDate}
      />




      {/* Modal de Correção Rápida de Conflito de Horário */}
      <Dialog open={!!conflictRescheduleModal} onOpenChange={(open) => { 
        if (!open) {
          setConflictRescheduleModal(null);
          setConflictRescheduleSelectedSlot(null);
          setConflictRescheduleReason('');
        }
      }}>
        <DialogContent className="max-w-md" aria-describedby={undefined}>
          <div className="flex flex-col gap-4">
            <div className={`flex items-start gap-3 p-4 rounded-lg border ${conflictRescheduleModal?.isConflict ? 'bg-red-50 border-red-200' : 'bg-blue-50 border-blue-200'}`}>
              {conflictRescheduleModal?.isConflict ? (
                <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
              ) : (
                <RefreshCcw className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
              )}
              <div>
                <DialogTitle className={`text-base font-bold ${conflictRescheduleModal?.isConflict ? 'text-red-800' : 'text-blue-800'}`}>
                  {conflictRescheduleModal?.isConflict ? 'Conflito de Horário Detectado' : 'Reagendar Consulta'}
                </DialogTitle>
                <p className={`text-sm mt-1 ${conflictRescheduleModal?.isConflict ? 'text-red-700' : 'text-blue-700'}`}>
                  <strong>{conflictRescheduleModal?.patientName}</strong> está na grade às{' '}
                  <strong>{conflictRescheduleModal?.currentTime}</strong>. Selecione um novo horário para realocação:
                </p>
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold text-slate-700 mb-2">Selecione um novo horário disponível:</p>
              {conflictRescheduleModal?.freeSlots.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 text-center text-slate-500">
                  <Clock className="h-8 w-8 text-slate-400 mb-2" />
                  <p className="text-sm">Não há horários disponíveis nesta data.</p>
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-1.5 max-h-64 overflow-y-auto pr-1">
                  {conflictRescheduleModal?.freeSlots.map((slot) => {
                    let hasOther = false;
                    let isCurrent = false;

                    if (slot.appointment) {
                      if (slot.appointment.id === conflictRescheduleModal.appointmentId) isCurrent = true;
                      else hasOther = true;
                    }

                    if (slot.status === 'booked' && !isCurrent) hasOther = true;

                    const isBooked = hasOther;
                    const isPast = slot.status === 'past' && !isBooked && !isCurrent;

                    return (
                      <button
                        key={slot.time}
                        type="button"
                        disabled={conflictRescheduleModal.loading || isBooked || isCurrent}
                        onClick={() => { setConflictRescheduleSelectedSlot(slot); }}
                        className={`flex flex-col items-center justify-center rounded-lg border-2 px-2 py-2 text-center transition-all duration-150 disabled:cursor-not-allowed group ${
                          conflictRescheduleSelectedSlot?.starts_at === slot.starts_at
                            ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-500'
                            : isCurrent
                            ? 'border-blue-200 bg-blue-50 opacity-90'
                            : isBooked
                            ? 'border-red-200 bg-red-50 opacity-80'
                            : isPast
                            ? 'border-slate-200 bg-slate-50 hover:bg-slate-100 hover:border-slate-400 hover:shadow-md disabled:opacity-50 grayscale'
                            : 'border-green-200 bg-green-50 hover:bg-green-100 hover:border-green-400 hover:shadow-md disabled:opacity-50'
                        }`}
                        title={isCurrent ? 'Horário atual da consulta' : isBooked ? 'Horário ocupado por outro paciente' : isPast ? 'Horário passado' : 'Horário disponível'}
                      >
                        <Clock className={`h-3.5 w-3.5 mb-0.5 transition-transform ${isCurrent ? 'text-blue-500' : isBooked ? 'text-red-400' : isPast ? 'text-slate-400' : 'text-green-600 group-hover:scale-110'}`} />
                        <span className={`text-sm font-bold ${isCurrent ? 'text-blue-800' : isBooked ? 'text-red-800' : isPast ? 'text-slate-500' : 'text-green-800'}`}>{slot.time}</span>
                        {isCurrent && <span className="text-[9px] text-blue-600 font-bold uppercase mt-0.5 tracking-wider">Atual</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {conflictRescheduleSelectedSlot && (
              <div className="space-y-1.5 bg-slate-50 p-3 rounded-lg border border-slate-200 animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wide flex justify-between">
                  <span>Horário Selecionado:</span>
                  <span className="font-extrabold text-blue-700">{conflictRescheduleSelectedSlot.time}</span>
                </div>
                <div className="space-y-1 mt-1">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Motivo do Reagendamento *</label>
                  <Input
                    placeholder="Digite o motivo real do reagendamento..."
                    value={conflictRescheduleReason}
                    onChange={(e) => setConflictRescheduleReason(e.target.value)}
                    className="h-9 text-xs bg-white border-slate-200"
                    required
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <Button
                variant="outline"
                onClick={() => {
                  setConflictRescheduleModal(null);
                  setConflictRescheduleSelectedSlot(null);
                  setConflictRescheduleReason('');
                }}
                disabled={conflictRescheduleModal?.loading}
              >
                Fechar
              </Button>
              {conflictRescheduleSelectedSlot ? (
                <Button
                  onClick={() => { void handleConflictRescheduleConfirm(conflictRescheduleSelectedSlot); }}
                  disabled={conflictRescheduleModal?.loading || !conflictRescheduleReason.trim()}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold h-9 text-xs"
                >
                  Confirmar Reagendamento
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => { if (conflictRescheduleModal) { handleAgendaReschedule(conflictRescheduleModal.appointmentId); setConflictRescheduleModal(null); } }}
                  disabled={conflictRescheduleModal?.loading}
                  className="border-amber-300 text-amber-700 hover:bg-amber-50 h-9 text-xs"
                >
                  <RefreshCcw className="h-4 w-4 mr-1.5" />
                  Reagendamento completo
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog de Proposta de Reorganização de Conflitos em Lote */}
      <Dialog open={!!propostaReorganizacaoModal} onOpenChange={(open) => { 
        if (!open) {
          setPropostaReorganizacaoModal(null);
          setPropostaReorganizacaoReason('');
        }
      }}>
        <DialogContent className="max-w-lg bg-white p-0 border-slate-200" aria-describedby={undefined}>
          <div className="flex flex-col">
            <div className="flex items-start gap-3 p-4 bg-[#003B71]/5 border-b border-slate-200">
              <RefreshCcw className="h-5 w-5 text-[#003B71] shrink-0 mt-0.5 animate-spin-once" />
              <div>
                <DialogTitle className="text-base font-bold text-[#003B71]">Proposta de Reorganização Automática</DialogTitle>
                <p className="text-xs text-slate-500 mt-1">
                  Identificamos consultas em conflito no mesmo horário. Abaixo está a proposta automática de realocação para os horários vagos mais próximos.
                </p>
              </div>
            </div>

            <div className="p-4 space-y-4 max-h-96 overflow-y-auto">
              <div className="space-y-2">
                {propostaReorganizacaoModal?.propostas.map((proposta, idx) => (
                  <div key={proposta.idAgendamento || idx} className="flex items-center justify-between p-3 rounded-lg border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition-colors">
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="text-xs font-bold text-slate-800 truncate uppercase">{proposta.nomePaciente}</span>
                      <span className="text-[10px] text-slate-500 font-medium">Horário Conflitante: <strong className="text-red-600">{proposta.horarioOriginal}</strong></span>
                    </div>
                    
                    <div className="flex items-center gap-2 shrink-0 ml-4">
                      {proposta.novoHorario ? (
                        <>
                          <span className="text-xs text-slate-400 font-medium">→</span>
                          <span className="inline-flex items-center gap-1 bg-green-50 border border-green-200 text-green-700 text-xs font-extrabold px-2.5 py-1 rounded-full shadow-2xs">
                            <Clock className="h-3.5 w-3.5 shrink-0" />
                            {proposta.novoHorario}
                          </span>
                        </>
                      ) : (
                        <span className="inline-flex items-center gap-1 bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-extrabold px-2.5 py-1 rounded-full shadow-2xs">
                          ⚠️ Sem vaga disponível
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {propostaReorganizacaoModal?.propostas.some(p => !p.novoHorario) && (
                <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-[11px] text-amber-800 leading-normal flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                  <span>
                    <strong>Atenção:</strong> Uma ou mais consultas não possuem vagas livres disponíveis neste dia e não serão alteradas automaticamente.
                  </span>
                </div>
              )}

              <div className="p-3 bg-blue-50 rounded-lg border border-blue-200 text-[11px] text-blue-800 leading-normal flex items-start gap-2">
                <Info className="h-4 w-4 shrink-0 text-blue-600 mt-0.5" />
                <span>
                  <strong>Nota de Integridade Clínica:</strong> Consultas com atendimento concluído, em andamento ou finalizadas mantêm seu horário original por regra de auditoria do prontuário e não são alteradas.
                </span>
              </div>
              
              <div className="space-y-1 mt-1 bg-slate-50/70 p-3 rounded-lg border border-slate-200">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Motivo da Reorganização *</label>
                <Input
                  placeholder="Digite o motivo real do reagendamento em lote..."
                  value={propostaReorganizacaoReason}
                  onChange={(e) => setPropostaReorganizacaoReason(e.target.value)}
                  className="h-9 text-xs bg-white border-slate-200"
                  required
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 p-4 border-t border-slate-200 bg-slate-50 rounded-b-lg">
              <Button
                variant="outline"
                disabled={propostaReorganizacaoModal?.loading}
                onClick={() => {
                  setPropostaReorganizacaoModal(null);
                  setPropostaReorganizacaoReason('');
                }}
                className="h-9 font-semibold text-xs"
              >
                Cancelar
              </Button>
              <Button
                disabled={propostaReorganizacaoModal?.loading || !propostaReorganizacaoModal?.propostas.some(p => p.novoHorario) || !propostaReorganizacaoReason.trim()}
                onClick={() => { void handleConfirmReorganizacao(); }}
                className="h-9 font-bold bg-[#003B71] hover:bg-[#002850] text-white text-xs shadow-md transition-all flex items-center gap-1"
              >
                {propostaReorganizacaoModal?.loading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    Confirmar Reorganização
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>



      {agendaModalIntent && (
        <Appointments 
          isModalOnly={true}
          modalIntent={agendaModalIntent}
          onModalClose={() => {
            setAgendaModalIntent(null);
            void refetchSlots();
          }}
          onAppointmentSaved={(info) => {
            setAgendaModalIntent(null);
            if (info?.isReschedule) {
              if (info.doctorId && info.doctorId !== info.originalDoctorId) {
                setSelectedDoctorId(info.doctorId);
              }
              if (info.appointmentDate) {
                setCurrentDate(info.appointmentDate);
              }
            }
            void refetchSlots();
          }}
        />
      )}

      {/* Barra Flutuante de Transferência Inteligente e Autônoma Inline */}
      <BarraTransferenciaAgenda
        visivel={modoTransferencia}
        totalSelecionadas={consultasSelecionadasIds.size}
        consultasSelecionadas={consultasSelecionadasLista}
        medicoOrigemNome={selectedDoctor?.full_name}
        medicoOrigemEspecialidade={selectedDoctor?.specialty_name}
        medicoOrigemEspecialidadeIcone={selectedDoctor?.specialty_icon}
        medicoOrigemEspecialidadeCor={selectedDoctor?.specialty_color}
        medicosDisponiveis={medicosDestinoDisponiveis}
        medicoDestinoId={medicoDestinoId}
        onSelecionarMedicoDestino={setMedicoDestinoId}
        analiseConflitos={analiseConflitos}
        carregandoAnalise={carregandoAnalise}
        sugestoesCompativeis={sugestoesCompativeis}
        carregandoSugestoes={carregandoSugestoes}
        onTransferir={handleExecutarTransferenciaInline}
        onTransferirComAutoAjuste={handleExecutarTransferenciaComAutoAjuste}
        transferindo={transferindoConsultas}
        onDesmarcarConsulta={handleDesmarcarConsulta}
        onSelecionarTodas={handleSelecionarTodasConsultasDoDia}
        onLimparSelecao={handleLimparSelecaoConsultas}
        onCancelarModo={() => {
          setModoTransferencia(false);
          setConsultasSelecionadasIds(new Set());
          setMedicoDestinoId('');
          setAnaliseConflitos(null);
          setSugestoesCompativeis([]);
        }}
        totalConsultasElegiveisNoDia={totalConsultasElegiveisNoDia}
      />

      <ConfirmationDialog />
    </div>
  );
};

export default Agenda;
