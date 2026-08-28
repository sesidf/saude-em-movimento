"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlarmClock,
  Building2,
  Calendar,
  Clock,
  Loader2,
  Lock,
  Plus,
  RefreshCcw,
  ShieldCheck,
  Unlock,
  Users,
  ChevronLeft,
  ChevronRight,
  Stethoscope,
  Save,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { getErrorMessage } from '@/lib/errors';
import { CompactDataGrid, type CompactDataGridColumn } from '@/components/CompactDataGrid';
import { MiniAvailabilityEditor } from '@/components/MiniAvailabilityEditor';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

import { useAuth } from '@/contexts/AuthContext';
import { chamarApiPost, chamarApiGet } from '@/lib/workerApi';
import { buildIdempotencyKey } from '@/lib/idempotency';
import { formatarRegistroProfissional } from '@/utils/formatar-registro';
import { getAvatarColor, getInitials } from '@/utils/formatters';
import { FormGrid, FormField } from '@/components/ui/standard-form';
import { useConfirm } from '@/hooks/useConfirm';
import { SPECIALTY_ICONS } from '@/pages/Specialties';
import BloqueiosAgendaDialog from '@/components/BloqueiosAgendaDialog';

type InstitutionOption = {
  id: string;
  name: string;
  is_active?: boolean;
};

type DoctorOption = {
  id: string;
  crm?: string;
  professional_council?: string | null;
  professional_registration?: string | null;
  registration_label?: string | null;
  full_name?: string;
  is_active?: boolean;
  specialty_name?: string;
  specialty_color?: string | null;
  specialty_icon?: string | null;

};

