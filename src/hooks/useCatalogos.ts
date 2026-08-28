import { useQuery } from '@tanstack/react-query';
import { chamarApiPost } from '@/lib/workerApi';
import { DoctorOption, InstitutionOption, SpecialtyOption } from '@/types/appointments';

// Configuração padrão de cache para dados de catálogos quase-estáticos:
// 10 minutos de frescor (staleTime) e 60 minutos em memória (gcTime)
const TEMPO_CACHE_FRESCO = 1000 * 60 * 10; // 10 minutos
const TEMPO_CACHE_MEMORIA = 1000 * 60 * 60; // 60 minutos

/**
 * Hook global cacheado para carregar catálogo de instituições.
 * Compartilha o mesmo cache entre todas as páginas e modais da aplicação.
 * @param options.includeInactive - Se deve incluir instituições inativas
 * @param options.onlyWithRecords - Se deve filtrar apenas instituições que possuem algum cadastro
 */
export function useInstitutionsCatalog(options?: { includeInactive?: boolean; onlyWithRecords?: boolean }) {
  const includeInactive = options?.includeInactive ?? false;
  const onlyWithRecords = options?.onlyWithRecords ?? false;

  return useQuery({
    queryKey: ['catalog', 'institutions', includeInactive, onlyWithRecords],
    queryFn: async (): Promise<InstitutionOption[]> => {
      const { data, error } = await chamarApiPost<InstitutionOption[]>('/api/catalog/institutions', {
        include_inactive: includeInactive,
        only_with_records: onlyWithRecords
      });

      if (error) {
        // eslint-disable-next-line no-console
        console.error('[useInstitutionsCatalog] Erro ao carregar instituições:', error);
        throw new Error(error);
      }

      return Array.isArray(data) ? data : [];
    },
    staleTime: TEMPO_CACHE_FRESCO,
    gcTime: TEMPO_CACHE_MEMORIA,
    refetchOnWindowFocus: false,
  });
}

/**
 * Hook global cacheado para carregar catálogo de profissionais / médicos.
 * Compartilha o mesmo cache entre todas as páginas e modais da aplicação.
 */
export function useDoctorsCatalog(options?: { includeInactive?: boolean }) {
  const includeInactive = options?.includeInactive ?? false;

  return useQuery({
    queryKey: ['catalog', 'doctors', includeInactive],
    queryFn: async (): Promise<DoctorOption[]> => {
      const { data, error } = await chamarApiPost<DoctorOption[]>('/api/catalog/doctors', {
        include_inactive: includeInactive,
      });

      if (error) {
        // eslint-disable-next-line no-console
        console.error('[useDoctorsCatalog] Erro ao carregar profissionais:', error);
        throw new Error(error);
      }

      return Array.isArray(data) ? data : [];
    },
    staleTime: TEMPO_CACHE_FRESCO,
    gcTime: TEMPO_CACHE_MEMORIA,
    refetchOnWindowFocus: false,
  });
}

/**
 * Hook global cacheado para carregar catálogo de especialidades.
 * Compartilha o mesmo cache entre todas as páginas e modais da aplicação.
 */
export function useSpecialtiesCatalog(options?: { includeInactive?: boolean }) {
  const includeInactive = options?.includeInactive ?? false;

  return useQuery({
    queryKey: ['catalog', 'specialties', includeInactive],
    queryFn: async (): Promise<SpecialtyOption[]> => {
      const { data, error } = await chamarApiPost<SpecialtyOption[]>('/api/catalog/specialties', {
        include_inactive: includeInactive,
      });

      if (error) {
        // eslint-disable-next-line no-console
        console.error('[useSpecialtiesCatalog] Erro ao carregar especialidades:', error);
        throw new Error(error);
      }

      return Array.isArray(data) ? data : [];
    },
    staleTime: TEMPO_CACHE_FRESCO,
    gcTime: TEMPO_CACHE_MEMORIA,
    refetchOnWindowFocus: false,
  });
}
