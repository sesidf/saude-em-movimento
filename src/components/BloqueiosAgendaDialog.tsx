import { useEffect, useMemo, useState } from 'react';
import { Lock, Unlock, Search, Loader2, CalendarDays, AlertTriangle, Plus, User, ArrowLeft, Trash2, AlarmClock, Plane, Coffee, Wrench, BookOpen, Utensils } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { chamarApiPost, chamarApiGet } from '@/lib/workerApi';
import { getOperationalErrorMessage } from '@/lib/errors';
import { buildIdempotencyKey } from '@/lib/idempotency';
import { capitalizeFirstLetter } from '@/utils/formatters';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Combobox } from '@/components/ui/combobox';
import { renderDoctorOption } from '@/components/ui/combobox-helpers';
import { useConfirm } from '@/hooks/useConfirm';
import { FormSectionTitle, FormGrid, FormField } from '@/components/ui/standard-form';

interface ScheduleBlock {
  block_id: string;
  starts_at: string;
  ends_at: string;
  reason: string;
  doctor_name: string | null;
  institution_name: string | null;
  scope_type: 'doctor' | 'institution';
  is_soft?: boolean;
}

interface InstitutionOption {
  id: string;
  name: string;
}

interface DoctorOption {
  id: string;
  full_name: string;
  crm?: string;
  professional_council?: string;
  specialty_name?: string;
  specialty_color?: string;
  specialty_icon?: string;
}

interface BloqueiosAgendaDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  /** ID do profissional a pré-selecionar ao abrir o formulário */
  preSelectedDoctorId?: string;
  /** 'list' = abre na listagem de bloqueios | 'create' = abre direto no formulário */
  defaultView?: 'list' | 'create';
}

