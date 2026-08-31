"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Edit2, FileText, Plus, Power, Search, UserPlus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { patientService, Patient } from '@/servicos/patients';
import { institutionService, Institution } from '@/servicos/institutions';
import { CompactDataGrid, type CompactDataGridColumn } from '@/components/CompactDataGrid';
import PageHeader from '@/components/PageHeader';
import { ActionButton } from '@/components/ui/action-button';
import { Button } from '@/components/ui/button';
import { FormSectionTitle, FormGrid, FormField } from '@/components/ui/standard-form';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PatientHistoryDrawer } from '@/components/PatientHistoryDrawer';
import { getAvatarColor, getInitials, normalizarEntradaTexto } from '@/utils/formatters';
import { useConfirm } from '@/hooks/useConfirm';
import { maskCPF, maskPhone, unmaskCPF, unmaskPhone } from '@/utils/masks';

const emptyForm = {
  institution_id: '',
  full_name: '',
  phone: '',
  cpf: '',
  birth_date: '',
};

const Patients = () => {
  const { hasRole, institutionId } = useAuth();
  const canManagePatients = hasRole(['admin', 'root', 'recepcao', 'gestor']);
  const { confirm, ConfirmationDialog } = useConfirm();
  const navigate = useNavigate();

  const [patients, setPatients] = useState<Patient[]>([]);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPatientId, setEditingPatientId] = useState<string | null>(null);
  const [formData, setFormData] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ativos');
  const [institutionFilter, setInstitutionFilter] = useState('all');

  // Drawer de histórico
  const [selectedPatientForHistory, setSelectedPatientForHistory] = useState<Patient | null>(null);
  const [isHistoryDrawerOpen, setIsHistoryDrawerOpen] = useState(false);

  const fetchPatients = useCallback(async () => {
    try {
      setLoading(true);
      const [pts, insts] = await Promise.all([
        patientService.list({ search: searchTerm.trim() || undefined }),
        institutionService.list(),
      ]);
      setPatients(pts || []);
      setInstitutions(insts || []);
    } catch (error) {
      console.error('Erro ao buscar pacientes:', error);
      toast.error('Erro ao carregar pacientes');
    } finally {
      setLoading(false);
    }
  }, [searchTerm]);

  useEffect(() => {
    fetchPatients();
  }, [fetchPatients]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const newErrors: Record<string, string> = {};

    if (!formData.full_name.trim()) {
      newErrors.full_name = 'Nome completo é obrigatório.';
    }
    if (!formData.cpf.trim()) {
      newErrors.cpf = 'CPF é obrigatório.';
    }
    if (!formData.birth_date) {
      newErrors.birth_date = 'Data de nascimento é obrigatória.';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});

    try {
      if (editingPatientId) {
        await patientService.update(editingPatientId, {
          full_name: normalizarEntradaTexto(formData.full_name),
          cpf: unmaskCPF(formData.cpf),
          phone: unmaskPhone(formData.phone) || null,
          birth_date: formData.birth_date,
          institution_id: formData.institution_id || null,
        });
        toast.success('Paciente atualizado com sucesso!');
      } else {
        await patientService.create({
          full_name: normalizarEntradaTexto(formData.full_name),
          cpf: unmaskCPF(formData.cpf),
          phone: unmaskPhone(formData.phone) || null,
          birth_date: formData.birth_date,
          institution_id: formData.institution_id || institutionId || undefined,
        });
        toast.success('Paciente cadastrado com sucesso!');
      }

      setIsDialogOpen(false);
      resetForm();
      await fetchPatients();
    } catch (error: any) {
      console.error('Erro ao salvar paciente:', error);
      toast.error(error.message || 'Erro ao salvar paciente');
    }
  };

  const handleEdit = (p: Patient) => {
    setEditingPatientId(p.id);
    setErrors({});
    setFormData({
      institution_id: p.institution_id || '',
      full_name: p.full_name,
      phone: maskPhone(p.phone || ''),
      cpf: maskCPF(p.cpf),
      birth_date: p.birth_date ? p.birth_date.split('T')[0] : '',
    });
    setIsDialogOpen(true);
  };

  const handleToggleActive = async (id: string, isActive: number | boolean) => {
    const activeBool = Boolean(isActive);
    const confirmed = await confirm(
      activeBool ? 'Deseja desativar este paciente?' : 'Deseja ativar este paciente?'
    );
    if (!confirmed) return;

    try {
      await patientService.update(id, { is_active: !activeBool });
      setPatients((prev) =>
        prev.map((p) => (p.id === id ? { ...p, is_active: !activeBool } : p))
      );
      toast.success(activeBool ? 'Paciente desativado' : 'Paciente ativado');
    } catch (error: any) {
      toast.error(error.message || 'Erro ao alterar status');
    }
  };

  const handleDelete = async (id: string) => {
    const confirmed = await confirm('Deseja realmente remover este paciente?');
    if (!confirmed) return;

    try {
      await patientService.remove(id);
      setPatients((prev) => prev.filter((p) => p.id !== id));
      toast.success('Paciente removido com sucesso');
    } catch (error: any) {
      toast.error(error.message || 'Erro ao remover paciente');
    }
  };

  const resetForm = () => {
    setEditingPatientId(null);
    setErrors({});
    setFormData(emptyForm);
  };

  const filteredPatients = patients.filter((p) => {
    if (institutionFilter !== 'all' && p.institution_id !== institutionFilter) {
      return false;
    }
    const isAct = Boolean(p.is_active);
    if (statusFilter === 'ativos') return isAct;
    if (statusFilter === 'inativos') return !isAct;
    return true;
  });

  const columns: Array<CompactDataGridColumn<Patient>> = useMemo(
    () => [
      {
        key: 'name',
        header: 'Paciente',
        className: 'w-[40%] min-w-[260px]',
        render: (p) => {
          const initials = getInitials(p.full_name);
          const colorClass = getAvatarColor(p.full_name);
          const isAct = Boolean(p.is_active);

          return (
            <div className="flex items-center gap-3">
              <div className={`inline-flex h-9 w-9 items-center justify-center rounded-full text-xs font-black border-2 border-white shadow-2xs shrink-0 ${colorClass}`}>
                {initials}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-bold text-slate-900 truncate" title={p.full_name}>
                  {p.full_name}
                </span>
                <span className="text-xs text-slate-500 font-medium font-mono">
                  CPF: {maskCPF(p.cpf)} {p.patient_code ? `• ${p.patient_code}` : ''}
                </span>
              </div>
            </div>
          );
        },
      },
      {
        key: 'birth_date',
        header: 'Nascimento',
        className: 'w-[20%] min-w-[140px]',
        render: (p) => (
          <span className="text-xs text-slate-700 font-medium">
            {p.birth_date ? p.birth_date.split('T')[0].split('-').reverse().join('/') : '-'}
          </span>
        ),
      },
      {
        key: 'institution',
        header: 'Unidade',
        className: 'w-[25%] min-w-[160px]',
        render: (p) => (
          <span className="text-xs text-slate-600 font-medium truncate">
            {p.institution_name || 'Geral'}
          </span>
        ),
      },
      {
        key: 'actions',
        header: 'Ações',
        className: 'w-[1%] whitespace-nowrap',
        sticky: 'right',
        render: (p) => (
          <div className="flex items-center gap-1.5">
            <ActionButton
              onClick={() => {
                setSelectedPatientForHistory(p);
                setIsHistoryDrawerOpen(true);
              }}
              icon={<FileText className="h-4 w-4" />}
              titleTooltip="Prontuário e Histórico"
            />
            {canManagePatients && (
              <>
                <ActionButton
                  onClick={() => handleEdit(p)}
                  icon={<Edit2 className="h-4 w-4" />}
                  titleTooltip="Editar Paciente"
                />
                <ActionButton
                  onClick={() => handleToggleActive(p.id, p.is_active)}
                  icon={<Power className="h-4 w-4" />}
                  titleTooltip={p.is_active ? 'Desativar Paciente' : 'Ativar Paciente'}
                  danger={Boolean(p.is_active)}
                />
                <ActionButton
                  onClick={() => handleDelete(p.id)}
                  icon={<Trash2 className="h-4 w-4" />}
                  titleTooltip="Excluir Paciente"
                  danger
                />
              </>
            )}
          </div>
        ),
      },
    ],
    [canManagePatients]
  );

  return (
    <div className="h-full min-h-0 bg-slate-100 px-3 pb-3">
      <div className="flex h-full min-h-0 w-full flex-col">
        <PageHeader
          title="Pacientes"
          description="Controle e prontuário integrado dos pacientes atendidos"
          className="mb-3"
          compact
          actionsClassName="lg:flex-1"
          loading={loading}
        >
          <div className="flex flex-col md:flex-row flex-wrap w-full items-end gap-2 justify-end">
            <div className="relative min-w-0 flex-1 w-full md:min-w-[200px]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Buscar por nome, CPF ou código..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="delphi-input h-9 pl-10 w-full"
              />
            </div>

            <div className="flex-none w-auto min-w-[150px] shrink-0">
              <Select value={institutionFilter} onValueChange={(val) => setInstitutionFilter(val)}>
                <SelectTrigger className="delphi-input h-9 w-full">
                  <SelectValue placeholder="Unidade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas Unidades</SelectItem>
                  {institutions.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.name}
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
                resetForm();
                setIsDialogOpen(true);
              }}
              disabled={!canManagePatients}
            >
              <UserPlus className="h-4 w-4 mr-2" />
              Novo Paciente
            </Button>
          </div>
        </PageHeader>

        <CompactDataGrid
          className="flex-1"
          columns={columns}
          rows={filteredPatients}
          getRowKey={(p) => p.id}
          emptyMessage="Nenhum paciente encontrado"
          rowClassName={(p) => (!p.is_active ? 'opacity-60' : '')}
          minWidth="900px"
          loading={loading}
          pagination={true}
          resetPaginationDependency={searchTerm + statusFilter + institutionFilter}
        />
      </div>

      {/* Modal de Cadastro / Edição */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-xl p-6 bg-white rounded-2xl shadow-2xl border-0 overflow-hidden max-h-[90vh] overflow-y-auto">
          <div className="flex flex-col gap-6">
            <div className="flex flex-col space-y-1.5">
              <DialogTitle className="text-2xl font-bold text-slate-800 tracking-tight">
                {editingPatientId ? 'Editar Paciente' : 'Novo Paciente'}
              </DialogTitle>
              <DialogDescription className="text-slate-500 font-medium">
                Preencha os dados do paciente para cadastro e emissão de prontuário.
              </DialogDescription>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-6">
              <div className="space-y-4">
                <FormSectionTitle>Dados Pessoais</FormSectionTitle>
                <FormGrid>
                  <FormField label="Nome Completo" required className="md:col-span-12" error={errors.full_name}>
                    <Input
                      value={formData.full_name}
                      onChange={(e) => {
                        setFormData({ ...formData, full_name: e.target.value });
                        setErrors((prev) => ({ ...prev, full_name: '' }));
                      }}
                      placeholder="Ex: Maria dos Santos Silva"
                      className="h-11 rounded-2xl bg-slate-50 border-slate-200 text-sm font-semibold"
                    />
                  </FormField>

                  <FormField label="CPF" required className="md:col-span-6" error={errors.cpf}>
                    <Input
                      value={formData.cpf}
                      onChange={(e) => {
                        setFormData({ ...formData, cpf: maskCPF(e.target.value) });
                        setErrors((prev) => ({ ...prev, cpf: '' }));
                      }}
                      placeholder="000.000.000-00"
                      className="h-11 rounded-2xl bg-slate-50 border-slate-200 text-sm font-mono"
                    />
                  </FormField>

                  <FormField label="Data de Nascimento" required className="md:col-span-6" error={errors.birth_date}>
                    <Input
                      type="date"
                      value={formData.birth_date}
                      onChange={(e) => {
                        setFormData({ ...formData, birth_date: e.target.value });
                        setErrors((prev) => ({ ...prev, birth_date: '' }));
                      }}
                      className="h-11 rounded-2xl bg-slate-50 border-slate-200 text-sm"
                    />
                  </FormField>

                  <FormField label="Telefone / WhatsApp" className="md:col-span-6">
                    <Input
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: maskPhone(e.target.value) })}
                      placeholder="(00) 00000-0000"
                      className="h-11 rounded-2xl bg-slate-50 border-slate-200 text-sm font-mono"
                    />
                  </FormField>

                  <FormField label="Unidade Vinculada" className="md:col-span-6">
                    <Select
                      value={formData.institution_id}
                      onValueChange={(val) => setFormData({ ...formData, institution_id: val })}
                    >
                      <SelectTrigger className="h-11 rounded-2xl bg-slate-50 border-slate-200 text-sm">
                        <SelectValue placeholder="Selecione a unidade" />
                      </SelectTrigger>
                      <SelectContent>
                        {institutions.map((i) => (
                          <SelectItem key={i.id} value={i.id}>
                            {i.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormField>
                </FormGrid>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <Button type="button" variant="outline" className="h-10 px-6 font-semibold" onClick={() => setIsDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" className="h-10 px-6 font-semibold bg-blue-600 hover:bg-blue-700 font-bold">
                  {editingPatientId ? 'Atualizar Paciente' : 'Cadastrar Paciente'}
                </Button>
              </div>
            </form>
          </div>
        </DialogContent>
      </Dialog>

      {/* Drawer de Histórico do Paciente */}
      {selectedPatientForHistory && (
        <PatientHistoryDrawer
          open={isHistoryDrawerOpen}
          onOpenChange={setIsHistoryDrawerOpen}
          patientId={selectedPatientForHistory.id}
          patientName={selectedPatientForHistory.full_name}
        />
      )}

      <ConfirmationDialog />
    </div>
  );
};

export default Patients;
