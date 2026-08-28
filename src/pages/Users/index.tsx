"use client";

import { useMemo, useCallback, useState, useEffect, useRef } from 'react';
import { Loader2, RefreshCw, Search, ShieldCheck, UserPlus, Stethoscope, Power, Edit2, KeyRound, CheckCircle, XCircle, Headphones, Users as UsersIcon, FileCheck, UserX, Building2, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CompactDataGrid, type CompactDataGridColumn } from '@/components/CompactDataGrid';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ActionButton } from '@/components/ui/action-button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogFooter, DialogHeader } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import PageHeader from '@/components/PageHeader';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

import { useAccessControl } from './useAccessControl';
import { CreateUserModal } from './components/CreateUserModal';
import { CreateInstitutionModal } from './components/CreateInstitutionModal';
import { ResetPasswordModal } from './components/ResetPasswordModal';
import type { AccessTab } from './types';
import { getAvatarColor, getInitials } from '@/utils/formatters';
import { CadastroProfissionalModal } from '@/components/CadastroProfissionalModal';
import { MultiSelect } from '@/components/ui/multi-select';
import { chamarApiPost, chamarApiGet } from '@/lib/workerApi';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

export default function Users() {
  const accessControl = useAccessControl();
  const { user: currentUser, userRole } = useAuth();
  const isRoot = userRole === 'superadmin' || (currentUser as any)?.role === 'superadmin';
  const [deleting, setDeleting] = useState(false);
  const [editingDoctorData, setEditingDoctorData] = useState<any | null>(null);
  const [editingDoctorId, setEditingDoctorId] = useState<string | null>(null);
  const [isDoctorModalOpen, setIsDoctorModalOpen] = useState(false);
  const [editingInstitutions, setEditingInstitutions] = useState<string[]>([]);
  const [specialties, setSpecialties] = useState<any[]>([]);
  const [directInstitutions, setDirectInstitutions] = useState<any[]>([]);
  const [userParaExcluir, setUserParaExcluir] = useState<any>(null);
  const [textoConfirmacaoExclusao, setTextoConfirmacaoExclusao] = useState('');

  useEffect(() => {
    async function fetchCatalogs() {
      try {
        const [specRes, instRes] = await Promise.allSettled([
          chamarApiPost('/api/rpc/list_specialties_catalog', { p_search: null, p_include_inactive: false }),
          chamarApiPost('/api/table/institutions/active', {}),
        ]);
        if (specRes.status === 'fulfilled' && specRes.value.data) {
          setSpecialties(specRes.value.data);
        }
        if (instRes.status === 'fulfilled' && Array.isArray(instRes.value.data)) {
          setDirectInstitutions(instRes.value.data);
        }
      } catch (err) {
        console.error(err);
      }
    }
    void fetchCatalogs();
  }, []);

  const isFirstRender = useRef(true);

  const {
    snapshot,
    permissionMatrix,
    effectiveLoading,
    loading,
    snapshotLoaded,
    permissionMatrixLoading,
    permissionMatrixLoaded,
    saving,
    activeAccessTab,
    setSelectedUserId,
    setCreateUserOpen,
    manageUserOpen, setManageUserOpen,
    setSelectedRoleId,
    userSearch, setUserSearch,
    filterStatus, setFilterStatus,
    canCreateUsers, canManageUserRoles, canReadPermissionMatrix,
    filteredUsers,
    institutionsById,
    selectedRole, selectedUser,
    isDoctorRole, isGlobalStructuralRole,
    loadSnapshot, loadPermissionMatrix, loadAuditEntries, loadRoleSupportCatalogs,
    updateAssignState, loadEffectivePermissions,
    setUserActive,
    updateUserName,
    assignRole,
    syncUserInstitutions,
    applyPermissionChange,
  } = accessControl;

  const [resetPasswordOpen, setResetPasswordOpen] = useState(false);
  const [resetPasswordUser, setResetPasswordUser] = useState<any>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [savingName, setSavingName] = useState(false);

  const {
    setActiveAccessTab,
    getVisibleRoles,
    isSuperadminUser,
    assignableRoles,
    canManageUserInstitutions,
    canUpdateUsers,
    matrixRoles,
    selectedRoleSummary,
    selectedRolePermissionStats,
    permissionsByResource,
    getActionLabel,
    getScopeLabel,
    usersVisibleToViewer,
    selectedUserVisibleRoles,
    selectedUserEffectivePermissions,
    getResourceLabel,
    selectedUserAssignState,
    renderDoctorAssignmentFields,
    unlinkInstitution,
  } = accessControl;

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const timer = setTimeout(() => {
      void loadSnapshot({ search: userSearch });
    }, 400);
    return () => clearTimeout(timer);
  }, [userSearch, loadSnapshot]);

  const isDoctorUser = Boolean(selectedUser && isDoctorRole(selectedUserAssignState?.roleKey || (selectedUser as any).primary_role_key || ''));
  const isSuperadminTarget = Boolean(selectedUserAssignState?.roleKey === 'superadmin' || (!selectedUserAssignState?.roleKey && selectedUser && accessControl.isSuperadminUser(selectedUser)));


  // Sincroniza o nome editado sempre que o usuário selecionado mudar
  useEffect(() => {
    if (selectedUser) {
      setEditedName(selectedUser.full_name || '');
      setIsEditingName(false);
    }
  }, [selectedUser?.id, selectedUser?.full_name]);

  // Carregamento automático na inicialização
  useEffect(() => {
    if (!snapshotLoaded && !loading) {
      loadSnapshot();
    }
  }, [snapshotLoaded, loading, loadSnapshot]);

  const handleResetPassword = useCallback((userItem: any) => {
    setResetPasswordUser(userItem);
    setResetPasswordOpen(true);
  }, []);

  const handleDeleteUser = useCallback(async (userItem: any) => {
    const { data: sessionData } = await chamarApiGet('/api/auth/session');
    const token = sessionData?.token;
    if (!token) {
      toast.error('Sessão expirada. Faça login novamente.');
      return;
    }

    setDeleting(true);
    try {
      const response = await fetch('/api/admin-delete-user', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ user_id: userItem.id }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'Erro ao excluir usuário.');
      }

      toast.success('Usuário excluído permanentemente com sucesso!');
      setUserParaExcluir(null);
      setTextoConfirmacaoExclusao('');
      void loadSnapshot();
    } catch (error: any) {
      toast.error((error as any)?.message || error || 'Erro ao excluir usuário.');
    } finally {
      setDeleting(false);
    }
  }, [loadSnapshot]);

  const handleSaveName = async () => {
    if (!selectedUser || !editedName.trim()) return;
    setSavingName(true);
    const ok = await updateUserName(selectedUser, editedName);
    if (ok) {
      setIsEditingName(false);
    }
    setSavingName(false);
  };

  const userColumns: Array<CompactDataGridColumn<any>> = useMemo(() => [
    {
      key: 'user',
      header: 'Usuário',
      className: 'w-[25%] min-w-[200px]',
      filterable: true,
      filterValue: (item) => item.full_name,
      render: (item) => {
        const initials = getInitials(item.full_name);
        const colorClass = getAvatarColor(item.full_name);
        const isDoctor = getVisibleRoles(item).some((role: any) => role.role_key === 'medico');
        return (
          <div className="flex items-center gap-3 min-w-[200px]">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-bold border shadow-sm ${colorClass}`}>
              {initials}
            </div>
            <div className="flex flex-col min-w-0 gap-0.5">
              <p className="truncate font-medium text-slate-900 flex items-center gap-1.5" title={item.full_name}>
                {item.full_name}
                {isDoctor && <span title="Profissional Médico"><Stethoscope className="h-3.5 w-3.5 text-blue-600 shrink-0" /></span>}
              </p>
              <p className="text-[11px] text-slate-500 truncate" title={item.email}>{item.email}</p>
              <p className={`text-[11px] font-semibold ${item.is_active ? 'text-emerald-700' : 'text-red-600'}`}>
                {item.is_active ? 'Ativo' : 'Inativo'}
              </p>
            </div>
          </div>
        );
      },
    },

    {
      key: 'roles',
      header: 'Cargo Atual',
      className: 'w-[22%]',
      filterable: true,
      filterValue: (item) => {
        const roles = getVisibleRoles(item);
        if (!roles || roles.length === 0) return 'Sem cargo';
        return roles.map((r: any) => r.role_name || r.role_key).join(', ');
      },
      filterLabel: (val: string) => {
        const normalized = (val || '').toLowerCase().trim();
        let icon = <UsersIcon className="h-3.5 w-3.5 text-slate-700 shrink-0" />;
        
        if (normalized.includes('superadmin') || normalized.includes('admin') || normalized.includes('administrador')) {
          icon = <ShieldCheck className="h-3.5 w-3.5 text-slate-700 shrink-0" />;
        } else if (normalized.includes('medico') || normalized.includes('profissional') || normalized.includes('saude') || normalized.includes('saúde')) {
          icon = <Stethoscope className="h-3.5 w-3.5 text-slate-700 shrink-0" />;
        } else if (normalized.includes('recepcao') || normalized.includes('recepção') || normalized.includes('atendimento')) {
          icon = <Headphones className="h-3.5 w-3.5 text-slate-700 shrink-0" />;
        } else if (normalized.includes('auditor') || normalized.includes('auditoria')) {
          icon = <FileCheck className="h-3.5 w-3.5 text-slate-700 shrink-0" />;
        } else if (normalized.includes('sem cargo')) {
          icon = <UserX className="h-3.5 w-3.5 text-slate-500 shrink-0" />;
        }

        return (
          <span className="flex items-center gap-2 font-semibold text-slate-800">
            {icon}
            <span className="uppercase text-xs">{val}</span>
          </span>
        );
      },
      render: (item) => {
        const roles = getVisibleRoles(item);
        if (!roles || roles.length === 0) {
          return (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold border bg-slate-50 text-slate-500 border-slate-200 uppercase">
              <UserX className="h-3 w-3 text-slate-400 shrink-0" />
              Sem cargo
            </span>
          );
        }
        
        return (
          <div className="flex flex-col gap-1 items-start">
            {roles.map((r: any) => {
              const roleName = r.role_name || r.role_key || '';
              const normalized = roleName.toLowerCase().trim();

              let badgeStyle = 'bg-slate-50 text-slate-700 border-slate-200';
              let badgeIcon = <UsersIcon className="h-3 w-3 text-slate-600 shrink-0" />;

              if (normalized.includes('superadmin') || normalized.includes('admin') || normalized.includes('administrador')) {
                badgeStyle = 'bg-purple-50 text-purple-700 border-purple-200 shadow-xs';
                badgeIcon = <ShieldCheck className="h-3 w-3 text-purple-700 shrink-0" />;
              } else if (normalized.includes('medico') || normalized.includes('profissional') || normalized.includes('saude') || normalized.includes('saúde')) {
                badgeStyle = 'bg-teal-50 text-teal-700 border-teal-200 shadow-xs';
                badgeIcon = <Stethoscope className="h-3 w-3 text-teal-700 shrink-0" />;
              } else if (normalized.includes('recepcao') || normalized.includes('recepção') || normalized.includes('atendimento')) {
                badgeStyle = 'bg-sky-50 text-sky-700 border-sky-200 shadow-xs';
                badgeIcon = <Headphones className="h-3 w-3 text-sky-700 shrink-0" />;
              } else if (normalized.includes('auditor') || normalized.includes('auditoria')) {
                badgeStyle = 'bg-amber-50 text-amber-700 border-amber-200 shadow-xs';
                badgeIcon = <FileCheck className="h-3 w-3 text-amber-700 shrink-0" />;
              }

              return (
                <Badge
                  key={r.role_id || r.role_key}
                  variant="outline"
                  className={cn(
                    "text-[10px] w-max font-bold uppercase py-0.5 px-2.5 rounded-full inline-flex items-center gap-1.5 transition-all",
                    badgeStyle
                  )}
                >
                  {badgeIcon}
                  {roleName}
                </Badge>
              );
            })}
          </div>
        );
      }
    },

    {
      key: 'institutions',
      header: 'Instituições Vinculadas',
      className: 'w-[20%]',
      filterable: true,
      filterValue: (item) => {
        const roles = accessControl.getVisibleRoles(item) || [];
        const isDoctor = roles.some((role: any) => accessControl.isDoctorRole(role.role_key || ''));
        const isSuperadmin = roles.some((role: any) => role.role_key === 'superadmin');
        if (isDoctor || isSuperadmin) return 'Não aplicável';

        const directLinked = (item.linked_institutions || []).filter((i: any) => i && i.name);
        const rawIds = Array.isArray(item.institution_ids) ? item.institution_ids : [];
        const userInstitutionIds = rawIds.map((val: any) => (typeof val === 'string' ? val : val?.id || val?.institution_id || '')).filter(Boolean);
        const roleInstitutionIds = (item.roles || []).map((r: any) => (typeof r === 'string' ? r : r?.institution_id)).filter(Boolean);
        const allUserInstIds = [...new Set([...userInstitutionIds, ...roleInstitutionIds, item.primary_institution_id].filter(Boolean))];

        const matchedFromCatalogs = allUserInstIds
          .map(id => (
            snapshot.institutions.find((inst: any) => inst.id === id) ||
            institutionsById.get(id) ||
            directInstitutions.find((inst: any) => inst.id === id)
          ))
          .filter((inst: any) => Boolean(inst && inst.name));

        const finalMap = new Map<string, any>();
        for (const inst of directLinked) if (inst?.id && inst?.name) finalMap.set(inst.id, inst);
        for (const inst of matchedFromCatalogs) if (inst?.id && inst?.name) finalMap.set(inst.id, inst);
        const linkedInstitutions = Array.from(finalMap.values());

        return linkedInstitutions.map((inst: any) => inst.name).join(', ') || 'Nenhuma instituição';
      },
      render: (item) => {
        const roles = accessControl.getVisibleRoles(item) || [];
        const isDoctor = roles.some((role: any) => accessControl.isDoctorRole(role.role_key || ''));
        const isSuperadmin = roles.some((role: any) => role.role_key === 'superadmin');
        if (isDoctor || isSuperadmin) {
          return <span className="text-[11px] text-slate-400 font-medium italic">Não aplicável</span>;
        }

        // 1. Instituições diretas do snapshot
        const directLinked = (item.linked_institutions || []).filter((i: any) => i && i.name);

        // 2. IDs para resolução cruzada com catálogos
        const rawIds = Array.isArray(item.institution_ids) ? item.institution_ids : [];
        const userInstitutionIds = rawIds.map((val: any) => (typeof val === 'string' ? val : val?.id || val?.institution_id || '')).filter(Boolean);
        const roleInstitutionIds = (item.roles || []).map((r: any) => (typeof r === 'string' ? r : r?.institution_id)).filter(Boolean);
        const allUserInstIds = [...new Set([...userInstitutionIds, ...roleInstitutionIds, item.primary_institution_id].filter(Boolean))];

        const matchedFromCatalogs = allUserInstIds
          .map(id => (
            snapshot.institutions.find((inst: any) => inst.id === id) ||
            institutionsById.get(id) ||
            directInstitutions.find((inst: any) => inst.id === id)
          ))
          .filter((inst: any) => Boolean(inst && inst.name));

        // Combina as duas listas sem duplicatas de ID
        const finalMap = new Map<string, any>();
        for (const inst of directLinked) {
          if (inst?.id && inst?.name) finalMap.set(inst.id, inst);
        }
        for (const inst of matchedFromCatalogs) {
          if (inst?.id && inst?.name) finalMap.set(inst.id, inst);
        }
        const linkedInstitutions = Array.from(finalMap.values());

        if (linkedInstitutions.length > 0) {
          return (
            <div className="flex flex-wrap gap-1.5 items-start">
              {linkedInstitutions.map((inst: any) => (
                <Badge
                  key={inst.id}
                  variant="outline"
                  className="text-[10px] w-max font-bold uppercase py-0.5 px-2.5 rounded-full inline-flex items-center gap-1.5 transition-all bg-indigo-50 text-indigo-700 border-indigo-200 shadow-xs"
                >
                  <Building2 className="h-3 w-3 text-indigo-700 shrink-0" />
                  {inst.name}
                </Badge>
              ))}
            </div>
          );
        }

        if (allUserInstIds.length === 0 && directLinked.length === 0) {
          return (
             <span className="text-[11px] text-slate-400 font-medium italic flex items-center gap-1">
               <Building2 className="h-3 w-3 shrink-0" />
               Nenhuma instituição
             </span>
          );
        }

        return (
           <span className="text-[11px] text-slate-400 font-medium italic flex items-center gap-1">
             <Building2 className="h-3 w-3 shrink-0" />
             Carregando vínculo...
           </span>
        );
      }
    },

    {
      key: 'actions',
      header: 'Ações',
      className: 'w-[1%] whitespace-nowrap text-left',
      sticky: 'right',
      render: (item) => {
        const roles = accessControl.getVisibleRoles(item) || [];
        const isMedico = roles.some((r: any) => r.role_key === 'medico') || item.profile_role === 'medico';

        return (
          <div className="flex flex-nowrap justify-end gap-1.5">
            {canUpdateUsers && (
              <ActionButton
                onClick={() => void handleResetPassword(item)}
                disabled={saving || deleting}
                icon={<KeyRound className="h-4 w-4" />}
                titleTooltip="Redefinir Senha do Usuário"
              />
            )}
            <ActionButton
              onClick={async () => {
                const roles = accessControl.getVisibleRoles(item) || [];
                const hasDoctorRole = roles.some((r: any) => accessControl.isDoctorRole(r.role_key || ''));

                if (hasDoctorRole) {
                  const { data: doctorData } = await chamarApiPost('/api/table/doctors/select', {});

                  if (doctorData) {
                    const profissionalEdicao = {
                      id: doctorData.id,
                      user_id: doctorData.user_id,
                      professional_council: doctorData.professional_council,
                      crm: doctorData.crm || doctorData.professional_registration,
                      specialty_id: doctorData.specialty_id || null,
                      is_active: doctorData.is_active,
                      full_name: item.full_name,
                      email: item.email,
                      specialty_name: doctorData.specialty?.name || '',
                      specialty_color: doctorData.specialty?.color || '',
                    };
                    setEditingDoctorId(doctorData.id);
                    setEditingDoctorData(profissionalEdicao);
                    setIsDoctorModalOpen(true);
                    return;
                  }
                }
                setSelectedUserId(item.id);
                setEditingInstitutions(item.institution_ids || []);
                setManageUserOpen(true);
              }}
              icon={<Edit2 className="h-4 w-4" />}
              label="Editar"
              titleTooltip="Editar Usuário"
            />
            {canUpdateUsers && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <ActionButton
                    disabled={saving || deleting}
                    icon={<Power className="h-4 w-4" />}
                    label={item.is_active ? 'Inativar' : 'Ativar'}
                    titleTooltip={item.is_active ? 'Inativar Usuário' : 'Ativar Usuário'}
                    danger={item.is_active}
                  />
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      {item.is_active ? 'Confirmar inativação' : 'Confirmar ativação'}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      {item.is_active
                        ? `Tem certeza que deseja inativar o usuário ${item.full_name}? Ele não poderá mais acessar o sistema.`
                        : `Tem certeza que deseja reativar o usuário ${item.full_name}?`}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      className={item.is_active ? "bg-red-600 hover:bg-red-700 text-white" : "bg-emerald-600 hover:bg-emerald-700 text-white"}
                      onClick={() => void setUserActive(item, !item.is_active)}
                    >
                      Confirmar
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            {isRoot && !isMedico && (
              <ActionButton
                disabled={saving || deleting}
                onClick={() => {
                  setUserParaExcluir(item);
                  setTextoConfirmacaoExclusao('');
                }}
                icon={<UserX className="h-4 w-4" />}
                titleTooltip="Excluir Usuário Permanentemente"
                danger
              />
            )}
          </div>
        );
      },
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [accessControl.canUpdateUsers, accessControl.canManageUserRoles, accessControl.canManageUserInstitutions, saving, deleting, handleResetPassword, handleDeleteUser, isRoot]);

  return (
    <div className="h-full min-h-0 bg-slate-100 px-3 pb-3 relative">
      {saving && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-slate-100/60 backdrop-blur-sm rounded-lg">
          <Loader2 className="h-10 w-10 animate-spin text-[#003B71] mb-4" />
          <p className="text-[#003B71] font-bold text-lg">Salvando alterações...</p>
          <p className="text-slate-500 text-sm mt-1">Por favor, aguarde um momento.</p>
        </div>
      )}
      <div className="flex h-full min-h-0 w-full flex-col">
        <Tabs value={activeAccessTab} onValueChange={(value) => setActiveAccessTab(value as AccessTab)} className="flex h-full min-h-0 flex-col space-y-0">
          <PageHeader
            title="Controle de Acesso"
            description="Usuários, unidades, vínculos e permissões gerenciados pelo sistema"
            className="mb-3"
            compact
            loading={loading}
            actions={
              <TabsList className="inline-flex items-center bg-slate-100/80 border border-slate-200/80 p-0.5 rounded-lg gap-0.5 shadow-inner h-8 w-max">
                <TabsTrigger
                  value="users"
                  className="h-7 px-3 text-[10px] uppercase tracking-wider font-extrabold transition-all duration-200 rounded-md data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm data-[state=active]:border data-[state=active]:border-slate-200/40 text-slate-500 hover:text-slate-800 hover:bg-white/40"
                >
                  Usuários
                </TabsTrigger>
                <TabsTrigger
                  value="roles"
                  className="h-7 px-3 text-[10px] uppercase tracking-wider font-extrabold transition-all duration-200 rounded-md data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm data-[state=active]:border data-[state=active]:border-slate-200/40 text-slate-500 hover:text-slate-800 hover:bg-white/40"
                >
                  Perfis
                </TabsTrigger>
                <TabsTrigger
                  value="permissions"
                  className="h-7 px-3 text-[10px] uppercase tracking-wider font-extrabold transition-all duration-200 rounded-md data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm data-[state=active]:border data-[state=active]:border-slate-200/40 text-slate-500 hover:text-slate-800 hover:bg-white/40"
                >
                  Permissões
                </TabsTrigger>
                <TabsTrigger
                  value="effective-access"
                  className="h-7 px-3 text-[10px] uppercase tracking-wider font-extrabold transition-all duration-200 rounded-md data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm data-[state=active]:border data-[state=active]:border-slate-200/40 text-slate-500 hover:text-slate-800 hover:bg-white/40"
                >
                  Acesso Efetivo
                </TabsTrigger>
              </TabsList>
            }
          >
            {activeAccessTab === 'users' ? (
              <div className="flex flex-col md:flex-row flex-wrap w-full items-center gap-2 justify-end">
                <div className="relative min-w-0 flex-1 w-full md:min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    value={userSearch}
                    onChange={(event) => setUserSearch(event.target.value)}
                    placeholder="Buscar paciente, CPF, profissional, registro, especialidade ou ticket..."
                    className="delphi-input h-9 pl-10"
                  />
                </div>
                
                <Select
                  value={filterStatus}
                  onValueChange={(val: 'all' | 'active' | 'inactive') => setFilterStatus(val)}
                >
                  <SelectTrigger className="delphi-input h-9 w-full md:w-auto md:min-w-[165px] bg-white whitespace-nowrap">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      <div className="flex items-center gap-2 whitespace-nowrap">
                        <span className="font-bold text-slate-800 text-xs whitespace-nowrap">Todos</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="active">
                      <div className="flex items-center gap-2 whitespace-nowrap">
                        <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 border bg-emerald-500/15 text-emerald-600 border-emerald-500/30">
                          <CheckCircle className="h-3 w-3" />
                        </div>
                        <span className="font-bold text-slate-800 text-xs whitespace-nowrap">Apenas Ativos</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="inactive">
                      <div className="flex items-center gap-2 whitespace-nowrap">
                        <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 border bg-rose-500/15 text-rose-600 border-rose-500/30">
                          <XCircle className="h-3 w-3" />
                        </div>
                        <span className="font-bold text-slate-800 text-xs whitespace-nowrap">Apenas Inativos</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>

                <div className="flex gap-2">
                  
                  <Button
                    variant="outline"
                    className="h-9 px-3"
                    onClick={() => {
                      void loadSnapshot({ search: userSearch });
                      void loadRoleSupportCatalogs();
                      if ((activeAccessTab as string) === 'permissions') void loadPermissionMatrix();
                      if ((activeAccessTab as string) === 'effective-access') {
                        void loadAuditEntries();
                        if (selectedUser?.id) void loadEffectivePermissions(selectedUser.id);
                      }
                    }}
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    {snapshotLoaded ? 'Atualizar' : 'Carregar'}
                  </Button>

                  {canCreateUsers ? (
                    <Button onClick={() => setCreateUserOpen(true)} className="h-9">
                      <UserPlus className="h-4 w-4 mr-2" />
                      Novo usuário
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </PageHeader>

          <TabsContent value="users" className="min-h-0 flex-1 flex-col mt-0 data-[state=active]:flex">
            <div className="flex min-h-0 flex-1 flex-col p-0 h-full">
              <div className="flex min-h-0 flex-1 flex-col h-full">
                <CompactDataGrid
                  columns={userColumns}
                  rows={filteredUsers}
                  getRowKey={(item: any) => item.id}
                  loading={!snapshotLoaded}
                  emptyMessage={
                    <div className="flex flex-col items-center justify-center p-8 text-center">
                      <div className="bg-blue-50 p-4 rounded-full mb-4">
                        <Search className="h-8 w-8 text-blue-400" />
                      </div>
                      <p className="text-lg font-bold text-slate-700">Nenhum usuário encontrado</p>
                      <p className="text-sm text-slate-500 max-w-sm mt-1">
                        Tente ajustar os filtros de busca ou verifique se o usuário já foi cadastrado no sistema.
                      </p>
                    </div>
                  }
                  pagination={true}
                  itemsPerPage={15}
                  estimatedRowHeight={72}
                  className="flex-1 h-full"
                  resetPaginationDependency={userSearch + filterStatus}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="roles" className="mt-3">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {snapshot.roles.map((role) => (
                <Card key={role.id} className="border-slate-300">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-blue-600" />
                      {role.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-slate-600 space-y-2">
                    <div><span className="font-medium">Chave:</span> {role.key}</div>
                    <div><span className="font-medium">Escopo:</span> {role.scope_label || (role.institution_id ? institutionsById.get(role.institution_id)?.name || role.institution_id : 'Global')}</div>
                    <div><span className="font-medium">Sistema:</span> {role.is_system ? 'Sim' : 'Nao'}</div>
                    <div><span className="font-medium">Risco:</span> {role.operational_summary?.risk_level || 'Não classificado'}</div>
                    <div className="rounded border border-slate-200 bg-slate-50 p-2">
                      <div className="font-medium text-slate-900">{role.operational_summary?.purpose || role.description || 'Perfil operacional'}</div>
                      <div className="mt-1 text-xs text-slate-500">{role.operational_summary?.scope || 'Escopo definido pelo backend'}</div>
                    </div>
                    <div>
                      <div className="font-medium text-emerald-700">Permite</div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {(role.operational_summary?.allowed_summary || []).length > 0
                          ? (role.operational_summary?.allowed_summary || []).map((item) => (
                            <Badge key={item} variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">{item}</Badge>
                          ))
                          : <span className="text-xs text-slate-500">Resumo aguardando baseline atualizada no banco.</span>}
                      </div>
                    </div>
                    <div>
                      <div className="font-medium text-red-700">Bloqueia</div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {(role.operational_summary?.blocked_summary || []).length > 0
                          ? (role.operational_summary?.blocked_summary || []).map((item) => (
                            <Badge key={item} variant="outline" className="border-red-200 bg-red-50 text-red-700">{item}</Badge>
                          ))
                          : <span className="text-xs text-slate-500">Resumo aguardando baseline atualizada no banco.</span>}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="permissions" className="mt-3">
            <Card className="border-slate-300">
              <CardHeader>
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <CardTitle>Permissões granulares</CardTitle>
                  <Select value={selectedRole?.id || ''} onValueChange={setSelectedRoleId}>
                    <SelectTrigger className="w-full md:w-72"><SelectValue placeholder="Perfil" /></SelectTrigger>
                    <SelectContent>
                      {matrixRoles.map((role) => (
                        <SelectItem key={role.id} value={role.id}>{role.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {selectedRole ? (
                  <div className="rounded border border-blue-200 bg-blue-50 p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-2">
                        <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">Perfil selecionado</div>
                        <div className="text-lg font-semibold text-slate-950">{selectedRole.name}</div>
                        <div className="text-sm text-slate-700">{selectedRoleSummary?.purpose || selectedRole.description || 'Perfil controlado pelo backend'}</div>
                        <div className="text-xs text-slate-500">{selectedRoleSummary?.scope || selectedRole.scope_label || 'Escopo calculado no banco'}</div>
                      </div>
                      {permissionMatrixLoaded ? (
                        <div className="grid min-w-full gap-2 sm:grid-cols-2 lg:min-w-[520px] lg:grid-cols-4">
                          <div className="rounded border border-blue-100 bg-white p-3">
                            <div className="text-xs uppercase text-slate-500">Aplicáveis</div>
                            <div className="text-xl font-semibold text-slate-950">{selectedRolePermissionStats.totalApplicable}</div>
                          </div>
                          <div className="rounded border border-blue-100 bg-white p-3">
                            <div className="text-xs uppercase text-slate-500">Concedidas</div>
                            <div className="text-xl font-semibold text-blue-700">{selectedRolePermissionStats.granted}</div>
                          </div>
                          <div className="rounded border border-blue-100 bg-white p-3">
                            <div className="text-xs uppercase text-slate-500">Efetivas</div>
                            <div className="text-xl font-semibold text-emerald-700">{selectedRolePermissionStats.effective}</div>
                          </div>
                          <div className="rounded border border-blue-100 bg-white p-3">
                            <div className="text-xs uppercase text-slate-500">Bloqueadas</div>
                            <div className="text-xl font-semibold text-red-700">{selectedRolePermissionStats.blocked + selectedRolePermissionStats.inactiveGranted}</div>
                          </div>
                        </div>
                      ) : null}
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <div>
                        <div className="mb-1 text-xs font-semibold uppercase text-emerald-700">Domínios permitidos</div>
                        <div className="flex flex-wrap gap-1">
                          {(selectedRoleSummary?.allowed_summary || []).length > 0
                            ? (selectedRoleSummary?.allowed_summary || []).map((item) => (
                              <Badge key={item} variant="outline" className="border-emerald-200 bg-white text-emerald-700">{item}</Badge>
                            ))
                            : <span className="text-xs text-slate-500">Resumo aguardando baseline atualizada no banco.</span>}
                        </div>
                      </div>
                      <div>
                        <div className="mb-1 text-xs font-semibold uppercase text-red-700">Bloqueios estruturais</div>
                        <div className="flex flex-wrap gap-1">
                          {(selectedRoleSummary?.blocked_summary || []).length > 0
                            ? (selectedRoleSummary?.blocked_summary || []).map((item) => (
                              <Badge key={item} variant="outline" className="border-red-200 bg-white text-red-700">{item}</Badge>
                            ))
                            : <span className="text-xs text-slate-500">Resumo aguardando baseline atualizada no banco.</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}

                {permissionMatrixLoaded && (
                  (permissionMatrix.inconsistencies?.permissions_without_detected_usage?.length || 0) > 0
                  || (permissionMatrix.inconsistencies?.rpc_without_authorization_marker?.length || 0) > 0
                ) ? (
                  <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    <div className="font-semibold">Atenção operacional</div>
                    <div>
                      O banco reportou {permissionMatrix.inconsistencies?.permissions_without_detected_usage?.length || 0} permissão(ões) sem uso operacional detectado e {permissionMatrix.inconsistencies?.rpc_without_authorization_marker?.length || 0} RPC(s) sem marcador explícito de autorização.
                    </div>
                  </div>
                ) : null}

                {!canReadPermissionMatrix ? (
                  <div className="rounded border border-slate-200 bg-white p-4 text-sm text-slate-500">
                    Matriz de permissões indisponível para o seu perfil atual.
                  </div>
                ) : permissionMatrixLoading ? (
                  <div className="flex items-center gap-2 rounded border border-slate-200 bg-white p-4 text-sm text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Carregando permissões granulares
                  </div>
                ) : !permissionMatrixLoaded ? (
                  <div className="rounded border border-slate-200 bg-white p-4 text-sm text-slate-500">
                    Clique em Atualizar para carregar a matriz de permissões sob demanda.
                  </div>
                ) : permissionsByResource.length === 0 ? (
                  <div className="rounded border border-slate-200 bg-white p-4 text-sm text-slate-500">
                    Nenhuma permissão aplicável encontrada para o perfil selecionado.
                  </div>
                ) : permissionsByResource.map(([resource, permissions]) => (
                  <div key={resource} className="rounded border border-slate-200 bg-white p-3">
                    <div className="mb-2">
                      <div className="font-semibold text-slate-900">{permissions[0]?.resource_label || resource}</div>
                      <div className="text-xs text-slate-400">{resource}</div>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                      {permissions.map((permission) => {
                        const blockedByGuardrail = Boolean(permission.blocked_by_guardrail || permission.guardrail_status === 'denied_by_guardrail');
                        const effectiveLabel = permission.effective_allowed
                          ? 'Efetiva'
                          : permission.granted
                            ? 'Bloqueada'
                            : 'Não efetiva';

                        return (
                          <label key={`${permission.role_id}-${permission.permission_id}-${permission.institution_id ?? 'global'}`} className="flex items-start gap-2 text-sm">
                            <Checkbox
                              checked={permission.granted}
                              onCheckedChange={(checked) => void applyPermissionChange(permission, Boolean(checked))}
                              disabled={saving || !selectedRole || !permission.editable}
                            />
                            <span className="space-y-2">
                              <span className="block font-medium text-slate-800">{getActionLabel(permission)}</span>
                              <span className="block text-[11px] text-slate-400">{permission.resource}.{permission.action}</span>
                              <span className="flex flex-wrap gap-1">
                                <Badge variant="outline" className={permission.granted ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 bg-slate-50 text-slate-500'}>
                                  {permission.granted ? 'Concedida no banco' : 'Não concedida'}
                                </Badge>
                                <Badge variant="outline" className={permission.effective_allowed ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}>
                                  {effectiveLabel}
                                </Badge>
                                {blockedByGuardrail ? (
                                  <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">
                                    Bloqueada por regra
                                  </Badge>
                                ) : null}
                              </span>
                              <span className="block text-xs text-slate-500">{getScopeLabel(permission)}</span>
                              {permission.guardrail_reason ? (
                                <span className="block text-xs text-amber-700">{permission.guardrail_reason}</span>
                              ) : null}
                              <span className="block text-xs text-slate-400">
                                {permission.used_by_function || permission.used_by_policy ? 'Regra ativa' : 'Sem regra operacional detectada'}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="institutions" className="mt-3">
            <Card className="border-slate-300">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Instituições cadastradas</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {snapshot.institutions.map((institution) => (
                    <Card key={institution.id} className="border-slate-200 shadow-none">
                      <CardContent className="pt-6 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="font-semibold text-slate-900">{institution.name}</div>
                          <Badge variant="outline" className={institution.is_active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}>
                            {institution.is_active ? 'Ativa' : 'Inativa'}
                          </Badge>
                        </div>
                        <div className="text-xs text-slate-500">CNPJ: {institution.cnpj || 'Não informado'}</div>
                        <div className="text-xs text-slate-500">Cidade: {institution.city || 'Não informada'}{institution.state ? `/${institution.state}` : ''}</div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="permissions" className="mt-3">
            <Card className="border-slate-300">
              <CardHeader>
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <CardTitle>Matriz operacional de permissões</CardTitle>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void loadPermissionMatrix()}
                    disabled={permissionMatrixLoading}
                  >
                    {permissionMatrixLoading ? 'Atualizando matriz...' : 'Atualizar matriz'}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {permissionMatrix.matrix.map((permission) => (
                  <div key={`${permission.resource}-${permission.action}-${permission.scope || 'global'}`} className="rounded border border-slate-200 p-3">
                    <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="font-semibold text-slate-900">{getResourceLabel(permission)} - {getActionLabel(permission)}</div>
                        <div className="text-xs text-slate-500">{permission.resource}.{permission.action}</div>
                      </div>
                      <Badge variant="outline" className={permission.effective_allowed ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}>
                        {permission.effective_allowed ? 'Operacional' : 'Restrita'}
                      </Badge>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="effective-access" className="mt-3">
            <Card className="border-slate-300">
              <CardHeader>
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <CardTitle>Acesso efetivo por usuário</CardTitle>
                  <Select value={selectedUser?.id || ''} onValueChange={setSelectedUserId}>
                    <SelectTrigger className="w-full md:w-80"><SelectValue placeholder="Usuário" /></SelectTrigger>
                    <SelectContent>
                      {usersVisibleToViewer.map((user) => (
                        <SelectItem key={user.id} value={user.id}>{user.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {selectedUser ? (
                  <>
                    <div className="grid gap-3 md:grid-cols-3">
                      <Card className="border-slate-200 shadow-none">
                        <CardContent className="pt-6 text-sm space-y-1">
                          <div className="font-semibold text-slate-900">{selectedUser.full_name}</div>
                          <div className="text-slate-500">{selectedUser.email}</div>
                          <div className="text-slate-500">{selectedUser.auth_status}</div>
                        </CardContent>
                      </Card>
                      <Card className="border-slate-200 shadow-none">
                        <CardContent className="pt-6 text-sm space-y-2">
                          <div className="font-semibold text-slate-900">Perfis ativos</div>
                          <div className="flex flex-wrap gap-2">
                            {selectedUserVisibleRoles.length === 0 ? (
                              <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                                Sem perfil definido
                              </Badge>
                            ) : null}
                            {selectedUserVisibleRoles.map((role) => (
                              <Badge key={`${role.role_key}-${role.institution_id}`} variant="outline">
                                {role.role_name || role.role_key}
                              </Badge>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                      <Card className="border-slate-200 shadow-none">
                        <CardContent className="pt-6 text-sm space-y-2">
                          <div className="font-semibold text-slate-900">Instituição</div>
                          {isSuperadminUser(selectedUser) ? (
                            <Badge className="border-blue-200 bg-blue-50 text-blue-700">Acesso global</Badge>
                          ) : isDoctorUser ? (
                            <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600 font-normal">
                              Sem restrição institucional
                            </Badge>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {(selectedUser.institution_ids || []).map((userInstitutionId) => (
                                <div key={userInstitutionId} className="flex items-center gap-2 rounded border border-slate-200 bg-slate-50 px-2 py-1">
                                  <span>{institutionsById.get(userInstitutionId)?.name || userInstitutionId.slice(0, 8)}</span>
                                  {canManageUserInstitutions ? (
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="ghost"
                                      className="h-6 px-2 text-xs text-red-700 hover:text-red-800"
                                      onClick={() => void unlinkInstitution(selectedUser, userInstitutionId)}
                                      disabled={saving}
                                    >
                                      Desvincular
                                    </Button>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </div>

                    <div className="rounded border border-slate-200 bg-white p-4">
                      <div className="mb-3 font-semibold text-slate-900">Permissões efetivas do perfil</div>
                      {effectiveLoading ? (
                        <div className="flex items-center gap-2 text-sm text-slate-500">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Atualizando permissões efetivas
                        </div>
                      ) : selectedUserEffectivePermissions.length === 0 ? (
                        <div className="text-sm text-slate-500">Nenhuma permissão efetiva encontrada para este usuário.</div>
                      ) : (
                        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                          {selectedUserEffectivePermissions.map((permission) => (
                            <div key={`${permission.resource}-${permission.action}-${permission.institution_id ?? 'global'}`} className="rounded border border-slate-200 px-3 py-2 text-sm">
                              <div className="font-medium text-slate-900">{getResourceLabel(permission)}</div>
                              <div className="text-slate-600">{getActionLabel(permission)}</div>
                              <div className="text-[11px] text-slate-400">{permission.resource}.{permission.action}</div>
                              <div className="mt-1 flex flex-wrap gap-1">
                                {permission.origin ? (
                                  <Badge variant="outline" className={permission.origin === 'user_permission' ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 bg-slate-50 text-slate-600'}>
                                    {permission.origin === 'user_permission' ? 'Individual' : 'Perfil'}
                                  </Badge>
                                ) : null}
                                <Badge variant="outline" className={permission.effective_allowed ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}>
                                  {permission.effective_allowed ? 'Efetiva' : 'Bloqueada'}
                                </Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-slate-500">Nenhum usuário selecionado.</div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Dialog open={manageUserOpen} onOpenChange={setManageUserOpen}>
          <DialogContent className="max-w-2xl p-0 bg-white rounded-2xl shadow-2xl border-0 overflow-hidden">
            <div className="flex flex-col h-full max-h-[90vh]">
              {/* CABEÇALHO */}
              <div className="px-7 py-5 bg-white border-b border-slate-100 flex-shrink-0 flex justify-between items-center">
                <div className="flex flex-col space-y-1">
                  <DialogTitle className="text-2xl font-bold text-slate-900 tracking-tight">Editar Usuário</DialogTitle>
                  <DialogDescription className="text-slate-500 text-xs font-medium mt-1">
                    Visualize e edite as permissões, cargo e informações do usuário.
                  </DialogDescription>
                </div>

              </div>

              {!selectedUser ? (
                <div className="p-7 text-sm text-slate-500 flex-1">Selecione um usuário para gerenciar.</div>
              ) : (
                <div className="flex flex-col flex-1 min-h-0">
                  <div className="p-7 space-y-6 flex-1 overflow-y-auto">
                    {/* SEÇÃO 1: DADOS DE ACESSO */}
                    <div className="space-y-4">
                      <h3 className="text-blue-600 font-bold uppercase text-[13px] tracking-wider border-b border-slate-100 pb-1.5">
                        DADOS DE ACESSO
                      </h3>
                      
                      <div className="grid grid-cols-12 gap-4">
                        {/* Nome Completo */}
                        <div className="col-span-12 space-y-1.5">
                          <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center">
                            Nome Completo <span className="text-red-500 font-bold ml-1">*</span>
                          </label>
                          <Input
                            value={editedName}
                            onChange={(e) => {
                              setEditedName(e.target.value.toUpperCase());
                              if (!isEditingName) setIsEditingName(true);
                            }}
                            placeholder="EX: JOAO DA SILVA"
                            style={{ textTransform: 'uppercase' }}
                            className="h-11 rounded-2xl bg-slate-50 border-slate-200 text-xs font-bold text-slate-800 placeholder:text-slate-400 focus:border-blue-400"
                          />
                        </div>

                        {/* E-mail */}
                        <div className="col-span-12 space-y-1.5">
                          <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center">
                            E-mail (Login de Acesso)
                          </label>
                          <Input
                            type="email"
                            value={selectedUser.email}
                            disabled
                            className="h-11 rounded-2xl bg-slate-100/50 border-slate-200 text-xs font-semibold text-slate-500 cursor-not-allowed"
                          />
                        </div>

                        {/* Perfil Operacional */}
                        <div className="col-span-12 sm:col-span-4 space-y-1.5">
                          <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center">
                            Perfil do Usuário <span className="text-red-500 font-bold ml-1">*</span>
                          </label>
                          <Select
                            value={selectedUserAssignState?.roleKey || ''}
                            onValueChange={(roleKey) => updateAssignState(selectedUser, { roleKey })}
                          >
                            <SelectTrigger className="h-11 rounded-2xl bg-slate-50 border-slate-200 text-xs font-bold text-slate-800 focus:border-blue-400">
                              <SelectValue placeholder="Selecione o perfil..." />
                            </SelectTrigger>
                            <SelectContent>
                              {assignableRoles.map((role) => (
                                <SelectItem key={role.id} value={role.key}>{role.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Instituições Vinculadas (MultiSelect) */}
                        {!isDoctorUser && !isSuperadminTarget && (
                          <div className="col-span-12 sm:col-span-8 space-y-1.5">
                            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center">
                              Instituições Vinculadas
                            </label>
                            <MultiSelect
                              options={snapshot.institutions.filter(inst => inst.is_active).map(inst => ({ label: inst.name, value: inst.id }))}
                              selected={editingInstitutions}
                              onChange={setEditingInstitutions}
                              placeholder="Selecione as instituições..."
                              emptyMessage="Nenhuma instituição encontrada."
                              className="rounded-2xl bg-slate-50 border-slate-200 text-xs font-bold text-slate-800 focus:border-blue-400"
                            />
                            <p className="text-[10px] text-slate-400 font-medium leading-tight pt-0.5">
                              O usuário visualizará e cadastrará apenas consultas e pacientes vinculados às instituições selecionadas.
                            </p>
                          </div>
                        )}
                        {!isDoctorUser && isSuperadminTarget && (
                          <div className="col-span-12 sm:col-span-8 space-y-1.5">
                            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center">
                              Instituições Vinculadas
                            </label>
                            <Select disabled>
                              <SelectTrigger className="h-11 rounded-2xl bg-slate-50 border-slate-200 text-xs font-bold text-slate-400 cursor-not-allowed">
                                <SelectValue placeholder="Acesso amplo / global" />
                              </SelectTrigger>
                            </Select>
                            <p className="text-[10px] text-slate-400 font-medium leading-tight pt-0.5">
                              Este perfil possui acesso irrestrito a todas as instituições da rede.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {isDoctorUser && (
                      selectedUserAssignState && renderDoctorAssignmentFields(selectedUser, selectedUserAssignState)
                    )}
                  </div>

                  {/* RODAPÉ */}
                  <div className="px-7 py-4 bg-slate-50/80 border-t border-slate-100 flex justify-end gap-3 flex-shrink-0">
                    <Button
                      type="button"
                      variant="outline"
                      className="px-6 h-11 rounded-2xl text-slate-700 text-xs font-bold border-slate-200 hover:bg-slate-100 transition-all cursor-pointer"
                      onClick={() => {
                        setManageUserOpen(false);
                        setIsEditingName(false);
                      }}
                    >
                      Cancelar
                    </Button>
                    <Button
                      type="button"
                      className="px-6 h-11 rounded-2xl bg-blue-500 hover:bg-blue-600 text-white text-xs font-bold shadow-xs transition-all cursor-pointer disabled:opacity-50"
                      disabled={saving || savingName || !canManageUserRoles}
                      onClick={async () => {
                        if (!selectedUser) return;

                        if (isEditingName && editedName.trim() && editedName !== selectedUser.full_name) {
                          await handleSaveName();
                        }

                        const targetRoleKey = selectedUserAssignState?.roleKey || selectedUser.profile_role || 'recepcao';
                        const isGlobal = isGlobalStructuralRole(targetRoleKey);
                        const isDoctor = isDoctorRole(targetRoleKey);
                        const requiresInstitution = !isGlobal && !isDoctor;
                        const targetInstitutions = (isGlobal || isDoctor) ? [] : editingInstitutions;

                        if (requiresInstitution && targetInstitutions.length === 0) {
                          toast.error('Selecione ao menos uma instituição para o usuário.');
                          return;
                        }

                        const primaryInstId = (isGlobal || isDoctor) ? null : (targetInstitutions[0] || null);

                        // 1. Sincroniza vínculos institucionais e permissões de forma atômica
                        await syncUserInstitutions(selectedUser, targetInstitutions, targetRoleKey);

                        // 2. Se for médico ou perfil operacional estruturado, atualiza também os dados específicos
                        if (isDoctorRole(targetRoleKey)) {
                          await assignRole(selectedUser, {
                            roleKey: targetRoleKey,
                            institutionId: primaryInstId || '',
                          });
                        }

                        setManageUserOpen(false);
                        setIsEditingName(false);
                      }}
                    >
                      {(savingName || saving) ? (
                        <div className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Salvando...</span>
                        </div>
                      ) : (
                        'Salvar Usuário'
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        <CreateUserModal accessControl={accessControl} />
        <CreateInstitutionModal accessControl={accessControl} />
        <ResetPasswordModal
          open={resetPasswordOpen}
          onOpenChange={setResetPasswordOpen}
          user={resetPasswordUser}
          onSuccess={() => void loadSnapshot()}
        />

        {/* Modal de Confirmação de Exclusão Definitiva de Usuário (Superadmin Root) */}
        <Dialog
          open={!!userParaExcluir}
          onOpenChange={(open) => {
            if (!open && !deleting) {
              setUserParaExcluir(null);
              setTextoConfirmacaoExclusao('');
            }
          }}
        >
          <DialogContent className="sm:max-w-[520px] border-2 border-red-500/40 bg-white p-6 rounded-2xl shadow-2xl">
            <DialogHeader className="mb-2">
              <DialogTitle className="flex items-center gap-2 text-red-600 text-lg font-bold">
                <AlertTriangle className="h-6 w-6 text-red-600 shrink-0" />
                Excluir Usuário Permanentemente (Superadmin Root)
              </DialogTitle>
              <DialogDescription className="text-slate-600 pt-2 space-y-2 text-sm">
                <span className="font-semibold text-slate-800 block">
                  Você está prestes a apagar permanentemente o usuário <span className="text-red-700 font-bold">{userParaExcluir?.full_name}</span> ({userParaExcluir?.email}).
                </span>
                <div className="bg-red-50 border border-red-200 rounded-md p-3 text-red-800 text-xs leading-relaxed space-y-1">
                  <span className="font-bold block">⚠️ ATENÇÃO - AÇÃO IRREVERSÍVEL E DE EXPURGO TOTAL:</span>
                  <ul className="list-disc pl-4 space-y-0.5">
                    <li>Todas as credenciais e dados de acesso serão removidos.</li>
                    <li>O usuário perderá totalmente qualquer acesso ao sistema de forma imediata.</li>
                    <li>As permissões e históricos vinculados a este perfil de acesso serão inativados.</li>
                  </ul>
                </div>
              </DialogDescription>
            </DialogHeader>

            <div className="py-3 space-y-2">
              <label className="text-xs font-semibold text-slate-700 block">
                Para confirmar a exclusão permanente, digite <span className="font-bold text-red-600">EXCLUIR</span> abaixo:
              </label>
              <Input
                value={textoConfirmacaoExclusao}
                onChange={(e) => setTextoConfirmacaoExclusao(e.target.value)}
                placeholder="Digite EXCLUIR"
                className="border-red-300 focus-visible:ring-red-500 uppercase tracking-widest font-mono text-sm"
                disabled={deleting}
                autoFocus
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-0 mt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setUserParaExcluir(null);
                  setTextoConfirmacaoExclusao('');
                }}
                disabled={deleting}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => { void handleDeleteUser(userParaExcluir); }}
                disabled={textoConfirmacaoExclusao.trim().toUpperCase() !== 'EXCLUIR' || deleting}
                className="bg-red-600 hover:bg-red-700 text-white font-bold"
              >
                {deleting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Excluindo...
                  </>
                ) : (
                  'Confirmar Exclusão'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <CadastroProfissionalModal
          aberto={isDoctorModalOpen}
          aoFechar={() => {
            setIsDoctorModalOpen(false);
            setEditingDoctorId(null);
            setEditingDoctorData(null);
          }}
          aoSalvarComSucesso={() => {
            setTimeout(() => { void loadSnapshot(); }, 400);
          }}
          idProfissionalEdicao={editingDoctorId}
          profissionalEdicao={editingDoctorData}
          especialidades={specialties}
          instituicoes={snapshot.institutions.filter((i: any) => i.is_active).map((i: any) => ({ id: i.id, name: i.name, is_active: i.is_active }))}
          podeProvisionarUsuarios={true}
        />
      </div>
    </div>
  );
};


