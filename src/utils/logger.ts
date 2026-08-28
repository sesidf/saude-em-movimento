/**
 * Utilitário de Logger Seguro em conformidade com a LGPD.
 * Filtra dados sensíveis (CPF, e-mails, tokens) de todas as saídas de console
 * e silencia logs não críticos (log, warn) em ambiente de produção.
 */

const EH_PRODUCAO = import.meta.env.PROD;

/**
 * Expressões regulares para detecção e higienização de dados pessoais (PII).
 */
const PADRAO_CPF = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
const PADRAO_EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
const PADRAO_TOKEN = /ey[A-Za-z0-9-_=]+\.ey[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/g; // Padrão JWT

/**
 * Sanitiza qualquer string substituindo dados sensíveis por máscara.
 */
function sanitizarDado(valor: unknown): any {
  if (typeof valor === 'string') {
    return valor
      .replace(PADRAO_CPF, '***.***.***-**')
      .replace(PADRAO_EMAIL, '******@******.***')
      .replace(PADRAO_TOKEN, '[TOKEN_REMOVIDO]');
  }

  if (valor && typeof valor === 'object') {
    const copia = Array.isArray(valor) ? [...valor] : { ...valor };
    for (const chave in copia) {
      if (Object.prototype.hasOwnProperty.call(copia, chave)) {
        (copia as any)[chave] = sanitizarDado((copia as any)[chave]);
      }
    }
    return copia;
  }

  return valor;
}

/**
 * Logger seguro que mascara PII e gerencia logs por ambiente.
 */
export const Logger = {
  info(mensagem: string, ...parametros: unknown[]): void {
    if (EH_PRODUCAO) return; // Silencia logs gerais em produção
    const paramsSanitizados = parametros.map(sanitizarDado);
    // eslint-disable-next-line no-console
    console.log(`[INFO] ${mensagem}`, ...paramsSanitizados);
  },

  warn(mensagem: string, ...parametros: unknown[]): void {
    if (EH_PRODUCAO) return; // Silencia alertas de desenvolvimento em produção
    const paramsSanitizados = parametros.map(sanitizarDado);
    // eslint-disable-next-line no-console
    console.warn(`[WARN] ${mensagem}`, ...paramsSanitizados);
  },

  error(mensagem: string, erro?: unknown, ...parametros: unknown[]): void {
    // Erros críticos sempre são registrados, mas higienizados
    const erroSanitizado = erro instanceof Error 
      ? new Error(sanitizarDado((erro as any)?.message || erro))
      : sanitizarDado(erro);

    if (erro instanceof Error && erro.stack) {
      (erroSanitizado as Error).stack = sanitizarDado(erro.stack);
    }

    const paramsSanitizados = parametros.map(sanitizarDado);
    // eslint-disable-next-line no-console
    console.error(`[ERROR] ${mensagem}`, erroSanitizado, ...paramsSanitizados);
  }
};
