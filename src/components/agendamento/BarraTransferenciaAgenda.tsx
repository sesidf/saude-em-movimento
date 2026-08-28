"use client";

import { useMemo, useState } from 'react';
import {
  ArrowRightLeft,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  X,
  Loader2,
  Stethoscope,
  ChevronDown,
  ChevronUp,
  Info,
  CheckCheck,
  Sparkles,
  Zap,
  Clock
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Combobox, ComboboxOption } from '@/components/ui/combobox';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { DoctorOption } from '@/types/appointments';
import { renderDoctorOption } from '@/components/ui/combobox-helpers';
import { SPECIALTY_ICONS } from '@/pages/Specialties';
import {
  ResultadoAnaliseConflito,
  SugestaoProfissionalDestino,
  AjusteHorarioSugerido
} from '@/servicos/agendas';
import { cn } from '@/lib/utils';

export interface ConsultaSelecionadaTransferencia {
  id: string;
  patient_name?: string;
  time?: string;
  starts_at: string;
}

export interface BarraTransferenciaAgendaProps {
  visivel: boolean;
  totalSelecionadas: number;
  consultasSelecionadas: ConsultaSelecionadaTransferencia[];
  medicoOrigemNome?: string;
  medicoOrigemEspecialidade?: string;
  medicoOrigemEspecialidadeIcone?: string | null;
  medicoOrigemEspecialidadeCor?: string | null;
  medicosDisponiveis: DoctorOption[];
  medicoDestinoId: string;
  onSelecionarMedicoDestino: (id: string) => void;
  analiseConflitos: ResultadoAnaliseConflito | null;
  carregandoAnalise: boolean;
  sugestoesCompativeis?: SugestaoProfissionalDestino[];
  carregandoSugestoes?: boolean;
  onTransferir: (idsParaTransferir: string[]) => void;
  onTransferirComAutoAjuste?: (idsDiretos: string[], ajustes: AjusteHorarioSugerido[]) => void;
  transferindo: boolean;
  onDesmarcarConsulta: (id: string) => void;
  onSelecionarTodas: () => void;
  onLimparSelecao: () => void;
  onCancelarModo: () => void;
  totalConsultasElegiveisNoDia: number;
}

/**
 * Barra Flutuante de Transferência Inteligente e Autônoma de Consultas.
 * Oferece sugestões proativas de profissionais por compatibilidade de grade,
 * análise de conflitos em tempo real e auto-ajuste de horários em vagas livres.
 */
