"use client";

import { useCallback, useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { institutionService, Institution } from '@/servicos/institutions';
import { CompactDataGrid, type CompactDataGridColumn } from '@/components/CompactDataGrid';
import { Button } from '@/components/ui/button';
import { ActionButton } from '@/components/ui/action-button';
import { FormSectionTitle, FormGrid, FormField } from '@/components/ui/standard-form';
import { Dialog, DialogContent, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import PageHeader from '@/components/PageHeader';
import { Building2, Plus, Search, Edit2, Power, MapPin, Phone, Mail, CheckCircle, XCircle, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useConfirm } from '@/hooks/useConfirm';
import { maskCNPJ, maskPhone, unmaskCNPJ, unmaskPhone } from '@/utils/masks';
import { normalizarEntradaTexto } from '@/utils/formatters';

const Institutions = () => {
  const { hasRole } = useAuth();
  const canManageInstitutions = hasRole(['admin', 'root']);
  const { confirm: confirmDialog, ConfirmationDialog } = useConfirm();
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingInstitution, setEditingInstitution] = useState<Institution | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'todos' | 'ativos' | 'inativos'>('ativos');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState({
    name: '',
    cnpj: '',
    address: '',
    city: '',
    state: '',
    phone: '',
    email: '',
  });

  const fetchInstitutions = useCallback(async () => {
    try {
      setLoading(true);
      const data = await institutionService.list(true);
      setInstitutions(data || []);
    } catch (error) {
      console.error('Erro ao buscar instituições:', error);
      toast.error('Erro ao carregar instituições');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInstitutions();
  }, [fetchInstitutions]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Nome da instituição é obrigatório.';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});

    try {
      if (editingInstitution) {
        await institutionService.update(editingInstitution.id, {
          name: formData.name.trim(),
          cnpj: unmaskCNPJ(formData.cnpj) || null,
          phone: unmaskPhone(formData.phone) || null,
          email: formData.email.trim() || null,
          address: formData.address.trim() || null,
          city: formData.city.trim() || null,
          state: formData.state.trim() || null,
        });
        toast.success('Instituição atualizada com sucesso!');
      } else {
        await institutionService.create({
          name: formData.name.trim(),
          cnpj: unmaskCNPJ(formData.cnpj) || null,
          phone: unmaskPhone(formData.phone) || null,
          email: formData.email.trim() || null,
          address: formData.address.trim() || null,
          city: formData.city.trim() || null,
          state: formData.state.trim() || null,
        });
        toast.success('Instituição cadastrada com sucesso!');
      }

      setIsDialogOpen(false);
      resetForm();
      await fetchInstitutions();
    } catch (error: any) {
      console.error('Erro ao salvar instituição:', error);
      toast.error(error.message || 'Erro ao salvar instituição');
    }
  };

  const handleEdit = (inst: Institution) => {
    setEditingInstitution(inst);
    setErrors({});
    setFormData({
      name: inst.name,
      cnpj: maskCNPJ(inst.cnpj || ''),
      address: inst.address || '',
      city: inst.city || '',
      state: inst.state || '',
      phone: maskPhone(inst.phone || ''),
      email: inst.email || '',
    });
    setIsDialogOpen(true);
  };

  const handleToggleActive = async (id: string, isActive: number | boolean) => {
    const activeBool = Boolean(isActive);
    const confirmed = await confirmDialog(
      activeBool
        ? 'Confirmar desativação desta instituição?'
        : 'Confirmar ativação desta instituição?'
    );

    if (!confirmed) return;

    try {
      await institutionService.update(id, { is_active: !activeBool });
      setInstitutions((current) =>
        current.map((i) => (i.id === id ? { ...i, is_active: !activeBool } : i))
      );
      toast.success(activeBool ? 'Instituição desativada' : 'Instituição ativada');
    } catch (error: any) {
      toast.error(error.message || 'Erro ao alterar status');
    }
  };

  const handleDelete = async (id: string) => {
    const confirmed = await confirmDialog('Deseja realmente excluir esta instituição?');
    if (!confirmed) return;

    try {
      await institutionService.remove(id);
      setInstitutions((current) => current.filter((i) => i.id !== id));
      toast.success('Instituição removida com sucesso');
    } catch (error: any) {
      toast.error(error.message || 'Erro ao excluir instituição');
    }
  };

  const resetForm = () => {
    setEditingInstitution(null);
    setErrors({});
    setFormData({
      name: '',
      cnpj: '',
      address: '',
      city: '',
      state: '',
      phone: '',
      email: '',
    });
  };

  const filteredInstitutions = institutions.filter((inst) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      inst.name.toLowerCase().includes(term) ||
      (inst.cnpj && inst.cnpj.includes(term)) ||
      (inst.city && inst.city.toLowerCase().includes(term));

    if (!matchesSearch) return false;
    const isAct = Boolean(inst.is_active);
    if (statusFilter === 'ativos') return isAct;
    if (statusFilter === 'inativos') return !isAct;
    return true;
  });

  const columns: Array<CompactDataGridColumn<Institution>> = useMemo(
    () => [
      {
        key: 'name',
        header: 'Instituição / Unidade',
        className: 'w-[35%] min-w-[240px]',
        render: (inst) => {
          const isAct = Boolean(inst.is_active);
          return (
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 border border-blue-100 shadow-2xs">
                <Building2 className="h-5 w-5" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-bold text-slate-900 truncate" title={inst.name}>
                  {inst.name}
                </span>
                <span className="text-xs text-slate-500 font-medium font-mono">
                  {inst.cnpj ? maskCNPJ(inst.cnpj) : 'CNPJ não informado'}
                </span>
              </div>
            </div>
          );
        },
      },
      {
        key: 'location',
        header: 'Localização',
        className: 'w-[30%] min-w-[200px]',
        render: (inst) => (
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <span className="truncate">
              {inst.city && inst.state ? `${inst.city} - ${inst.state}` : inst.address || 'Não informada'}
            </span>
          </div>
        ),
      },
      {
        key: 'contact',
        header: 'Contato',
        className: 'w-[25%] min-w-[180px]',
        render: (inst) => (
          <div className="flex flex-col gap-0.5 text-xs text-slate-600">
            {inst.phone && (
              <span className="flex items-center gap-1.5 font-medium font-mono">
                <Phone className="h-3 w-3 text-slate-400" />
                {maskPhone(inst.phone)}
              </span>
            )}
            {inst.email && (
              <span className="flex items-center gap-1.5 text-slate-500 truncate" title={inst.email}>
                <Mail className="h-3 w-3 text-slate-400" />
                {inst.email}
              </span>
            )}
          </div>
        ),
      },
      {
        key: 'actions',
        header: 'Ações',
        className: 'w-[1%] whitespace-nowrap',
        sticky: 'right',
        render: (inst) =>
          canManageInstitutions ? (
            <div className="flex items-center gap-1.5">
              <ActionButton
                onClick={() => handleEdit(inst)}
                icon={<Edit2 className="h-4 w-4" />}
                titleTooltip="Editar Instituição"
              />
              <ActionButton
                onClick={() => handleToggleActive(inst.id, inst.is_active)}
                icon={<Power className="h-4 w-4" />}
                titleTooltip={inst.is_active ? 'Desativar Instituição' : 'Ativar Instituição'}
                danger={Boolean(inst.is_active)}
              />
              <ActionButton
                onClick={() => handleDelete(inst.id)}
                icon={<Trash2 className="h-4 w-4" />}
                titleTooltip="Excluir Instituição"
                danger
              />
            </div>
          ) : null,
      },
    ],
    [canManageInstitutions]
  );

  return (
    <div className="h-full min-h-0 bg-slate-100 px-3 pb-3">
      <div className="flex h-full min-h-0 w-full flex-col">
        <PageHeader
          title="Instituições e Unidades"
          description="Gerencie as clínicas e pontos de atendimento da rede"
          className="mb-3"
          compact
          actionsClassName="lg:flex-1"
          loading={loading}
        >
          <div className="flex flex-col md:flex-row flex-wrap w-full items-end gap-2 justify-end">
            <div className="relative min-w-0 flex-1 w-full md:min-w-[200px]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Buscar por nome, CNPJ ou cidade..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="delphi-input h-9 pl-10 w-full"
              />
            </div>
            <div className="flex-none w-auto min-w-[165px] shrink-0">
              <Select value={statusFilter} onValueChange={(val: any) => setStatusFilter(val)}>
                <SelectTrigger className="delphi-input h-9 w-full whitespace-nowrap">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="ativos">Apenas Ativos</SelectItem>
                  <SelectItem value="inativos">Apenas Inativos</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  className="h-9 min-w-[120px] bg-blue-600 text-white hover:bg-blue-700 font-bold"
                  onClick={() => {
                    resetForm();
                    setIsDialogOpen(true);
                  }}
                  disabled={!canManageInstitutions}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Nova Unidade
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-xl p-6 bg-white rounded-2xl shadow-2xl border-0 overflow-hidden max-h-[90vh] overflow-y-auto">
                <div className="flex flex-col gap-6">
                  <div className="flex flex-col space-y-1.5">
                    <DialogTitle className="text-2xl font-bold text-slate-800 tracking-tight">
                      {editingInstitution ? 'Editar Unidade' : 'Nova Unidade'}
                    </DialogTitle>
                    <DialogDescription className="text-slate-500 font-medium">
                      Preencha os dados da instituição de atendimento.
                    </DialogDescription>
                  </div>
                  <form onSubmit={handleSubmit} className="flex flex-col gap-6">
                    <div className="space-y-4">
                      <FormSectionTitle>Dados Cadastrais</FormSectionTitle>
                      <FormGrid>
                        <FormField label="Nome da Unidade / Razão Social" required className="md:col-span-12" error={errors.name}>
                          <Input
                            value={formData.name}
                            onChange={(e) => {
                              setFormData({ ...formData, name: e.target.value });
                              setErrors((prev) => ({ ...prev, name: '' }));
                            }}
                            required
                            placeholder="Ex: Unidade Centro - SESI"
                            className="h-11 rounded-2xl bg-slate-50 border-slate-200 text-sm font-semibold"
                          />
                        </FormField>

                        <FormField label="CNPJ" className="md:col-span-6">
                          <Input
                            value={formData.cnpj}
                            onChange={(e) => setFormData({ ...formData, cnpj: maskCNPJ(e.target.value) })}
                            placeholder="00.000.000/0000-00"
                            className="h-11 rounded-2xl bg-slate-50 border-slate-200 text-sm font-mono"
                          />
                        </FormField>

                        <FormField label="Telefone" className="md:col-span-6">
                          <Input
                            value={formData.phone}
                            onChange={(e) => setFormData({ ...formData, phone: maskPhone(e.target.value) })}
                            placeholder="(00) 00000-0000"
                            className="h-11 rounded-2xl bg-slate-50 border-slate-200 text-sm font-mono"
                          />
                        </FormField>

                        <FormField label="E-mail Institucional" className="md:col-span-12">
                          <Input
                            type="email"
                            value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            placeholder="contato@unidade.com.br"
                            className="h-11 rounded-2xl bg-slate-50 border-slate-200 text-sm"
                          />
                        </FormField>

                        <FormField label="Endereço" className="md:col-span-6">
                          <Input
                            value={formData.address}
                            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                            placeholder="Rua / Avenida, Número"
                            className="h-11 rounded-2xl bg-slate-50 border-slate-200 text-sm"
                          />
                        </FormField>

                        <FormField label="Cidade" className="md:col-span-4">
                          <Input
                            value={formData.city}
                            onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                            placeholder="Cidade"
                            className="h-11 rounded-2xl bg-slate-50 border-slate-200 text-sm"
                          />
                        </FormField>

                        <FormField label="UF" className="md:col-span-2">
                          <Input
                            value={formData.state}
                            onChange={(e) => setFormData({ ...formData, state: e.target.value.toUpperCase() })}
                            maxLength={2}
                            placeholder="DF"
                            className="h-11 rounded-2xl bg-slate-50 border-slate-200 text-sm uppercase text-center font-bold"
                          />
                        </FormField>
                      </FormGrid>
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-10 px-6 font-semibold"
                        onClick={() => setIsDialogOpen(false)}
                      >
                        Cancelar
                      </Button>
                      <Button type="submit" className="h-10 px-6 font-semibold bg-blue-600 hover:bg-blue-700">
                        {editingInstitution ? 'Atualizar' : 'Salvar'}
                      </Button>
                    </div>
                  </form>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </PageHeader>

        <CompactDataGrid
          className="flex-1"
          columns={columns}
          rows={filteredInstitutions}
          getRowKey={(inst) => inst.id}
          emptyMessage="Nenhuma instituição encontrada"
          rowClassName={(inst) => (!inst.is_active ? 'opacity-60' : '')}
          minWidth="900px"
          loading={loading}
          pagination={true}
          resetPaginationDependency={searchTerm + statusFilter}
        />
      </div>
      <ConfirmationDialog />
    </div>
  );
};

export default Institutions;
