import { useState, useEffect, useMemo } from 'react';
import { ArrowRightLeft, Calendar, Loader2, User, AlertCircle, Filter } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { renderDoctorOption } from '@/components/ui/combobox-helpers';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { chamarApiPost, chamarApiGet } from '@/lib/workerApi';
import { buildIdempotencyKey } from '@/lib/idempotency';
import { censorCPF } from '@/utils/masks';
import {
  buscarConsultasParaTransferencia,
  transferirConsultasProfissional,
  ConsultaElegivelTransferencia
} from '@/servicos/agendas';

export interface DoctorOptionModal {
  id: string;
  full_name: string;
  specialty_id?: string | null;
  specialty_name?: string | null;
  crm?: string | null;
}

export interface ModalTransferirConsultasProps {
  aberto: boolean;
  aoFechar: () => void;
  aoSucesso?: (totalTransferidas: number) => void;
  /** ID do profissional de origem pré-selecionado */
  profissionalOrigemIdPadrao?: string;
  /** ID da consulta individual pré-selecionada (caso aberto a partir de uma consulta específica) */
  consultaIdPadrao?: string;
  /** Data padrão pré-selecionada (formato YYYY-MM-DD) */
  dataPadrao?: string;
}

/**
 * Modal de transferência de consultas (em lote ou individual) entre profissionais de saúde.
 */
