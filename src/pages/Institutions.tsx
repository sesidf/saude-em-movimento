"use client";

import { useCallback, useEffect, useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { chamarApiPost, chamarApiGet } from '@/lib/workerApi';
import { CompactDataGrid, type CompactDataGridColumn } from '@/components/CompactDataGrid';
import { Button } from '@/components/ui/button';
import { ActionButton } from '@/components/ui/action-button';
import { FormSectionTitle, FormGrid, FormField } from '@/components/ui/standard-form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import PageHeader from '@/components/PageHeader';
import { Building2, Plus, Search, Edit2, Power, MapPin, Phone, Mail, CheckCircle, XCircle, Trash2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useConfirm } from '@/hooks/useConfirm';
import { buildIdempotencyKey } from '@/lib/idempotency';
import { maskCNPJ, maskPhone, unmaskCNPJ, unmaskPhone, validateCNPJ, validateEmail, validatePhone } from '@/utils/masks';
import { normalizarEntradaTexto } from '@/utils/formatters';

interface Institution {
  id: string;
  name: string;
  cnpj: string;
  address: string;
  city: string;
  state: string;
  phone: string;
  email: string;
  is_active: boolean;
}

const Institutions = () => {
  const { hasPermission, institutionId, userRole, profile, user } = useAuth();
  const ROOT_SUPERADMIN_ID = "e1610477-7e32-4dc7-88dc-39c84db49ede";
  const eSuperadminRoot = userRole === "superadmin" && (
    profile?.user_id === ROOT_SUPERADMIN_ID || 
    user?.id === ROOT_SUPERADMIN_ID
  );
  const { confirm: confirmDialog, ConfirmationDialog } = useConfirm();
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingInstitution, setEditingInstitution] = useState<Institution | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'todos' | 'ativos' | 'inativos'>('ativos');

  // Estados para o modal de exclusão inteligente da instituição
  const [confirmacaoExclusaoAberta, setConfirmacaoExclusaoAberta] = useState(false);
  const [instituicaoParaExcluir, setInstituicaoParaExcluir] = useState<Institution | null>(null);
  const [excluirPacientes, setExcluirPacientes] = useState(false);
  const [textoConfirmacaoExclusao, setTextoConfirmacaoExclusao] = useState('');
  const [excluindoInstituicao, setExcluindoInstituicao] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);

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

  const canReadInstitutions = hasPermission('institutions', 'read', institutionId) || hasPermission('institutions', 'update', institutionId);
  const canManageInstitutions =
    hasPermission('institutions', 'create', institutionId) ||
    hasPermission('institutions', 'update', institutionId) ||
    hasPermission('institutions', 'manage', institutionId);

  const { data: institutionsData, isLoading: loadingInstitutions, refetch: refetchInstitutions } = useQuery({
    queryKey: ['institutions', debouncedSearch],
    queryFn: async () => {
      if (!canReadInstitutions) return [];
      const { data, error } = await chamarApiPost('/api/rpc/list_institutions_catalog', {
        p_search: debouncedSearch.trim() || null,
        p_include_inactive: true,
      });
      if (error) throw error;
      return (data as unknown as Institution[]) || [];
    },
    enabled: canReadInstitutions,
  });

  useEffect(() => {
    if (institutionsData) setInstitutions(institutionsData);
  }, [institutionsData]);

  const loading = loadingInstitutions;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const newErrors: Record<string, string> = {};

    const normalized = {
      name: formData.name.trim(),
      cnpj: unmaskCNPJ(formData.cnpj.trim()),
      address: formData.address.trim(),
      city: formData.city.trim(),
      state: formData.state.trim().toUpperCase(),
      phone: unmaskPhone(formData.phone.trim()),
      email: formData.email.trim().toLowerCase(),
    };

    if (!normalized.name) {
      newErrors.name = 'Nome da instituição é obrigatório.';
    }

    if (normalized.cnpj && !validateCNPJ(normalized.cnpj)) {
      newErrors.cnpj = 'CNPJ inválido (14 dígitos).';
    }

    if (normalized.email && !validateEmail(normalized.email)) {
      newErrors.email = 'E-mail inválido.';
    }

    if (normalized.phone && !validatePhone(normalized.phone)) {
      newErrors.phone = 'Telefone inválido (DDD + número).';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});

    try {
      const p_idempotency_key = await buildIdempotencyKey('upsert_institution', {
        institution_id: editingInstitution?.id ?? null,
        ...normalized,
      });

      const { error } = await chamarApiPost('/api/rpc/upsert_institution', {
        p_institution_id: editingInstitution?.id ?? null,
        p_name: normalized.name,
        p_cnpj: normalized.cnpj || null,
        p_email: normalized.email || null,
        p_phone: normalized.phone || null,
        p_address: normalized.address || null,
        p_city: normalized.city || null,
        p_state: normalized.state || null,
        p_is_active: editingInstitution?.is_active ?? true,
        p_idempotency_key,
      });

      if (error) throw error;

      toast.success(editingInstitution ? 'Instituição atualizada com sucesso!' : 'Instituição criada com sucesso!');
      setIsDialogOpen(false);
      resetForm();
      void refetchInstitutions();
    } catch (error: unknown) {
      console.error('Erro ao salvar instituição:', error);
      const message = error instanceof Error ? (error as any)?.message || error : 'Erro ao salvar instituição';
      toast.error(message);
    }
  };

  const handleToggleActive = useCallback(async (id: string, isActive: boolean) => {
    const action = isActive ? 'desativar' : 'ativar';
    const confirmed = await confirmDialog(`Tem certeza que deseja ${action} esta instituicao?`);
    if (!confirmed) return;

    const target = institutions.find((institution) => institution.id === id);
    if (!target) {
      toast.error('Instituicao nao encontrada.');
      return;
    }

    try {
      const p_idempotency_key = await buildIdempotencyKey('set_institution_active', {
        institution_id: id,
        is_active: !isActive,
      });

      const { data, error } = await chamarApiPost('/api/rpc/set_institution_active', {
        p_institution_id: target.id,
        p_is_active: !isActive,
        p_idempotency_key,
      });

      if (error) throw error;
      const payload = (data || {}) as { success?: boolean; institution?: Institution | null };
      if (!payload.success || !payload.institution || payload.institution.is_active !== !isActive) {
        throw new Error('O backend nao confirmou a mudanca real de status da instituicao.');
      }

      setInstitutions((current) => current.map((institution) => (
        institution.id === id
          ? { ...institution, is_active: payload.institution?.is_active ?? institution.is_active }
          : institution
      )));
      toast.success(isActive ? 'Instituicao desativada com sucesso!' : 'Instituicao ativada com sucesso!');
      void refetchInstitutions();
    } catch (error) {
      console.error('Erro ao alterar status da instituicao:', error);
      toast.error(error instanceof Error ? (error as any)?.message || error : 'Erro ao alterar status da instituicao');
    }
  }, [confirmDialog, refetchInstitutions, institutions]);

  /**
   * Abre o modal de confirmação para exclusão da instituição.
   * @param instituicao - Objeto da instituição a ser excluída
   */
  const abrirConfirmacaoExclusao = useCallback((instituicao: Institution) => {
    setInstituicaoParaExcluir(instituicao);
    setExcluirPacientes(false);
    setTextoConfirmacaoExclusao('');
    setConfirmacaoExclusaoAberta(true);
  }, []);

  /**
   * Executa a exclusão lógica da instituição via RPC no banco de dados.
   */
  const executarExclusaoInstituicao = async () => {
    if (!instituicaoParaExcluir) return;

    if (textoConfirmacaoExclusao.trim().toUpperCase() !== 'EXCLUIR') {
      toast.error('Por favor, digite EXCLUIR para confirmar a exclusão.');
      return;
    }

    setExcluindoInstituicao(true);
    try {
      const p_idempotency_key = await buildIdempotencyKey('api_excluir_instituicao', {
        institution_id: instituicaoParaExcluir.id,
        delete_patients: excluirPacientes,
      });

      const { data, error } = await chamarApiPost('/api/rpc/api_excluir_instituicao', {
        p_institution_id: instituicaoParaExcluir.id,
        p_delete_patients: excluirPacientes,
        p_chave_idempotencia: p_idempotency_key,
      });

      if (error) throw error;

      const resposta = data as {
        success?: boolean;
        mensagem?: string;
        patients_deleted_count?: number;
        appointments_deleted_count?: number;
      };

      if (resposta?.success) {
        let mensagemSucesso = resposta.mensagem || 'Instituição excluída com sucesso!';
        if (excluirPacientes && resposta.patients_deleted_count && resposta.patients_deleted_count > 0) {
          mensagemSucesso += ` (${resposta.patients_deleted_count} pacientes e ${resposta.appointments_deleted_count || 0} consultas vinculadas foram excluídos)`;
        }
        toast.success(mensagemSucesso);
        setConfirmacaoExclusaoAberta(false);
        setInstituicaoParaExcluir(null);
        void refetchInstitutions();
      } else {
        throw new Error(resposta?.mensagem || 'Erro ao excluir instituição.');
      }
    } catch (erro: any) {
      console.error('Erro ao excluir instituição:', erro, JSON.stringify(erro, null, 2));
      const errorMessage = erro?.message || erro?.details || (erro instanceof Error ? (erro as any)?.message || erro : 'Erro ao tentar excluir a instituição.');
      toast.error(errorMessage);
    } finally {
      setExcluindoInstituicao(false);
    }
  };

  const handleEdit = useCallback((institution: Institution) => {
    setEditingInstitution(institution);
    setErrors({});
    setFormData({
      name: institution.name,
      cnpj: maskCNPJ(institution.cnpj || ''),
      address: institution.address || '',
      city: institution.city || '',
      state: institution.state || '',
      phone: maskPhone(institution.phone || ''),
      email: institution.email || '',
    });
    setIsDialogOpen(true);
  }, []);

  const fetchInstitutionByCNPJ = async (cnpj: string) => {
    try {
      const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
      if (!response.ok) return;
      const data = await response.json();
      setFormData(prev => ({
        ...prev,
        name: data.razao_social || data.nome_fantasia || prev.name,
        email: data.email || prev.email,
        phone: data.ddd_telefone_1 ? maskPhone(data.ddd_telefone_1) : prev.phone,
        address: [data.descricao_tipo_de_logradouro, data.logradouro, data.numero, data.complemento, data.bairro].filter(Boolean).join(' ') || prev.address,
        city: data.municipio || prev.city,
        state: data.uf || prev.state,
      }));
      toast.success('Dados preenchidos pelo CNPJ!');
    } catch {
      // ignore
    }
  };

  const resetForm = () => {
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
    setEditingInstitution(null);
  };

  const filteredInstitutions = institutions.filter((inst) => {
    if (statusFilter === 'ativos' && !inst.is_active) return false;
    if (statusFilter === 'inativos' && inst.is_active) return false;
    return true;
  });

  const institutionColumns: Array<CompactDataGridColumn<Institution>> = useMemo(() => [
    {
      key: 'name',
      header: 'Instituição',
      className: 'w-[25%] min-w-[200px]',
      filterable: true,
      filterValue: (institution) => institution.name,
      render: (institution) => (
        <div className="min-w-[240px]">
          <p className="truncate font-semibold text-slate-900" title={institution.name}>{institution.name}</p>
          <p className={`text-[11px] font-semibold ${institution.is_active ? 'text-green-700' : 'text-red-700'}`}>{institution.is_active ? 'Ativa' : 'Inativa'}</p>
        </div>
      ),
    },
    { key: 'cnpj', header: 'CNPJ', className: 'w-[15%] min-w-[130px]', render: (institution) => <span className="font-mono text-[11px]">{maskCNPJ(institution.cnpj || '') || '-'}</span> },
    { 
      key: 'city', 
      header: 'Cidade/UF', 
      className: 'w-[15%] min-w-[120px]', 
      filterable: true,
      filterValue: (institution) => `${institution.city || '-'}${institution.state ? ` - ${institution.state}` : ''}`,
      render: (institution) => `${institution.city || '-'}${institution.state ? ` - ${institution.state}` : ''}` 
    },
    { key: 'address', header: 'Endereço', className: 'w-[20%] min-w-[200px]', render: (institution) => <span className="block max-w-[360px] truncate" title={institution.address || '-'}>{institution.address || '-'}</span> },
    { key: 'phone', header: 'Telefone', className: 'w-[10%] min-w-[120px]', render: (institution) => maskPhone(institution.phone) || '-' },
    { key: 'email', header: 'E-mail', className: 'w-[15%] min-w-[150px]', render: (institution) => <span className="block max-w-[260px] truncate" title={institution.email || '-'}>{institution.email || '-'}</span> },
    {
      key: 'actions',
      header: 'Ações',
      className: 'w-[12%] min-w-[150px]',
      cellClassName: '',
      sticky: 'right',
      render: (institution) => (
        canManageInstitutions ? (
          <div className="flex flex-nowrap gap-1.5">
            <ActionButton 
              onClick={() => handleEdit(institution)} 
              icon={<Edit2 className="h-4 w-4" />} 
              label="Editar" 
              titleTooltip="Editar Instituição" 
            />
            <ActionButton 
              onClick={() => { void handleToggleActive(institution.id, institution.is_active); }} 
              icon={<Power className="h-4 w-4" />} 
              titleTooltip={institution.is_active ? "Desativar Instituição" : "Ativar Instituição"} 
              danger={institution.is_active} 
            />
            {eSuperadminRoot && (
              <ActionButton 
                onClick={() => abrirConfirmacaoExclusao(institution)} 
                icon={<Trash2 className="h-4 w-4" />} 
                label="Excluir" 
                titleTooltip="Excluir Instituição" 
                danger
              />
            )}
          </div>
        ) : null
      ),
    },
  ], [canManageInstitutions, handleEdit, handleToggleActive, abrirConfirmacaoExclusao, eSuperadminRoot]);

  if (!canReadInstitutions) {
    return (
      <div className="pt-20 pb-16 px-4 min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="text-center text-slate-500">
          <p>Acesso negado</p>
        </div>
      </div>
    );
  }


  return (
    <div className="h-full min-h-0 bg-slate-100 px-3 pb-3">
      <div className="flex h-full min-h-0 w-full flex-col">
        <PageHeader title="Instituições" description="Gerencie unidades, dados institucionais e status operacional" className="mb-3" compact actionsClassName="lg:flex-1" loading={loading}>
          <div className="flex flex-col md:flex-row flex-wrap w-full items-end gap-2 justify-end">
            <div className="relative min-w-0 flex-1 w-full md:min-w-[200px]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Buscar..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="delphi-input h-9 pl-10 w-full"
              />
            </div>
            
            <div className="flex-none w-full md:w-auto md:min-w-[165px]">
              <Select value={statusFilter} onValueChange={(val: any) => setStatusFilter(val)}>
                <SelectTrigger className="delphi-input h-9 w-full bg-white whitespace-nowrap">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">
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

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  className="h-9"
                  onClick={() => {
                    resetForm();
                    setIsDialogOpen(true);
                  }}
                  disabled={!canManageInstitutions}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Nova Instituição
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl p-6 bg-white rounded-2xl shadow-2xl border-0 overflow-hidden max-h-[90vh] overflow-y-auto">
                <div className="flex flex-col gap-6">
                  <div className="flex flex-col space-y-1.5">
                    <DialogTitle className="text-2xl font-bold text-slate-800 tracking-tight">
                      {editingInstitution ? 'Editar Instituição' : 'Nova Instituição'}
                    </DialogTitle>
                    <DialogDescription className="text-slate-500 font-medium">Preencha os dados abaixo para cadastrar ou atualizar a instituição.</DialogDescription>
                  </div>
                  <form onSubmit={handleSubmit} className="flex flex-col gap-8">
                      <div className="space-y-4">
                        <FormSectionTitle>Dados Principais</FormSectionTitle>
                        
                        <FormGrid>
                          <div className="flex flex-col sm:flex-row gap-5 col-span-1 sm:col-span-2 md:col-span-12">
                            <FormField label="Nome da Instituição" required className="flex-1" error={errors.name}>
                              <Input
                                id="name"
                                value={formData.name}
                                onChange={(event) => {
                                  setFormData({ ...formData, name: event.target.value.toUpperCase() });
                                  setErrors(prev => { const next = { ...prev }; delete next.name; return next; });
                                }}
                                onBlur={(event) => setFormData({ ...formData, name: normalizarEntradaTexto(event.target.value) })}
                                required
                                placeholder="Ex: CLINICA MUNICIPAL DE SAUDE"
                                style={{ textTransform: 'uppercase' }}
                                className={`delphi-input w-full bg-slate-50 border-slate-200 ${errors.name ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                              />
                            </FormField>

                            <FormField label="CNPJ" className="w-full sm:w-[180px] shrink-0" error={errors.cnpj}>
                              <Input
                                id="cnpj"
                                value={formData.cnpj}
                                onChange={(event) => {
                                  const masked = maskCNPJ(event.target.value);
                                  setFormData({ ...formData, cnpj: masked });
                                  setErrors(prev => { const next = { ...prev }; delete next.cnpj; return next; });
                                  const cleanCNPJ = masked.replace(/\D/g, '');
                                  if (cleanCNPJ.length === 14 && validateCNPJ(cleanCNPJ)) {
                                    void fetchInstitutionByCNPJ(cleanCNPJ);
                                  }
                                }}
                                placeholder="00.000.000/0000-00"
                                className={`delphi-input w-full bg-slate-50 border-slate-200 ${errors.cnpj ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                              />
                            </FormField>
                          </div>
                        </FormGrid>
                      </div>

                      <div className="space-y-4">
                        <FormSectionTitle>Endereço e Contato</FormSectionTitle>
                        
                        <FormGrid>
                          <FormField label="Endereço Completo" className="md:col-span-12">
                            <Input
                              id="address"
                              value={formData.address}
                              onChange={(event) => setFormData({ ...formData, address: event.target.value.toUpperCase() })}
                              onBlur={(event) => setFormData({ ...formData, address: normalizarEntradaTexto(event.target.value) })}
                              style={{ textTransform: 'uppercase' }}
                              className="delphi-input w-full bg-slate-50 border-slate-200"
                            />
                          </FormField>

                          <FormField label="Cidade" className="md:col-span-8">
                            <Input
                              id="city"
                              value={formData.city}
                              onChange={(event) => setFormData({ ...formData, city: event.target.value.toUpperCase() })}
                              onBlur={(event) => setFormData({ ...formData, city: normalizarEntradaTexto(event.target.value) })}
                              style={{ textTransform: 'uppercase' }}
                              className="delphi-input w-full bg-slate-50 border-slate-200"
                            />
                          </FormField>
                          
                          <FormField label="Estado" className="md:col-span-4">
                            <Input
                              id="state"
                              value={formData.state}
                              onChange={(event) => setFormData({ ...formData, state: event.target.value.toUpperCase() })}
                              style={{ textTransform: 'uppercase' }}
                              className="delphi-input w-full bg-slate-50 border-slate-200"
                            />
                          </FormField>

                          <FormField label="Telefone" className="md:col-span-6" error={errors.phone}>
                            <Input
                              id="phone"
                              value={formData.phone}
                              onChange={(event) => {
                                setFormData({ ...formData, phone: maskPhone(event.target.value) });
                                setErrors(prev => { const next = { ...prev }; delete next.phone; return next; });
                              }}
                              className={`delphi-input w-full bg-slate-50 border-slate-200 ${errors.phone ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                            />
                          </FormField>
                          
                          <FormField label="E-mail" className="md:col-span-6" error={errors.email}>
                            <Input
                              id="email"
                              type="email"
                              value={formData.email}
                              onChange={(event) => {
                                setFormData({ ...formData, email: event.target.value });
                                setErrors(prev => { const next = { ...prev }; delete next.email; return next; });
                              }}
                              className={`delphi-input w-full bg-slate-50 border-slate-200 ${errors.email ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                            />
                          </FormField>
                        </FormGrid>
                      </div>

                      <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 mt-2">
                        <Button
                          type="button"
                          variant="outline"
                          className="h-10 px-6 font-semibold"
                          onClick={() => setIsDialogOpen(false)}
                        >
                          Cancelar
                        </Button>
                        <Button type="submit" disabled={!canManageInstitutions} className="h-10 px-6 font-semibold bg-blue-600 hover:bg-blue-700">
                          {editingInstitution ? 'Atualizar' : 'Criar'}
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
          columns={institutionColumns}
          rows={filteredInstitutions}
          getRowKey={(institution) => institution.id}
          emptyMessage="Nenhuma instituição encontrada"
          rowClassName={(institution) => (!institution.is_active ? 'opacity-60' : '')}
          minWidth="1000px"
          loading={loading}
          pagination={true}
          resetPaginationDependency={searchTerm + statusFilter}
        />

        <div className="hidden">
          {filteredInstitutions.length === 0 ? (
            <Card className="col-span-full border-slate-300">
              <CardContent className="py-8 text-center text-slate-500">
                <Building2 className="h-12 w-12 mx-auto mb-4 text-slate-400" />
                <p>Nenhuma instituição encontrada</p>
              </CardContent>
            </Card>
          ) : (
            filteredInstitutions.map((institution) => (
              <Card key={institution.id} className={`hover:shadow-lg transition-shadow border-slate-300 ${!institution.is_active ? 'opacity-60' : ''}`}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-5 w-5 text-blue-600" />
                      <CardTitle className="text-lg">{institution.name}</CardTitle>
                    </div>
                    {!institution.is_active && (
                      <span className="px-2 py-1 bg-red-100 text-red-800 text-xs rounded border border-red-200">
                        Inativa
                      </span>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 text-sm">
                    {institution.cnpj && (
                      <div className="flex items-center gap-2 text-slate-600">
                        <span className="font-medium">CNPJ:</span>
                        <span>{institution.cnpj}</span>
                      </div>
                    )}

                    {institution.address && (
                      <div className="flex items-start gap-2 text-slate-600">
                        <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        <span>
                          {institution.address}
                          {institution.city && `, ${institution.city}`}
                          {institution.state && ` - ${institution.state}`}
                        </span>
                      </div>
                    )}

                    {institution.phone && (
                      <div className="flex items-center gap-2 text-slate-600">
                        <Phone className="h-4 w-4 text-slate-400" />
                        <span>{maskPhone(institution.phone)}</span>
                      </div>
                    )}

                    {institution.email && (
                      <div className="flex items-center gap-2 text-slate-600">
                        <Mail className="h-4 w-4 text-slate-400" />
                        <span className="truncate">{institution.email}</span>
                      </div>
                    )}
                  </div>

                  {canManageInstitutions && (
                    <div className="mt-4 pt-4 border-t border-slate-200 flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEdit(institution)}
                        className="border-slate-300 hover:bg-slate-50"
                        title="Editar"
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className={institution.is_active ? 'text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200' : 'text-green-600 hover:text-green-700 hover:bg-green-50 border-green-200'}
                        onClick={() => { void handleToggleActive(institution.id, institution.is_active); }}
                        title={institution.is_active ? "Desativar" : "Ativar"}
                      >
                        <Power className="h-4 w-4" />
                      </Button>
                      {eSuperadminRoot && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                          onClick={() => abrirConfirmacaoExclusao(institution)}
                          title="Excluir"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
      <ConfirmationDialog />

      <Dialog open={confirmacaoExclusaoAberta} onOpenChange={(aberto) => { if (!aberto && !excluindoInstituicao) { setConfirmacaoExclusaoAberta(false); setInstituicaoParaExcluir(null); } }}>
        <DialogContent className="sm:max-w-[520px] border-2 border-red-500/40 bg-white p-6 rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col space-y-1.5">
              <DialogTitle className="text-xl font-bold text-red-600 flex items-center gap-2">
                <Trash2 className="h-6 w-6 text-red-600 shrink-0" />
                Exclusão de Instituição
              </DialogTitle>
              <DialogDescription className="text-slate-500 font-medium">
                Esta ação realizará a exclusão lógica da instituição do sistema.
              </DialogDescription>
            </div>

            <div className="text-sm text-slate-600 space-y-3">
              <p>
                Você está prestes a excluir a instituição <span className="font-bold text-slate-800">{instituicaoParaExcluir?.name}</span>.
              </p>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3.5 text-amber-800 text-xs space-y-2">
                <div className="flex items-center gap-1.5 font-bold">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                  <span>OPÇÕES DE INTEGRIDADE DOS DADOS VINCULADOS</span>
                </div>
                <p className="leading-relaxed">
                  Pacientes e consultas vinculados a esta instituição precisam ser tratados. Selecione a opção desejada:
                </p>

                <div className="flex items-start gap-2.5 mt-3 cursor-pointer select-none" onClick={() => setExcluirPacientes(false)}>
                  <input
                    type="radio"
                    name="opcaoExclusaoPacientes"
                    id="preservarPacientes"
                    checked={!excluirPacientes}
                    onChange={() => setExcluirPacientes(false)}
                    className="mt-0.5 cursor-pointer"
                  />
                  <label htmlFor="preservarPacientes" className="font-semibold text-amber-900 cursor-pointer ml-2">
                    Preservar pacientes (a exclusão falhará se houver pacientes ativos)
                  </label>
                </div>
                
                <div className="flex items-start gap-2.5 mt-2 cursor-pointer select-none" onClick={() => setExcluirPacientes(true)}>
                  <input
                    type="radio"
                    name="opcaoExclusaoPacientes"
                    id="excluirPacientesCascata"
                    checked={excluirPacientes}
                    onChange={() => setExcluirPacientes(true)}
                    className="mt-0.5 cursor-pointer"
                  />
                  <label htmlFor="excluirPacientesCascata" className="font-semibold text-red-900 cursor-pointer ml-2">
                    Excluir todos os pacientes e suas consultas vinculadas (Ação Destrutiva)
                  </label>
                </div>
              </div>

              {excluirPacientes && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-800 text-xs space-y-1">
                  <span className="font-bold block">🚨 ATENÇÃO - EFEITOS DA EXCLUSÃO EM CASCATA:</span>
                  <ul className="list-disc pl-4 space-y-1 leading-relaxed">
                    <li>Todos os pacientes vinculados a esta instituição serão marcados como excluídos.</li>
                    <li>Todas as consultas e atendimentos clínicos desses pacientes serão marcados como excluídos.</li>
                  </ul>
                </div>
              )}

              <div className="space-y-2 pt-2">
                <label className="text-xs font-semibold text-slate-700 block">
                  Para confirmar a exclusão, digite <span className="font-bold text-red-600">EXCLUIR</span> no campo abaixo:
                </label>
                <Input
                  value={textoConfirmacaoExclusao}
                  onChange={(event) => setTextoConfirmacaoExclusao(event.target.value)}
                  placeholder="Digite EXCLUIR"
                  className="border-red-300 focus-visible:ring-red-500 uppercase tracking-widest font-mono text-sm"
                  disabled={excluindoInstituicao}
                  autoFocus
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 mt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => { setConfirmacaoExclusaoAberta(false); setInstituicaoParaExcluir(null); }}
                disabled={excluindoInstituicao}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={executarExclusaoInstituicao}
                disabled={textoConfirmacaoExclusao.trim().toUpperCase() !== 'EXCLUIR' || excluindoInstituicao}
                className="bg-red-600 hover:bg-red-700 text-white font-bold"
              >
                {excluindoInstituicao ? 'Excluindo...' : 'Confirmar Exclusão'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Institutions;
