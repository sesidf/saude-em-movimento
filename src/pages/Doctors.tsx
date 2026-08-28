"use client";

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Edit2, Ban, UserCheck, Search, UserPlus, Stethoscope, CheckCircle, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { chamarApiPost, chamarApiGet } from '@/lib/workerApi';
import { useAuth } from '@/contexts/AuthContext';
import { CompactDataGrid, type CompactDataGridColumn } from '@/components/CompactDataGrid';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { ActionButton } from '@/components/ui/action-button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { buildIdempotencyKey } from '@/lib/idempotency';
import { getOperationalErrorMessage } from '@/lib/errors';
import { CadastroProfissionalModal } from '@/components/CadastroProfissionalModal';
import { getAvatarColor, getInitials } from '@/utils/formatters';
import { useConfirm } from '@/hooks/useConfirm';
import { formatarRegistroProfissional } from '@/utils/formatar-registro';
import { SPECIALTY_ICONS } from '@/pages/Specialties';

interface Doctor {
  id: string;
  user_id: string;
  professional_council?: string;
  professional_registration?: string;
  registration_label?: string;
  crm: string;
  specialty_id: string;

  is_active: boolean;
  full_name: string;
  email: string;
  phone?: string;
  specialty_name: string;
  specialty_color?: string;
  total_appointments: number;
}

interface SpecialtyOption {
  id: string;
  name: string;
  color?: string;
  icon?: string;
}

interface InstitutionOption {
  id: string;
  name: string;
  is_active?: boolean;
}


const isInvalidRegistration = (doctor: Pick<Doctor, 'professional_registration' | 'crm'>) => {
  const value = doctor.professional_registration || doctor.crm || '';
  if (!value) return false;
  
  const lower = value.toLowerCase();
  if (lower === 'nao_informado' || lower === 'nao-informado' || lower === 'não informado' || lower === 'não-informado' || lower === 'n/a') {
    return false;
  }
  
  return value.includes('123456') || value === '123456789' || value.includes('000000');
};