export default function ModalTransferirConsultas({
  aberto,
  aoFechar,
  aoSucesso,
  profissionalOrigemIdPadrao,
  consultaIdPadrao,
  dataPadrao,
}: ModalTransferirConsultasProps) {
  const [profissionais, setProfissionais] = useState<DoctorOptionModal[]>([]);
  const [carregandoProfissionais, setCarregandoProfissionais] = useState(false);

  const [doctorOrigemId, setDoctorOrigemId] = useState<string>('');
  const [doctorDestinoId, setDoctorDestinoId] = useState<string>('');

  const [filtroPeriodo, setFiltroPeriodo] = useState<'hoje' | 'amanha' | 'semana' | 'todas' | 'personalizado'>('todas');
  const [dataInicio, setDataInicio] = useState<string>('');
  const [dataFim, setDataFim] = useState<string>('');

  const [consultas, setConsultas] = useState<ConsultaElegivelTransferencia[]>([]);
  const [idsSelecionados, setIdsSelecionados] = useState<string[]>([]);
  const [carregandoConsultas, setCarregandoConsultas] = useState(false);

  const [motivo, setMotivo] = useState<string>('');
  const [transferindo, setTransferindo] = useState(false);

  // Reseta ou inicializa campos ao abrir o modal
  useEffect(() => {
    if (aberto) {
      carregarProfissionais();
      if (profissionalOrigemIdPadrao) {
        setDoctorOrigemId(profissionalOrigemIdPadrao);
      } else {
        setDoctorOrigemId('');
      }
      setDoctorDestinoId('');
      setMotivo('');

      if (dataPadrao) {
        setFiltroPeriodo('personalizado');
        setDataInicio(dataPadrao);
        setDataFim(dataPadrao);
      } else {
        setFiltroPeriodo('todas');
        setDataInicio('');
        setDataFim('');
      }
    }
  }, [aberto, profissionalOrigemIdPadrao, dataPadrao]);

  // Carrega catálogo de profissionais ativos
  const carregarProfissionais = async () => {
    setCarregandoProfissionais(true);
    try {
      const { data, error } = await chamarApiPost('/api/rpc/list_doctors_catalog', {
        p_institution_id: null,
      });

      if (error) {
        console.error('[ModalTransferirConsultas] Erro ao carregar profissionais:', error);
        toast.error('Erro ao carregar lista de profissionais.');
        return;
      }

      const lista: DoctorOptionModal[] = (data || []).map((doc: any) => ({
        id: doc.id,
        full_name: doc.full_name || 'Sem Nome',
        specialty_id: doc.specialty_id || null,
        specialty_name: doc.specialty_name || null,
        crm: doc.crm || null,
      }));

      setProfissionais(lista);
    } catch (err) {
      console.error('[ModalTransferirConsultas] Exceção profissionais:', err);
    } finally {
      setCarregandoProfissionais(false);
    }
  };

  // Ajusta intervalo de datas com base no filtro selecionado
  useEffect(() => {
    const hoje = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const formatarDateIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    if (filtroPeriodo === 'hoje') {
      const str = formatarDateIso(hoje);
      setDataInicio(str);
      setDataFim(str);
    } else if (filtroPeriodo === 'amanha') {
      const amanha = new Date(hoje);
      amanha.setDate(amanha.getDate() + 1);
      const str = formatarDateIso(amanha);
      setDataInicio(str);
      setDataFim(str);
    } else if (filtroPeriodo === 'semana') {
      const inicio = new Date(hoje);
      const fim = new Date(hoje);
      fim.setDate(fim.getDate() + 7);
      setDataInicio(formatarDateIso(inicio));
      setDataFim(formatarDateIso(fim));
    } else if (filtroPeriodo === 'todas') {
      setDataInicio('');
      setDataFim('');
    }
  }, [filtroPeriodo]);

  // Carrega consultas elegíveis quando o profissional de origem ou o período mudar
  useEffect(() => {
    if (aberto && doctorOrigemId) {
      carregarConsultasElegiveis();
    } else {
      setConsultas([]);
      setIdsSelecionados([]);
    }
  }, [aberto, doctorOrigemId, dataInicio, dataFim]);

  const carregarConsultasElegiveis = async () => {
    setCarregandoConsultas(true);
    try {
      let isoInicio: string | null = null;
      let isoFim: string | null = null;

      if (dataInicio) {
        isoInicio = `${dataInicio}T00:00:00.000Z`;
      }
      if (dataFim) {
        isoFim = `${dataFim}T23:59:59.999Z`;
      }

      const lista = await buscarConsultasParaTransferencia(doctorOrigemId, isoInicio, isoFim);
      setConsultas(lista);

      // Se passou uma consultaIdPadrao, pré-seleciona ela; senão seleciona todas por padrão
      if (consultaIdPadrao && lista.some((c) => c.id === consultaIdPadrao)) {
        setIdsSelecionados([consultaIdPadrao]);
      } else {
        setIdsSelecionados(lista.map((c) => c.id));
      }
    } catch (err) {
      console.error('[ModalTransferirConsultas] Erro ao carregar consultas:', err);
      toast.error('Não foi possível carregar as consultas para transferência.');
    } finally {
      setCarregandoConsultas(false);
    }
  };

  // Profissional de Origem selecionado
  const profissionalOrigem = useMemo(() => {
    return profissionais.find((p) => p.id === doctorOrigemId) || null;
  }, [profissionais, doctorOrigemId]);

  // Opções para Profissional de Destino (exclui a origem e ordena por mesma especialidade)
  const opcoesDestino = useMemo(() => {
    return profissionais
      .filter((p) => p.id !== doctorOrigemId)
      .sort((a, b) => {
        const aMesmaEspecialidade = profissionalOrigem && a.specialty_id === profissionalOrigem.specialty_id;
        const bMesmaEspecialidade = profissionalOrigem && b.specialty_id === profissionalOrigem.specialty_id;
        if (aMesmaEspecialidade && !bMesmaEspecialidade) return -1;
        if (!aMesmaEspecialidade && bMesmaEspecialidade) return 1;
        return a.full_name.localeCompare(b.full_name);
      });
  }, [profissionais, doctorOrigemId, profissionalOrigem]);

  // Manipuladores de seleção
  const alternarSelecionarTodas = () => {
    if (idsSelecionados.length === consultas.length) {
      setIdsSelecionados([]);
    } else {
      setIdsSelecionados(consultas.map((c) => c.id));
    }
  };

  const alternarSelecaoConsulta = (id: string) => {
    setIdsSelecionados((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Submissão da transferência
  const executarTransferencia = async () => {
    if (!doctorOrigemId || !doctorDestinoId) {
      toast.error('Selecione o profissional de origem e o profissional de destino.');
      return;
    }

    if (idsSelecionados.length === 0) {
      toast.error('Selecione ao menos uma consulta para transferir.');
      return;
    }

    setTransferindo(true);
    try {
      const idempotencyKey = await buildIdempotencyKey('transfer_doctor_appts', {
        origem: doctorOrigemId,
        destino: doctorDestinoId,
        count: idsSelecionados.length,
        timestamp: Date.now(),
      });

      let isoInicio: string | null = null;
      let isoFim: string | null = null;
      if (dataInicio) isoInicio = `${dataInicio}T00:00:00.000Z`;
      if (dataFim) isoFim = `${dataFim}T23:59:59.999Z`;

      const resultado = await transferirConsultasProfissional({
        doctorOrigemId,
        doctorDestinoId,
        appointmentIds: idsSelecionados.length === consultas.length ? undefined : idsSelecionados,
        dataInicio: isoInicio,
        dataFim: isoFim,
        motivo: motivo.trim() || 'Transferência realizada via painel de agenda',
        idempotencyKey,
      });

      const total = resultado.transferred_count || idsSelecionados.length;
      toast.success(`${total} consulta(s) transferida(s) com sucesso!`);

      if (aoSucesso) {
        aoSucesso(total);
      }
      aoFechar();
    } catch (err: any) {
      console.error('[ModalTransferirConsultas] Erro ao transferir:', err);
      toast.error(err.message || 'Ocorreu um erro ao transferir as consultas.');
    } finally {
      setTransferindo(false);
    }
  };

  // Formatação de data/hora para exibição
  const formatarDataHora = (isoStr: string) => {
    if (!isoStr) return '-';
    try {
      const d = new Date(isoStr);
      return new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(d);
    } catch {
      return isoStr;
    }
  };

  return (
    <Dialog open={aberto} onOpenChange={(val) => !val && aoFechar()}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden rounded-2xl">
        {/* Cabeçalho */}
        <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-slate-800 text-white p-5 border-b border-blue-600/30">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/10 rounded-xl backdrop-blur-xs text-blue-200">
              <ArrowRightLeft className="w-6 h-6" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold text-white tracking-tight">
                Transferir Agenda / Consultas
              </DialogTitle>
              <DialogDescription className="text-blue-100/90 text-sm mt-0.5">
                Remaneje consultas agendadas de um profissional para outro devido a ausências ou reorganizações de escala.
              </DialogDescription>
            </div>
          </div>
        </div>

        {/* Corpo principal do Modal */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/50">
          {/* Seção 1: Seleção de Profissionais */}
          <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs space-y-4">
            <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
              <User className="w-4 h-4 text-blue-600" />
              Profissionais Envolvidos
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Profissional Origem */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600">
                  Profissional Origem (Sairá de):
                </label>
                <Combobox
                  options={profissionais.map(renderDoctorOption)}
                  value={doctorOrigemId}
                  onChange={(val) => setDoctorOrigemId(val)}
                  placeholder="Selecione o profissional origem..."
                  emptyText="Nenhum profissional encontrado"
                  isLoading={carregandoProfissionais}
                />
              </div>

              {/* Profissional Destino */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600">
                  Profissional Destino (Receberá):
                </label>
                <Combobox
                  options={opcoesDestino.map(renderDoctorOption)}
                  value={doctorDestinoId}
                  onChange={(val) => setDoctorDestinoId(val)}
                  placeholder="Selecione o profissional destino..."
                  emptyText="Nenhum profissional destino disponível"
                  disabled={!doctorOrigemId}
                />
              </div>
            </div>
          </div>

          {/* Seção 2: Filtro de Período */}
          {doctorOrigemId && (
            <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                  <Filter className="w-4 h-4 text-blue-600" />
                  Filtrar Consultas Por Período
                </h3>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant={filtroPeriodo === 'todas' ? 'secondary' : 'ghost'}
                    size="sm"
                    className="h-7 text-xs font-medium rounded-lg"
                    onClick={() => setFiltroPeriodo('todas')}
                  >
                    Todas
                  </Button>
                  <Button
                    variant={filtroPeriodo === 'hoje' ? 'secondary' : 'ghost'}
                    size="sm"
                    className="h-7 text-xs font-medium rounded-lg"
                    onClick={() => setFiltroPeriodo('hoje')}
                  >
                    Hoje
                  </Button>
                  <Button
                    variant={filtroPeriodo === 'amanha' ? 'secondary' : 'ghost'}
                    size="sm"
                    className="h-7 text-xs font-medium rounded-lg"
                    onClick={() => setFiltroPeriodo('amanha')}
                  >
                    Amanhã
                  </Button>
                  <Button
                    variant={filtroPeriodo === 'semana' ? 'secondary' : 'ghost'}
                    size="sm"
                    className="h-7 text-xs font-medium rounded-lg"
                    onClick={() => setFiltroPeriodo('semana')}
                  >
                    Próx. 7 Dias
                  </Button>
                </div>
              </div>

              {/* Datas customizadas */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="text-[11px] font-medium text-slate-500 mb-1 block">
                    Data Inicial (opcional):
                  </label>
                  <Input
                    type="date"
                    value={dataInicio}
                    onChange={(e) => {
                      setFiltroPeriodo('personalizado');
                      setDataInicio(e.target.value);
                    }}
                    className="h-8 text-xs rounded-lg"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-slate-500 mb-1 block">
                    Data Final (opcional):
                  </label>
                  <Input
                    type="date"
                    value={dataFim}
                    onChange={(e) => {
                      setFiltroPeriodo('personalizado');
                      setDataFim(e.target.value);
                    }}
                    className="h-8 text-xs rounded-lg"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Seção 3: Lista de Consultas Encontradas */}
          {doctorOrigemId && (
            <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-blue-600" />
                  <h3 className="text-sm font-semibold text-slate-800">
                    Consultas Elegíveis ({consultas.length})
                  </h3>
                  {carregandoConsultas && <Loader2 className="w-4 h-4 animate-spin text-blue-600" />}
                </div>

                {consultas.length > 0 && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={alternarSelecionarTodas}
                      className="h-7 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                    >
                      {idsSelecionados.length === consultas.length
                        ? 'Desmarcar Todas'
                        : `Selecionar Todas (${consultas.length})`}
                    </Button>
                  </div>
                )}
              </div>

              {/* Tabela / Lista de Consultas */}
              {carregandoConsultas ? (
                <div className="py-8 text-center text-slate-500 text-xs flex flex-col items-center gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                  <span>Carregando consultas da agenda...</span>
                </div>
              ) : consultas.length === 0 ? (
                <div className="py-8 text-center text-slate-500 text-xs bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                  <AlertCircle className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                  <p className="font-semibold text-slate-700">Nenhuma consulta pendente encontrada</p>
                  <p className="text-slate-500 mt-0.5">
                    Não existem consultas com status agendado ou confirmado para este profissional no período selecionado.
                  </p>
                </div>
              ) : (
                <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                  {consultas.map((c) => {
                    const selecionado = idsSelecionados.includes(c.id);
                    return (
                      <div
                        key={c.id}
                        onClick={() => alternarSelecaoConsulta(c.id)}
                        className={`flex items-center justify-between p-2.5 rounded-lg border transition-all cursor-pointer select-none text-xs ${
                          selecionado
                            ? 'bg-blue-50/70 border-blue-200 text-slate-900 shadow-2xs'
                            : 'bg-white border-slate-200/70 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Checkbox
                            checked={selecionado}
                            onCheckedChange={() => alternarSelecaoConsulta(c.id)}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <div>
                            <p className="font-semibold text-slate-800">{c.patient_name}</p>
                            <p className="text-[11px] text-slate-500">
                              {c.patient_cpf ? `CPF: ${censorCPF(c.patient_cpf)} • ` : ''}
                              {formatarDataHora(c.appointment_date)}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {c.specialty_name && (
                            <Badge variant="outline" className="bg-slate-100 text-slate-700 text-[10px] font-medium border-slate-200">
                              {c.specialty_name}
                            </Badge>
                          )}
                          <Badge variant="outline" className="bg-blue-50 text-blue-700 text-[10px] font-semibold border-blue-200">
                            {c.status}
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Seção 4: Motivo da Transferência */}
          {doctorOrigemId && (
            <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs space-y-2">
              <label className="text-xs font-semibold text-slate-700 block">
                Motivo da Transferência (Opcional):
              </label>
              <Textarea
                placeholder="Exemplo: Profissional ausente; Remanejamento de escala presencial."
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={2}
                className="text-xs rounded-lg resize-none"
              />
            </div>
          )}
        </div>

        {/* Rodapé / Ações */}
        <div className="bg-slate-100/80 p-4 border-t border-slate-200 flex items-center justify-between gap-3">
          <div className="text-xs text-slate-600">
            {idsSelecionados.length > 0 ? (
              <span className="font-semibold text-blue-700">
                {idsSelecionados.length} consulta(s) selecionada(s)
              </span>
            ) : (
              <span>Nenhuma consulta selecionada</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={aoFechar}
              disabled={transferindo}
              className="rounded-xl h-9 text-xs"
            >
              Cancelar
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={executarTransferencia}
              disabled={
                transferindo ||
                !doctorOrigemId ||
                !doctorDestinoId ||
                idsSelecionados.length === 0
              }
              className="rounded-xl h-9 text-xs font-bold bg-blue-700 hover:bg-blue-800 text-white shadow-xs"
            >
              {transferindo ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                  Transferindo...
                </>
              ) : (
                <>
                  <ArrowRightLeft className="w-3.5 h-3.5 mr-1.5" />
                  Confirmar Transferência ({idsSelecionados.length})
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
