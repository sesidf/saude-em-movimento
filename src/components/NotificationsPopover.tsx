"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatOperationalTime } from '@/lib/operationalDateTime';
import { criarEstadoNavegacao } from '@/lib/intencaoNavegacao';
import {
  ArrowRight,
  Bell,
  Calendar,
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  Stethoscope,
  Zap,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAuth } from '@/contexts/AuthContext';
import { appointmentService } from '@/servicos/appointments';
import { chamarApiPost, chamarApiGet } from '@/lib/workerApi';

interface Agendamento {
  id: string;
  patient_name: string;
  doctor_name: string;
  doctor_id?: string;
  appointment_date: string;
  status: string;
}

interface NotificationsPopoverProps {
  expanded?: boolean;
}

/** Tradução e configuração visual de cada status clínico */
const configuracaoStatus: Record<
  string,
  { rotulo: string; cor: string; corFundo: string; corBorda: string; corPonto: string }
> = {
  agendado: {
    rotulo: 'Agendado',
    cor: 'text-blue-700',
    corFundo: 'bg-blue-50',
    corBorda: 'border-blue-200',
    corPonto: 'bg-blue-500',
  },
  confirmado: {
    rotulo: 'Confirmado',
    cor: 'text-emerald-700',
    corFundo: 'bg-emerald-50',
    corBorda: 'border-emerald-200',
    corPonto: 'bg-emerald-500',
  },
  em_atendimento: {
    rotulo: 'Em Atendimento',
    cor: 'text-violet-700',
    corFundo: 'bg-violet-50',
    corBorda: 'border-violet-200',
    corPonto: 'bg-violet-500',
  },
};

const obterConfigStatus = (status: string) =>
  configuracaoStatus[status] ?? {
    rotulo: status,
    cor: 'text-slate-600',
    corFundo: 'bg-slate-100',
    corBorda: 'border-slate-200',
    corPonto: 'bg-slate-400',
  };

/**
 * Calcula em quantos minutos a consulta acontece a partir de agora.
 * Retorna null se a data for inválida.
 */
const calcularMinutosAte = (dataConsulta: string): number | null => {
  const agora = Date.now();
  const data = new Date(dataConsulta).getTime();
  if (Number.isNaN(data)) return null;
  return Math.round((data - agora) / 60000);
};

/**
 * Classifica urgência de uma consulta baseado em quantos minutos faltam e no status atual.
 * - 'atrasada': Passou mais de 5 minutos e paciente ainda está aguardando
 * - 'critica': até 15 min
 * - 'proxima': 15–45 min
 * - 'normal': mais de 45 min
 */
const classificarUrgencia = (minutos: number | null, status: string): 'atrasada' | 'critica' | 'proxima' | 'normal' => {
  if (minutos === null) return 'normal';
  if (minutos < -5 && (status === 'agendado' || status === 'confirmado' || status === 'reagendado')) return 'atrasada';
  if (minutos <= 15) return 'critica';
  if (minutos <= 45) return 'proxima';
  return 'normal';
};