export default function BloqueiosAgendaDialog({
  open,
  onClose,
  onSuccess,
  preSelectedDoctorId,
  defaultView = 'list',
}: BloqueiosAgendaDialogProps) {
  const { institutionId, userRole } = useAuth();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [bloqueios, setBloqueios] = useState<ScheduleBlock[]>([]);
  const [carregandoBloqueios, setCarregandoBloqueios] = useState(false);
  const [desbloqueandoId, setDesbloqueandoId] = useState<string | null>(null);
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);
  const [removendoTodos, setRemovendoTodos] = useState(false);
  const [filtroBloqueio, setFiltroBloqueio] = useState('');

  const { confirm: confirmDialog, ConfirmationDialog } = useConfirm();

  // Drill-down: entidade → bloqueios (2 etapas)
  const [drilldownStep, setDrilldownStep] = useState<'entity' | 'blocks'>('entity');
  const [selectedEntityKey, setSelectedEntityKey] = useState<string | null>(null);

  // Formulário de Novo Bloqueio
  const [_institutions, setInstitutions] = useState<InstitutionOption[]>([]);
  const [doctors, setDoctors] = useState<DoctorOption[]>([]);
  const [savingBlock, setSavingBlock] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [blockForm, setBlockForm] = useState({
    doctor_id: '',
    starts_at: '',
    ends_at: '',
    reason: '',
    is_soft: false,
    is_recurrent: false,
  });

  const isSuperadmin = userRole === 'superadmin';

  const formatDateTimeLocal = (date: Date) => {
    const pad = (num: number) => String(num).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };

  const obterDiaDaSemana = (dataString: string) => {
    if (!dataString) return '';
    try {
      const dataPart = dataString.split('T')[0];
      if (!dataPart) return '';
      const partes = dataPart.split('-');
      if (partes.length !== 3) return '';
      const ano = parseInt(partes[0] || '0', 10);
      const mes = parseInt(partes[1] || '0', 10) - 1;
      const dia = parseInt(partes[2] || '0', 10);
      const d = new Date(ano, mes, dia);
      if (isNaN(d.getTime())) return '';
      
      const dias = ['DOMINGO', 'SEGUNDA-FEIRA', 'TERÇA-FEIRA', 'QUARTA-FEIRA', 'QUINTA-FEIRA', 'SEXTA-FEIRA', 'SÁBADO'];
      return dias[d.getDay()] || '';
    } catch {
      return '';
    }
  };

  const carregarBloqueios = async () => {
    setCarregandoBloqueios(true);
    try {
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      const pastStart = hoje.toISOString();
      const futureEnd = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
      
      const { data, error } = await chamarApiPost('/api/rpc/get_schedule_admin_snapshot', {
        p_doctor_id: null,
        p_start_at: pastStart,
        p_end_at: futureEnd,
      });

      if (error) throw error;
      const snapshot = (data || {}) as { blocks?: ScheduleBlock[] };
      setBloqueios(snapshot.blocks || []);
    } catch (error) {
      console.error('Erro ao carregar bloqueios:', error);
      void getOperationalErrorMessage(error, 'Erro ao carregar bloqueios da agenda').then((msg) => {
        toast.error(msg);
      });
      setBloqueios([]);
    } finally {
      setCarregandoBloqueios(false);
    }
  };

  const carregarOpcoesFormulario = async () => {
    try {
      const { data: instData } = await chamarApiPost('/api/table/institutions/select', {});
      
      const loadedInsts = (instData || []) as InstitutionOption[];
      setInstitutions(loadedInsts);

      const targetInst = institutionId || loadedInsts[0]?.id || '';
      
      setBlockForm((prev) => ({
        ...prev,
        starts_at: prev.starts_at || formatDateTimeLocal(new Date()),
        ends_at: prev.ends_at || formatDateTimeLocal(new Date(Date.now() + 3600000)),
      }));

      if (targetInst) {
        await carregarMedicosDaInstituicao(preSelectedDoctorId);
      }
    } catch (err) {
      console.error('Erro ao carregar opcoes do formulario:', err);
    }
  };

  const carregarMedicosDaInstituicao = async (preSelectedId?: string) => {
    try {
      const { data, error } = await chamarApiPost('/api/rpc/list_doctors_catalog', { p_search: null, p_include_inactive: false });

      if (error) throw error;

      const formatted = ((data as any[] | null) || []).map((d: any) => ({
        id: d.id,
        full_name: d.full_name || 'Profissional',
        crm: d.crm,
        professional_council: d.professional_council,
        specialty_name: d.specialty_name,
        specialty_color: d.specialty_color,
        specialty_icon: d.specialty_icon,
      })).sort((a: any, b: any) => (a.full_name || '').localeCompare(b.full_name || ''));

      setDoctors(formatted);
      // Se veio um ID pré-selecionado, usa ele; senão pega o primeiro da lista
      const defaultId = preSelectedId || (formatted.length > 0 ? formatted[0].id : '');
      if (defaultId) {
        setBlockForm((prev) => ({ ...prev, doctor_id: defaultId }));
      }
    } catch (err) {
      console.error('Erro ao carregar medicos:', err);
      setDoctors([]);
    }
  };

  useEffect(() => {
    if (open) {
      void carregarBloqueios();
      void carregarOpcoesFormulario();
      setConfirmandoId(null);
      setDesbloqueandoId(null);
      setFiltroBloqueio('');
      setDrilldownStep('entity');
      setSelectedEntityKey(null);

      // Aplica defaultView — a pré-seleção de médico já foi feita dentro de carregarMedicosDaInstituicao
      if (defaultView === 'create') {
        setIsCreateDialogOpen(true);
      } else {
        setIsCreateDialogOpen(false);
      }
    }
  }, [open, institutionId, defaultView, preSelectedDoctorId]);

  const handleRecurrentChange = (checked: boolean) => {
    setBlockForm((prev) => {
      let nextStarts = prev.starts_at;
      let nextEnds = prev.ends_at;

      if (checked) {
        if (nextStarts.includes('T')) {
          nextStarts = nextStarts.split('T')[1]?.slice(0, 5) || '08:00';
        } else if (nextStarts.length > 5) {
          nextStarts = '08:00';
        }
        if (nextEnds.includes('T')) {
          nextEnds = nextEnds.split('T')[1]?.slice(0, 5) || '17:00';
        } else if (nextEnds.length > 5) {
          nextEnds = '17:00';
        }
      } else {
        const hojeStr = formatDateTimeLocal(new Date()).split('T')[0];
        const timeStart = nextStarts.includes(':') && nextStarts.length === 5 ? nextStarts : '08:00';
        const timeEnd = nextEnds.includes(':') && nextEnds.length === 5 ? nextEnds : '17:00';
        nextStarts = `${hojeStr}T${timeStart}`;
        nextEnds = `${hojeStr}T${timeEnd}`;
      }

      return {
        ...prev,
        is_recurrent: checked,
        starts_at: nextStarts,
        ends_at: nextEnds,
      };
    });
  };

  const handleDesbloquear = async (bloqueioId: string) => {
    setDesbloqueandoId(bloqueioId);
    try {
      const idempotencyKey = await buildIdempotencyKey('agenda_archive_block', { block_id: bloqueioId });
      const { error } = await chamarApiPost('/api/rpc/api_archive_schedule_block', {
        p_block_id: bloqueioId,
        p_idempotency_key: idempotencyKey,
      });

      if (error) throw error;

      toast.success('Bloqueio removido da agenda operacional com sucesso.');
      setBloqueios((prev) => prev.filter((b) => b.block_id !== bloqueioId));
      setConfirmandoId(null);
      if (onSuccess) onSuccess();
    } catch (error) {
      console.error('Erro ao arquivar bloqueio:', error);
      void getOperationalErrorMessage(error, 'Não foi possível remover o bloqueio').then((msg) => {
        toast.error(msg);
      });
    } finally {
      setDesbloqueandoId(null);
    }
  };

  /**
   * Remove todos os bloqueios de agenda de todos os médicos/unidades de uma só vez (Apenas Superadmin)
   */
  const handleRemoverTodosBloqueios = async () => {
    if (!isSuperadmin) return;
    const ok = await confirmDialog(
      'ATENÇÃO SUPERADMIN:\n\nDeseja realmente REMOVER TODOS OS BLOQUEIOS DE AGENDA de todos os médicos e unidades de uma só vez?\n\nEsta ação liberará imediatamente todas as agendas bloqueadas.'
    );
    if (!ok) return;

    setRemovendoTodos(true);
    try {
      // 1. Tenta via RPC dedicada de remoção em massa
      const { data: rpcCount, error: rpcErr } = await chamarApiPost('/api/rpc/api_clear_all_schedule_blocks');

      if (!rpcErr && typeof rpcCount === 'number') {
        toast.success(`${rpcCount} bloqueio(s) de agenda removido(s) com sucesso!`);
      } else {
        // 2. Fallback via RPC individual para cada bloqueio ativo para contornar qualquer restrição de RLS ou trigger
        let sucessos = 0;
        for (const b of bloqueios) {
          try {
            const key = await buildIdempotencyKey('agenda_archive_block', { block_id: b.block_id, bulk: Date.now() });
            const { error: singleErr } = await chamarApiPost('/api/rpc/api_archive_schedule_block', {
              p_block_id: b.block_id,
              p_idempotency_key: key,
            });
            if (!singleErr) sucessos++;
          } catch (e) {
            console.error('Erro ao remover bloqueio individual:', e);
          }
        }
        if (sucessos > 0) {
          toast.success(`${sucessos} bloqueio(s) de agenda removido(s) com sucesso!`);
        } else {
          toast.info('Nenhum bloqueio ativo pendente para remoção.');
        }
      }

      await carregarBloqueios();
      if (onSuccess) onSuccess();
    } catch (err: any) {
      console.error('Erro ao remover todos os bloqueios:', err);
      toast.error(err?.message || 'Falha ao remover todos os bloqueios.');
    } finally {
      setRemovendoTodos(false);
    }
  };

  /**
   * Cria um bloqueio de agenda para o profissional selecionado.
   * Sem recorrência — sempre período único.
   */
  const handleCriarBloqueio = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (!blockForm.doctor_id) {
      newErrors.doctor_id = 'Selecione o profissional.';
    }
    if (!blockForm.starts_at) {
      newErrors.starts_at = blockForm.is_recurrent ? 'Informe o horário inicial.' : 'Informe a data e hora de início.';
    }
    if (!blockForm.ends_at) {
      newErrors.ends_at = blockForm.is_recurrent ? 'Informe o horário final.' : 'Informe a data e hora de fim.';
    }

    const isRecurrent = blockForm.is_recurrent;
    let startsAtDate: Date | null = null;
    let endsAtDate: Date | null = null;
    const hojeStr = formatDateTimeLocal(new Date()).split('T')[0];

    if (blockForm.starts_at && blockForm.ends_at) {
      if (isRecurrent) {
        startsAtDate = new Date(`${hojeStr}T${blockForm.starts_at}`);
        endsAtDate = new Date(`${hojeStr}T${blockForm.ends_at}`);
      } else {
        startsAtDate = new Date(blockForm.starts_at);
        endsAtDate = new Date(blockForm.ends_at);
      }

      if (endsAtDate <= startsAtDate) {
        newErrors.ends_at = 'O término deve ser posterior ao início.';
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    if (!startsAtDate || !endsAtDate) {
      return;
    }

    setErrors({});
    setSavingBlock(true);
    try {
      const chaveIdempotencia = await buildIdempotencyKey('schedule_admin_block', {
        institution_id: null,
        doctor_id: blockForm.doctor_id,
        starts_at: blockForm.starts_at,
        ends_at: blockForm.ends_at,
        reason: blockForm.reason,
        is_recurrent: isRecurrent,
      });

      const formatTimePart = (d: Date) => {
        const p = (n: number) => String(n).padStart(2, '0');
        return `${p(d.getHours())}:${p(d.getMinutes())}:00`;
      };
      
      const formatDatePart = (d: Date) => {
        const p = (n: number) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
      };

      const { error } = await chamarApiPost('/api/rpc/api_create_schedule_block', {
        p_doctor_id: blockForm.doctor_id,
        p_start_at: startsAtDate.toISOString(),
        p_end_at: endsAtDate.toISOString(),
        p_reason: blockForm.reason || 'Bloqueio de agenda',
        p_idempotency_key: chaveIdempotencia,
      });

      if (error) throw error;

      toast.success('Bloqueio de agenda registrado com sucesso.');
      setBlockForm((anterior) => ({
        ...anterior,
        starts_at: formatDateTimeLocal(new Date()),
        ends_at: formatDateTimeLocal(new Date(Date.now() + 3600000)),
        reason: '',
        is_soft: false,
        is_recurrent: false,
      }));
      await carregarBloqueios();
      setIsCreateDialogOpen(false);
      if (onSuccess) onSuccess();
    } catch (erro) {
      console.error('Erro ao registrar bloqueio:', erro);
      void getOperationalErrorMessage(erro, 'Não foi possível registrar o bloqueio').then((msg) => {
        toast.error(msg);
      });
    } finally {
      setSavingBlock(false);
    }
  };

  const normalizarTexto = (texto: string) => 
    texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

  const bloqueiosFiltrados = useMemo(() => {
    if (!filtroBloqueio.trim()) return bloqueios;
    const search = normalizarTexto(filtroBloqueio);
    return bloqueios.filter((b) => 
      normalizarTexto(b.doctor_name || '').includes(search) ||
      normalizarTexto(b.institution_name || '').includes(search) ||
      normalizarTexto(b.reason || '').includes(search)
    );
  }, [bloqueios, filtroBloqueio]);

  const blocksByEntity = useMemo(() => {
    const map = new Map<string, {
      key: string;
      label: string;
      blocks: ScheduleBlock[];
    }>();

    bloqueiosFiltrados.forEach(b => {
      // Bloqueio de médico: chave pelo nome do médico
      // Bloqueio de unidade (scope_type === 'institution'): chave pela instituição
      const isDoctorBlock = b.scope_type === 'doctor' && !!b.doctor_name;
      const key = isDoctorBlock
        ? `doc_${b.doctor_name}`
        : `inst_${b.institution_name || 'Geral'}`;
      const label = isDoctorBlock
        ? (b.doctor_name as string)
        : `Bloqueio de Unidade: ${capitalizeFirstLetter((b.institution_name || 'Geral').toLowerCase())}`;
      
      if (!map.has(key)) {
        map.set(key, { key, label, blocks: [] });
      }
      map.get(key)!.blocks.push(b);
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [bloqueiosFiltrados]);

  /**
   * Bloqueios a exibir na etapa 'blocks' — todos os bloqueios da entidade selecionada,
   * ordenados por data mais próxima.
   */
  const blocksToDisplay = useMemo(() => {
    if (!selectedEntityKey) return [];
    const entity = blocksByEntity.find(e => e.key === selectedEntityKey);
    if (!entity) return [];
    return [...entity.blocks].sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  }, [selectedEntityKey, blocksByEntity]);

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

  /** Tipos de bloqueio pré-definidos. */
  const TIPOS_BLOQUEIO = [
    { valor: 'ferias', rotulo: 'Férias', Icone: Plane, motivo: 'Profissional em período de férias.' },
    { valor: 'falta', rotulo: 'Falta / Ausência', Icone: Coffee, motivo: 'Ausência do profissional.' },
    { valor: 'almoco', rotulo: 'Almoço', Icone: Utensils, motivo: 'Horário de almoço do profissional.' },
    { valor: 'congresso', rotulo: 'Congresso / Evento', Icone: BookOpen, motivo: 'Participação em congresso ou evento médico.' },
    { valor: 'manutencao', rotulo: 'Manutenção', Icone: Wrench, motivo: 'Manutenção preventiva da sala ou equipamento.' },
    { valor: 'outro', rotulo: 'Outro', Icone: AlarmClock, motivo: '' },
  ];

  /** Helper para formatar datetime local. */
  const fmtLocal = (date: Date) => {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}`;
  };

  const doctorOptions = useMemo(() => {
    // Remove a opção "Todos os Profissionais" — desatualizada após desvinculamento institucional
    return doctors.map(renderDoctorOption);
  }, [doctors]);

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl bg-white p-0 border-0 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in-50 zoom-in-95 duration-200" aria-describedby={undefined}>
          <div className="flex flex-col">
            <div className="px-6 py-5 flex items-center justify-between border-b border-slate-100 bg-white">
              <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2.5">
                <div className="bg-rose-50 p-2 rounded-xl border border-rose-100/50 text-rose-500 shadow-sm">
                  <Lock className="h-4 w-4" />
                </div>
                Bloqueios Oficiais da Agenda
              </DialogTitle>
            </div>

            {/* Cabeçalho de Ações da Lista */}
            <div className="px-6 py-4 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between gap-4">
              <p className="text-xs text-slate-500 font-medium">
                Listagem de bloqueios ativos nesta unidade.
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  onClick={() => setIsCreateDialogOpen(true)}
                  className="h-9 px-4 bg-[#003B71] hover:bg-[#002b54] text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-sm transition-all"
                >
                  <Plus className="h-4 w-4" />
                  Registrar Bloqueio
                </Button>

                {isSuperadmin && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={removendoTodos}
                    onClick={() => { void handleRemoverTodosBloqueios(); }}
                    className="h-9 w-9 p-0 border-rose-200 bg-transparent text-rose-500 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-300 rounded-xl flex items-center justify-center transition-all active:scale-95"
                    title="Superadmin: Remover todos os bloqueios de agenda"
                  >
                    {removendoTodos ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                )}
              </div>
            </div>
            
            <div className="p-6 space-y-4 bg-slate-50/50 max-h-[60vh] overflow-y-auto">
              {!carregandoBloqueios && bloqueios.length > 0 && (
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                    <Input
                      type="text"
                      placeholder="Filtrar por profissional, unidade ou motivo..."
                      value={filtroBloqueio}
                      onChange={(e) => setFiltroBloqueio(e.target.value)}
                      className="pl-10 h-10 border-slate-200 focus-visible:ring-2 focus-visible:ring-[#003B71]/10 focus-visible:border-[#003B71] text-sm bg-white rounded-xl shadow-sm"
                    />
                  </div>
                </div>
              )}

              {carregandoBloqueios ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <Loader2 className="animate-spin h-8 w-8 text-[#003B71]" />
                  <span className="text-xs font-semibold text-slate-500">Carregando bloqueios da agenda...</span>
                </div>
              ) : bloqueios.length === 0 ? (
                <div className="py-12 text-center flex flex-col items-center justify-center gap-3">
                  <div className="bg-emerald-50 p-4 rounded-full border border-emerald-100/50">
                    <Unlock className="h-10 w-10 text-emerald-500" />
                  </div>
                  <div>
                    <p className="text-slate-700 font-bold text-base">Nenhum bloqueio ativo localizado</p>
                    <p className="text-xs text-slate-500 max-w-sm mt-1">A agenda está livre de bloqueios oficiais. Clique em "Registrar Bloqueio" para bloquear um horário.</p>
                  </div>
                  <Button
                    onClick={() => setIsCreateDialogOpen(true)}
                    className="mt-2 h-9 px-4 bg-[#003B71] hover:bg-[#002b54] text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-sm"
                  >
                    <Plus className="h-4 w-4" />
                    Criar Bloqueio Agora
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {bloqueiosFiltrados.length === 0 ? (
                    <div className="py-12 text-center text-slate-500 text-sm font-medium bg-white rounded-2xl border border-slate-100 shadow-sm">
                      Nenhum bloqueio encontrado para "{filtroBloqueio}".
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center gap-2 pb-1 border-b border-slate-200">
                        {drilldownStep !== 'entity' && (
                          <Button variant="ghost" size="sm" onClick={() => {
                            setDrilldownStep('entity'); setSelectedEntityKey(null);
                          }} className="h-8 px-2 text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors">
                            <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
                          </Button>
                        )}
                        <h4 className="text-sm font-bold text-slate-800">
                          {drilldownStep === 'entity' && "Selecione o Profissional"}
                          {drilldownStep === 'blocks' && "Bloqueios do Profissional"}
                        </h4>
                      </div>

                      {drilldownStep === 'entity' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {blocksByEntity.map(entity => (
                            <button key={entity.key} type="button" onClick={() => { setSelectedEntityKey(entity.key); setDrilldownStep('blocks'); }} className="p-4 border border-slate-200 rounded-xl bg-white text-left shadow-sm hover:shadow-md hover:border-[#003B71]/40 transition-all flex flex-col gap-3 group">
                               <div className="flex items-center gap-3">
                                 <div className={`p-2.5 rounded-xl border bg-blue-50 text-blue-600 border-blue-100 group-hover:scale-105 transition-transform`}>
                                   <User className="h-5 w-5" />
                                 </div>
                                 <p className="font-bold text-xs text-slate-800 line-clamp-2 uppercase">{entity.label}</p>
                               </div>
                               <div className="pt-2 border-t border-slate-50 flex items-center justify-between">
                                 <span className="text-[10px] font-bold text-slate-400 uppercase">Bloqueios Ativos</span>
                                 <span className="px-2 py-0.5 bg-rose-50 text-rose-600 font-bold text-xs rounded-full border border-rose-100">{entity.blocks.length}</span>
                               </div>
                            </button>
                          ))}
                        </div>
                      )}

                      {drilldownStep === 'blocks' && (
                        <div className="space-y-3">
                          {blocksToDisplay.map((bloqueio) => {
                            const inicio = new Date(bloqueio.starts_at);
                            const fim = new Date(bloqueio.ends_at);
                            const formatarDH = (d: Date) =>
                              d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                            const formatarD = (d: Date) =>
                              d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' });

                            const isConfirmando = confirmandoId === bloqueio.block_id;
                            const isDoctorBlock = !!bloqueio.doctor_name && bloqueio.scope_type === 'doctor' && bloqueio.doctor_name !== 'Bloqueio Geral' && bloqueio.doctor_name !== 'Todos os profissionais da unidade' && bloqueio.doctor_name !== 'Todos os profissionais';
                            const isDaily = (bloqueio as any).recurrence_type === 'daily';
                            const urgencia = getBlockUrgency(bloqueio.ends_at);

                            return (
                              <div
                                key={bloqueio.block_id}
                                className={`rounded-2xl border bg-white p-4 transition-all duration-300 shadow-sm hover:shadow-md flex flex-col gap-3 border-l-4 ${urgencia.borda} ${
                                  isConfirmando 
                                    ? 'border-amber-300 bg-gradient-to-br from-amber-50/20 to-amber-50/60' 
                                    : ''
                                }`}
                              >
                                <div className="flex items-start justify-between gap-4">
                                  <div className="flex items-start gap-3 flex-1 min-w-0">
                                    <div className={`p-2 rounded-xl border ${
                                      isDoctorBlock 
                                        ? 'bg-rose-50 text-rose-500 border-rose-100/50' 
                                        : 'bg-amber-50 text-amber-500 border-amber-100/50'
                                    }`}>
                                      <Lock className="h-4 w-4 shrink-0" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      {/* Badge de urgência */}
                                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold border mb-1.5 ${urgencia.cor}`}>
                                        <AlarmClock className="h-2.5 w-2.5" />
                                        {urgencia.label}
                                      </span>
                                      {bloqueio.doctor_name && bloqueio.scope_type === 'doctor' && bloqueio.doctor_name !== 'Bloqueio Geral' && bloqueio.doctor_name !== 'Todos os profissionais da unidade' && bloqueio.doctor_name !== 'Todos os profissionais' ? (
                                        <p className="text-sm font-black text-slate-800 truncate uppercase">
                                          {bloqueio.doctor_name}
                                        </p>
                                      ) : (
                                        <p className="text-sm font-black text-amber-700 flex items-center gap-1.5">
                                          Bloqueio de Unidade Inteira
                                        </p>
                                      )}
                                      {bloqueio.institution_name && (
                                        <p className="text-xs text-slate-500 font-medium mt-0.5">{capitalizeFirstLetter(bloqueio.institution_name.toLowerCase())}</p>
                                      )}
                                      
                                      {isDaily ? (
                                        <div className="flex flex-wrap items-center gap-2 mt-2">
                                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-50 rounded-md px-2 py-0.5 border border-amber-200">
                                            Diário: {(bloqueio as any).start_time?.substring(0, 5)} às {(bloqueio as any).end_time?.substring(0, 5)}
                                          </span>
                                          <span className="text-slate-400 text-xs">período:</span>
                                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-600 bg-slate-100 rounded-md px-2 py-0.5">
                                            {formatarD(inicio)}
                                          </span>
                                          <span className="text-slate-400 text-xs">até</span>
                                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-600 bg-slate-100 rounded-md px-2 py-0.5">
                                            {(bloqueio.ends_at && !bloqueio.ends_at.startsWith('2099')) ? formatarD(fim) : 'Sempre'}
                                          </span>
                                        </div>
                                      ) : (
                                        <div className="flex flex-wrap items-center gap-2 mt-2">
                                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-600 bg-slate-100 rounded-md px-2 py-0.5">
                                            <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
                                            {formatarDH(inicio)}
                                          </span>
                                          <span className="text-slate-400 text-xs">até</span>
                                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-600 bg-slate-100 rounded-md px-2 py-0.5">
                                            <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
                                            {formatarDH(fim)}
                                          </span>
                                        </div>
                                      )}
                                      {bloqueio.reason && (
                                        <div className="mt-3 p-2 bg-slate-50 rounded-lg border border-slate-100">
                                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Motivo Informado</p>
                                          <p className="text-xs text-slate-700 mt-0.5 font-medium">{capitalizeFirstLetter(bloqueio.reason.replace(/\.$/, ""))}</p>
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  {/* Botão de desbloqueio na direita */}
                                  {desbloqueandoId === bloqueio.block_id ? (
                                    <Loader2 className="h-5 w-5 animate-spin text-[#003B71] shrink-0 mt-1" />
                                  ) : !isConfirmando ? (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => setConfirmandoId(bloqueio.block_id)}
                                      className="shrink-0 rounded-xl h-9 border-rose-200 text-rose-600 hover:bg-rose-50 hover:border-rose-300 font-bold text-xs flex items-center gap-1 shadow-sm transition-all"
                                    >
                                      <Unlock className="h-3.5 w-3.5" />
                                      Desbloquear
                                    </Button>
                                  ) : null}
                                </div>

                                {/* Confirmação inline */}
                                {isConfirmando && (
                                  <div className="mt-1 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/55 p-3">
                                    <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
                                      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 animate-pulse" />
                                      Confirmar a liberação e desbloqueio deste período?
                                    </p>
                                    <div className="flex gap-2 w-full sm:w-auto shrink-0 justify-end">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setConfirmandoId(null)}
                                        className="h-8 rounded-lg text-xs font-bold border-slate-200 text-slate-600 hover:bg-white bg-transparent"
                                      >
                                        Cancelar
                                      </Button>
                                      <Button
                                        size="sm"
                                        onClick={() => { void handleDesbloquear(bloqueio.block_id); }}
                                        className="h-8 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white border-0 shadow-md shadow-emerald-600/10"
                                      >
                                        <Unlock className="h-3 w-3 mr-1" />
                                        Confirmar
                                      </Button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
            
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-100 bg-white">
              <Button 
                variant="outline" 
                onClick={onClose}
                className="rounded-xl px-5 h-10 font-bold border-slate-200 hover:bg-slate-50 text-slate-700 text-sm shadow-sm"
              >
                Fechar
              </Button>
            </div>
          </div>
        </DialogContent>
        <ConfirmationDialog />
      </Dialog>

      {/* Modal de Registro de Novo Bloqueio */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-2xl bg-white p-6 border-0 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in-50 zoom-in-95 duration-200 max-h-[95vh] overflow-y-auto" aria-describedby={undefined}>
          <form onSubmit={handleCriarBloqueio} className="flex flex-col gap-6">
            <div className="flex flex-col space-y-1">
              <DialogTitle className="text-xl font-bold text-slate-800 tracking-tight">
                Registrar Bloqueio de Agenda
              </DialogTitle>
              <DialogDescription className="text-slate-500 font-medium text-xs">
                Defina o período e o profissional para proibir novos agendamentos.
              </DialogDescription>
            </div>

            <div className="flex flex-col gap-6">
              {/* Seção 1: Dados do Bloqueio */}
              <div className="space-y-4">
                <FormSectionTitle>Dados do Bloqueio</FormSectionTitle>
                <FormGrid>
                  <FormField label="Profissional" required className="md:col-span-12" error={errors.doctor_id}>
                    <Combobox
                      options={doctorOptions}
                      value={blockForm.doctor_id}
                      onChange={(val) => {
                        setBlockForm((prev) => ({ ...prev, doctor_id: val }));
                        setErrors((prev) => { const next = { ...prev }; delete next.doctor_id; return next; });
                      }}
                      placeholder="Selecione o profissional"
                      searchPlaceholder="Buscar profissional..."
                      emptyText="Nenhum profissional encontrado."
                      className={`h-10 text-xs bg-white border-slate-200 rounded-xl shadow-sm hover:bg-slate-50 transition-colors ${errors.doctor_id ? 'border-red-500' : ''}`}
                    />
                  </FormField>

                  <FormField label="Tipo de Bloqueio" required className="md:col-span-12">
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                      {TIPOS_BLOQUEIO.map((tipo) => {
                        const isSelected = blockForm.reason === tipo.motivo && tipo.motivo !== '';
                        return (
                          <button
                            key={tipo.valor}
                            type="button"
                            onClick={() => setBlockForm((c) => ({ ...c, reason: tipo.motivo }))}
                            className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-[11px] font-bold transition-all w-full justify-center ${
                              isSelected
                                ? 'bg-rose-50 border-rose-300 text-rose-700 shadow-xs'
                                : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:border-slate-300'
                            }`}
                          >
                            <tipo.Icone className={`h-4 w-4 shrink-0 ${isSelected ? 'text-rose-500' : 'text-slate-400'}`} />
                            <span>{tipo.rotulo}</span>
                          </button>
                        );
                      })}
                    </div>
                  </FormField>
                </FormGrid>
              </div>

              {/* Seção 2: Período e Detalhes */}
              <div className="space-y-4">
                <FormSectionTitle>Período e Detalhes</FormSectionTitle>
                <FormGrid>
                   {/* Presets rápidos */}
                   {!blockForm.is_recurrent && (
                     <FormField label="Duração Rápida" className="md:col-span-12">
                       <div className="flex flex-wrap gap-2">
                         {[
                           { rotulo: 'Hoje', fn: () => {
                             const h = new Date(); h.setHours(0, 0, 0, 0);
                             const f = new Date(); f.setHours(23, 59, 0, 0);
                             return { starts_at: fmtLocal(h), ends_at: fmtLocal(f) };
                           }},
                           { rotulo: 'Amanhã', fn: () => {
                             const h = new Date(Date.now() + 86400000); h.setHours(0, 0, 0, 0);
                             const f = new Date(Date.now() + 86400000); f.setHours(23, 59, 0, 0);
                             return { starts_at: fmtLocal(h), ends_at: fmtLocal(f) };
                           }},
                           { rotulo: '1 Semana', fn: () => {
                             const h = new Date(); h.setHours(8, 0, 0, 0);
                             const f = new Date(Date.now() + 7 * 86400000); f.setHours(18, 0, 0, 0);
                             return { starts_at: fmtLocal(h), ends_at: fmtLocal(f) };
                           }},
                           { rotulo: '1 Mês', fn: () => {
                             const h = new Date(); h.setHours(8, 0, 0, 0);
                             const f = new Date(Date.now() + 30 * 86400000); f.setHours(18, 0, 0, 0);
                             return { starts_at: fmtLocal(h), ends_at: fmtLocal(f) };
                           }},
                         ].map((preset) => (
                           <button
                             key={preset.rotulo}
                             type="button"
                             onClick={() => {
                               setBlockForm((c) => ({ ...c, ...preset.fn() }));
                               setErrors((prev) => { const next = { ...prev }; delete next.starts_at; delete next.ends_at; return next; });
                             }}
                             className="px-3 py-1.5 rounded-lg border text-[11px] font-bold bg-white text-slate-600 border-slate-200 hover:bg-[#003B71]/10 hover:border-[#003B71]/30 hover:text-[#003B71] transition-all"
                           >
                             {preset.rotulo}
                           </button>
                         ))}
                       </div>
                     </FormField>
                   )}
 
                   <FormField 
                      label={blockForm.is_recurrent ? "Horário de Início" : `Início${obterDiaDaSemana(blockForm.starts_at) ? ` - ${obterDiaDaSemana(blockForm.starts_at)}` : ""}`} 
                      required 
                      className="md:col-span-6"
                      error={errors.starts_at}
                    >
                      <Input
                        type={blockForm.is_recurrent ? "time" : "datetime-local"}
                        value={blockForm.starts_at}
                        onChange={(e) => {
                          setBlockForm((prev) => ({ ...prev, starts_at: e.target.value }));
                          setErrors((prev) => { const next = { ...prev }; delete next.starts_at; return next; });
                        }}
                        className={`h-10 text-xs bg-white border-slate-200 rounded-xl shadow-sm hover:bg-slate-50 transition-colors ${errors.starts_at ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                      />
                    </FormField>
 
                    <FormField 
                      label={blockForm.is_recurrent ? "Horário de Fim" : `Fim${obterDiaDaSemana(blockForm.ends_at) ? ` - ${obterDiaDaSemana(blockForm.ends_at)}` : ""}`} 
                      required 
                      className="md:col-span-6"
                      error={errors.ends_at}
                    >
                      <Input
                        type={blockForm.is_recurrent ? "time" : "datetime-local"}
                        value={blockForm.ends_at}
                        onChange={(e) => {
                          setBlockForm((prev) => ({ ...prev, ends_at: e.target.value }));
                          setErrors((prev) => { const next = { ...prev }; delete next.ends_at; return next; });
                        }}
                        className={`h-10 text-xs bg-white border-slate-200 rounded-xl shadow-sm hover:bg-slate-50 transition-colors ${errors.ends_at ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                      />
                    </FormField>
 
                   <FormField label="" className="md:col-span-12">
                     <label className="flex items-center gap-2 cursor-pointer py-1 select-none">
                       <input
                         type="checkbox"
                         checked={blockForm.is_recurrent}
                         onChange={(e) => handleRecurrentChange(e.target.checked)}
                         className="h-4 w-4 rounded border-slate-300 text-[#003B71] focus:ring-[#003B71]"
                       />
                       <span className="text-xs font-bold text-slate-700">
                         Repetir diariamente (Para Sempre / Horário de Almoço)
                       </span>
                     </label>
                   </FormField>

                  <FormField label="Motivo Oficial" className="md:col-span-12">
                    <Textarea
                      placeholder="Ex.: Férias, congresso, manutenção da unidade..."
                      value={blockForm.reason}
                      onChange={(e) => setBlockForm((prev) => ({ ...prev, reason: e.target.value }))}
                      className="min-h-[72px] text-xs bg-white border-slate-200 rounded-xl shadow-sm resize-none focus-visible:ring-1 hover:bg-slate-50 transition-colors"
                    />
                  </FormField>
                </FormGrid>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsCreateDialogOpen(false)}
                className="h-9 text-xs font-bold rounded-xl border-slate-200 text-slate-600"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={savingBlock}
                className="h-9 px-4 bg-[#003B71] hover:bg-[#002b54] text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-sm"
              >
                {savingBlock ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Lock className="h-3.5 w-3.5" />}
                Registrar Bloqueio
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
