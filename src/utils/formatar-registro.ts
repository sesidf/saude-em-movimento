/**
 * Utilitário para formatar o registro profissional no padrão oficial brasileiro.
 *
 * Regra geral: SIGLA-REGIÃO NUMERO (ex: CRM-DF 12345, CRFa-5 7243)
 *
 * O banco armazena apenas o código normalizado do conselho (ex: "CREFONO", "CRM")
 * e o número do registro (ex: "7243"). Este utilitário reconstrói o label oficial
 * usando o prefixo completo com a região registrada no sistema (DF ou regional cadastrada).
 */

/**
 * Mapa de conversão: código interno do banco → prefixo oficial de exibição.
 * Formato: "SIGLA-REGIÃO" — o número é sempre concatenado após um espaço.
 *
 * Exemplos de resultado final:
 *   CRM    + 12345  → "CRM-DF 12345"
 *   CREFONO + 7243  → "CRFa-5 7243"
 *   CRP    + 27593  → "CRP-01 27593"
 *   CRF    + 13343  → "CRF-DF 13343"
 */
const PREFIXO_OFICIAL: Record<string, string> = {
  // Medicina — Distrito Federal
  CRM:      'CRM-DF',
  // Odontologia — Distrito Federal
  CRO:      'CRO-DF',
  // Enfermagem — Distrito Federal
  COREN:    'COREN-DF',
  // Educação Física — Região 7
  CREF:     'CREF-7',
  // Psicologia — Região 01
  CRP:      'CRP-01',
  // Fisioterapia/TO — Região 11
  CREFITO:  'CREFITO-11',
  // Nutrição — Região 1
  CRN:      'CRN-1',
  // Fonoaudiologia — Região 5 (sigla oficial: CRFa)
  CREFONO:  'CRFa-5',
  // Farmácia — Distrito Federal
  CRF:      'CRF-DF',
  // Biomedicina — Região 3
  CRBM:     'CRBM-3',
  // Radiologia — Região 12
  CRTR:     'CRTR-12',
  // Medicina Veterinária
  CRMV:     'CRMV-DF',
  // Serviço Social
  CRESS:    'CRESS-8',
  // Genérico — exibe só o número sem prefixo de região
  OUTRO:    '',
};

/**
 * Formata o registro profissional a partir de conselho + número separados.
 * Esta é a função principal usada em toda a interface.
 *
 * @param conselho - Código interno do banco (ex: "CREFONO", "CRM", "NAO_INFORMADO")
 * @param crm      - Número do registro (ex: "7243", "12345")
 * @returns Label no padrão oficial (ex: "CRFa-5 7243", "CRM-DF 12345")
 *
 * @example
 *   formatarRegistroProfissional('CREFONO', '7243')  // → "CRFa-5 7243"
 *   formatarRegistroProfissional('CRM', '12345')     // → "CRM-DF 12345"
 *   formatarRegistroProfissional('CRP', '27593')     // → "CRP-01 27593"
 *   formatarRegistroProfissional('CRF', '13343')     // → "CRF-DF 13343"
 *   formatarRegistroProfissional('NAO_INFORMADO', '00') // → "Não Informado"
 */
export const formatarRegistroProfissional = (
  conselho: string | null | undefined,
  crm: string | null | undefined,
): string => {
  if (!conselho && !crm) return '';

  const c = (conselho ?? '').toUpperCase().trim();
  const n = (crm ?? '').trim();

  // Marcador especial de "sem registro" (NAO_INFORMADO + 00)
  if (
    (c === 'NAO_INFORMADO' || c === 'NAO-INFORMADO') &&
    (n === '00' || n === '')
  ) {
    return 'Não Informado';
  }

  // OUTRO sem prefixo — exibe apenas o número
  if (c === 'OUTRO') return n;

  const prefixo = PREFIXO_OFICIAL[c];
  if (prefixo !== undefined) {
    // Formato oficial: "SIGLA-REGIÃO NUMERO"
    return prefixo ? `${prefixo} ${n}` : n;
  }

  // Fallback para conselhos desconhecidos: "CONSELHO NUMERO"
  return [c, n].filter(Boolean).join(' ');
};

/**
 * Formata o label bruto do banco (ex: "CREFONO 7243") para o padrão oficial.
 * Útil quando se tem apenas o campo `doctor_registration_label` (string única).
 *
 * @param labelBanco - Valor bruto do banco (ex: "CREFONO 7243")
 * @returns Label formatado (ex: "CRFa-5 7243")
 */
const formatarLabelRegistro = (labelBanco: string | null | undefined): string => {
  if (!labelBanco) return '';

  const partes = labelBanco.trim().split(/\s+/);
  const conselho = partes[0] ?? '';
  const numero = partes.slice(1).join(' ');

  return formatarRegistroProfissional(conselho, numero);
};
