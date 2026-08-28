/**
 * Utilitário centralizado para passar intenções de navegação entre páginas de forma SEGURA.
 *
 * Usa EXCLUSIVAMENTE o estado interno do React Router (location.state),
 * que fica SOMENTE NA MEMÓRIA da sessão JavaScript:
 * - Nunca é gravado em disco, localStorage ou sessionStorage
 * - Não aparece na URL (sem parâmetros visíveis)
 * - Não é visível no DevTools de Storage/Network
 * - Desaparece automaticamente ao fechar a aba ou recarregar a página
 * - Não pode ser acessado por scripts externos (isolado do escopo global)
 *
 * REGRA: Toda navegação com payload entre páginas DEVE usar este módulo.
 * Nunca passe dados via URL params, sessionStorage ou window.history diretamente.
 *
 * @example — Página de origem
 *   import { criarEstadoNavegacao } from '@/lib/intencaoNavegacao';
 *   navigate('/patients', { state: criarEstadoNavegacao({ buscarPaciente: 'João' }) });
 *
 * @example — Página de destino
 *   import { extrairIntencaoNavegacao } from '@/lib/intencaoNavegacao';
 *   const intencao = extrairIntencaoNavegacao(location.state);
 */

/** Chave interna usada no location.state para isolar a intenção do restante do state */
const CHAVE_ESTADO = '__sms_intencao';

// ─────────────────────────────────────────────────────────────────────────────
// Interface principal — adicione novos campos aqui conforme necessário
// ─────────────────────────────────────────────────────────────────────────────

export interface IntencaoNavegacao {
  // ── Consultas (Appointments) ──────────────────────────────────────────────

  /** ID do agendamento a ser reagendado */
  reagendar?: string;

  /** ID do agendamento para iniciar o atendimento */
  iniciarAtendimento?: string;

  /** Pular a confirmação e abrir o prontuário clínico direto */
  abrirProntuarioDireto?: boolean;

  /** ID do agendamento a ser destacado/scrollado na lista */
  focarAgendamento?: string;

  /** Especialidade associada ao agendamento, para evitar exibir consultas de outras especialidades do mesmo paciente */
  focarEspecialidade?: string;

  /** Abrir modal de novo agendamento */
  abrirNovoAgendamento?: boolean;

  /** ID do paciente pré-selecionado no formulário de agendamento */
  pacienteId?: string;

  /** ID do médico pré-selecionado no formulário de agendamento */
  medicoId?: string;

  /** Data de agendamento pré-selecionada (YYYY-MM-DD) */
  dataAgendamento?: string;

  /** Horário pré-selecionado (ISO timestamp) */
  slotInicio?: string;

  /** ID da instituição pré-selecionada no formulário de agendamento */
  instituicaoId?: string;

  /** Ignora a restrição de consulta única por especialidade (superadmin) */
  override?: boolean;

  /** Retorna para a aba Agenda ao invés de limpar a URL e ficar em Consultas */
  retornarParaAgenda?: boolean;

  // ── Pacientes ─────────────────────────────────────────────────────────────

  /** Termo de busca a pré-popular no campo de busca da tela de Pacientes */
  buscarPaciente?: string;

  /** Abrir modal de novo paciente automaticamente */
  abrirNovoPaciente?: boolean;

  // ── Controle interno ──────────────────────────────────────────────────────

  /**
   * Chave de unicidade para forçar re-processamento da intenção mesmo quando
   * a página de destino já estava montada. Use Date.now() como valor.
   */
  chaveUnica?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Funções públicas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cria o objeto de state do React Router com a intenção encapsulada.
 * Passe o retorno como `state` no navigate():
 *   navigate('/rota', { state: criarEstadoNavegacao({ ... }) });
 *
 * @param intencao - Objeto com a intenção de navegação
 * @returns Objeto pronto para passar como `state` no navigate()
 */
export const criarEstadoNavegacao = (intencao: IntencaoNavegacao): Record<string, unknown> => ({
  [CHAVE_ESTADO]: {
    ...intencao,
    chaveUnica: intencao.chaveUnica ?? Date.now(),
  },
});

/**
 * Extrai e valida a intenção de navegação do location.state do React Router.
 * Seguro: retorna null se o state não existir ou não tiver o formato esperado.
 * Nunca lança exceção.
 *
 * @param state - O location.state obtido via useLocation()
 * @returns A intenção de navegação tipada, ou null
 */
export const extrairIntencaoNavegacao = (state: unknown): IntencaoNavegacao | null => {
  if (!state || typeof state !== 'object') return null;
  const intencao = (state as Record<string, unknown>)[CHAVE_ESTADO];
  if (!intencao || typeof intencao !== 'object') return null;
  return intencao as IntencaoNavegacao;
};
