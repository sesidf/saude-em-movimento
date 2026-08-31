"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle,
  Edit2,
  KeyRound,
  Loader2,
  Plus,
  Power,
  Search,
  ShieldCheck,
  Stethoscope,
  User,
  UserPlus,
  Users as UsersIcon,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import PageHeader from '@/components/PageHeader';
import { CompactDataGrid, type CompactDataGridColumn } from '@/components/CompactDataGrid';
import { Button } from '@/components/ui/button';
import { ActionButton } from '@/components/ui/action-button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { FormSectionTitle, FormGrid, FormField } from '@/components/ui/standard-form';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { userService, UserManagementItem, RoleItem } from '@/servicos/users';
import { institutionService, Institution } from '@/servicos/institutions';
import { useConfirm } from '@/hooks/useConfirm';
import { getAvatarColor, getInitials, normalizarEntradaTexto } from '@/utils/formatters';
import { maskPhone } from '@/utils/masks';

export default function Users() {
  const { hasRole } = useAuth();
  const canManage = hasRole(['admin', 'root']);
  const { confirm, ConfirmationDialog } = useConfirm();

  const [users, setUsers] = useState<UserManagementItem[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Modais
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  const [targetUserForReset, setTargetUserForReset] = useState<UserManagementItem | null>(null);
  const [tempPasswordInput, setTempPasswordInput] = useState('Mudar@123');

  // Form State
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    phone: '',
    role_id: '',
    primary_institution_id: '',
    password: 'Mudar@123',
  });

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const [res, insts] = await Promise.all([
        userService.list(),
        institutionService.list(),
      ]);
      setUsers(res?.users || []);
      setRoles(res?.roles || []);
      setInstitutions(insts || []);
    } catch (err) {
      console.error('Erro ao buscar usuários:', err);
      toast.error('Erro ao carregar lista de usuários');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.full_name.trim()) {
      toast.error('Nome completo é obrigatório.');
      return;
    }

    try {
      if (editingUserId) {
        await userService.update(editingUserId, {
          full_name: normalizarEntradaTexto(formData.full_name),
          phone: formData.phone.trim() || undefined,
          primary_institution_id: formData.primary_institution_id || undefined,
          role_id: formData.role_id || undefined,
        });
        toast.success('Usuário atualizado com sucesso!');
      } else {
        if (!formData.email.trim()) {
          toast.error('E-mail é obrigatório para novo usuário.');
          return;
        }
        await userService.create({
          full_name: normalizarEntradaTexto(formData.full_name),
          email: formData.email.trim().toLowerCase(),
          phone: formData.phone.trim() || undefined,
          password: formData.password || 'Mudar@123',
          role_id: formData.role_id || undefined,
          primary_institution_id: formData.primary_institution_id || undefined,
        });
        toast.success('Usuário cadastrado com sucesso! Senha padrão definida.');
      }

      setIsNewDialogOpen(false);
      resetForm();
      await fetchUsers();
    } catch (err: any) {
      console.error('Erro ao salvar usuário:', err);
      toast.error(err.message || 'Erro ao salvar usuário');
    }
  };

  const handleToggleActive = async (userItem: UserManagementItem) => {
    const isAct = Boolean(userItem.is_active);
    const ok = await confirm(
      isAct ? `Deseja desativar o acesso de ${userItem.full_name}?` : `Deseja reativar o acesso de ${userItem.full_name}?`
    );
    if (!ok) return;

    try {
      await userService.update(userItem.id, { is_active: !isAct });
      setUsers((prev) =>
        prev.map((u) => (u.id === userItem.id ? { ...u, is_active: !isAct } : u))
      );
      toast.success(isAct ? 'Usuário desativado' : 'Usuário ativado');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao alterar status');
    }
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetUserForReset) return;

    try {
      await userService.resetPassword(targetUserForReset.id, tempPasswordInput);
      toast.success(`Senha de ${targetUserForReset.full_name} redefinida com sucesso!`);
      setIsResetDialogOpen(false);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao redefinir senha');
    }
  };

  const handleEdit = (userItem: UserManagementItem) => {
    setEditingUserId(userItem.id);
    setFormData({
      full_name: userItem.full_name,
      email: userItem.email,
      phone: maskPhone(userItem.phone || ''),
      role_id: '',
      primary_institution_id: userItem.primary_institution_id || '',
      password: '',
    });
    setIsNewDialogOpen(true);
  };

  const resetForm = () => {
    setEditingUserId(null);
    setFormData({
      full_name: '',
      email: '',
      phone: '',
      role_id: '',
      primary_institution_id: '',
      password: 'Mudar@123',
    });
  };

  const filteredUsers = users.filter((u) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      u.full_name.toLowerCase().includes(term) ||
      u.email.toLowerCase().includes(term) ||
      (u.role_names && u.role_names.toLowerCase().includes(term));

    if (!matchesSearch) return false;
    const isAct = Boolean(u.is_active);
    if (statusFilter === 'active') return isAct;
    if (statusFilter === 'inactive') return !isAct;
    return true;
  });

  const columns: Array<CompactDataGridColumn<UserManagementItem>> = useMemo(
    () => [
      {
        key: 'user',
        header: 'Usuário',
        className: 'w-[35%] min-w-[240px]',
        render: (item) => {
          const initials = getInitials(item.full_name);
          const colorClass = getAvatarColor(item.full_name);
          const isAct = Boolean(item.is_active);

          return (
            <div className="flex items-center gap-3">
              <div className={`inline-flex h-9 w-9 items-center justify-center rounded-full text-xs font-black border-2 border-white shadow-2xs shrink-0 ${colorClass}`}>
                {initials}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-bold text-slate-900 truncate" title={item.full_name}>
                  {item.full_name}
                </span>
                <span className="text-xs text-slate-500 font-mono truncate" title={item.email}>
                  {item.email}
                </span>
              </div>
            </div>
          );
        },
      },
      {
        key: 'role',
        header: 'Perfil de Acesso',
        className: 'w-[25%] min-w-[160px]',
        render: (item) => (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
            <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
            {item.role_names || 'Usuário Padrão'}
          </span>
        ),
      },
      {
        key: 'institution',
        header: 'Unidade Principal',
        className: 'w-[25%] min-w-[160px]',
        render: (item) => (
          <span className="text-xs text-slate-600 font-medium truncate">
            {item.institution_name || 'Todas as Unidades'}
          </span>
        ),
      },
      {
        key: 'actions',
        header: 'Ações',
        className: 'w-[1%] whitespace-nowrap',
        sticky: 'right',
        render: (item) =>
          canManage ? (
            <div className="flex items-center gap-1.5">
              <ActionButton
                onClick={() => handleEdit(item)}
                icon={<Edit2 className="w-4 h-4" />}
                titleTooltip="Editar Usuário"
              />
              <ActionButton
                onClick={() => {
                  setTargetUserForReset(item);
                  setTempPasswordInput('Mudar@123');
                  setIsResetDialogOpen(true);
                }}
                icon={<KeyRound className="w-4 h-4" />}
                titleTooltip="Redefinir Senha"
              />
              <ActionButton
                onClick={() => handleToggleActive(item)}
                icon={<Power className="w-4 h-4" />}
                titleTooltip={item.is_active ? 'Inativar Usuário' : 'Ativar Usuário'}
                danger={Boolean(item.is_active)}
              />
            </div>
          ) : null,
      },
    ],
    [canManage]
  );

  return (
    <div className="h-full min-h-0 bg-slate-100 px-3 pb-3 flex flex-col">
      <PageHeader
        title="Gestão de Usuários & Acessos"
        description="Controle de operadores, recepcionistas, gestores e perfis de permissão"
        className="mb-3"
        compact
        loading={loading}
      >
        <div className="flex flex-col md:flex-row flex-wrap w-full items-end gap-2 justify-end">
          <div className="relative min-w-0 flex-1 w-full md:min-w-[200px]">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Buscar por nome, e-mail ou cargo..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="delphi-input h-9 pl-10 w-full"
            />
          </div>

          <div className="flex-none w-auto min-w-[150px] shrink-0">
            <Select value={statusFilter} onValueChange={(val) => setStatusFilter(val)}>
              <SelectTrigger className="delphi-input h-9 w-full">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="active">Apenas Ativos</SelectItem>
                <SelectItem value="inactive">Apenas Inativos</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button
            className="h-9 min-w-[120px] bg-blue-600 text-white hover:bg-blue-700 font-bold"
            onClick={() => {
              resetForm();
              setIsNewDialogOpen(true);
            }}
            disabled={!canManage}
          >
            <UserPlus className="h-4 w-4 mr-2" />
            Novo Usuário
          </Button>
        </div>
      </PageHeader>

      <CompactDataGrid
        className="flex-1"
        columns={columns}
        rows={filteredUsers}
        getRowKey={(u) => u.id}
        emptyMessage="Nenhum usuário encontrado"
        rowClassName={(u) => (!u.is_active ? 'opacity-60' : '')}
        minWidth="850px"
        loading={loading}
        pagination={true}
        resetPaginationDependency={searchTerm + statusFilter}
      />

      {/* Modal de Criação / Edição */}
      <Dialog open={isNewDialogOpen} onOpenChange={setIsNewDialogOpen}>
        <DialogContent className="max-w-xl p-6 bg-white rounded-3xl shadow-2xl border-0 overflow-hidden max-h-[90vh] overflow-y-auto">
          <div className="flex flex-col gap-6">
            <div>
              <DialogTitle className="text-2xl font-bold text-slate-800 tracking-tight">
                {editingUserId ? 'Editar Usuário' : 'Novo Usuário do Sistema'}
              </DialogTitle>
              <DialogDescription className="text-slate-500 font-medium">
                Defina o perfil de acesso e credenciais do operador.
              </DialogDescription>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-6">
              <div className="space-y-4">
                <FormSectionTitle>Dados Cadastrais & Acesso</FormSectionTitle>
                <FormGrid>
                  <FormField label="Nome Completo" required className="md:col-span-12">
                    <Input
                      value={formData.full_name}
                      onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                      placeholder="Ex: João da Silva"
                      required
                      className="h-11 rounded-2xl bg-slate-50 border-slate-200 text-sm font-semibold"
                    />
                  </FormField>

                  {!editingUserId && (
                    <FormField label="E-mail de Acesso" required className="md:col-span-12">
                      <Input
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        placeholder="usuario@saude.gov.br"
                        required
                        className="h-11 rounded-2xl bg-slate-50 border-slate-200 text-sm"
                      />
                    </FormField>
                  )}

                  <FormField label="Telefone / WhatsApp" className="md:col-span-6">
                    <Input
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: maskPhone(e.target.value) })}
                      placeholder="(00) 00000-0000"
                      className="h-11 rounded-2xl bg-slate-50 border-slate-200 text-sm font-mono"
                    />
                  </FormField>

                  <FormField label="Cargo / Perfil" className="md:col-span-6">
                    <Select
                      value={formData.role_id}
                      onValueChange={(val) => setFormData({ ...formData, role_id: val })}
                    >
                      <SelectTrigger className="h-11 rounded-2xl bg-slate-50 border-slate-200 text-sm">
                        <SelectValue placeholder="Selecione o perfil" />
                      </SelectTrigger>
                      <SelectContent>
                        {roles.map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormField>

                  <FormField label="Unidade Principal" className="md:col-span-12">
                    <Select
                      value={formData.primary_institution_id}
                      onValueChange={(val) => setFormData({ ...formData, primary_institution_id: val })}
                    >
                      <SelectTrigger className="h-11 rounded-2xl bg-slate-50 border-slate-200 text-sm">
                        <SelectValue placeholder="Todas as Unidades (Geral)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Todas as Unidades (Global)</SelectItem>
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
                <Button type="button" variant="outline" className="h-10 px-6 font-semibold" onClick={() => setIsNewDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" className="h-10 px-6 font-semibold bg-blue-600 hover:bg-blue-700 font-bold">
                  {editingUserId ? 'Atualizar Usuário' : 'Criar Usuário'}
                </Button>
              </div>
            </form>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de Redefinição de Senha */}
      <Dialog open={isResetDialogOpen} onOpenChange={setIsResetDialogOpen}>
        <DialogContent className="max-w-md p-6 bg-white rounded-3xl shadow-2xl border-0 overflow-hidden">
          <div className="flex flex-col gap-5">
            <div>
              <DialogTitle className="text-xl font-bold text-slate-800">
                Redefinir Senha de Acesso
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500 mt-1">
                Uma senha temporária será definida para o usuário{' '}
                <strong className="text-slate-800">{targetUserForReset?.full_name}</strong>.
              </DialogDescription>
            </div>

            <form onSubmit={handleResetPasswordSubmit} className="flex flex-col gap-4">
              <FormField label="Nova Senha Temporária" required>
                <Input
                  value={tempPasswordInput}
                  onChange={(e) => setTempPasswordInput(e.target.value)}
                  placeholder="Mudar@123"
                  required
                  className="h-11 rounded-2xl bg-slate-50 border-slate-200 text-sm font-mono font-bold"
                />
              </FormField>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100 mt-2">
                <Button type="button" variant="outline" className="h-10 px-5" onClick={() => setIsResetDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" className="h-10 px-5 bg-blue-600 hover:bg-blue-700 font-bold">
                  Confirmar Redefinição
                </Button>
              </div>
            </form>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmationDialog />
    </div>
  );
}