const Doctors = () => {
  const { hasPermission, hasRole, institutionId, institutionIds, profileLoaded } = useAuth();
  const { confirm: confirmDialog, ConfirmationDialog } = useConfirm();
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [specialties, setSpecialties] = useState<SpecialtyOption[]>([]);
  const [institutions, setInstitutions] = useState<InstitutionOption[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingDoctorId, setEditingDoctorId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ativos');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const profissionalEdicao = useMemo(() => {
    return doctors.find((doc) => doc.id === editingDoctorId) || null;
  }, [doctors, editingDoctorId]);

  // Superadmin tem acesso irrestrito a todas as operações
  const isSuperadmin = hasRole(['superadmin']);

  const canReadDoctors    = isSuperadmin || hasPermission('doctors', 'read', institutionId) || hasPermission('doctors', 'update', institutionId) || hasPermission('doctors', 'manage', institutionId);
  const canManageDoctors  = isSuperadmin || hasPermission('doctors', 'update', institutionId) || hasPermission('doctors', 'manage', institutionId);
  const canProvisionUsers = isSuperadmin || hasPermission('users', 'create', institutionId) || hasPermission('users', 'manage', institutionId);

  const { data: doctorsData, isLoading: loadingDoctors, refetch: refetchDoctors } = useQuery({
    queryKey: ['doctors', institutionIds, debouncedSearch],
    queryFn: async () => {
      if (!canReadDoctors) return [];
      const { data, error } = await chamarApiPost('/api/rpc/list_doctors_catalog', {
        p_search: debouncedSearch.trim() || null,
        p_include_inactive: true,
      });
      if (error) throw error;
      return (data as unknown as Doctor[] | null) || [];
    },
    enabled: canReadDoctors && profileLoaded,
    staleTime: 1000 * 60 * 5, // 5 min cache
  });

  useEffect(() => {
    if (doctorsData) setDoctors(doctorsData);
  }, [doctorsData]);

  const { data: catalogsData, isLoading: loadingCatalogs } = useQuery({
    queryKey: ['doctors_catalogs', institutionIds],
    queryFn: async () => {
      if (!canReadDoctors) return { inst: [], spec: [] };
      const [institutionsResult, specialtiesResult] = await Promise.all([
        chamarApiPost('/api/rpc/list_institutions_catalog', { p_search: null, p_include_inactive: false }),
        chamarApiPost('/api/rpc/list_specialties_catalog', { p_search: null, p_include_inactive: false }),
      ]);

      if (institutionsResult.error) throw institutionsResult.error;
      if (specialtiesResult.error) throw specialtiesResult.error;

      const isGlobalAdmin = hasRole(['superadmin', 'admin']);
      const scopedInstitutions = ((institutionsResult.data as unknown as InstitutionOption[] | null) || []).filter((institution) =>
        isGlobalAdmin || institutionIds.length === 0 || institutionIds.includes(institution.id),
      );
      
      return {
        inst: scopedInstitutions,
        spec: (specialtiesResult.data as unknown as SpecialtyOption[] | null) || []
      };
    },
    enabled: canReadDoctors && profileLoaded,
    staleTime: 1000 * 60 * 60, // 1 hour cache
  });

  useEffect(() => {
    if (catalogsData) {
      setInstitutions(catalogsData.inst);
      setSpecialties(catalogsData.spec);
    }
  }, [catalogsData]);

  const loading = loadingDoctors || loadingCatalogs;

  const handleEditDoctor = (doctor: Doctor) => {
    setEditingDoctorId(doctor.id);
    setIsDialogOpen(true);
  };

  const handleToggleDoctorActive = async (id: string, isActive: boolean) => {
    const action = isActive ? 'desativar' : 'ativar';
    const confirmed = await confirmDialog(`Tem certeza que deseja ${action} este profissional?`);
    if (!confirmed) return;

    try {
      const { data, error } = await chamarApiPost('/api/rpc/set_doctor_active', {
        p_doctor_id: id,
        p_is_active: !isActive,
        p_idempotency_key: await buildIdempotencyKey('set_doctor_active', { doctor_id: id, is_active: !isActive }),
      });

      if (error) throw error;
      const payload = (data || {}) as { success?: boolean; doctor?: Doctor | null };
      if (!payload.success || !payload.doctor || payload.doctor.is_active !== !isActive) {
        throw new Error('O backend nao confirmou a mudanca real de status do profissional.');
      }

      setDoctors((current) => current.map((doctor) => (
        doctor.id === id
          ? { ...doctor, is_active: payload.doctor?.is_active ?? doctor.is_active }
          : doctor
      )));
      toast.success(isActive ? 'Profissional desativado com sucesso.' : 'Profissional ativado com sucesso.');
      void refetchDoctors();
    } catch (error) {
      console.error('Erro ao alterar status:', error);
      toast.error(await getOperationalErrorMessage(error, 'Erro ao alterar status do profissional'));
    }
  };

  const visibleDoctors = useMemo(() =>
    doctors.filter((doc) => {
      if (statusFilter === 'ativos') return doc.is_active;
      if (statusFilter === 'inativos') return !doc.is_active;
      return true;
    }),
    [doctors, statusFilter],
  );

  const doctorColumns: Array<CompactDataGridColumn<Doctor>> = useMemo(() => [
    {
      key: 'name',
      header: 'Profissional',
      className: 'w-[35%] min-w-[250px]',
      filterable: true,
      filterValue: (doctor) => doctor.full_name,
      render: (doctor) => {
        const initials = getInitials(doctor.full_name, 'DR');
        const colorClass = getAvatarColor(doctor.full_name);
        return (
          <div className="flex items-center gap-3 min-w-[260px]">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-bold border shadow-sm ${colorClass}`}>
              {initials}
            </div>
            <div className="flex flex-col min-w-0">
              <p className="truncate font-semibold text-slate-900" title={doctor.full_name}>{doctor.full_name}</p>
              <p className="text-[11px] text-slate-500 truncate">{doctor.email || '-'}</p>
              <p className={`text-[11px] font-semibold ${doctor.is_active ? 'text-green-700' : 'text-red-700'}`}>{doctor.is_active ? 'Ativo' : 'Inativo'}</p>
            </div>
          </div>
        );
      },
    },
    {
      key: 'registration',
      header: 'Registro',
      className: 'w-[20%] min-w-[150px]',
      render: (doctor) => {
        const invalid = isInvalidRegistration(doctor);
        const labelFormatado = formatarRegistroProfissional(doctor.professional_council, doctor.professional_registration || doctor.crm);
        return (
          <div className="flex items-center gap-2">
            <span className="font-medium">{labelFormatado || '-'}</span>
            {invalid && (
              <span title="Registro possivelmente inválido ou temporário. Por favor, corrija.">
                <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: 'specialty',
      header: 'Especialidade',
      className: 'w-[15%] min-w-[150px]',
      filterable: true,
      filterValue: (doctor) => doctor.specialty_name || 'N/A',
      filterLabel: (val) => {
        const especialidade = specialties.find(s => s.name === val);
        const chaveIcone = especialidade?.icon;
        const ComponenteIcone = chaveIcone ? SPECIALTY_ICONS[chaveIcone] : Stethoscope;
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-800 uppercase tracking-wider">
            {ComponenteIcone && <ComponenteIcone className="h-3.5 w-3.5 text-slate-700 shrink-0" />}
            {val}
          </span>
        );
      },
      render: (doctor) => {
        const bgHex = doctor.specialty_color || '#e2e8f0';
        const textHex = doctor.specialty_color || '#475569';
        return (
          <span 
            className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider shadow-2xs" 
            style={{ backgroundColor: `${bgHex}15`, color: textHex, border: `1px solid ${bgHex}50` }}
          >
            {doctor.specialty_name || 'N/A'}
          </span>
        );
      },
    },
    {
      key: 'appointments',
      header: 'Consultas',
      className: 'w-[10%] min-w-[100px]',
      render: (doctor) => <span className="font-mono">{doctor.total_appointments || 0}</span>,
    },
    {
      key: 'actions',
      header: 'Ações',
      className: 'w-[10%] min-w-[100px]',
      cellClassName: '',
      sticky: 'right',
      render: (doctor) => (
        canManageDoctors ? (
          <div className="flex flex-nowrap gap-1.5">
            <ActionButton 
              onClick={() => handleEditDoctor(doctor)} 
              icon={<Edit2 className="h-4 w-4" />} 
              label="Editar" 
              titleTooltip="Editar Profissional" 
            />
            <ActionButton 
              onClick={() => { void handleToggleDoctorActive(doctor.id, doctor.is_active); }} 
              icon={doctor.is_active ? <Ban className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />} 
              titleTooltip={doctor.is_active ? "Desativar Profissional" : "Ativar Profissional"} 
              danger={doctor.is_active} 
            />
          </div>
        ) : null
      ),
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [canManageDoctors, specialties]);

  if (!canReadDoctors) {
    return <div className="pt-20 pb-16 px-4 min-h-screen bg-slate-100 flex items-center justify-center">Acesso negado</div>;
  }

  return (
    <div className="h-full min-h-0 bg-slate-100 px-3 pb-3 relative">

      <div className="flex h-full min-h-0 w-full flex-col">
        <PageHeader title="Profissionais" description="GESTÃO DE PROFISSIONAIS, AGENDAS E ESPECIALIDADES VINCULADAS" className="mb-3" compact actionsClassName="lg:flex-1" loading={loading}>
          <div className="flex flex-col md:flex-row flex-wrap w-full items-end gap-2 justify-end">
            {/* Busca */}
            <div className="relative min-w-0 flex-1 w-full md:min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Buscar por nome, registro ou especialidade..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="delphi-input h-9 pl-10 w-full"
              />
            </div>

            {/* Filtro de status */}
            <div className="flex-none w-full md:w-auto md:min-w-[165px]">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="delphi-input h-9 w-full whitespace-nowrap"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    <div className="flex items-center gap-2 whitespace-nowrap">
                      <span className="font-bold text-slate-800 text-xs whitespace-nowrap">Todos</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="ativos">
                    <div className="flex items-center gap-2 whitespace-nowrap">
                      <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 border bg-emerald-500/15 text-emerald-600 border-emerald-500/30">
                        <CheckCircle className="h-3 w-3" />
                      </div>
                      <span className="font-bold text-slate-800 text-xs whitespace-nowrap">Apenas Ativos</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="inativos">
                    <div className="flex items-center gap-2 whitespace-nowrap">
                      <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 border bg-rose-500/15 text-rose-600 border-rose-500/30">
                        <XCircle className="h-3 w-3" />
                      </div>
                      <span className="font-bold text-slate-800 text-xs whitespace-nowrap">Apenas Inativos</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Ações */}
            {canManageDoctors && (
              <Button
                className="h-9"
                onClick={() => {
                  setEditingDoctorId(null);
                  setIsDialogOpen(true);
                }}
                disabled={!canProvisionUsers || (!isSuperadmin && institutions.length === 0)}
              >
                <UserPlus className="h-4 w-4 mr-2" />
                Novo Profissional
              </Button>
            )}
          </div>
        </PageHeader>

        {/* Modal de cadastro/edição — renderizado fora do grid de filtros */}
        <CadastroProfissionalModal
          aberto={isDialogOpen}
          aoFechar={() => {
            setIsDialogOpen(false);
            setEditingDoctorId(null);
          }}
          aoSalvarComSucesso={() => {
            // Aguarda 400ms para o banco confirmar a gravação antes de recarregar
            setTimeout(() => { void refetchDoctors(); }, 400);
          }}
          idProfissionalEdicao={editingDoctorId}
          profissionalEdicao={profissionalEdicao}
          especialidades={specialties}
          instituicoes={institutions}
          idInstituicaoPadrao={institutionId || undefined}
          podeProvisionarUsuarios={canProvisionUsers}
        />

        <main className="flex-1 flex flex-col min-h-0 overflow-hidden pt-2">
          <CompactDataGrid
            className="flex-1"
            columns={doctorColumns}
            rows={visibleDoctors}
            getRowKey={(doctor) => doctor.id}
            loading={loading}
            emptyMessage="Nenhum profissional encontrado"
            rowClassName={(doctor) => (!doctor.is_active ? 'opacity-60' : '')}
            minWidth="1000px"
            pagination={true}
            itemsPerPage={15}
            resetPaginationDependency={searchTerm + statusFilter}
          />
        </main>
      </div>
      <ConfirmationDialog />
    </div>
  );
};

export default Doctors;
