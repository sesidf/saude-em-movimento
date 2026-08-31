"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Edit2, Power, Search, UserPlus, Stethoscope, CheckCircle, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { doctorService, Doctor } from '@/servicos/doctors';
import { specialtyService, Specialty } from '@/servicos/specialties';
import { CompactDataGrid, type CompactDataGridColumn } from '@/components/CompactDataGrid';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { ActionButton } from '@/components/ui/action-button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CadastroProfissionalModal } from '@/components/CadastroProfissionalModal';
import { getAvatarColor, getInitials } from '@/utils/formatters';
import { useConfirm } from '@/hooks/useConfirm';

const Doctors = () => {
  const { hasRole } = useAuth();
  const canManageDoctors = hasRole(['admin', 'root']);
  const { confirm: confirmDialog, ConfirmationDialog } = useConfirm();
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingDoctorId, setEditingDoctorId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ativos');
  const [specialtyFilter, setSpecialtyFilter] = useState('todas');

  const profissionalEdicao = useMemo(() => {
    return doctors.find((doc) => doc.id === editingDoctorId) || null;
  }, [doctors, editingDoctorId]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [docs, specs] = await Promise.all([
        doctorService.list({ showAll: true }),
        specialtyService.list(true),
      ]);
      setDoctors(docs || []);
      setSpecialties(specs || []);
    } catch (error) {
      console.error('Erro ao buscar profissionais:', error);
      toast.error('Erro ao carregar dados dos profissionais');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleToggleActive = async (id: string, isActive: number | boolean) => {
    const activeBool = Boolean(isActive);
    const confirmed = await confirmDialog(
      activeBool ? 'Confirmar desativação deste profissional?' : 'Confirmar ativação deste profissional?'
    );

    if (!confirmed) return;

    try {
      await doctorService.update(id, { is_active: !activeBool });
      setDoctors((prev) =>
        prev.map((d) => (d.id === id ? { ...d, is_active: !activeBool } : d))
      );
      toast.success(activeBool ? 'Profissional desativado' : 'Profissional ativado');
    } catch (error: any) {
      toast.error(error.message || 'Erro ao alterar status');
    }
  };

  const filteredDoctors = doctors.filter((doc) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      doc.name.toLowerCase().includes(term) ||
      doc.crm.toLowerCase().includes(term) ||
      (doc.specialty_name && doc.specialty_name.toLowerCase().includes(term));

    if (!matchesSearch) return false;

    if (specialtyFilter !== 'todas' && doc.specialty_id !== specialtyFilter) {
      return false;
    }

    const isAct = Boolean(doc.is_active);
    if (statusFilter === 'ativos') return isAct;
    if (statusFilter === 'inativos') return !isAct;
    return true;
  });

  const columns: Array<CompactDataGridColumn<Doctor>> = useMemo(
    () => [
      {
        key: 'name',
        header: 'Profissional',
        className: 'w-[40%] min-w-[260px]',
        render: (doc) => {
          const initials = getInitials(doc.name);
          const colorClass = getAvatarColor(doc.name);
          const isAct = Boolean(doc.is_active);

          return (
            <div className="flex items-center gap-3">
              <div className={`inline-flex h-9 w-9 items-center justify-center rounded-full text-xs font-black border-2 border-white shadow-2xs shrink-0 ${colorClass}`}>
                {initials}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-bold text-slate-900 truncate" title={doc.name}>
                  {doc.name}
                </span>
                <span className="text-xs text-slate-500 font-medium font-mono">
                  {doc.professional_council || 'CRM'}: {doc.crm}
                </span>
              </div>
            </div>
          );
        },
      },
      {
        key: 'specialty',
        header: 'Especialidade',
        className: 'w-[30%] min-w-[180px]',
        render: (doc) => (
          <div className="flex items-center gap-2">
            <span
              className="px-2.5 py-1 rounded-md text-xs font-bold"
              style={{
                backgroundColor: `${doc.specialty_color || '#3B82F6'}15`,
                color: doc.specialty_color || '#3B82F6',
                border: `1px solid ${doc.specialty_color || '#3B82F6'}30`,
              }}
            >
              {doc.specialty_name || 'Geral'}
            </span>
          </div>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        className: 'w-[20%] min-w-[140px]',
        render: (doc) => {
          const isAct = Boolean(doc.is_active);
          return (
            <div className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full ${isAct ? 'bg-emerald-500' : 'bg-rose-500'}`} />
              <span className={`text-xs font-bold ${isAct ? 'text-emerald-700' : 'text-rose-700'}`}>
                {isAct ? 'Ativo' : 'Inativo'}
              </span>
            </div>
          );
        },
      },
      {
        key: 'actions',
        header: 'Ações',
        className: 'w-[1%] whitespace-nowrap',
        sticky: 'right',
        render: (doc) =>
          canManageDoctors ? (
            <div className="flex items-center gap-1.5">
              <ActionButton
                onClick={() => {
                  setEditingDoctorId(doc.id);
                  setIsDialogOpen(true);
                }}
                icon={<Edit2 className="h-4 w-4" />}
                titleTooltip="Editar Profissional"
              />
              <ActionButton
                onClick={() => handleToggleActive(doc.id, doc.is_active)}
                icon={<Power className="h-4 w-4" />}
                titleTooltip={doc.is_active ? 'Desativar Profissional' : 'Ativar Profissional'}
                danger={Boolean(doc.is_active)}
              />
            </div>
          ) : null,
      },
    ],
    [canManageDoctors]
  );

  return (
    <div className="h-full min-h-0 bg-slate-100 px-3 pb-3">
      <div className="flex h-full min-h-0 w-full flex-col">
        <PageHeader
          title="Profissionais de Saúde"
          description="Gerencie médicos, especialistas e corpo clínico"
          className="mb-3"
          compact
          actionsClassName="lg:flex-1"
          loading={loading}
        >
          <div className="flex flex-col md:flex-row flex-wrap w-full items-end gap-2 justify-end">
            <div className="relative min-w-0 flex-1 w-full md:min-w-[200px]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Buscar por nome, CRM ou especialidade..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="delphi-input h-9 pl-10 w-full"
              />
            </div>

            <div className="flex-none w-auto min-w-[150px] shrink-0">
              <Select value={specialtyFilter} onValueChange={(val) => setSpecialtyFilter(val)}>
                <SelectTrigger className="delphi-input h-9 w-full">
                  <SelectValue placeholder="Especialidade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas Especialidades</SelectItem>
                  {specialties.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex-none w-auto min-w-[140px] shrink-0">
              <Select value={statusFilter} onValueChange={(val) => setStatusFilter(val)}>
                <SelectTrigger className="delphi-input h-9 w-full">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="ativos">Apenas Ativos</SelectItem>
                  <SelectItem value="inativos">Apenas Inativos</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              className="h-9 min-w-[120px] bg-blue-600 text-white hover:bg-blue-700 font-bold"
              onClick={() => {
                setEditingDoctorId(null);
                setIsDialogOpen(true);
              }}
              disabled={!canManageDoctors}
            >
              <UserPlus className="h-4 w-4 mr-2" />
              Novo Profissional
            </Button>
          </div>
        </PageHeader>

        <CompactDataGrid
          className="flex-1"
          columns={columns}
          rows={filteredDoctors}
          getRowKey={(doc) => doc.id}
          emptyMessage="Nenhum profissional encontrado"
          rowClassName={(doc) => (!doc.is_active ? 'opacity-60' : '')}
          minWidth="900px"
          loading={loading}
          pagination={true}
          resetPaginationDependency={searchTerm + statusFilter + specialtyFilter}
        />
      </div>

      <CadastroProfissionalModal
        aberto={isDialogOpen}
        aoFechar={() => {
          setIsDialogOpen(false);
          setEditingDoctorId(null);
        }}
        aoSalvarComSucesso={fetchData}
        idProfissionalEdicao={editingDoctorId}
        profissionalEdicao={profissionalEdicao as any}
        especialidades={specialties}
        instituicoes={[]}
        podeProvisionarUsuarios={canManageDoctors}
      />

      <ConfirmationDialog />
    </div>
  );
};

export default Doctors;
