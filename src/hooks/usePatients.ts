import { useQuery } from '@tanstack/react-query';
import type { Patient } from '@/types/patient';
import { useAuth } from '@/contexts/AuthContext';
import { chamarApiPost } from '@/lib/workerApi';

export const usePatients = (searchTerm: string) => {
  const { hasPermission, institutionId } = useAuth();
  
  const canReadPatients = hasPermission('patients', 'read', institutionId) || hasPermission('patients', 'update', institutionId);

  return useQuery({
    queryKey: ['patients', institutionId, searchTerm],
    queryFn: async () => {
      if (!canReadPatients) return [];

      const result = await chamarApiPost<Patient[]>('/api/patients', {
        search: searchTerm.trim() || null,
        include_inactive: true,
        limit: 10000,
        institution_id: institutionId,
      });

      if (result.error) throw new Error(result.error);

      const rawPatients = result.data || [];
      const cpfCounts = new Map<string, number>();
      const phoneCounts = new Map<string, number>();
      const nameToCpfs = new Map<string, Set<string | null>>();

      for (const p of rawPatients) {
        if (p.is_active) {
          if (p.cpf) {
            cpfCounts.set(p.cpf, (cpfCounts.get(p.cpf) || 0) + 1);
          }
          if (p.phone && p.phone !== '-') {
            phoneCounts.set(p.phone, (phoneCounts.get(p.phone) || 0) + 1);
          }
          if (p.full_name) {
            const nameKey = p.full_name.trim().toLowerCase();
            if (!nameToCpfs.has(nameKey)) nameToCpfs.set(nameKey, new Set());
            nameToCpfs.get(nameKey)!.add(p.cpf || null);
          }
        }
      }

      const processedPatients = rawPatients.map((patient) => ({
        ...patient,
        email: patient.email || '-',
        phone: patient.phone || '-',
        age: patient.age ?? new Date().getFullYear() - new Date(patient.birth_date).getFullYear(),
        is_duplicate_cpf: patient.cpf ? (cpfCounts.get(patient.cpf) || 0) > 1 : false,
        is_duplicate_phone: patient.phone && patient.phone !== '-' ? (phoneCounts.get(patient.phone) || 0) > 1 : false,
        is_duplicate_name_diff_cpf: patient.full_name ? (nameToCpfs.get(patient.full_name.trim().toLowerCase())?.size || 0) > 1 : false,
      }));

      return processedPatients;
    },
    enabled: canReadPatients,
    staleTime: 1000 * 60 * 5, // 5 minutes cache
  });
};