export default function BarraTransferenciaAgenda({
  visivel,
  totalSelecionadas,
  consultasSelecionadas,
  medicoOrigemNome,
  medicoOrigemEspecialidade,
  medicoOrigemEspecialidadeIcone,
  medicoOrigemEspecialidadeCor,
  medicosDisponiveis,
  medicoDestinoId,
  onSelecionarMedicoDestino,
  analiseConflitos,
  carregandoAnalise,
  sugestoesCompativeis = [],
  carregandoSugestoes = false,
  onTransferir,
  onTransferirComAutoAjuste,
  transferindo,
  onDesmarcarConsulta,
  onSelecionarTodas,
  onLimparSelecao,
  onCancelarModo,
  totalConsultasElegiveisNoDia,
}: BarraTransferenciaAgendaProps) {
  const [mostrarDetalhesConflitos, setMostrarDetalhesConflitos] = useState(false);
  const [habilitarAutoAjuste, setHabilitarAutoAjuste] = useState(true);
  const [modalConfirmacaoAberto, setModalConfirmacaoAberto] = useState(false);

  // Mapa de sugestões por ID de médico para badges no select
  const mapaSugestoesPorMedico = useMemo(() => {
    const mapa = new Map<string, SugestaoProfissionalDestino>();
    for (const sug of sugestoesCompativeis) {
      mapa.set(sug.doctor.id, sug);
    }
    return mapa;
  }, [sugestoesCompativeis]);

  // Mapeia opções de médicos usando o padrão oficial do Combobox
  const opcoesMedicos = useMemo<ComboboxOption[]>(() => {
    return medicosDisponiveis.map((medico) => renderDoctorOption(medico));
  }, [medicosDisponiveis]);

  // Médico destino selecionado
  const medicoDestinoSelecionado = useMemo(() => {
    return medicosDisponiveis.find((m) => m.id === medicoDestinoId);
  }, [medicosDisponiveis, medicoDestinoId]);

  // Sugestão associada ao médico de destino atualmente selecionado
  const sugestaoDestinoAtual = useMemo(() => {
    if (!medicoDestinoId) return null;
    return mapaSugestoesPorMedico.get(medicoDestinoId) || null;
  }, [medicoDestinoId, mapaSugestoesPorMedico]);

  // Identifica quais IDs são transferíveis sem conflito
  const idsTransferiveisDiretos = useMemo(() => {
    if (!analiseConflitos || !medicoDestinoId) {
      return consultasSelecionadas.map((c) => c.id);
    }
    return analiseConflitos.detalhes
      .filter((item) => !item.temConflito)
      .map((item) => item.idConsulta);
  }, [analiseConflitos, medicoDestinoId, consultasSelecionadas]);

  // Ajustes de horários disponíveis no médico de destino atual
  const ajustesDisponiveis = useMemo(() => {
    return sugestaoDestinoAtual?.ajustesSugeridos || [];
  }, [sugestaoDestinoAtual]);

  const totalConflitos = analiseConflitos?.totalConflitos || 0;
  const totalLivresDiretos = analiseConflitos ? analiseConflitos.totalLivres : totalSelecionadas;
  const totalComAutoAjuste = totalLivresDiretos + ajustesDisponiveis.length;

  if (!visivel) return null;

  const handleExecutarTransferencia = () => {
    if (habilitarAutoAjuste && ajustesDisponiveis.length > 0 && onTransferirComAutoAjuste) {
      onTransferirComAutoAjuste(idsTransferiveisDiretos, ajustesDisponiveis);
    } else {
      if (idsTransferiveisDiretos.length === 0) return;
      onTransferir(idsTransferiveisDiretos);
    }
  };

  const handleDesmarcarConflitantes = () => {
    if (!analiseConflitos) return;
    const idsConflitantes = analiseConflitos.detalhes
      .filter((item) => item.temConflito)
      .map((item) => item.idConsulta);

    for (const id of idsConflitantes) {
      onDesmarcarConsulta(id);
    }
  };

  return (
    <div className="fixed bottom-3 right-0 left-0 md:left-64 z-50 flex justify-center px-4 pointer-events-none transition-all duration-200 animate-in slide-in-from-bottom-5">
      <div className="pointer-events-auto relative w-full max-w-5xl rounded-xl border border-blue-200/90 bg-white/95 backdrop-blur-md shadow-2xl ring-1 ring-slate-900/10 p-3.5 flex flex-col gap-2.5">
        
        {/* Linha Principal de Controle */}
        <div className="flex items-center justify-between gap-3">
          
          {/* LADO ESQUERDO: Identificador de Modo, Origem e Contagem */}
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-xs shrink-0">
              <ArrowRightLeft className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase tracking-wider text-slate-800 shrink-0">
                  Transferência Inteligente
                </span>
                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 font-extrabold text-[10px] px-1.5 py-0.5 rounded-[4px] shrink-0">
                  {totalSelecionadas} {totalSelecionadas === 1 ? 'selecionada' : 'selecionadas'}
                </Badge>

                {/* Ações Rápidas de Seleção */}
                {totalSelecionadas < totalConsultasElegiveisNoDia && totalConsultasElegiveisNoDia > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onSelecionarTodas}
                    className="h-6 px-1.5 text-[10px] font-bold text-blue-700 hover:bg-blue-50 hover:text-blue-800 rounded-md shrink-0"
                    title="Selecionar todas as consultas ativas do dia"
                  >
                    <CheckCheck className="h-3 w-3 mr-1" />
                    Todas ({totalConsultasElegiveisNoDia})
                  </Button>
                )}
                {totalSelecionadas > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onLimparSelecao}
                    className="h-6 px-1.5 text-[10px] font-bold text-slate-500 hover:bg-slate-100 hover:text-slate-700 rounded-md shrink-0"
                    title="Limpar seleção atual"
                  >
                    Limpar
                  </Button>
                )}
              </div>

              <div className="flex items-center gap-1.5 mt-0.5 max-w-[360px]">
                <span className="text-[11px] text-slate-600 font-semibold truncate">
                  {medicoOrigemNome ? `Origem: ${medicoOrigemNome}` : 'Selecione as consultas na grade'}
                </span>
                {medicoOrigemNome && medicoOrigemEspecialidade && (() => {
                  const OrigemIcon = medicoOrigemEspecialidadeIcone && SPECIALTY_ICONS[medicoOrigemEspecialidadeIcone]
                    ? SPECIALTY_ICONS[medicoOrigemEspecialidadeIcone]
                    : Stethoscope;
                  const corOrigem = medicoOrigemEspecialidadeCor || '#8b5cf6';
                  return (
                    <span
                      className="inline-flex items-center gap-1 rounded-[4px] px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider shrink-0 select-none shadow-3xs"
                      style={{
                        backgroundColor: `${corOrigem}15`,
                        color: corOrigem,
                        border: `1px solid ${corOrigem}30`,
                      }}
                    >
                      <OrigemIcon className="h-3 w-3" />
                      {medicoOrigemEspecialidade.toUpperCase()}
                    </span>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* CENTRO: Seletor de Médico de Destino */}
          <div className="w-[300px] shrink-0">
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1">
                <Stethoscope className="h-3 w-3 text-blue-600" />
                Profissional de Destino (Novo Médico)
              </label>
              {carregandoSugestoes && (
                <span className="text-[9px] text-blue-600 font-bold flex items-center gap-1">
                  <Loader2 className="h-2.5 w-2.5 animate-spin" />
                  Calculando...
                </span>
              )}
            </div>
            <Combobox
              options={opcoesMedicos}
              value={medicoDestinoId}
              onChange={onSelecionarMedicoDestino}
              placeholder="Buscar e escolher novo profissional..."
              searchPlaceholder="Digite o nome ou especialidade..."
              emptyText="Nenhum outro profissional encontrado"
              className="h-9 w-full bg-slate-50/90 border-slate-300 text-xs font-semibold rounded-lg focus:bg-white transition-all shadow-2xs"
            />
          </div>

          {/* LADO DIREITO: Botões de Ação */}
          <div className="flex items-center gap-2 shrink-0 pt-3.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onCancelarModo}
              disabled={transferindo}
              className="h-9 px-3 text-xs font-bold text-slate-600 border-slate-300 hover:bg-slate-100 rounded-lg transition-all"
            >
              <X className="h-3.5 w-3.5 mr-1" />
              Cancelar
            </Button>

            <Button
              type="button"
              size="sm"
              onClick={() => setModalConfirmacaoAberto(true)}
              disabled={
                totalSelecionadas === 0 ||
                !medicoDestinoId ||
                carregandoAnalise ||
                transferindo ||
                (habilitarAutoAjuste ? totalComAutoAjuste === 0 : idsTransferiveisDiretos.length === 0)
              }
              className={cn(
                "h-9 px-4 text-xs font-black rounded-lg transition-all shadow-sm flex items-center gap-1.5 shrink-0",
                habilitarAutoAjuste && ajustesDisponiveis.length > 0
                  ? "bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white shadow-indigo-200"
                  : totalConflitos > 0 && totalLivresDiretos > 0
                    ? "bg-amber-600 hover:bg-amber-700 text-white"
                    : "bg-blue-600 hover:bg-blue-700 text-white"
              )}
            >
              {transferindo ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Transferindo...</span>
                </>
              ) : (
                <>
                  <ArrowRightLeft className="h-3.5 w-3.5" />
                  <span>Transferir</span>
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Linha de Análise Preditiva, Status e Opção de Auto-Ajuste */}
        <div className="border-t border-slate-100 pt-2 flex flex-wrap items-center justify-between gap-2">
          
          {/* Status da Análise de Conflitos */}
          <div className="flex-1 flex items-center gap-2 min-w-0 flex-wrap">
            {carregandoAnalise ? (
              <div className="inline-flex items-center gap-1.5 text-xs text-blue-700 bg-blue-50/80 px-2.5 py-1 rounded-lg border border-blue-100 animate-pulse">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />
                <span className="font-semibold text-[11px]">
                  Analisando grade do Dr(a). {medicoDestinoSelecionado?.full_name}...
                </span>
              </div>
            ) : !medicoDestinoId ? (
              <div className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200">
                <Info className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <span>Escolha o profissional de destino para validar compatibilidade e vagas em tempo real.</span>
              </div>
            ) : totalConflitos === 0 ? (
              <div className="inline-flex items-center gap-1.5 text-[11px] text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                <span className="font-bold">
                  Excelente! Todos os {totalSelecionadas} horários estão 100% livres na agenda do Dr(a). {medicoDestinoSelecionado?.full_name}.
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <div className="inline-flex items-center gap-1.5 text-[11px] text-amber-800 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                  <span className="font-bold">
                    {totalConflitos} {totalConflitos === 1 ? 'conflito direto' : 'conflitos diretos'}: {totalLivresDiretos} livres no mesmo horário.
                  </span>
                </div>

                {/* Opção Inteligente de Auto-Ajuste de Vaga */}
                {ajustesDisponiveis.length > 0 && (
                  <label className="inline-flex items-center gap-1.5 text-[11px] font-bold text-indigo-900 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded-lg cursor-pointer hover:bg-indigo-100 transition-colors shadow-2xs">
                    <input
                      type="checkbox"
                      checked={habilitarAutoAjuste}
                      onChange={(e) => setHabilitarAutoAjuste(e.target.checked)}
                      className="rounded text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
                    />
                    <Sparkles className="h-3 w-3 text-indigo-600" />
                    <span>Auto-ajustar {ajustesDisponiveis.length} {ajustesDisponiveis.length === 1 ? 'consulta para vaga livre mais próxima' : 'consultas para vagas livres mais próximas'}</span>
                  </label>
                )}

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setMostrarDetalhesConflitos(!mostrarDetalhesConflitos)}
                  className="h-6 px-2 text-[10px] font-bold text-slate-700 border-slate-200 hover:bg-slate-100 rounded-md"
                >
                  {mostrarDetalhesConflitos ? (
                    <>
                      <ChevronUp className="h-3 w-3 mr-1" />
                      Ocultar Detalhes
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-3 w-3 mr-1" />
                      Ver Detalhes ({totalConflitos})
                    </>
                  )}
                </Button>

                {!habilitarAutoAjuste && totalConflitos > 0 && totalLivresDiretos > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleDesmarcarConflitantes}
                    className="h-6 px-2 text-[10px] font-bold text-amber-700 hover:bg-amber-50 rounded-md underline"
                  >
                    Desmarcar {totalConflitos} conflitantes
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Chips Horizontais dos Horários Selecionados */}
          {consultasSelecionadas.length > 0 && (
            <div className="flex items-center gap-1 overflow-x-auto max-w-md py-0.5 scrollbar-none">
              {consultasSelecionadas.map((c) => {
                const infoConflito = analiseConflitos?.detalhes.find((d) => d.idConsulta === c.id);
                const temConflito = infoConflito?.temConflito;
                const ajuste = ajustesDisponiveis.find((a) => a.idConsultaOrigem === c.id);

                return (
                  <span
                    key={c.id}
                    className={cn(
                      "inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-md border shrink-0 transition-all",
                      temConflito && (!habilitarAutoAjuste || !ajuste)
                        ? "bg-rose-100 text-rose-800 border-rose-300"
                        : temConflito && habilitarAutoAjuste && ajuste
                          ? "bg-indigo-100 text-indigo-800 border-indigo-300"
                          : "bg-slate-100 text-slate-700 border-slate-200"
                    )}
                    title={
                      ajuste && habilitarAutoAjuste
                        ? `Auto-ajustado: ${c.time} ➔ ${ajuste.horarioSugerido} (${c.patient_name || 'Paciente'})`
                        : infoConflito?.motivo || `${c.time} - ${c.patient_name || 'Paciente'}`
                    }
                  >
                    <span>{c.time || 'Horário'}</span>
                    {ajuste && habilitarAutoAjuste && (
                      <span className="text-indigo-700 font-black">➔ {ajuste.horarioSugerido}</span>
                    )}
                    <span className="opacity-75 truncate max-w-[70px]">{c.patient_name || 'Pac.'}</span>
                    <button
                      type="button"
                      onClick={() => onDesmarcarConsulta(c.id)}
                      className="hover:text-rose-600 ml-0.5 p-0.5 rounded-xs"
                      title="Remover da seleção"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {/* Gaveta Expansível de Detalhes de Conflitos e Auto-Ajustes */}
        {mostrarDetalhesConflitos && analiseConflitos && totalConflitos > 0 && (
          <div className="mt-1 p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-2 animate-in fade-in-50 duration-150">
            <div className="flex items-center justify-between">
              <span className="font-extrabold text-slate-800 text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
                Análise Preditiva para Dr(a). {medicoDestinoSelecionado?.full_name}:
              </span>
              <span className="text-[10px] text-slate-500 font-medium">
                {ajustesDisponiveis.length > 0
                  ? `${ajustesDisponiveis.length} horário(s) com sugestão de realocação automática`
                  : 'Horários ocupados na grade do destino'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-1.5 max-h-36 overflow-y-auto">
              {analiseConflitos.detalhes
                .filter((item) => item.temConflito)
                .map((item) => {
                  const ajuste = ajustesDisponiveis.find((a) => a.idConsultaOrigem === item.idConsulta);

                  return (
                    <div
                      key={item.idConsulta}
                      className={cn(
                        "p-2 rounded-lg border text-[11px] flex flex-col gap-0.5 shadow-2xs",
                        ajuste && habilitarAutoAjuste
                          ? "bg-indigo-50/80 border-indigo-200 text-indigo-950"
                          : "bg-rose-50/80 border-rose-200 text-rose-950"
                      )}
                    >
                      <div className="flex items-center justify-between font-bold">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3 text-slate-500" />
                          <span>Original: {item.horario}</span>
                        </span>
                        {ajuste ? (
                          <span className="text-[9px] bg-indigo-200 text-indigo-800 px-1.5 py-0.2 rounded-xs font-black uppercase flex items-center gap-0.5">
                            <Zap className="h-2.5 w-2.5" />
                            Vaga às {ajuste.horarioSugerido}
                          </span>
                        ) : (
                          <span className="text-[9px] bg-rose-200 text-rose-800 px-1 py-0.2 rounded-xs font-black uppercase">
                            Ocupado
                          </span>
                        )}
                      </div>

                      <span className="truncate">
                        Paciente: <strong className="text-slate-900">{item.nomePacienteOrigem}</strong>
                      </span>

                      {ajuste ? (
                        <p className="text-[10px] text-indigo-800 font-semibold leading-tight">
                          ✨ O novo médico tem vaga livre às <strong>{ajuste.horarioSugerido}</strong>. Será auto-ajustado com 1 clique.
                        </p>
                      ) : (
                        <span className="text-rose-700 truncate font-medium text-[10px]">
                          {item.motivo}
                        </span>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </div>

      {/* Modal / Popup de Confirmação de Transferência */}
      <Dialog open={modalConfirmacaoAberto} onOpenChange={setModalConfirmacaoAberto}>
        <DialogContent className="max-w-lg p-0 overflow-hidden rounded-xl border border-slate-200 shadow-2xl bg-white">
          <div className="bg-slate-50 border-b border-slate-200 px-5 py-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-xs shrink-0">
              <ArrowRightLeft className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-slate-900">
                Confirmar Transferência de Consultas
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500 font-medium">
                Revise os detalhes dos profissionais e consultas antes de concluir.
              </DialogDescription>
            </div>
          </div>

          <div className="p-5 space-y-4 max-h-[65vh] overflow-y-auto">
            {/* Card Fluxo: Origem ➔ Destino */}
            <div className="grid grid-cols-[1fr,auto,1fr] items-center gap-3 p-3 rounded-lg border border-slate-200 bg-slate-50/70">
              {/* Origem */}
              <div className="space-y-1 min-w-0">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  Origem (Atual)
                </span>
                <p className="text-xs font-bold text-slate-800 truncate" title={medicoOrigemNome}>
                  {medicoOrigemNome || 'Não selecionado'}
                </p>
                {medicoOrigemEspecialidade && (() => {
                  const OrigemIcon = medicoOrigemEspecialidadeIcone && SPECIALTY_ICONS[medicoOrigemEspecialidadeIcone]
                    ? SPECIALTY_ICONS[medicoOrigemEspecialidadeIcone]
                    : Stethoscope;
                  const cor = medicoOrigemEspecialidadeCor || '#8b5cf6';
                  return (
                    <span
                      className="inline-flex items-center gap-1 rounded-[4px] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                      style={{
                        backgroundColor: `${cor}15`,
                        color: cor,
                        border: `1px solid ${cor}30`,
                      }}
                    >
                      <OrigemIcon className="h-2.5 w-2.5" />
                      {medicoOrigemEspecialidade.toUpperCase()}
                    </span>
                  );
                })()}
              </div>

              {/* Seta */}
              <div className="flex items-center justify-center text-slate-400">
                <ArrowRight className="h-5 w-5 text-blue-600" />
              </div>

              {/* Destino */}
              <div className="space-y-1 min-w-0">
                <span className="text-[10px] font-black uppercase tracking-wider text-blue-600">
                  Destino (Novo)
                </span>
                <p className="text-xs font-bold text-slate-800 truncate" title={medicoDestinoSelecionado?.full_name || ''}>
                  {medicoDestinoSelecionado?.full_name || 'Não selecionado'}
                </p>
                {medicoDestinoSelecionado?.specialty_name && (() => {
                  const DestinoIcon = medicoDestinoSelecionado.specialty_icon && SPECIALTY_ICONS[medicoDestinoSelecionado.specialty_icon]
                    ? SPECIALTY_ICONS[medicoDestinoSelecionado.specialty_icon]
                    : Stethoscope;
                  const cor = medicoDestinoSelecionado.specialty_color || '#8b5cf6';
                  return (
                    <span
                      className="inline-flex items-center gap-1 rounded-[4px] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                      style={{
                        backgroundColor: `${cor}15`,
                        color: cor,
                        border: `1px solid ${cor}30`,
                      }}
                    >
                      <DestinoIcon className="h-2.5 w-2.5" />
                      {medicoDestinoSelecionado.specialty_name.toUpperCase()}
                    </span>
                  );
                })()}
              </div>
            </div>

            {/* Cabeçalho da Lista de Consultas */}
            <div className="flex items-center justify-between text-xs font-bold px-0.5">
              <span className="text-slate-700">Consultas selecionadas para transferência:</span>
              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs px-2 py-0.5 rounded-md font-extrabold">
                {totalSelecionadas} {totalSelecionadas === 1 ? 'consulta' : 'consultas'}
              </Badge>
            </div>

            {/* Lista das Consultas */}
            <div className="border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-100 max-h-52 overflow-y-auto bg-white shadow-2xs">
              {consultasSelecionadas.map((c) => {
                const infoConflito = analiseConflitos?.detalhes.find((d) => d.idConsulta === c.id);
                const temConflito = infoConflito?.temConflito;
                const ajuste = ajustesDisponiveis.find((a) => a.idConsultaOrigem === c.id);

                return (
                  <div key={c.id} className="p-2.5 flex items-center justify-between text-xs hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="font-mono font-bold text-slate-700 text-[11px] bg-slate-100 px-1.5 py-0.5 rounded shrink-0">
                        {c.time || 'Horário'}
                      </span>
                      {ajuste && habilitarAutoAjuste && (
                        <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded flex items-center gap-1 shrink-0">
                          <Zap className="h-2.5 w-2.5" />
                          ➔ {ajuste.horarioSugerido}
                        </span>
                      )}
                      <span className="font-semibold text-slate-800 truncate" title={c.patient_name}>
                        {c.patient_name || 'Paciente não identificado'}
                      </span>
                    </div>

                    <div className="shrink-0 ml-2">
                      {temConflito && (!habilitarAutoAjuste || !ajuste) ? (
                        <span className="inline-flex items-center text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded">
                          Conflito
                        </span>
                      ) : temConflito && habilitarAutoAjuste && ajuste ? (
                        <span className="inline-flex items-center text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded">
                          Auto-ajustado
                        </span>
                      ) : (
                        <span className="inline-flex items-center text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                          Vaga Livre
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Aviso de conflitos se houver */}
            {totalConflitos > 0 && !habilitarAutoAjuste && (
              <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-xs flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Atenção:</strong> {totalConflitos} {totalConflitos === 1 ? 'consulta possui conflito' : 'consultas possuem conflitos'} de horário e {totalConflitos === 1 ? 'não será transferida' : 'não serão transferidas'}.
                </span>
              </div>
            )}
          </div>

          <DialogFooter className="bg-slate-50 border-t border-slate-200 px-5 py-3 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setModalConfirmacaoAberto(false)}
              disabled={transferindo}
              className="h-9 px-4 text-xs font-bold text-slate-600 rounded-lg"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => {
                handleExecutarTransferencia();
                setModalConfirmacaoAberto(false);
              }}
              disabled={
                totalSelecionadas === 0 ||
                !medicoDestinoId ||
                transferindo ||
                (habilitarAutoAjuste ? totalComAutoAjuste === 0 : idsTransferiveisDiretos.length === 0)
              }
              className="h-9 px-5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-sm flex items-center gap-1.5"
            >
              {transferindo ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                  <span>Transferindo...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                  <span>Confirmar Transferência</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