/** Formata o tempo relativo de forma inteligente */
const formatarTempoRelativo = (minutos: number | null, status: string): string | null => {
  if (minutos === null) return null;
  
  if (status === 'em_atendimento') return 'No consultório';
  
  if (minutos < -5 && (status === 'agendado' || status === 'confirmado' || status === 'reagendado')) {
    const atraso = Math.abs(minutos);
    if (atraso < 60) return `Atrasado ${atraso} min`;
    const h = Math.floor(atraso / 60);
    const m = atraso % 60;
    return `Atrasado ${h}h${m > 0 ? m + 'm' : ''}`;
  }
  
  if (minutos < 0) return 'Iniciando...';
  if (minutos === 0) return 'Agora';
  if (minutos < 60) return `em ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const mins = minutos % 60;
  return mins > 0 ? `em ${horas}h ${mins}m` : `em ${horas}h`;
};

// Intervalo de auto-refresh: 90 segundos
const INTERVALO_REFRESH_MS = 90_000;

const NotificationsPopover = ({ expanded }: NotificationsPopoverProps = {}) => {
  const { doctorId, firstAllowedRoute, userRole, profile } = useAuth();
  const navigate = useNavigate();
  const [aberto, setAberto] = useState(false);
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState<Date | null>(null);
  const [filtroAtivo, setFiltroAtivo] = useState<'todos' | 'pendentes' | 'em_atendimento'>('todos');
  const [filtroProfissional, setFiltroProfissional] = useState<'eu' | 'todos'>(
    ['admin', 'superadmin', 'recepcao'].includes(userRole || '') ? 'todos' : 'eu'
  );
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /**
   * Busca as consultas de hoje via RPC.
   */
  const buscarAgendamentos = useCallback(async () => {
    setCarregando(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const data = await appointmentService.list({ date: today });

      const itens = (data || []).map((a) => ({
        id: a.id,
        patient_name: a.patient_name || 'Paciente',
        doctor_name: a.doctor_name || 'Médico',
        doctor_id: a.doctor_id,
        appointment_date: a.appointment_date,
        status: a.status,
      }));

      setAgendamentos(itens);
      setUltimaAtualizacao(new Date());
    } catch (erro) {
      console.error('[buscarAgendamentos]', erro);
      setAgendamentos([]);
    } finally {
      setCarregando(false);
    }
  }, []);

  // Busca inicial ao montar
  useEffect(() => {
    void buscarAgendamentos();
  }, [buscarAgendamentos]);

  // Auto-refresh periódico
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      void buscarAgendamentos();
    }, INTERVALO_REFRESH_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [buscarAgendamentos]);

  const isPendente = (status: string) =>
    status === 'agendado' || status === 'confirmado' || status === 'reagendado';

  const totalPendentes = agendamentos.filter((a) => isPendente(a.status)).length;

  const handleCliqueAgendamento = (id: string) => {
    setAberto(false);
    navigate('/appointments', { state: criarEstadoNavegacao({ focarAgendamento: id }) });
  };

  // Ordena: em_atendimento primeiro, depois por hora
  const agendamentosOrdenados = [...agendamentos].sort((a, b) => {
    if (a.status === 'em_atendimento' && b.status !== 'em_atendimento') return -1;
    if (b.status === 'em_atendimento' && a.status !== 'em_atendimento') return 1;
    return new Date(a.appointment_date).getTime() - new Date(b.appointment_date).getTime();
  });

  // Aplica o filtro selecionado pelo usuário
  const agendamentosExibidos = agendamentosOrdenados.filter((a) => {
    if (filtroProfissional === 'eu' && a.doctor_name !== profile?.full_name) {
      return false;
    }
    if (filtroAtivo === 'pendentes') return isPendente(a.status);
    if (filtroAtivo === 'em_atendimento') return a.status === 'em_atendimento';
    return true;
  });

  const totalPendentesExibidos = agendamentosExibidos.filter((a) => isPendente(a.status)).length;

  const totalEmAtendimentoExibidos = agendamentosExibidos.filter((a) => a.status === 'em_atendimento').length;

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size={expanded ? 'default' : 'icon'}
          className={
            expanded
              ? 'w-full flex items-center justify-start gap-3 px-3 py-2 text-slate-600 hover:bg-slate-50 hover:text-slate-900 h-10'
              : 'relative text-slate-500 hover:bg-slate-50 hover:text-slate-800'
          }
          title="Notificações"
        >
          <div className="relative shrink-0">
            <Bell className="h-4 w-4" />
            {totalPendentes > 0 && (
              <span className="absolute -top-1 -right-1 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
              </span>
            )}
          </div>
          {expanded && <span className="text-sm font-medium">Notificações</span>}
          {expanded && totalPendentes > 0 && (
            <Badge className="ml-auto bg-rose-500/10 text-rose-600 hover:bg-rose-500/20 border-transparent shadow-none px-2 py-0.5 rounded-full text-[11px] font-bold">
              {totalPendentesExibidos > 0 ? totalPendentesExibidos : totalPendentes}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className="w-[380px] p-0 bg-white border border-slate-200 shadow-xl rounded-xl overflow-hidden"
        side="right"
        align="end"
        sideOffset={20}
      >
        {/* ── Header limpo ── */}
        <div className="px-4 py-3 bg-white border-b border-slate-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-[#00427A]" />
              <h3 className="font-bold text-[13px] text-slate-800">Consultas de Hoje</h3>
              <span className="text-[10px] text-slate-400 font-medium">
                {new Date().toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' })}
              </span>
            </div>

            <button
              onClick={() => void buscarAgendamentos()}
              disabled={carregando}
              className="text-slate-400 hover:text-slate-700 transition-colors p-1 rounded disabled:opacity-40"
              title={
                ultimaAtualizacao
                  ? `Atualizado às ${ultimaAtualizacao.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
                  : 'Atualizar'
              }
            >
              <RefreshCw className={`h-3.5 w-3.5 ${carregando ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Chips de filtro clicáveis */}
          <div className="flex flex-col gap-2.5 mt-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setFiltroProfissional('eu')}
                className={`inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2.5 py-1 transition-all ${
                  filtroProfissional === 'eu'
                    ? 'bg-[#00427A] text-white shadow-sm ring-1 ring-[#003B71]'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                Eu
              </button>
              <button
                onClick={() => setFiltroProfissional('todos')}
                className={`inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2.5 py-1 transition-all ${
                  filtroProfissional === 'todos'
                    ? 'bg-slate-700 text-white shadow-sm ring-1 ring-slate-500'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                Todos
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setFiltroAtivo('todos')}
                className={`inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2.5 py-1 transition-all ${
                  filtroAtivo === 'todos'
                    ? 'bg-slate-200 text-slate-800 shadow-sm ring-1 ring-slate-300'
                    : 'bg-slate-50 text-slate-500 hover:bg-slate-100 border border-transparent'
                }`}
              >
                <span className="font-bold">{agendamentosExibidos.length}</span> total
              </button>
            <button
              onClick={() => setFiltroAtivo(filtroAtivo === 'pendentes' ? 'todos' : 'pendentes')}
              className={`inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2.5 py-1 border transition-all ${
                filtroAtivo === 'pendentes'
                  ? 'bg-amber-500 text-white border-amber-500 shadow-sm ring-1 ring-amber-400'
                  : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
              }`}
            >
              <span className="font-bold">{totalPendentesExibidos}</span> pendentes
            </button>
            {totalEmAtendimentoExibidos > 0 && (
              <button
                onClick={() => setFiltroAtivo(filtroAtivo === 'em_atendimento' ? 'todos' : 'em_atendimento')}
                className={`inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2.5 py-1 border transition-all ${
                  filtroAtivo === 'em_atendimento'
                    ? 'bg-violet-600 text-white border-violet-600 shadow-sm ring-1 ring-violet-400'
                    : 'bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100'
                }`}
              >
                <Zap className="h-2.5 w-2.5" />
                <span className="font-bold">{totalEmAtendimentoExibidos}</span> em atend.
              </button>
            )}
          </div>
        </div>
      </div>

        {/* ── Lista ── */}
        <div className="max-h-[380px] overflow-y-auto">
          {carregando && agendamentos.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-10 gap-3">
              <Loader2 className="h-7 w-7 animate-spin text-[#00427A]" />
              <p className="text-sm text-slate-400 font-medium">Carregando consultas...</p>
            </div>
          ) : agendamentos.length === 0 ? (
            <div className="p-10 text-center">
              <div className="bg-slate-100 rounded-full p-4 w-fit mx-auto mb-4">
                <Calendar className="h-8 w-8 text-slate-300" />
              </div>
              <p className="text-[14px] font-semibold text-slate-600">Agenda livre!</p>
              <p className="text-[12px] text-slate-400 mt-1">Nenhuma consulta pendente para hoje.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {agendamentosExibidos.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-[13px] font-semibold text-slate-500">
                    {filtroAtivo === 'pendentes' ? 'Nenhuma consulta pendente.' : 'Nenhuma consulta em atendimento.'}
                  </p>
                </div>
              ) : (
                agendamentosExibidos.map((agendamento) => {
                  const cfg = obterConfigStatus(agendamento.status);
                  const minutos = calcularMinutosAte(agendamento.appointment_date);
                  const urgencia = classificarUrgencia(minutos, agendamento.status);
                  const tempoRelativo = formatarTempoRelativo(minutos, agendamento.status);
                  const hora = formatOperationalTime(agendamento.appointment_date);

                  return (
                    <button
                      key={agendamento.id}
                      onClick={() => handleCliqueAgendamento(agendamento.id)}
                      className={`w-full px-4 py-3 flex items-start gap-3 transition-all duration-150 text-left group
                        ${urgencia === 'atrasada' ? 'bg-red-50/80 hover:bg-red-100 border-l-4 border-red-500 pl-3' : urgencia === 'critica' ? 'bg-rose-50/60 hover:bg-rose-50' : urgencia === 'proxima' ? 'hover:bg-amber-50/40' : 'hover:bg-slate-50/80'}
                      `}
                    >
                      {/* Conteúdo */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <span className="font-semibold text-[13px] text-slate-800 truncate leading-tight group-hover:text-[#00427A] transition-colors">
                            {agendamento.patient_name}
                          </span>

                          {/* Badge status */}
                          <span
                            className={`shrink-0 inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${cfg.corFundo} ${cfg.cor} ${cfg.corBorda}`}
                          >
                            {agendamento.status === 'em_atendimento' && <Zap className="h-2.5 w-2.5" />}
                            {agendamento.status === 'confirmado' && <CheckCircle2 className="h-2.5 w-2.5" />}
                            {cfg.rotulo}
                          </span>
                        </div>

                        <div className="flex items-center gap-3 text-[11px]">
                          <div className="flex items-center gap-1 font-semibold text-slate-600">
                            <Clock className="h-3 w-3 text-slate-400" />
                            <span>{hora}</span>
                            {tempoRelativo && (
                              <span
                                className={`font-medium ${urgencia === 'atrasada' ? 'text-red-700 font-extrabold' : urgencia === 'critica' ? 'text-rose-600 font-bold' : urgencia === 'proxima' ? 'text-amber-600' : 'text-slate-400'}`}
                              >
                                · {tempoRelativo}
                              </span>
                            )}
                          </div>

                          {!doctorId && (
                            <div className="flex items-center gap-1 truncate text-slate-400">
                              <Stethoscope className="h-3 w-3 shrink-0" />
                              <span className="truncate">{agendamento.doctor_name}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <ArrowRight className="h-3.5 w-3.5 text-slate-300 mt-1 shrink-0 group-hover:text-[#00427A] group-hover:translate-x-0.5 transition-all" />
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="border-t border-slate-100 bg-slate-50/80 px-4 py-3 flex items-center justify-between gap-2">
          {ultimaAtualizacao && (
            <span className="text-[10px] text-slate-400 flex items-center gap-1">
              <RefreshCw className="h-2.5 w-2.5" />
              Atualizado às{' '}
              {ultimaAtualizacao.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <Button
            variant="default"
            size="sm"
            className="ml-auto h-8 px-4 text-[12px] font-semibold"
            onClick={() => {
              setAberto(false);
              navigate(firstAllowedRoute(['/agenda', '/appointments', '/history']));
            }}
          >
            <Calendar className="h-3.5 w-3.5 mr-1.5" />
            Ver Agenda Completa
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default NotificationsPopover;

