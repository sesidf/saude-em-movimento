import { api, setStoredToken, getStoredToken } from '@/servicos/api';

export interface ResultadoWorker<T = Record<string, unknown>> {
  data: T | null;
  error: string | null;
}

export function clearApiCache(_prefix?: string): void {
  // no-op
}

export async function chamarApiPost<T = Record<string, unknown>>(
  rota: string,
  corpo: unknown = {}
): Promise<ResultadoWorker<T>> {
  try {
    const cleanRoute = rota.startsWith('/api') ? rota.substring(4) : rota;
    const res = await api.post<T>(cleanRoute, corpo);
    return { data: res, error: null };
  } catch (err: any) {
    return { data: null, error: err.message || 'Erro de rede.' };
  }
}

export async function chamarApiGet<T = Record<string, unknown>>(
  rota: string
): Promise<ResultadoWorker<T>> {
  try {
    const cleanRoute = rota.startsWith('/api') ? rota.substring(4) : rota;
    const res = await api.get<T>(cleanRoute);
    return { data: res, error: null };
  } catch (err: any) {
    return { data: null, error: err.message || 'Erro de rede.' };
  }
}

export async function chamarApiPostComRetry<T = Record<string, unknown>>(
  rota: string,
  corpo: unknown = {}
): Promise<ResultadoWorker<T>> {
  return chamarApiPost<T>(rota, corpo);
}
