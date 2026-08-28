import { Logger } from '@/utils/logger';

/**
 * Obtém o token JWT do localStorage (nossa nova solução de sessão).
 * @returns Token de acesso ou string vazia
 */
async function obterToken(): Promise<string> {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('medco_access_token') || '';
  }
  return '';
}

/**
 * Resultado padrão de uma chamada ao Cloudflare Worker API.
 */

// Cache em memória para deduplicação de requisições repetitivas no Frontend
const requestCache = new Map<string, { promise: Promise<any>, timestamp: number }>();
const CACHE_TTL = 5000; // 5 segundos de debounce para requisições idênticas

export interface ResultadoWorker<T = Record<string, unknown>> {
  data: T | null;
  error: string | null;
}

/**
 * Faz uma chamada POST para um endpoint do Cloudflare Worker com autenticação.
 * Inclui mecanismo de retry com backoff exponencial em caso de falha de conexão/rede física.
 * @param rota - Caminho relativo da API (ex: '/api/admin-create-user')
 * @param corpo - Payload da requisição
 * @param tentativasMaximas - Limite máximo de retentativas para erros de rede (padrão: 3)
 * @returns Objeto com data e error
 */
export async function chamarApiPost<T = Record<string, unknown>>(
  rota: string,
  corpo: unknown = {},
  tentativasMaximas = 3
): Promise<ResultadoWorker<T>> {
  
  // Deduplicação de chamadas idênticas
  const cacheKey = rota + JSON.stringify(corpo);
  const now = Date.now();
  const cached = requestCache.get(cacheKey);
  
  if (cached && now - cached.timestamp < CACHE_TTL) {
    return cached.promise;
  }

  const executeFetch = async () => {

  const token = await obterToken();
  if (!token) {
    return { data: null, error: 'Sessão expirada. Faça login novamente.' };
  }

  let tentativa = 0;
  let tempoEspera = 1000; // Começa aguardando 1 segundo

  while (true) {
    tentativa++;
    try {
      const resposta = await fetch(rota, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(corpo),
      });

      const dados = await resposta.json().catch(() => ({})) as Record<string, unknown>;

      if (!resposta.ok) {
        let mensagem = `Falha na requisição (${resposta.status})`;
        if (typeof dados.error === 'string') mensagem = dados.error;
        else if (dados.error) mensagem = JSON.stringify(dados.error);
        else if (typeof dados.message === 'string') mensagem = dados.message;
        else if (typeof dados.details === 'string') mensagem = dados.details;
        return { data: null, error: mensagem };
      }

      return { data: dados as T, error: null };
    } catch (erro) {
      const erroMensagem = erro instanceof Error ? (erro as any)?.message || erro : 'Erro de rede.';
      
      // Verifica se é uma falha de conexão física/DNS (Failed to fetch)
      const ehErroConexao = erroMensagem.includes('Failed to fetch') || 
                            erroMensagem.includes('network') || 
                            erroMensagem.includes('fetch');

      if (ehErroConexao && tentativa < tentativasMaximas) {
        Logger.warn(
          `Falha de conexão na rota ${rota} (Tentativa ${tentativa}/${tentativasMaximas}). Re-tentando em ${tempoEspera}ms...`
        );
        await new Promise((resolver) => setTimeout(resolver, tempoEspera));
        tempoEspera *= 2; // Dobra o tempo de espera (Backoff exponencial: 1s, 2s, 4s...)
        continue;
      }

      // Se estourar o limite de tentativas ou for outro tipo de erro de parsing/código
      return {
        data: null,
        error: ehErroConexao
          ? 'Instabilidade na rede detectada. Verifique sua conexão com a internet.'
          : erroMensagem,
      };
    }

    }
  };

  const fetchPromise = executeFetch();
  requestCache.set(cacheKey, { promise: fetchPromise, timestamp: now });
  
  // Limpeza do cache
  fetchPromise.finally(() => {
    setTimeout(() => {
      requestCache.delete(cacheKey);
    }, CACHE_TTL);
  });

  return fetchPromise;

}

/**
 * Faz uma chamada POST para o Cloudflare Worker com retry automático em caso de token inválido.
 * @param rota - Caminho relativo da API
 * @param corpo - Payload da requisição
 * @returns Objeto com data e error
 */
export async function chamarApiPostComRetry<T = Record<string, unknown>>(
  rota: string,
  corpo: unknown,
): Promise<ResultadoWorker<T>> {
  const resultado = await chamarApiPost<T>(rota, corpo);

  if (!resultado.error) return resultado;

  // Em uma implementação real com refresh tokens, faríamos o refresh aqui
  if (/invalid authentication token|sessão expirada/i.test(resultado.error)) {
    // try refresh token logic here if implemented
    return chamarApiPost<T>(rota, corpo);
  }

  return resultado;
}

export async function chamarApiGet<T = Record<string, unknown>>(
  rota: string,
  tentativasMaximas = 3
): Promise<ResultadoWorker<T>> {
  const token = await obterToken();
  if (!token) {
    return { data: null, error: 'Sessão expirada. Faça login novamente.' };
  }

  let tentativa = 0;
  let tempoEspera = 1000;

  while (true) {
    tentativa++;
    try {
      const resposta = await fetch(rota, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      const dados = await resposta.json().catch(() => ({})) as Record<string, unknown>;

      if (!resposta.ok) {
        let mensagem = `Falha na requisição (${resposta.status})`;
        if (typeof dados.error === 'string') mensagem = dados.error;
        else if (dados.error) mensagem = JSON.stringify(dados.error);
        else if (typeof dados.message === 'string') mensagem = dados.message;
        else if (typeof dados.details === 'string') mensagem = dados.details;
        return { data: null, error: mensagem };
      }

      return { data: dados as T, error: null };
    } catch (erro) {
      const erroMensagem = erro instanceof Error ? (erro as any)?.message || erro : 'Erro de rede.';
      const ehErroConexao = erroMensagem.includes('Failed to fetch') || 
                            erroMensagem.includes('network') || 
                            erroMensagem.includes('fetch');

      if (ehErroConexao && tentativa < tentativasMaximas) {
        Logger.warn(`Falha de conexão na rota ${rota}. Re-tentando em ${tempoEspera}ms...`);
        await new Promise((resolver) => setTimeout(resolver, tempoEspera));
        tempoEspera *= 2;
        continue;
      }

      return {
        data: null,
        error: ehErroConexao
          ? 'Instabilidade na rede detectada. Verifique sua conexão com a internet.'
          : erroMensagem,
      };
    }
  }
}

