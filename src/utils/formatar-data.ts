import { format, parse, isValid } from 'date-fns';

/**
 * Faz o parse de uma string no formato DD/MM/AAAA para um objeto Date.
 * Retorna null se for inválida.
 * @param value - Data em formato string
 * @returns Instância de Date ou null
 */
export const parseDateBR = (value: string): Date | null => {
  if (!value) return null;
  const parsed = parse(value, 'dd/MM/yyyy', new Date());
  return isValid(parsed) ? parsed : null;
};

/**
 * Converte uma data no formato string DD/MM/AAAA para o formato de input yyyy-MM-dd.
 * @param value - Data em formato string DD/MM/AAAA
 * @returns Data formatada para input HTML
 */
export const dateBRToInputValue = (value: string): string => {
  const parsed = value ? parseDateBR(value) : null;
  return parsed && isValid(parsed) ? format(parsed, 'yyyy-MM-dd') : '';
};

/**
 * Converte uma data no formato de input yyyy-MM-dd para o formato BR DD/MM/AAAA.
 * @param value - Data em formato yyyy-MM-dd
 * @returns Data formatada em padrão brasileiro
 */
export const inputValueToDateBR = (value: string): string => {
  if (!value) return '';
  const parsed = parse(value, 'yyyy-MM-dd', new Date());
  return isValid(parsed) ? format(parsed, 'dd/MM/yyyy') : '';
};