type AvailabilityRow = {
  availability_id: string;
  institution_id: string;
  institution_name: string;
  doctor_id: string;
  doctor_name: string;
  doctor_crm?: string;
  doctor_council?: string | null;
  doctor_registration_label?: string | null;
  weekday: number;
  starts_at: string;
  ends_at: string;
  slot_minutes: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type BlockRow = {
  block_id: string;
  institution_id: string;
  institution_name: string;
  doctor_id: string | null;
  doctor_name: string;
  starts_at: string;
  ends_at: string;
  reason: string;
  scope_type: 'institution' | 'doctor';
  created_at: string;
};

type ScheduleAdminSnapshot = {
  generated_at?: string;
  availabilities?: AvailabilityRow[];
  blocks?: BlockRow[];
  summary?: {
    availability_count?: number;
    active_availability_count?: number;
    block_count?: number;
  };
};

const weekdayOptions = [
  { value: 1, label: 'Segunda-feira', short: 'Seg' },
  { value: 2, label: 'Terça-feira', short: 'Ter' },
  { value: 3, label: 'Quarta-feira', short: 'Qua' },
  { value: 4, label: 'Quinta-feira', short: 'Qui' },
  { value: 5, label: 'Sexta-feira', short: 'Sex' },
  { value: 6, label: 'Sábado', short: 'Sáb' },
  { value: 0, label: 'Domingo', short: 'Dom' },
];



const formatDateTime = (value: string) => format(new Date(value), 'dd/MM/yyyy HH:mm');


/**
 * Calcula a duração formatada entre o horário de início e o de término.
 * @param inicio - Horário de início no formato "HH:MM"
 * @param fim - Horário de término no formato "HH:MM"
 * @returns Objeto com a string formatada e indicador de erro
 */
const calcularDuracaoAtendimento = (inicio: string, fim: string): { texto: string; erro: boolean } => {
  if (!inicio || !fim) return { texto: '', erro: false };
  const [hIni, mIni] = inicio.split(':').map(Number);
  const [hFim, mFim] = fim.split(':').map(Number);
  
  if (isNaN(hIni) || isNaN(mIni) || isNaN(hFim) || isNaN(mFim)) {
    return { texto: '', erro: false };
  }

  const totalMinutos = (hFim * 60 + mFim) - (hIni * 60 + mIni);
  if (totalMinutos <= 0) {
    return { texto: 'Horário de término deve ser após o início', erro: true };
  }

  const horas = Math.floor(totalMinutos / 60);
  const minutos = totalMinutos % 60;

  let textoDuracao = 'Duração total: ';
  if (horas > 0) {
    textoDuracao += `${horas} ${horas === 1 ? 'hora' : 'horas'}`;
  }
  if (minutos > 0) {
    if (horas > 0) textoDuracao += ' e ';
    textoDuracao += `${minutos} ${minutos === 1 ? 'minuto' : 'minutos'}`;
  }

  return { texto: textoDuracao, erro: false };
};

const ScheduleManagement = () => {
  const { hasPermission, institutionId, profileLoaded } = useAuth();
  const { confirm, ConfirmationDialog } = useConfirm();
  const [loading, setLoading] = useState(true);
  const [savingAvailability, setSavingAvailability] = useState(false);
  const [editingAvailabilityId, setEditingAvailabilityId] = useState<string | null>(null);

  // Modal Control States
  const [isAvailabilityDialogOpen, setIsAvailabilityDialogOpen] = useState(false);
  /** Controla o dialog unificado de bloqueios */
  const [isBlocksDialogOpen, setIsBlocksDialogOpen] = useState(false);
  /** ID do médico a pré-selecionar quando abrindo para registrar bloqueio específico */
  const [preSelectedDoctorIdForBlock, setPreSelectedDoctorIdForBlock] = useState<string | undefined>(undefined);
  /** View padrão do dialog de bloqueios */
  const [blocksDialogDefaultView, setBlocksDialogDefaultView] = useState<'list' | 'create'>('list');

  // View Switcher Tab ('doctors' | 'blocks')
  const [activeViewTab, setActiveViewTab] = useState<'doctors' | 'blocks'>('doctors');

  // Batch Replication State
  const [selectedBatchWeekdays, setSelectedBatchWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);


  const [institutions, setInstitutions] = useState<InstitutionOption[]>([]);
  const [doctors, setDoctors] = useState<DoctorOption[]>([]);
  const [snapshot, setSnapshot] = useState<ScheduleAdminSnapshot>({});

  const [selectedInstitutionFilter, setSelectedInstitutionFilter] = useState<string>('all');

  const [availabilityForm, setAvailabilityForm] = useState({
    institution_id: '',
    institution_name: '',
    doctor_id: '',
    doctor_name: '',
    weekday: '1',
    starts_at: '08:00',
    ends_at: '17:00',
    slot_minutes: '5',
    is_active: 'true',
  });


  const canManageAvailability =
    hasPermission('doctor_availability', 'create')
    || hasPermission('doctor_availability', 'update')
    || hasPermission('doctor_availability', 'delete');
  const canManageBlocks =
    hasPermission('schedule_blocks', 'create')
    || hasPermission('schedule_blocks', 'update')
    || hasPermission('schedule_blocks', 'delete');
  const canManageSchedule = canManageAvailability || canManageBlocks;


  /** Todos os médicos ativos — sem filtro por instituição (profissionais não têm vínculo institucional) */
  const formDoctors = useMemo(() => doctors, [doctors]);


  /**
   * Mapa de disponibilidades do médico selecionado no formulário, indexado por dia da semana.
   * Permite saber o estado real de cada dia (ativo, inativo, sem escala).
   */
  const scheduleByWeekdayForSelectedDoctor = useMemo(() => {
    if (!availabilityForm.doctor_id) return new Map<number, AvailabilityRow>();
    const existing = snapshot.availabilities || [];
    const map = new Map<number, AvailabilityRow>();
    existing
      .filter((item) => item.doctor_id === availabilityForm.doctor_id)
      .forEach((item) => {
        // Mantém o mais recente se houver duplicatas por dia
        if (!map.has(item.weekday)) map.set(item.weekday, item);
      });
    return map;
  }, [availabilityForm.doctor_id, snapshot.availabilities]);

  /** Lista dos dias ativos (para o seletor de batch no modo cadastro) */
  const activeWeekdaysForSelectedDoctor = useMemo(() => {
    return Array.from(scheduleByWeekdayForSelectedDoctor.entries())
      .filter(([_, item]) => item.is_active)
      .map(([day]) => day);
  }, [scheduleByWeekdayForSelectedDoctor]);

  /**
   * Ao trocar de dia no modo edição, carrega automaticamente os dados desse dia
   * (horário, status, availability_id) para manter consistência.
   */
  const handleEditWeekdayChange = (newWeekday: number) => {
    const existing = scheduleByWeekdayForSelectedDoctor.get(newWeekday);
    if (existing) {
      // Dia tem escala: carrega os dados dele
      setEditingAvailabilityId(existing.availability_id);
      const docReg = existing.doctor_crm
        ? formatarRegistroProfissional(existing.doctor_council || 'CRM', existing.doctor_crm)
        : '';
      setAvailabilityForm((current) => ({
        ...current,
        weekday: String(newWeekday),
        starts_at: existing.starts_at.slice(0, 5),
        ends_at: existing.ends_at.slice(0, 5),
        slot_minutes: String(existing.slot_minutes),
        is_active: existing.is_active ? 'true' : 'false',
        doctor_name: docReg ? `${existing.doctor_name} - ${docReg}` : existing.doctor_name,
      }));
    } else {
      // Dia sem escala: limpa os dados e passa para modo criação desse dia
      setEditingAvailabilityId(null);
      setAvailabilityForm((current) => ({
        ...current,
        weekday: String(newWeekday),
        starts_at: '08:00',
        ends_at: '17:00',
        slot_minutes: '5',
        is_active: 'true',
      }));
    }
  };



  const loadCatalogs = useCallback(async () => {
    const [institutionsResult, doctorsResult] = await Promise.all([
      chamarApiPost('/api/rpc/list_institutions_catalog', { p_search: null, p_include_inactive: false }),
      chamarApiPost('/api/rpc/list_doctors_catalog', { p_search: null, p_include_inactive: false }),
    ]);

    if (institutionsResult.error) throw institutionsResult.error;
    if (doctorsResult.error) throw doctorsResult.error;

    const nextInstitutions = ((institutionsResult.data as unknown as InstitutionOption[] | null) || []);
    const nextDoctors = ((doctorsResult.data as unknown as DoctorOption[] | null) || []);
    setInstitutions(nextInstitutions);
    setDoctors(nextDoctors);

    const defaultInstitution = institutionId || nextInstitutions[0]?.id || '';
    if (institutionId) {
      setSelectedInstitutionFilter((current) => (current === 'all' ? institutionId : current));
    }
    setAvailabilityForm((current) => ({
      ...current,
      institution_id: current.institution_id || defaultInstitution,
      // Sem pré-seleção por institution — médicos não têm vínculo institucional
      doctor_id: current.doctor_id || nextDoctors[0]?.id || '',
    }));
  }, [institutionId]);

  const loadSnapshot = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await chamarApiPost('/api/rpc/get_schedule_admin_snapshot', {
        p_doctor_id: null,
        p_start_at: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
        p_end_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      });

      if (error) throw error;
      setSnapshot((data || {}) as ScheduleAdminSnapshot);
    } catch (error) {
      console.error('Erro ao carregar gestão administrativa da agenda:', error);
      toast.error(getErrorMessage(error, 'Erro ao carregar governança da agenda'));
      setSnapshot({});
    } finally {
      setLoading(false);
    }
  }, [selectedInstitutionFilter]);

  useEffect(() => {
    if (!profileLoaded || !canManageSchedule) return;
    void loadCatalogs().catch((error) => {
      console.error('Erro ao carregar catálogos da agenda:', error);
      toast.error(getErrorMessage(error, 'Erro ao carregar dados da agenda'));
      setLoading(false);
    });
  }, [canManageSchedule, loadCatalogs, profileLoaded]);

  useEffect(() => {
    if (!profileLoaded || !canManageSchedule) return;
    void loadSnapshot();
  }, [canManageSchedule, loadSnapshot, profileLoaded]);

  const resetAvailabilityEditor = useCallback(() => {
    const defaultInstitution = (selectedInstitutionFilter !== 'all' ? selectedInstitutionFilter : institutionId) || institutions[0]?.id || '';
    const defaultDoctor = doctors[0]?.id || '';

    setEditingAvailabilityId(null);
    setSelectedBatchWeekdays([1, 2, 3, 4, 5]);
    setAvailabilityForm({
      institution_id: defaultInstitution,
      institution_name: '',
      doctor_id: defaultDoctor,
      doctor_name: '',
      weekday: '1',
      starts_at: '08:00',
      ends_at: '17:00',
      slot_minutes: '5',
      is_active: 'true',
    });
  }, [institutionId, institutions]);

  const openNewAvailabilityModal = () => {
    resetAvailabilityEditor();
    setIsAvailabilityDialogOpen(true);
  };

  const toggleBatchWeekday = (dayValue: number) => {
    setSelectedBatchWeekdays((prev) =>
      prev.includes(dayValue) ? prev.filter((d) => d !== dayValue) : [...prev, dayValue]
    );
  };

  const handleAvailabilitySubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!availabilityForm.doctor_id) {
      toast.error('Selecione o profissional para configurar a agenda.');
      return;
    }

    setSavingAvailability(true);
    try {
      const toMinutes = (timeStr: string) => {
        const [h, m] = timeStr.split(':').map(Number);
        return h * 60 + m;
      };
      const newStart = toMinutes(availabilityForm.starts_at);
      const newEnd = toMinutes(availabilityForm.ends_at);

      if (newStart >= newEnd) {
        toast.error('O horário de início deve ser anterior ao horário de término.');
        setSavingAvailability(false);
        return;
      }

      if (!editingAvailabilityId && selectedBatchWeekdays.length > 0) {

        // Multi-day Batch Mode (Cadastro sempre faz replicação para múltiplos dias selecionados)
        for (const dayVal of selectedBatchWeekdays) {
          const idempotencyKey = await buildIdempotencyKey('schedule_admin_availability_batch', {
            institution_id: null,
            doctor_id: availabilityForm.doctor_id,
            weekday: dayVal,
            starts_at: availabilityForm.starts_at,
            ends_at: availabilityForm.ends_at,
            slot_minutes: availabilityForm.slot_minutes,
            is_active: availabilityForm.is_active,
          });

          await chamarApiPost('/api/rpc/api_set_doctor_availability', {
            p_doctor_id: availabilityForm.doctor_id,
            p_weekday: dayVal,
            p_starts_at: availabilityForm.starts_at,
            p_ends_at: availabilityForm.ends_at,
            p_slot_minutes: Number(availabilityForm.slot_minutes),
            p_is_active: availabilityForm.is_active === 'true',
            p_idempotency_key: idempotencyKey,
            p_availability_id: null,
          });
        }
        toast.success(`Disponibilidade cadastrada para ${selectedBatchWeekdays.length} dia(s)!`);
      } else {

        // Single Day Mode (Edição)
        const idempotencyKey = await buildIdempotencyKey('schedule_admin_availability', {
          availability_id: editingAvailabilityId,
          doctor_id: availabilityForm.doctor_id,
          weekday: availabilityForm.weekday,
          starts_at: availabilityForm.starts_at,
          ends_at: availabilityForm.ends_at,
          slot_minutes: availabilityForm.slot_minutes,
          is_active: availabilityForm.is_active,
        });

        const { error } = await chamarApiPost('/api/rpc/api_set_doctor_availability', {
          p_doctor_id: availabilityForm.doctor_id,
          p_weekday: Number(availabilityForm.weekday),
          p_starts_at: availabilityForm.starts_at,
          p_ends_at: availabilityForm.ends_at,
          p_slot_minutes: Number(availabilityForm.slot_minutes),
          p_is_active: availabilityForm.is_active === 'true',
          p_idempotency_key: idempotencyKey,
          p_availability_id: editingAvailabilityId,
        });

        if (error) throw error;
        toast.success('Disponibilidade atualizada com sucesso.');
      }

      setIsAvailabilityDialogOpen(false);
      resetAvailabilityEditor();
      await loadSnapshot();
    } catch (error: any) {
      console.error('Erro ao salvar disponibilidade:', error);
      toast.error(getErrorMessage(error, 'Erro ao salvar disponibilidade'));
    } finally {
      setSavingAvailability(false);
    }
  };



  const [desbloqueandoId, setDesbloqueandoId] = useState<string | null>(null);

  /**
   * Abre o dialog unificado de bloqueios para registrar um bloqueio para um médico específico.
   * @param doctorId - ID do médico a pré-selecionar
   */
  const openBlocksDialogForDoctor = (doctorId: string) => {
    setPreSelectedDoctorIdForBlock(doctorId);
    setBlocksDialogDefaultView('create');
    setIsBlocksDialogOpen(true);
  };

  const handleDesbloquear = async (bloqueioId: string) => {
    const ok = await confirm('Deseja realmente remover este bloqueio de agenda?');
    if (!ok) return;

    setDesbloqueandoId(bloqueioId);
    try {
      const idempotencyKey = await buildIdempotencyKey('agenda_archive_block', { block_id: bloqueioId });
      const { error } = await chamarApiPost('/api/rpc/api_archive_schedule_block', {
        p_block_id: bloqueioId,
        p_idempotency_key: idempotencyKey,
      });

      if (error) throw error;

      toast.success('Bloqueio de agenda removido com sucesso!');
      await loadSnapshot();
    } catch (err) {
      console.error('Erro ao arquivar bloqueio:', err);
      toast.error('Não foi possível remover o bloqueio.');
    } finally {
      setDesbloqueandoId(null);
    }
  };

  /** Retorna informações de urgência temporal de um bloqueio. */
  const getBlockUrgency = (endsAt: string) => {
    const fim = new Date(endsAt);
    const agora = new Date();
    const diffMs = fim.getTime() - agora.getTime();
    const diffDias = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (diffDias <= 0) return { label: 'Expirado', cor: 'bg-slate-100 text-slate-500 border-slate-200', borda: 'border-l-slate-300' };
    if (diffDias === 1) return { label: 'Expira hoje', cor: 'bg-red-50 text-red-700 border-red-200', borda: 'border-l-red-500' };
    if (diffDias <= 3) return { label: `Expira em ${diffDias} dia(s)`, cor: 'bg-amber-50 text-amber-700 border-amber-200', borda: 'border-l-amber-500' };
    if (diffDias <= 7) return { label: `Expira em ${diffDias} dia(s)`, cor: 'bg-yellow-50 text-yellow-700 border-yellow-200', borda: 'border-l-yellow-400' };
    return { label: `Expira em ${diffDias} dia(s)`, cor: 'bg-emerald-50 text-emerald-700 border-emerald-200', borda: 'border-l-rose-500' };
  };







  const availabilities = snapshot.availabilities || [];
  const blocks = snapshot.blocks || [];

  const listagemMedicosFiltrados = useMemo(() => {
    return doctors.filter((doctor) => {
      // 0. Apenas profissionais ativos
      if (doctor.is_active === false) return false;
      return true;
    });
  }, [doctors]);

  /**
   * Agrupa as disponibilidades diretamente por médico, consolidando as escalas de
   * forma global para o profissional sem qualquer vínculo institucional.
   */
  const groupedByDoctor = useMemo(() => {
    type DoctorGroup = {
      doctorId: string;
      doctorName: string;
      registrationLabel: string | null;
      items: AvailabilityRow[];
      activeCount: number;
    };

    const map = new Map<string, DoctorGroup>();

    // 1. Inicializa um registro por médico (usando listagemMedicosFiltrados)
    for (const doc of listagemMedicosFiltrados) {
      if (map.has(doc.id)) continue;
      const reg = formatarRegistroProfissional(doc.professional_council, doc.professional_registration || doc.crm);

      map.set(doc.id, {
        doctorId: doc.id,
        doctorName: doc.full_name || 'Profissional',
        registrationLabel: reg,
        items: [],
        activeCount: 0,
      });
    }

    // 2. Preenche as escalas reais sem duplicar o mesmo dia da semana
    for (const row of availabilities) {
      const group = map.get(row.doctor_id);
      if (!group) {
        // Médico não está na listagem filtrada (inativo ou fora do filtro) — ignora
        continue;
      }

      const existingIndex = group.items.findIndex(item => item.weekday === row.weekday);
      if (existingIndex !== -1) {
        // Se o item existente estiver inativo e este estiver ativo, substitui para priorizar a visualização ativa
        if (!group.items[existingIndex].is_active && row.is_active) {
          if (group.items[existingIndex].is_active) group.activeCount--;
          group.items[existingIndex] = row;
          if (row.is_active) group.activeCount++;
        }
        continue;
      }

      group.items.push(row);
      if (row.is_active) group.activeCount++;
    }

    // 3. Ordena as escalas por dia da semana
    return Array.from(map.values()).map(g => ({
      ...g,
      items: g.items.sort((a, b) => a.weekday - b.weekday),
    }));
  }, [availabilities, listagemMedicosFiltrados]);

  const blocksFiltrados = blocks;


  const scheduleColumns: Array<CompactDataGridColumn<any>> = useMemo(() => {
    const shortWeekdayMap: Record<number, string> = {
      0: 'Dom', 1: 'Seg', 2: 'Ter', 3: 'Qua', 4: 'Qui', 5: 'Sex', 6: 'Sáb'
    };
    return [
      {
        key: 'profissional',
        headerTitle: 'Profissional',
        filterable: true,
        filterValue: (row) => row.doctorName,
        header: <span className="font-extrabold text-[11px] uppercase tracking-wider">Profissional</span>,
        render: (group) => {
          const doctorObj = doctors.find((d) => d.id === group.doctorId);
          const specialtyName = doctorObj?.specialty_name;
          const specialtyColor = doctorObj?.specialty_color;
          const initials = getInitials(group.doctorName, 'DR');
          const colorClass = getAvatarColor(group.doctorName);
          return (
            <div className="flex items-center gap-3 min-w-0">
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-bold border shadow-sm ${colorClass}`}>
                {initials}
              </div>
              <div className="min-w-0">
                <p className="font-extrabold text-slate-900 uppercase text-xs truncate" title={group.doctorName}>
                  {group.doctorName}
                </p>
                <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                  {group.registrationLabel && (
                    <span className="inline-flex text-[10px] font-bold text-slate-500 bg-slate-100 rounded px-1.5 py-0.5 border border-slate-200">
                      {group.registrationLabel}
                    </span>
                  )}
                  {specialtyName && (() => {
                    const iconKey = doctorObj?.specialty_icon || '';
                    const Icon = iconKey && SPECIALTY_ICONS[iconKey as keyof typeof SPECIALTY_ICONS]
                      ? SPECIALTY_ICONS[iconKey as keyof typeof SPECIALTY_ICONS]
                      : Stethoscope;
                    return (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider"
                        style={specialtyColor
                          ? { backgroundColor: `${specialtyColor}15`, color: specialtyColor, border: `1px solid ${specialtyColor}30` }
                          : { backgroundColor: '#e2e8f015', color: '#475569', border: '1px solid #e2e8f030' }
                        }
                      >
                        <Icon className="h-2.5 w-2.5" />
                        {specialtyName}
                      </span>
                    );
                  })()}
                </div>
              </div>
            </div>
          );
        }
      },
      {
        key: 'escala',
        headerTitle: 'Escala Consolidada',
        header: <span className="font-extrabold text-[11px] uppercase tracking-wider">Escala Consolidada</span>,
        render: (group) => {
          return (
            <div className="flex flex-wrap items-center gap-1.5">
              {[1, 2, 3, 4, 5, 6, 0].map((dayVal) => {
                const item = group.items.find((i: any) => i.weekday === dayVal);
                const shortDay = shortWeekdayMap[dayVal] || `Dia ${dayVal}`;
                const weekdayLabel = weekdayOptions.find(w => w.value === dayVal)?.label || shortDay;
                return (
                  <MiniAvailabilityEditor
                    key={dayVal}
                    doctorId={group.doctorId}
                    weekday={dayVal}
                    weekdayLabel={weekdayLabel}
                    item={item}
                    canManageAvailability={canManageAvailability}
                    onSuccess={loadSnapshot}
                  >
                    <button
                      type="button"
                      className={cn(
                        "inline-flex items-center gap-1 text-[9px] font-extrabold px-1.5 py-1 rounded-md border transition-all shadow-2xs cursor-pointer hover:shadow-xs",
                        item
                          ? item.is_active
                            ? "bg-emerald-50/70 text-emerald-800 border-emerald-200/80"
                            : "bg-rose-50/40 text-rose-400 border-rose-200/40 opacity-70"
                          : "bg-slate-50/50 text-slate-400 border-slate-200/50 border-dashed hover:bg-slate-50 hover:text-slate-600"
                      )}
                      title={
                        item
                          ? `${weekdayLabel}: ${item.starts_at.slice(0, 5)} - ${item.ends_at.slice(0, 5)} (${item.is_active ? 'Ativo' : 'Desativado'}, clique para ações)`
                          : `${weekdayLabel}: Sem horário definido (clique para configurar)`
                      }
                    >
                      <span className={cn(
                        "h-1 w-1 rounded-full shrink-0",
                        item
                          ? item.is_active
                            ? "bg-emerald-500"
                            : "bg-rose-400"
                          : "bg-slate-300"
                      )} />
                      <span className={cn("font-extrabold capitalize", item && !item.is_active && "line-through text-rose-400/80")}>
                        {weekdayLabel}
                      </span>
                      {item && item.is_active && (
                        <span className="font-bold text-[8px] ml-1 px-1 py-[1px] rounded-sm bg-emerald-100/60 text-emerald-800">
                          {item.starts_at.slice(0, 5)} - {item.ends_at.slice(0, 5)}
                        </span>
                      )}
                    </button>
                  </MiniAvailabilityEditor>
                );
              })}
            </div>
          );
        }
      },
      {
        key: 'acoes',
        headerTitle: 'Ações',
        className: 'w-[100px]',
        header: <span className="font-extrabold text-[11px] uppercase tracking-wider">Ações</span>,
        render: (group) => {
          return (
            <div className="flex items-center justify-start gap-1.5">
              {canManageBlocks && (
                <Button variant="outline" size="sm" onClick={() => openBlocksDialogForDoctor(group.doctorId)} title="Registrar Bloqueio Temporário (Ausência, Folga)" className="h-7 w-7 p-0 rounded-lg flex items-center justify-center border border-rose-200 text-rose-600 hover:bg-rose-50 shadow-2xs">
                  <Lock className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          );
        }
      }
    ];
  }, [doctors, canManageAvailability, canManageBlocks, openBlocksDialogForDoctor]);

  if (!canManageSchedule) {
    return (
      <div className="pt-20 pb-16 px-4 min-h-screen bg-slate-100 flex items-center justify-center font-medium text-slate-500">
        Acesso restrito à gestão de agendas.
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 bg-slate-100 px-3 pb-3 relative flex flex-col">
      <div className="flex h-full min-h-0 w-full flex-col">
        {/* Header Principal com Ações Rápidas */}
        {/* Header Principal com Ações Rápidas e Filtros Operacionais */}
        <PageHeader
          title="Gestão Administrativa da Agenda"
          description="Governança centralizada de horários de atendimento médicos, escalas por unidade e bloqueios oficiais."
          className="mb-3"
          compact
          loading={loading}
          actions={
            <div className="flex flex-wrap items-center gap-2 justify-end">
              {canManageBlocks && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setPreSelectedDoctorIdForBlock(undefined);
                    setBlocksDialogDefaultView('create');
                    setIsBlocksDialogOpen(true);
                  }}
                  className="h-9 px-3 text-xs font-bold flex items-center gap-1.5 border-rose-200 text-rose-700 hover:bg-rose-50 rounded-2xl shadow-xs"
                >
                  <ShieldCheck className="h-3.5 w-3.5 text-rose-500" />
                  Registrar Bloqueio
                </Button>
              )}

              <Button
                variant="outline"
                className="bg-white border-slate-200 hover:bg-slate-50 text-xs font-semibold h-9 px-2.5 rounded-2xl shadow-xs"
                onClick={() => { void loadSnapshot(); }}
                disabled={loading}
                title="Atualizar dados da agenda"
              >
                <RefreshCcw className="h-3.5 w-3.5 text-slate-500" />
              </Button>
            </div>
          }
        >
          {/* Filtros operacionais removidos */}
        </PageHeader>

        <div className="flex-1 min-h-0 flex flex-col gap-4 pr-1 pb-3">
          {/* Alternador de Visões (View Switcher) */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white p-2 rounded-2xl border border-slate-200/80 shadow-2xs">
            <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-2xl w-full sm:w-auto">
              <button
                type="button"
                onClick={() => setActiveViewTab('doctors')}
                className={cn(
                  'flex-1 sm:flex-none px-3.5 py-1.5 rounded-lg text-xs font-extrabold transition-all duration-200 flex items-center justify-center gap-1.5',
                  activeViewTab === 'doctors'
                    ? 'bg-white text-[#003B71] shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                )}
              >
                <Users className="h-3.5 w-3.5" />
                <span>Profissionais ({groupedByDoctor.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveViewTab('blocks')}
                className={cn(
                  'flex-1 sm:flex-none px-3.5 py-1.5 rounded-lg text-xs font-extrabold transition-all duration-200 flex items-center justify-center gap-1.5',
                  activeViewTab === 'blocks'
                    ? 'bg-white text-rose-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                )}
              >
                <Lock className="h-3.5 w-3.5" />
                <span>Bloqueios ({blocks.length})</span>
              </button>
            </div>



          </div>

          {/* ABA 1: VISÃO POR PROFISSIONAIS */}
          {activeViewTab === 'doctors' && (
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="flex-1 min-h-0 flex flex-col">
                <CompactDataGrid
                  columns={scheduleColumns}
                  rows={groupedByDoctor}
                  getRowKey={(row) => row.doctorId}
                  loading={loading}
                  emptyMessage={
                    <div className="py-16 text-center text-slate-500 text-sm font-medium bg-white rounded-2xl border border-slate-200/80 p-8 space-y-3">
                      <p>Nenhum profissional localizado para os filtros selecionados.</p>
                      <Button
                        type="button"
                        onClick={openNewAvailabilityModal}
                        className="bg-[#003B71] text-white text-xs font-bold h-9 px-4 rounded-2xl shadow-xs"
                      >
                        + Cadastrar Primeira Disponibilidade
                      </Button>
                    </div>
                  }
                  className="flex-1 h-full"
                  pagination={true}
                  estimatedRowHeight={62}
                />
              </div>
            </div>
          )}

          {/* ABA 3: VISÃO BLOQUEIOS VIGENTES */}
          {activeViewTab === 'blocks' && (
            <div className="space-y-3">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-16 gap-2 bg-white rounded-2xl border border-slate-100">
                  <Loader2 className="h-8 w-8 animate-spin text-rose-600" />
                  <span className="text-xs text-slate-500 font-semibold">Carregando bloqueios...</span>
                </div>
              ) : blocksFiltrados.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 px-8 bg-white rounded-2xl border border-slate-200/80 shadow-2xs">
                  {/* Ícone decorativo */}
                  <div className="relative mb-6">
                    <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-rose-50 to-rose-100 flex items-center justify-center shadow-sm border border-rose-100">
                      <Lock className="h-9 w-9 text-rose-300" />
                    </div>
                    <div className="absolute -top-1.5 -right-1.5 h-6 w-6 rounded-full bg-emerald-100 border-2 border-white flex items-center justify-center">
                      <span className="text-[10px] font-black text-emerald-600">✓</span>
                    </div>
                  </div>

                  {/* Título e descrição */}
                  <h3 className="text-base font-extrabold text-slate-800 mb-1.5 tracking-tight">
                    Agenda sem bloqueios
                  </h3>
                  <p className="text-sm text-slate-500 font-medium text-center max-w-xs leading-relaxed mb-6">
                    Nenhum bloqueio oficial está ativo no momento. A agenda de todos os profissionais está liberada.
                  </p>

                  {/* Ação */}
                  {canManageBlocks && (
                    <Button
                      type="button"
                      onClick={() => {
                        setPreSelectedDoctorIdForBlock(undefined);
                        setBlocksDialogDefaultView('create');
                        setIsBlocksDialogOpen(true);
                      }}
                      className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold h-9 px-5 rounded-2xl shadow-sm hover:shadow-md transition-all flex items-center gap-2"
                    >
                      <ShieldCheck className="h-3.5 w-3.5" />
                      Registrar Bloqueio
                    </Button>
                  )}
                </div>
              ) : (
                blocksFiltrados.map((row) => (
                  <div
                    key={row.block_id}
                    className={cn(
                      "rounded-2xl border bg-white p-4 transition-all duration-200 shadow-2xs hover:shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-l-4",
                      getBlockUrgency(row.ends_at).borda
                    )}
                  >
                    <div className="space-y-2 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                          row.scope_type === 'institution' ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}>
                          <Lock className="h-3 w-3" />
                          {row.scope_type === 'institution' ? 'Bloqueio de Unidade' : 'Bloqueio do Profissional'}
                        </span>
                        {/* Badge de urgência */}
                        <span className={cn(
                          'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border',
                          getBlockUrgency(row.ends_at).cor
                        )}>
                          <AlarmClock className="h-2.5 w-2.5" />
                          {getBlockUrgency(row.ends_at).label}
                        </span>
                      </div>
                      <p className="text-base font-extrabold text-slate-900 tracking-tight truncate uppercase">{row.doctor_name}</p>
                      <div className="space-y-1 text-xs text-slate-600">
                        {row.scope_type !== 'doctor' && (
                          <div className="flex items-center gap-1.5">
                            <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                            <span className="truncate font-medium">{row.institution_name}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1.5 text-slate-700">
                          <Calendar className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                          <span className="font-semibold">{formatDateTime(row.starts_at)} até {formatDateTime(row.ends_at)}</span>
                        </div>
                        {row.reason && (
                          <div className="mt-1 p-2.5 bg-slate-50 rounded-xl border border-slate-100 text-xs text-slate-600 italic">
                            Motivo: "{row.reason}"
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex sm:flex-col items-center sm:items-end justify-end shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={desbloqueandoId === row.block_id}
                        className="h-8 rounded-2xl px-3 border-rose-200 text-rose-600 hover:bg-rose-50 font-bold text-xs shadow-xs flex items-center gap-1.5 w-full sm:w-auto"
                        onClick={() => handleDesbloquear(row.block_id)}
                      >
                        {desbloqueandoId === row.block_id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Unlock className="h-3.5 w-3.5 text-rose-500" />
                        )}
                        {desbloqueandoId === row.block_id ? 'Removendo...' : 'Desbloquear'}
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>


      {/* DIALOG 1: CADASTRAR / EDITAR DISPONIBILIDADE */}
      <Dialog open={isAvailabilityDialogOpen} onOpenChange={setIsAvailabilityDialogOpen}>
        <DialogContent className="sm:max-w-[550px] rounded-2xl p-6 bg-white border-0 shadow-2xl overflow-hidden">
          <DialogHeader className="mb-2">
            <DialogTitle className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
              <Clock className="h-6 w-6 text-[#003B71]" />
              {editingAvailabilityId ? 'Editar Disponibilidade Oficial' : 'Cadastrar Disponibilidade Oficial'}
            </DialogTitle>
            <DialogDescription className="text-sm text-slate-500 font-medium">
              Configure o dia e intervalo de atendimento médico governado pelo backend.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAvailabilitySubmit} className="space-y-4 py-2">
            <FormGrid>
              {editingAvailabilityId ? (
                // Modo Edição: Card de perfil do profissional com iniciais e especialidade destacado
                <FormField label="Profissional" className="md:col-span-12">
                  {(() => {
                    const doctorName = availabilityForm.doctor_name.split(' - ')[0] || 'Profissional';
                    const doctorObj = formDoctors.find(d => d.id === availabilityForm.doctor_id);
                    const initials = getInitials(doctorName, 'DR');
                    const colorClass = getAvatarColor(doctorName);
                    
                    const specialtyName = doctorObj?.specialty_name;
                    const iconKey = doctorObj?.specialty_icon || '';
                    const Icon = iconKey && SPECIALTY_ICONS[iconKey as keyof typeof SPECIALTY_ICONS]
                      ? SPECIALTY_ICONS[iconKey as keyof typeof SPECIALTY_ICONS]
                      : Stethoscope;
                    const colorHex = doctorObj?.specialty_color || '#3b82f6';

                    return (
                      <div className="flex items-center gap-3.5 p-3.5 bg-slate-50 border border-slate-200/60 rounded-2xl w-full shadow-2xs hover:bg-slate-100/30 transition-all duration-300 mt-1">
                        <div className={cn(
                          "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xs font-black border shadow-xs transition-transform duration-300 hover:scale-105",
                          colorClass
                        )}>
                          {initials}
                        </div>
                        <div className="flex flex-col gap-1 min-w-0">
                          <span className="font-black text-sm text-slate-800 uppercase tracking-tight truncate">
                            {doctorName}
                          </span>
                          {specialtyName && (
                            <div className="flex">
                              <span 
                                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[9px] font-black border shrink-0 uppercase tracking-wider shadow-3xs"
                                style={{
                                  backgroundColor: `${colorHex}15`,
                                  color: colorHex,
                                  borderColor: `${colorHex}30`
                                }}
                              >
                                <Icon className="h-3 w-3" />
                                {specialtyName}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </FormField>
              ) : (
                // Modo Cadastro: Seletores normais
                <FormField label="Profissional" required className="md:col-span-12">
                  <Select
                    value={availabilityForm.doctor_id}
                    onValueChange={(value) => setAvailabilityForm((current) => ({ ...current, doctor_id: value }))}
                  >
                    <SelectTrigger className="h-11 rounded-2xl bg-slate-50 border-slate-200 hover:bg-slate-100/50 text-xs font-semibold w-full transition-all">
                      <SelectValue placeholder="Selecione o profissional" />
                    </SelectTrigger>
                    <SelectContent>
                      {formDoctors.map((doctor) => {
                        const iconKey = doctor.specialty_icon || '';
                        const Icon = iconKey && SPECIALTY_ICONS[iconKey as keyof typeof SPECIALTY_ICONS]
                          ? SPECIALTY_ICONS[iconKey as keyof typeof SPECIALTY_ICONS]
                          : Stethoscope;
                        const colorHex = doctor.specialty_color || '#3b82f6';
                        return (
                          <SelectItem key={doctor.id} value={doctor.id}>
                            <div className="flex items-center justify-between w-full gap-2">
                              <span>{doctor.full_name || 'Profissional'}</span>
                              {doctor.specialty_name && (
                                <span 
                                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-bold border ml-auto shrink-0 uppercase tracking-wider"
                                  style={{
                                    backgroundColor: `${colorHex}15`,
                                    color: colorHex,
                                    borderColor: `${colorHex}30`
                                  }}
                                >
                                  <Icon className="h-3 w-3" />
                                  {doctor.specialty_name}
                                </span>
                              )}
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </FormField>
              )}

              {/* Seletor de Dias da Semana */}
              <FormField label={editingAvailabilityId ? "Dia da semana" : "Dias da semana de atendimento"} required className="md:col-span-12">
                {editingAvailabilityId ? (
                  /* Modo edição: seleciona 1 dia por vez */
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {weekdayOptions.map((w) => {
                      const isSelected = String(w.value) === availabilityForm.weekday;
                      const dayItem = scheduleByWeekdayForSelectedDoctor.get(w.value);
                      // Estado real do dia: tem escala ativa, inativa ou nenhuma
                      const hasSchedule = !!dayItem;
                      const isActiveDay = dayItem?.is_active ?? false;

                      return (
                        <button
                          key={w.value}
                          type="button"
                          onClick={() => handleEditWeekdayChange(w.value)}
                          title={
                            dayItem
                              ? `${w.label}: ${dayItem.starts_at.slice(0,5)}–${dayItem.ends_at.slice(0,5)} (${dayItem.is_active ? 'Ativo' : 'Desativado'})`
                              : `${w.label}: Sem escala cadastrada`
                          }
                          className={cn(
                            'px-3 py-2 rounded-xl text-xs font-bold border transition-all duration-200 active:scale-95 flex flex-col items-center gap-1 min-w-[54px] shadow-3xs cursor-pointer',
                            isSelected
                              ? 'bg-[#003B71]/10 text-[#003B71] border-2 border-[#003B71] font-black shadow-xs ring-2 ring-[#003B71]/5'
                              : hasSchedule && isActiveDay
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200/80 hover:bg-emerald-100/60'
                              : hasSchedule && !isActiveDay
                              ? 'bg-rose-50/70 text-rose-500 border-rose-200/60 hover:bg-rose-100/50'
                              : 'bg-slate-50 text-slate-400 border-slate-200 border-dashed hover:bg-slate-100 hover:text-slate-600'
                          )}
                        >
                          <span className="text-[10px] tracking-tight uppercase font-extrabold">{w.short ?? w.label}</span>
                          {/* Indicador de status do dia */}
                          {hasSchedule ? (
                            <span className={cn(
                              'text-[9px] font-bold leading-none px-1 rounded-md',
                              isSelected 
                                ? 'text-[#003B71]/80 bg-[#003B71]/5' 
                                : isActiveDay 
                                ? 'text-emerald-700 bg-emerald-100/50' 
                                : 'text-rose-500 bg-rose-100/50'
                            )}>
                              {dayItem!.starts_at.slice(0,5)}
                            </span>
                          ) : (
                            <span className="text-[9px] text-slate-300 leading-none">--</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 pt-1">
                    <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5 w-full">
                      {weekdayOptions.map((w) => {
                        const isSelected = selectedBatchWeekdays.includes(w.value);
                        const isActive = activeWeekdaysForSelectedDoctor.includes(w.value);
                        return (
                          <button
                            key={w.value}
                            type="button"
                            onClick={() => toggleBatchWeekday(w.value)}
                            className={cn(
                              'h-11 px-1 rounded-xl text-xs font-bold border transition-all duration-200 flex flex-col items-center justify-center gap-1 active:scale-95 shadow-2xs cursor-pointer',
                              isSelected
                                ? 'bg-blue-50/45 text-[#003B71] border-2 border-[#003B71] font-black shadow-xs ring-2 ring-[#003B71]/5'
                                : isActive
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200/80 hover:bg-emerald-100/50'
                                : 'bg-slate-50/60 text-slate-600 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                            )}
                          >
                            <span className="text-[10px] tracking-tight uppercase font-extrabold">{w.short}</span>
                            <span className={cn(
                              "h-1.5 w-1.5 rounded-full transition-all duration-200",
                              isSelected
                                ? "bg-[#003B71] scale-125"
                                : isActive
                                ? "bg-emerald-500"
                                : "bg-transparent border border-slate-300"
                            )} />
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[11px] text-slate-400 font-medium">Selecione os dias clicando sobre os botões para ativar a escala.</p>
                  </div>
                )}
              </FormField>

              {/* Auxiliar para alterar horário via setas (< >) integradas */}
              {(() => {
                const ajustarHorarioString = (horarioOriginal: string, deltaMinutos: number): string => {
                  if (!horarioOriginal) return deltaMinutos > 0 ? "08:00" : "07:30";
                  const [horasStr, minutosStr] = horarioOriginal.split(':');
                  const totalMinutos = Number(horasStr) * 60 + Number(minutosStr) + deltaMinutos;
                  const minutosNormalizados = Math.max(0, Math.min(24 * 60 - 30, totalMinutos));
                  const novasHoras = Math.floor(minutosNormalizados / 60);
                  const novosMinutos = minutosNormalizados % 60;
                  return `${String(novasHoras).padStart(2, '0')}:${String(novosMinutos).padStart(2, '0')}`;
                };

                return (
                  <>
                    <FormField label="Horário Início" required className="md:col-span-6">
                      <div className="h-11 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between px-2.5 focus-within:border-[#003B71] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#003B71]/10 transition-all duration-200 shadow-2xs">
                        <button
                          type="button"
                          className="p-1 hover:bg-slate-200/60 rounded-md text-slate-400 hover:text-slate-600 active:scale-90 transition-all shrink-0 cursor-pointer"
                          onClick={() => setAvailabilityForm((current) => ({
                            ...current,
                            starts_at: ajustarHorarioString(current.starts_at, -30)
                          }))}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </button>
                        <div className="flex items-center justify-center gap-1.5 min-w-0 flex-1">
                          <Clock className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <input
                            type="time"
                            className="bg-transparent border-0 outline-none text-xs font-semibold text-center text-slate-800 w-full max-w-[85px] p-0 focus:ring-0 focus:outline-none cursor-pointer"
                            value={availabilityForm.starts_at}
                            onChange={(event) => setAvailabilityForm((current) => ({ ...current, starts_at: event.target.value }))}
                          />
                        </div>
                        <button
                          type="button"
                          className="p-1 hover:bg-slate-200/60 rounded-md text-slate-400 hover:text-slate-600 active:scale-90 transition-all shrink-0 cursor-pointer"
                          onClick={() => setAvailabilityForm((current) => ({
                            ...current,
                            starts_at: ajustarHorarioString(current.starts_at, 30)
                          }))}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                    </FormField>

                    <FormField label="Horário Fim" required className="md:col-span-6">
                      <div className="h-11 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between px-2.5 focus-within:border-[#003B71] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#003B71]/10 transition-all duration-200 shadow-2xs">
                        <button
                          type="button"
                          className="p-1 hover:bg-slate-200/60 rounded-md text-slate-400 hover:text-slate-600 active:scale-90 transition-all shrink-0 cursor-pointer"
                          onClick={() => setAvailabilityForm((current) => ({
                            ...current,
                            ends_at: ajustarHorarioString(current.ends_at, -30)
                          }))}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </button>
                        <div className="flex items-center justify-center gap-1.5 min-w-0 flex-1">
                          <Clock className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <input
                            type="time"
                            className="bg-transparent border-0 outline-none text-xs font-semibold text-center text-slate-800 w-full max-w-[85px] p-0 focus:ring-0 focus:outline-none cursor-pointer"
                            value={availabilityForm.ends_at}
                            onChange={(event) => setAvailabilityForm((current) => ({ ...current, ends_at: event.target.value }))}
                          />
                        </div>
                        <button
                          type="button"
                          className="p-1 hover:bg-slate-200/60 rounded-md text-slate-400 hover:text-slate-600 active:scale-90 transition-all shrink-0 cursor-pointer"
                          onClick={() => setAvailabilityForm((current) => ({
                            ...current,
                            ends_at: ajustarHorarioString(current.ends_at, 30)
                          }))}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                    </FormField>

                    {/* Badge de Duração Total */}
                    {(() => {
                      const res = calcularDuracaoAtendimento(availabilityForm.starts_at, availabilityForm.ends_at);
                      if (!res.texto) return null;
                      return (
                        <div className="md:col-span-12 flex justify-center mt-1">
                          <span className={cn(
                            "inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-[10px] font-black border uppercase tracking-wider shadow-3xs transition-all duration-300",
                            res.erro 
                              ? "bg-rose-50 text-rose-600 border-rose-200/60" 
                              : "bg-blue-50/50 text-[#003B71] border-blue-100"
                          )}>
                            <Clock className="h-3 w-3 shrink-0" />
                            {res.texto}
                          </span>
                        </div>
                      );
                    })()}
                  </>
                );
              })()}

              {/* Status do Dia (Ativar / Desativar) */}
              <FormField label="Status do Atendimento" className="md:col-span-12">
                {(() => {
                  const isChecked = availabilityForm.is_active === 'true';
                  return (
                    <div className={cn(
                      "p-3.5 rounded-2xl border transition-all duration-300 mt-1 flex flex-col gap-2.5",
                      isChecked 
                        ? "bg-emerald-50/30 border-emerald-200/80 text-emerald-800" 
                        : "bg-rose-50/30 border-rose-200/80 text-rose-800"
                    )}>
                      <div className="flex items-center gap-3">
                        <Switch
                          id="dia-ativo"
                          checked={isChecked}
                          onCheckedChange={(checked) => setAvailabilityForm((current) => ({
                            ...current,
                            is_active: checked ? 'true' : 'false'
                          }))}
                        />
                        <Label 
                          htmlFor="dia-ativo" 
                          className={cn(
                            "text-xs font-black transition-colors cursor-pointer select-none",
                            isChecked ? "text-emerald-700" : "text-rose-700"
                          )}
                        >
                          {isChecked ? 'Dia de Atendimento Ativo' : 'Dia de Atendimento Desativado'}
                        </Label>
                      </div>
                      <p className={cn(
                        "text-[10.5px] font-medium leading-relaxed opacity-90 pl-1",
                        isChecked ? "text-emerald-600/90" : "text-rose-500/90"
                      )}>
                        {isChecked 
                          ? 'O profissional estará disponível para receber agendamentos e consultas neste dia da semana.' 
                          : 'Este dia da semana ficará bloqueado. O profissional não receberá agendamentos neste período.'
                        }
                      </p>
                    </div>
                  );
                })()}
              </FormField>
            </FormGrid>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 mt-4">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setIsAvailabilityDialogOpen(false)} 
                disabled={savingAvailability} 
                className="h-10 px-6 text-xs font-bold rounded-2xl hover:bg-slate-50 transition-all cursor-pointer"
              >
                Cancelar
              </Button>
              <Button 
                type="submit" 
                disabled={savingAvailability} 
                className="bg-[#003B71] hover:bg-[#002B55] text-white text-xs font-bold h-10 px-6 rounded-2xl shadow-md hover:shadow-lg transition-all flex items-center gap-1.5 cursor-pointer"
              >
                {savingAvailability ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : editingAvailabilityId ? (
                  <Save className="h-4 w-4" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                {editingAvailabilityId ? 'Atualizar Horário' : 'Salvar Disponibilidade'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* DIALOG UNIFICADO DE BLOQUEIOS */}
      <BloqueiosAgendaDialog
        open={isBlocksDialogOpen}
        onClose={() => {
          setIsBlocksDialogOpen(false);
          setPreSelectedDoctorIdForBlock(undefined);
          setBlocksDialogDefaultView('list');
        }}
        onSuccess={() => { void loadSnapshot(); }}
        preSelectedDoctorId={preSelectedDoctorIdForBlock}
        defaultView={blocksDialogDefaultView}
      />

      <ConfirmationDialog />
    </div>
  );
};

export default ScheduleManagement;

