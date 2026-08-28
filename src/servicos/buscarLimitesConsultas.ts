import { format, isValid } from 'date-fns';
import { chamarApiPost } from '@/lib/workerApi';

interface LimitesDatasConsulta {
  antiga: string;  // dd/MM/yyyy
  recente: string; // dd/MM/yyyy
}

/**
 * Busca a data da primeira e última consulta.
 * @returns Limites de data formatados em dd/MM/yyyy, ou null se não houver dados
 */
export const buscarLimitesConsultas = async (): Promise<LimitesDatasConsulta | null> => {
  const { data, error } = await chamarApiPost<{ first_date: string | null; last_date: string | null }>('/api/appointments/date_range');

  if (error) {
    console.error('[buscarLimitesConsultas] Erro ao buscar limites de data:', error);
    return null;
  }

  const payload = data;

  if (!payload?.first_date || !payload?.last_date) return null;

  const firstDate = new Date(payload.first_date);
  const lastDate = new Date(payload.last_date);

  if (!isValid(firstDate) || !isValid(lastDate)) return null;

  return {
    antiga: format(firstDate, 'dd/MM/yyyy'),
    recente: format(lastDate, 'dd/MM/yyyy'),
  };
};
