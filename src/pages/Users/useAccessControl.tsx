"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { chamarApiPost, chamarApiGet } from '@/lib/workerApi';
import { useAuth } from '@/contexts/AuthContext';
import { maskPhone } from '@/utils/masks';
import { getOperationalErrorMessage, getErrorMessage } from '@/lib/errors';
import { buildIdempotencyKey } from '@/lib/idempotency';
import { Logger } from '@/utils/logger';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';

import type {
  RoleRow, PermissionRow,
  AccessUser, SpecialtyOption, DoctorCatalogRow, UserRoleAssignmentState,
  AccessSnapshot, PermissionMatrixRow, PermissionsMatrix, EffectivePermission,
  AuditEntry, AccessTab
} from './types';
const emptySnapshot: AccessSnapshot = {
  institutions: [],
  users: [],
  roles: [],
  permissions: [],
  role_permissions: [],
  user_permissions: [],
};

const ROLE_LABELS: Record<string, string> = {
  superadmin: 'Superadmin',
  admin: 'Administrador',
  medico: 'Profissional de saude',
  recepcao: 'Recepcao',
  auditor: 'Auditor',
  paciente: 'Paciente',
};

const ROOT_SUPERADMIN_ID = '80eb8e53-061c-478e-b687-3e67e2cf1731';

const getRoleLabel = (roleKey?: string | null, roleName?: string | null) => {
  const normalizedRoleName = typeof roleName === 'string' ? roleName.trim() : '';
  if (normalizedRoleName) return normalizedRoleName;

  const normalizedRoleKey = typeof roleKey === 'string' ? roleKey.trim().toLowerCase() : '';
  if (!normalizedRoleKey) return 'Sem perfil definido';
  return ROLE_LABELS[normalizedRoleKey] || normalizedRoleKey;
};

const getVisibleRoles = (user: AccessUser | null | undefined) => {
  if (!user) return [] as Array<{ role_key: string; role_name: string; institution_id?: string | null }>;

  const roleMap = new Map<string, { role_key: string; role_name: string; institution_id?: string | null }>();
  for (const role of user.roles || []) {
    const roleKey = typeof role.role_key === 'string' ? role.role_key.trim().toLowerCase() : '';
    if (!roleKey) continue;
    const roleScope = role.institution_id || 'global';
    const dedupeKey = `${roleKey}:${roleScope}`;
    if (!roleMap.has(dedupeKey)) {
      roleMap.set(dedupeKey, {
        role_key: roleKey,
        role_name: getRoleLabel(roleKey, role.role_name),
        institution_id: role.institution_id || null,
      });
    }
  }

  const profileRoleKey = typeof user.profile_role === 'string' ? user.profile_role.trim().toLowerCase() : '';
  if (roleMap.size === 0 && profileRoleKey) {
    roleMap.set(`${profileRoleKey}:global`, {
      role_key: profileRoleKey,
      role_name: getRoleLabel(profileRoleKey),
      institution_id: null,
    });
  }

  return [...roleMap.values()];
};

const userHasRole = (user: AccessUser | null | undefined, roleKey: string) => (
  getVisibleRoles(user)
).some((role) => role.role_key === roleKey);

const promoteSuperadminViaServer = async (targetUserId: string) => {
  const { data: sessionData, error: sessionError } = await chamarApiPost('/api/auth/session', {});
  const token = sessionData?.token;
  if (sessionError || !token) {
    throw new Error(sessionError || 'Sessao expirada. Entre novamente para promover superadministrador.');
  }

  const response = await fetch('/api/promote-superadmin', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ target_user_id: targetUserId }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof payload?.error === 'string' ? payload.error : 'Erro ao promover superadministrador.');
  }
};

const emptyPermissionMatrix: PermissionsMatrix = {
  roles: [],
  resources: [],
  actions: [],
  matrix: [],
  rls_policies: [],
  rpc_functions: [],
};

const normalizeSnapshot = (value: unknown): AccessSnapshot => {
  const raw = (value ?? {}) as Partial<AccessSnapshot>;
  return {
    institutions: Array.isArray(raw.institutions) ? raw.institutions : [],
    users: Array.isArray(raw.users) ? raw.users : [],
    users_total: typeof raw.users_total === 'number' ? raw.users_total : undefined,
    users_limit: typeof raw.users_limit === 'number' ? raw.users_limit : undefined,
    users_search: typeof raw.users_search === 'string' ? raw.users_search : null,
    roles: Array.isArray(raw.roles) ? raw.roles : [],
    permissions: Array.isArray(raw.permissions) ? raw.permissions : [],
    role_permissions: Array.isArray(raw.role_permissions) ? raw.role_permissions : [],
    user_permissions: Array.isArray(raw.user_permissions) ? raw.user_permissions : [],
  };
};

const normalizePermissionMatrix = (value: unknown): PermissionsMatrix => {
  const raw = (value ?? {}) as Partial<PermissionsMatrix>;
  return {
    generated_at: typeof raw.generated_at === 'string' ? raw.generated_at : undefined,
    roles: Array.isArray(raw.roles) ? raw.roles : [],
    resources: Array.isArray(raw.resources) ? raw.resources : [],
    actions: Array.isArray(raw.actions) ? raw.actions : [],
    matrix: Array.isArray(raw.matrix) ? raw.matrix : [],
    rls_policies: Array.isArray(raw.rls_policies) ? raw.rls_policies : [],
    rpc_functions: Array.isArray(raw.rpc_functions) ? raw.rpc_functions : [],
    inconsistencies: raw.inconsistencies ?? {},
  };
};

const getRoleSummary = (role?: RoleRow | null) => role?.operational_summary ?? null;
const getAssignableRoles = (roles: RoleRow[]) => roles.filter((role) => role.assignable !== false);
const getResourceLabel = (permission: Pick<PermissionMatrixRow | EffectivePermission, 'resource' | 'resource_label'>) =>
  permission.resource_label || permission.resource;
const getActionLabel = (permission: Pick<PermissionMatrixRow | EffectivePermission, 'action' | 'action_label'>) =>
  permission.action_label || permission.action;

const invokeAdminCreateUserWithRetry = async (body: Record<string, unknown>) => {
  const { chamarApiPostComRetry } = await import('@/lib/workerApi');
  const resultado = await chamarApiPostComRetry('/api/admin-create-user', body);

  if (resultado.error) {
    throw new Error(resultado.error);
  }

  return { data: resultado.data, error: null };
};
const getScopeLabel = (permission: Pick<PermissionMatrixRow | EffectivePermission, 'scope' | 'scope_label'>) =>
  permission.scope_label || permission.scope || 'Escopo não informado';
const isSuperadminUser = (user: AccessUser | null | undefined) => userHasRole(user, 'superadmin');

const isDoctorRole = (roleKey?: string | null) => roleKey === 'medico';
const STRUCTURAL_ROLE_PRIORITY = ['superadmin', 'admin', 'medico', 'recepcao', 'auditor', 'paciente'] as const;
const DEFAULT_PROFESSIONAL_COUNCIL = 'CRM';

const PROFESSIONAL_COUNCIL_OPTIONS = [
  { value: 'CRM', label: 'CRM - Medicina' },
  { value: 'CRO', label: 'CRO - Odontologia' },
  { value: 'COREN', label: 'COREN - Enfermagem' },
  { value: 'CREFITO', label: 'CREFITO - Fisioterapia/Terapia Ocupacional' },
  { value: 'CRP', label: 'CRP - Psicologia' },
  { value: 'CRF', label: 'CRF - Farmacia' },
  { value: 'CRN', label: 'CRN - Nutricao' },
  { value: 'CRESS', label: 'CRESS-DF - Serviço Social' },
  { value: 'CREFONO', label: 'CREFONO - Fonoaudiologia' },
  { value: 'CRBM', label: 'CRBM - Biomedicina' },
  { value: 'CRMV', label: 'CRMV - Veterinaria' },
  { value: 'CREF', label: 'CREF - Educacao Fisica' },
  { value: 'OUTRO', label: 'Outro conselho/registro' },
  { value: 'NAO_INFORMADO', label: 'Não informado' },
];

const getPreferredRoleKey = (user: AccessUser) => {
  const activeRoleKeys = getVisibleRoles(user)
    .map((role) => role.role_key || '')
    .filter(Boolean);

  for (const roleKey of STRUCTURAL_ROLE_PRIORITY) {
    if (activeRoleKeys.includes(roleKey)) return roleKey;
  }

  return activeRoleKeys[0] || '';
};

const getPreferredRoleInstitutionId = (user: AccessUser, roleKey: string) => {
  const matchingRole = getVisibleRoles(user).find((role) => role.role_key === roleKey && role.institution_id);
  return matchingRole?.institution_id || user.primary_institution_id || '';
};

export const useAccessControl = () => {
  const { hasPermission, institutionId, userRole, profile, refreshAccessContext } = useAuth();
  const [snapshot, setSnapshot] = useState<AccessSnapshot>(emptySnapshot);
  const [permissionMatrix, setPermissionMatrix] = useState<PermissionsMatrix>(emptyPermissionMatrix);
  const [effectivePermissions, setEffectivePermissions] = useState<EffectivePermission[]>([]);
  const [effectiveLoading, setEffectiveLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [snapshotLoaded, setSnapshotLoaded] = useState(false);
  const [permissionMatrixLoading, setPermissionMatrixLoading] = useState(false);
  const [permissionMatrixLoaded, setPermissionMatrixLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const activeAccessTab = (searchParams.get('tab') as AccessTab) || 'users';
  const setActiveAccessTab = (tab: AccessTab) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', tab);
      return next;
    });
  };
  const [selectedUserId, setSelectedUserId] = useState<string | null>('');
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [institutionOpen, setInstitutionOpen] = useState(false);
  const [manageUserOpen, setManageUserOpen] = useState(false);
  const [selectedRoleId, setSelectedRoleId] = useState<string>('');
  const [assignState, setAssignState] = useState<Record<string, UserRoleAssignmentState>>({});
  const [linkState, setLinkState] = useState<Record<string, string>>({});
  const [userSearch, setUserSearch] = useState('');
  const [userPage, setUserPage] = useState(1);
  const [userPageSize, setUserPageSize] = useState(50);
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('active');
  const [specialties, setSpecialties] = useState<SpecialtyOption[]>([]);
  const [doctorCatalog, setDoctorCatalog] = useState<DoctorCatalogRow[]>([]);

  const [userForm, setUserForm] = useState({
    full_name: '',
    email: '',
    password: '',
    phone: '',
    role_key: '',
    primary_institution_id: '',
    institution_ids: [] as string[],
    professional_council: DEFAULT_PROFESSIONAL_COUNCIL,
    professional_registration: '',
    specialty_id: '',
  });

  const [institutionForm, setInstitutionForm] = useState({
    name: '',
    cnpj: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    state: '',
  });

  const hydrateUsersWithRoleEvidence = useCallback(async (users: AccessUser[], currentInstitutions: any[]) => {
    if (!Array.isArray(users) || users.length === 0) return { users, missingInstitutions: [] };

    const userIds = [...new Set(users.map((user) => user.id).filter(Boolean))];
    if (userIds.length === 0) return { users, missingInstitutions: [] };

    // Mapa base com instituições já recebidas do snapshot
    const institutionsByIdMap = new Map<string, any>();
    for (const inst of currentInstitutions || []) {
      if (inst?.id && inst?.name) {
        institutionsByIdMap.set(inst.id, inst);
      }
    }

    // Executa buscas paralelas com tratamento individual de erro para nunca quebrar o snapshot
    const [rolesResult, userRolesResult, userInstsResult, profilesResult, allInstsResult] = await Promise.allSettled([
      chamarApiPost('/api/from/roles', {}),
      chamarApiPost('/api/from/user_roles', {}),
      chamarApiPost('/api/from/user_institutions', {}),
      chamarApiPost('/api/from/profiles', {}),
      chamarApiPost('/api/from/institutions', {})
    ]);    // Processa instituições retornadas pelo banco via REST
    if (allInstsResult.status === 'fulfilled' && Array.isArray(allInstsResult.value.data)) {
      for (const inst of allInstsResult.value.data) {
        if (inst?.id && inst?.name) {
          institutionsByIdMap.set(inst.id, inst);
        }
      }
    }

    // Tenta também a RPC SECURITY DEFINER caso disponível
    try {
      const { data: rpcInsts } = await chamarApiPost('/api/rpc/get_all_institutions_catalog');
      if (Array.isArray(rpcInsts)) {
        for (const inst of rpcInsts) {
          if (inst?.id && inst?.name) {
            institutionsByIdMap.set(inst.id, inst);
          }
        }
      }
    } catch {
      // Ignora se a RPC não existir
    }

    // Catálogo de roles
    const roleCatalog = new Map<string, { key?: string | null; name?: string | null }>();
    if (rolesResult.status === 'fulfilled' && Array.isArray(rolesResult.value.data)) {
      for (const role of rolesResult.value.data) {
        if (role?.id) {
          roleCatalog.set(role.id, { key: role.key, name: role.name });
        }
      }
    }

    // Mapeia roles dos usuários
    const activeUserRoles = new Map<string, Array<{ role_key?: string | null; role_name?: string | null; institution_id?: string | null }>>();
    if (userRolesResult.status === 'fulfilled' && Array.isArray(userRolesResult.value.data)) {
      for (const assignment of userRolesResult.value.data) {
        if (!assignment?.user_id) continue;
        const roleCatalogRow = assignment.role_id ? roleCatalog.get(assignment.role_id) : null;
        const roleKey = roleCatalogRow?.key || assignment.role || null;
        const nextAssignments = activeUserRoles.get(assignment.user_id) || [];
        nextAssignments.push({
          role_key: roleKey,
          role_name: getRoleLabel(roleKey, roleCatalogRow?.name),
          institution_id: assignment.institution_id || null,
        });
        activeUserRoles.set(assignment.user_id, nextAssignments);
      }
    }

    // Mapeia vínculos diretos de user_institutions
    const directUserInstitutions = new Map<string, string[]>();
    if (userInstsResult.status === 'fulfilled' && Array.isArray(userInstsResult.value.data)) {
      for (const link of userInstsResult.value.data) {
        if (link?.user_id && link?.institution_id) {
          const list = directUserInstitutions.get(link.user_id) || [];
          list.push(link.institution_id);
          directUserInstitutions.set(link.user_id, list);
        }
      }
    }

    // Perfis
    const profileRoles = new Map<string, string>();
    if (profilesResult.status === 'fulfilled' && Array.isArray(profilesResult.value.data)) {
      for (const profile of profilesResult.value.data) {
        if (profile?.id && typeof profile.role === 'string' && profile.role.trim()) {
          profileRoles.set(profile.id, profile.role.trim().toLowerCase());
        }
      }
    }

    // Monta os usuários combinando todas as fontes de institution_ids
    const nextUsers = users.map((user) => {
      const roles = activeUserRoles.get(user.id) || user.roles || [];
      const roleInstIds = roles.map(r => r.institution_id).filter(Boolean) as string[];
      const directInstIds = directUserInstitutions.get(user.id) || [];
      const rawSnapshotInstIds = (user.institution_ids || []).map((id: any) => typeof id === 'string' ? id : id?.institution_id || id?.id).filter(Boolean);
      
      const mergedInstIds = [...new Set([
        ...rawSnapshotInstIds,
        ...directInstIds,
        ...roleInstIds,
        ...(user.primary_institution_id ? [user.primary_institution_id] : []),
      ])];

      const directLinked = (user.linked_institutions || []).filter((i: any) => i?.name);
      for (const inst of directLinked) {
        if (inst?.id && inst?.name && !institutionsByIdMap.has(inst.id)) {
          institutionsByIdMap.set(inst.id, inst);
        }
      }

      return {
        ...user,
        profile_role: profileRoles.get(user.auth_user_id || user.id) || user.profile_role || null,
        roles,
        institution_ids: mergedInstIds,
        linked_institutions: directLinked.length > 0 ? directLinked : user.linked_institutions,
      };
    });

    // Se ainda houver IDs de instituições sem nome no mapa, busca especificamente por esses IDs
    const allInstIds = [...new Set(nextUsers.flatMap(u => u.institution_ids || []))];
    const missingInstIds = allInstIds.filter(id => !institutionsByIdMap.has(id));

    if (missingInstIds.length > 0) {
      try {
        const { data: specificInsts } = await chamarApiPost('/api/from/institutions', {});

        if (Array.isArray(specificInsts)) {
          for (const inst of specificInsts) {
            if (inst?.id && inst?.name) {
              institutionsByIdMap.set(inst.id, inst);
            }
          }
        }
      } catch (err) {
        Logger.warn('Erro ao resolver instituições pendentes por RPC segura', { err });
      }

      // Fallback de RPCs caso ainda falte algo
      const stillMissing = missingInstIds.filter(id => !institutionsByIdMap.has(id));
      if (stillMissing.length > 0) {
        try {
          const { data: apptData } = await chamarApiPost('/api/rpc/list_appointments_snapshot', { p_limit: 5000 } as any);
          if (Array.isArray(apptData)) {
            for (const appt of apptData) {
              if (appt?.institution_id && appt?.institution_name && !institutionsByIdMap.has(appt.institution_id)) {
                institutionsByIdMap.set(appt.institution_id, { id: appt.institution_id, name: appt.institution_name, is_active: true });
              }
            }
          }
        } catch (err) {
          Logger.warn('Erro no fallback de list_appointments_snapshot para instituições', { err });
        }

        try {
          const { data: ptData } = await chamarApiPost('/api/rpc/list_patients_catalog', { p_limit: 10000 } as any);
          if (Array.isArray(ptData)) {
            for (const pt of ptData) {
              if (pt?.institution_id && pt?.institution_name && !institutionsByIdMap.has(pt.institution_id)) {
                institutionsByIdMap.set(pt.institution_id, { id: pt.institution_id, name: pt.institution_name, is_active: true });
              }
            }
          }
        } catch (err) {
          Logger.warn('Erro no fallback de list_patients_catalog para instituições', { err });
        }
      }
    }

    const allResolvedInstitutions = Array.from(institutionsByIdMap.values());
    return { users: nextUsers, missingInstitutions: allResolvedInstitutions };
  }, []);

  const canReadAudit = hasPermission('audit', 'read', institutionId);
  const canReadPermissionMatrix =
    hasPermission('permissions', 'read', institutionId)
    || hasPermission('permissions', 'manage', institutionId);
  const canCreateUsers = hasPermission('users', 'create', institutionId);
  const canUpdateUsers = hasPermission('users', 'update', institutionId);
  const canCreateInstitutions = hasPermission('institutions', 'create', institutionId);
  const canManageUserRoles =
    hasPermission('user_roles', 'create', institutionId)
    || hasPermission('user_roles', 'update', institutionId);
  const canManageUserInstitutions =
    hasPermission('user_institutions', 'create', institutionId)
    || hasPermission('user_institutions', 'update', institutionId);

  const loadSnapshot = useCallback(async (options?: { search?: string, page?: number }) => {
    setLoading(true);
    try {
      const search = (options?.search ?? userSearch).trim();
      const page = options?.page ?? userPage;
      if (options?.page) setUserPage(options.page);
      
      const rpcParams: Record<string, any> = { p_limit: userPageSize };
      if (search) rpcParams.p_search = search;

      let response = await chamarApiPost('/api/rpc/get_access_control_snapshot', rpcParams);

      if (response.error && response.error?.includes('schema cache')) {
        // Fallback for older database versions that use p_page and p_page_size AND lack DEFAULT NULL
        response = await chamarApiPost('/api/rpc/get_access_control_snapshot', {
          p_institution_id: null,
          p_search: search || "",
          p_page: page,
          p_page_size: userPageSize,
        } as any);
      }

      const { data, error } = response;
      if (error) throw error;
      const normalized = normalizeSnapshot(data);
      const { users: nextUsers, missingInstitutions } = await hydrateUsersWithRoleEvidence(normalized.users, normalized.institutions);
      
      const combinedInstitutionsMap = new Map<string, any>();
      for (const inst of normalized.institutions || []) {
        if (inst?.id && inst?.name) combinedInstitutionsMap.set(inst.id, inst);
      }
      for (const inst of missingInstitutions || []) {
        if (inst?.id && inst?.name) combinedInstitutionsMap.set(inst.id, inst);
      }
      const allFinalInstitutions = Array.from(combinedInstitutionsMap.values());

      const next = {
        ...normalized,
        institutions: allFinalInstitutions,
        users: nextUsers,
      };
      
      const firstAssignableRole = getAssignableRoles(next.roles)[0] || next.roles[0];
      setSnapshot(next);
      setSelectedRoleId((current) => current || next.roles[0]?.id || '');
      setSelectedUserId((current) => current || next.users[0]?.id || '');
      setUserForm((current) => ({
        ...current,
        role_key: current.role_key || firstAssignableRole?.key || '',
        primary_institution_id: current.primary_institution_id || '',
        institution_ids: current.institution_ids,
      }));
      setSnapshotLoaded(true);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Erro ao carregar controle de acesso'));
    } finally {
      setLoading(false);
    }
  }, [hydrateUsersWithRoleEvidence, userPage, userPageSize, userSearch]);

  const loadPermissionMatrix = useCallback(async () => {
    if (!canReadPermissionMatrix) {
      setPermissionMatrix(emptyPermissionMatrix);
      setPermissionMatrixLoaded(true);
      return;
    }

    setPermissionMatrixLoading(true);
    try {
      const { data, error } = await chamarApiPost('/api/rpc/get_permissions_matrix', {});
      if (error) throw error;
      const next = normalizePermissionMatrix(data);
      setPermissionMatrix(next);
      setSelectedRoleId((current) => current || next.roles[0]?.id || '');
      setPermissionMatrixLoaded(true);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Erro ao carregar matriz de permissões'));
    } finally {
      setPermissionMatrixLoading(false);
    }
  }, [canReadPermissionMatrix]);

  const loadAuditEntries = useCallback(async () => {
    if (!canReadAudit) {
      setAuditEntries([]);
      return;
    }

    try {
      const { data, error } = await chamarApiPost('/api/rpc/list_audit_log_snapshot', {
        p_search: null,
        p_action: null,
        p_table_name: null,
        p_limit: 200,
      });

      if (error) throw error;
      setAuditEntries(Array.isArray(data) ? (data as AuditEntry[]) : []);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Erro ao carregar auditoria de acesso'));
    }
  }, [canReadAudit]);

  const loadRoleSupportCatalogs = useCallback(async () => {
    if (!canCreateUsers && !canManageUserRoles) return;

    try {
      const [specialtiesResult, doctorsResult] = await Promise.all([
        chamarApiPost('/api/rpc/list_specialties_catalog', {
          p_search: null,
          p_include_inactive: false,
        }),
        chamarApiPost('/api/rpc/list_doctors_catalog', {
          p_search: null,
          p_include_inactive: true,
        }),
      ]);

      if (specialtiesResult.error) throw specialtiesResult.error;

      setSpecialties(Array.isArray(specialtiesResult.data) ? (specialtiesResult.data as unknown as SpecialtyOption[]) : []);

      if (doctorsResult.error) {
        console.warn('Nao foi possivel carregar catalogo de profissionais para apoiar perfis medicos.', doctorsResult.error);
        setDoctorCatalog([]);
      } else {
        setDoctorCatalog(Array.isArray(doctorsResult.data) ? (doctorsResult.data as DoctorCatalogRow[]) : []);
      }
    } catch (error) {
      toast.error(getErrorMessage(error, 'Erro ao carregar catalogos operacionais de perfis'));
    }
  }, [canCreateUsers, canManageUserRoles]);

  const institutionsById = useMemo(
    () => new Map(snapshot.institutions.map((institution) => [institution.id, institution])),
    [snapshot.institutions],
  );
  const doctorCatalogByUserId = useMemo(
    () => new Map(doctorCatalog.map((doctor) => [doctor.user_id, doctor])),
    [doctorCatalog],
  );

  const buildAssignmentState = useCallback((user: AccessUser, partial?: Partial<UserRoleAssignmentState>): UserRoleAssignmentState => {
    const current = assignState[user.id];
    const doctorRecord = doctorCatalogByUserId.get(user.id);
    return {
      roleKey: partial?.roleKey ?? current?.roleKey ?? getPreferredRoleKey(user),
      institutionId:
        partial?.institutionId
        ?? current?.institutionId
        ?? getPreferredRoleInstitutionId(user, partial?.roleKey ?? current?.roleKey ?? getPreferredRoleKey(user)),
      professionalCouncil:
        partial?.professionalCouncil
        ?? current?.professionalCouncil
        ?? doctorRecord?.professional_council
        ?? DEFAULT_PROFESSIONAL_COUNCIL,
      professionalRegistration:
        partial?.professionalRegistration
        ?? current?.professionalRegistration
        ?? doctorRecord?.professional_registration
        ?? doctorRecord?.crm
        ?? '',
      specialtyId:
        partial?.specialtyId
        ?? current?.specialtyId
        ?? doctorRecord?.specialty_id
        ?? '',
      
    };
  }, [assignState, doctorCatalogByUserId]);

  const updateAssignState = useCallback((user: AccessUser, partial: Partial<UserRoleAssignmentState>) => {
    setAssignState((current) => ({
      ...current,
      [user.id]: (() => {
        const doctorRecord = doctorCatalogByUserId.get(user.id);
        const state = current[user.id];
        return {
          roleKey: partial.roleKey ?? state?.roleKey ?? getPreferredRoleKey(user),
          institutionId:
            partial.institutionId
            ?? state?.institutionId
            ?? getPreferredRoleInstitutionId(user, partial.roleKey ?? state?.roleKey ?? getPreferredRoleKey(user)),
          professionalCouncil:
            partial.professionalCouncil
            ?? state?.professionalCouncil
            ?? doctorRecord?.professional_council
            ?? DEFAULT_PROFESSIONAL_COUNCIL,
          professionalRegistration:
            partial.professionalRegistration
            ?? state?.professionalRegistration
            ?? doctorRecord?.professional_registration
            ?? doctorRecord?.crm
            ?? '',
          specialtyId:
            partial.specialtyId
            ?? state?.specialtyId
            ?? doctorRecord?.specialty_id
            ?? '',
          
        };
      })(),
    }));
  }, [doctorCatalogByUserId]);



  const matrixRoles = permissionMatrix.roles.length > 0 ? permissionMatrix.roles : snapshot.roles;
  const selectedRole = matrixRoles.find((role) => role.id === selectedRoleId) || matrixRoles[0];
  const selectedRoleSummary = getRoleSummary(selectedRole);
  const isRootSuperadmin = profile?.user_id === ROOT_SUPERADMIN_ID;
  const assignableRoles = useMemo(
    () => getAssignableRoles(snapshot.roles).filter((role) => role.key !== 'superadmin' || isRootSuperadmin),
    [isRootSuperadmin, snapshot.roles],
  );
  const isGlobalStructuralRole = (roleKey?: string | null) => ['superadmin', 'admin', 'auditor'].includes(roleKey || '');
  const userRoleRequiresInstitution = !isGlobalStructuralRole(userForm.role_key) && !isDoctorRole(userForm.role_key);
  const createUserBlockReason = useMemo(() => {
    if (!userForm.full_name.trim()) return 'Nome completo é obrigatório.';
    if (!userForm.email.trim()) return 'E-mail é obrigatório.';
    if (!userForm.password || userForm.password.length < 8) return 'A senha deve ter pelo menos 8 caracteres.';
    if (!userForm.role_key) return 'Selecione um perfil para o usuario.';
    if (isDoctorRole(userForm.role_key)) {
      if (!userForm.professional_registration.trim()) {
        return 'Informe o registro profissional para criar um perfil medico.';
      }
      if (!userForm.specialty_id) {
        return 'Selecione a especialidade principal do profissional de saude.';
      }
      return '';
    }
    if (!userRoleRequiresInstitution) return '';
    if (snapshot.institutions.length === 0) {
      return 'Cadastre uma instituicao antes de criar usuarios operacionais.';
    }
    if (!userForm.primary_institution_id && userForm.institution_ids.length === 0) {
      return 'Selecione a instituicao principal do usuario.';
    }
    return '';
  }, [
    userForm.full_name,
    userForm.email,
    userForm.password,
    snapshot.institutions.length,
    userForm.institution_ids.length,
    userForm.primary_institution_id,
    userForm.professional_registration,
    userForm.role_key,
    userForm.specialty_id,
    userRoleRequiresInstitution,
  ]);
  const selectedRoleMatrixRows = useMemo(
    () => permissionMatrix.matrix.filter((permission) => selectedRole && permission.role_id === selectedRole.id),
    [permissionMatrix.matrix, selectedRole],
  );
  const selectedRolePermissionStats = useMemo(() => {
    const applicable = selectedRoleMatrixRows.filter((permission) => permission.applicable !== false);
    return {
      totalApplicable: applicable.length,
      granted: applicable.filter((permission) => permission.granted).length,
      effective: applicable.filter((permission) => permission.effective_allowed).length,
      blocked: applicable.filter((permission) => permission.blocked_by_guardrail || permission.guardrail_status === 'denied_by_guardrail').length,
      inactiveGranted: applicable.filter((permission) => permission.granted && !permission.effective_allowed).length,
    };
  }, [selectedRoleMatrixRows]);

  const permissionsByResource = useMemo(() => {
    const grouped = new Map<string, PermissionMatrixRow[]>();
    if (!selectedRole) return [] as Array<[string, PermissionMatrixRow[]]>;

    for (const permission of permissionMatrix.matrix) {
      if (permission.role_id !== selectedRole.id) continue;
      if (permission.applicable === false) continue;
      const resourcePermissions = grouped.get(permission.resource) || [];
      resourcePermissions.push(permission);
      grouped.set(permission.resource, resourcePermissions);
    }

    return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [permissionMatrix.matrix, selectedRole]);

  const usersVisibleToViewer = useMemo(() => (
    snapshot.users.filter((item) => (
      (isRootSuperadmin || item.id !== ROOT_SUPERADMIN_ID)
      && !(userRole === 'admin' && isSuperadminUser(item))
    ))
  ), [isRootSuperadmin, snapshot.users, userRole]);

  const filteredUsers = useMemo(() => {
    const list = usersVisibleToViewer.filter((user) => {
      if (filterStatus === 'active' && !user.is_active) return false;
      if (filterStatus === 'inactive' && user.is_active) return false;
      return true;
    });

    if (snapshot.users_search && snapshot.users_search.trim()) {
      return list;
    }

    const term = userSearch.trim().toLowerCase();
    if (!term) return list;

    return list.filter((item) => {
      const roleText = getVisibleRoles(item)
        .map((role) => `${role.role_name || ''} ${role.role_key || ''}`)
        .join(' ')
        .toLowerCase();
      const institutionText = (item.institution_ids || [])
        .map((userInstitutionId) => institutionsById.get(userInstitutionId)?.name || userInstitutionId)
        .join(' ')
        .toLowerCase();

      return `${item.full_name} ${item.email} ${roleText} ${institutionText}`.toLowerCase().includes(term);
    });
  }, [institutionsById, snapshot.users_search, userSearch, usersVisibleToViewer, filterStatus]);
  const visibleUsers = filteredUsers.slice(0, 80);
  const hiddenUsersCount = Math.max(filteredUsers.length - visibleUsers.length, 0);
  const selectedUser = filteredUsers.find((user) => user.id === selectedUserId) || filteredUsers[0] || null;
  const selectedUserVisibleRoles = getVisibleRoles(selectedUser);
  const selectedUserAssignState = selectedUser ? buildAssignmentState(selectedUser) : null;
  const selectedUserEffectivePermissions = effectivePermissions;
  const canManageIndividualPermissions = userRole === 'superadmin';
  const selectedUserIndividualPermissionRows = useMemo(
    () => snapshot.user_permissions.filter((permission) => (
      selectedUser?.id
      && permission.user_id === selectedUser.id
      && !permission.revoked_at
    )),
    [selectedUser?.id, snapshot.user_permissions],
  );
  const selectedUserIndividualPermissionKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const permission of selectedUserIndividualPermissionRows) {
      keys.add(`${permission.permission_id}:${permission.institution_id || 'global'}`);
    }
    return keys;
  }, [selectedUserIndividualPermissionRows]);
  const individualPermissionsByResource = useMemo(() => {
    const grouped = new Map<string, PermissionRow[]>();
    for (const permission of snapshot.permissions) {
      const resourcePermissions = grouped.get(permission.resource) || [];
      resourcePermissions.push(permission);
      grouped.set(permission.resource, resourcePermissions);
    }

    return [...grouped.entries()]
      .map(([resource, permissions]) => [
        resource,
        permissions.sort((a, b) => a.action.localeCompare(b.action)),
      ] as [string, PermissionRow[]])
      .sort(([a], [b]) => a.localeCompare(b));
  }, [snapshot.permissions]);

  const selectedUserAuditEntries = useMemo(
    () => auditEntries.filter((entry) => selectedUser?.id && entry.user_id === selectedUser.id).slice(0, 25),
    [auditEntries, selectedUser],
  );

  const canManageTargetUser = useCallback((user: AccessUser | null, actionLabel: string) => {
    if (!user) {
      toast.error('Selecione um usuario para continuar');
      return false;
    }

    if (userRole === 'admin' && isSuperadminUser(user)) {
      toast.error(`Administradores nao podem ${actionLabel} do superadmin.`);
      return false;
    }

    if (user.id === ROOT_SUPERADMIN_ID && !isRootSuperadmin) {
      toast.error('Usuario estrutural protegido nao pode ser gerenciado por este operador.');
      return false;
    }

    return true;
  }, [isRootSuperadmin, userRole]);

  const loadEffectivePermissions = useCallback(async (userId: string) => {
    setEffectiveLoading(true);
    try {
      const { data, error } = await chamarApiPost('/api/rpc/get_user_effective_permissions', { p_user_id: userId });
      if (error) throw error;
      const payload = (data ?? {}) as { permissions?: EffectivePermission[] };
      setEffectivePermissions(Array.isArray(payload.permissions) ? payload.permissions : []);
    } catch (error) {
      setEffectivePermissions([]);
      toast.error(getErrorMessage(error, 'Erro ao carregar permissões efetivas'));
    } finally {
      setEffectiveLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!snapshotLoaded && !loading) { 
      void loadSnapshot({ search: '' });
    }
  }, [loadSnapshot, loading, snapshotLoaded]);

  // Recarrega automaticamente após 1.5s do primeiro carregamento bem-sucedido
  // para garantir que o JWT esteja completamente inicializado com o papel correto
  // e que as instituições vinculadas apareçam no primeiro render
  useEffect(() => {
    if (!snapshotLoaded) return;
    const timer = setTimeout(() => {
      void loadSnapshot({ search: '' });
    }, 1500);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshotLoaded]); // Só executa uma vez após o primeiro carregamento

  useEffect(() => {
    if (!snapshotLoaded) return;
    void loadRoleSupportCatalogs();
  }, [loadRoleSupportCatalogs, snapshotLoaded]);

  useEffect(() => {
    if (activeAccessTab === 'permissions' && canReadPermissionMatrix && !permissionMatrixLoaded && !permissionMatrixLoading) {
      void loadPermissionMatrix();
    }
  }, [activeAccessTab, canReadPermissionMatrix, loadPermissionMatrix, permissionMatrixLoaded, permissionMatrixLoading]);

  useEffect(() => {
    if (activeAccessTab === 'effective-access') {
      void loadAuditEntries();
    }
  }, [activeAccessTab, loadAuditEntries]);

  useEffect(() => {
    if (activeAccessTab === 'effective-access' && selectedUser?.id) {
      void loadEffectivePermissions(selectedUser.id);
    } else {
      setEffectivePermissions([]);
    }
  }, [activeAccessTab, loadEffectivePermissions, selectedUser?.id]);

  const toggleUserInstitution = (institutionId: string, checked: boolean) => {
    setUserForm((current) => {
      const next = new Set(current.institution_ids);
      if (checked) {
        next.add(institutionId);
      } else {
        next.delete(institutionId);
      }
      const institution_ids = [...next];
      return {
        ...current,
        institution_ids,
        primary_institution_id: institution_ids[0] || '',
      };
    });
  };

  const createUser = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const creatingGlobalStructuralRole = isGlobalStructuralRole(userForm.role_key);
      const institutionIds = creatingGlobalStructuralRole ? [] : userForm.institution_ids.length > 0
        ? userForm.institution_ids
        : (userForm.primary_institution_id ? [userForm.primary_institution_id] : []);
      const primaryInstitutionId = creatingGlobalStructuralRole ? null : userForm.primary_institution_id || institutionIds[0] || null;

      if (createUserBlockReason) {
        throw new Error(createUserBlockReason);
      }

      const createPayload = {
        full_name: userForm.full_name,
        email: userForm.email,
        role_key: userForm.role_key,
        primary_institution_id: primaryInstitutionId,
        institution_ids: institutionIds,
        professional_council: isDoctorRole(userForm.role_key) ? userForm.professional_council : null,
        professional_registration: isDoctorRole(userForm.role_key) ? userForm.professional_registration : null,
        specialty_id: isDoctorRole(userForm.role_key) ? userForm.specialty_id : null,
      };

      const idempotency_key = await buildIdempotencyKey('create_user_access', createPayload);

      await invokeAdminCreateUserWithRetry({
        full_name: userForm.full_name,
        email: userForm.email,
        password: userForm.password,
        phone: userForm.phone || null,
        role: userForm.role_key,
        institution_id: primaryInstitutionId,
        institution_ids: institutionIds,
        all_institutions: false,
        crm: isDoctorRole(userForm.role_key) ? userForm.professional_registration : null,
        professional_council: isDoctorRole(userForm.role_key) ? userForm.professional_council : null,
        specialty_id: isDoctorRole(userForm.role_key) ? userForm.specialty_id : null,
        idempotency_key,
      });
      toast.success('Usuario registrado no controle de acesso');
      setCreateUserOpen(false);
      setUserForm({
        full_name: '',
        email: '',
        password: '',
        phone: '',
        role_key: '',
        primary_institution_id: '',
        institution_ids: [],
        professional_council: DEFAULT_PROFESSIONAL_COUNCIL,
        professional_registration: '',
        specialty_id: '',
      });
      await loadSnapshot();
      if (permissionMatrixLoaded) {
        await loadPermissionMatrix();
      }
      if (activeAccessTab === 'effective-access' && selectedUser?.id) {
        await loadEffectivePermissions(selectedUser.id);
      }
      await loadRoleSupportCatalogs();
    } catch (error) {
      toast.error(await getOperationalErrorMessage(error, 'Erro ao criar usuario'));
    } finally {
      setSaving(false);
    }
  };

  const fetchInstitutionByCNPJ = async (cnpj: string) => {
    try {
      const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
      if (!response.ok) return;
      const data = await response.json();
      setInstitutionForm(prev => ({
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
      // ignora o erro
    }
  };
  const saveInstitution = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const p_idempotency_key = await buildIdempotencyKey('upsert_institution', {
        name: institutionForm.name,
        cnpj: institutionForm.cnpj || null,
        email: institutionForm.email || null,
        phone: institutionForm.phone || null,
        address: institutionForm.address || null,
        city: institutionForm.city || null,
        state: institutionForm.state || null,
      });

      const { error } = await chamarApiPost('/api/rpc/upsert_institution', {
        p_institution_id: null,
        p_name: institutionForm.name,
        p_cnpj: institutionForm.cnpj || null,
        p_email: institutionForm.email || null,
        p_phone: institutionForm.phone || null,
        p_address: institutionForm.address || null,
        p_city: institutionForm.city || null,
        p_state: institutionForm.state || null,
        p_is_active: true,
        p_idempotency_key,
      });

      if (error) throw error;
      toast.success('Instituição registrada');
      setInstitutionOpen(false);
      setInstitutionForm({ name: '', cnpj: '', email: '', phone: '', address: '', city: '', state: '' });
      await loadSnapshot();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Erro ao salvar instituição'));
    } finally {
      setSaving(false);
    }
  };

  const assignRole = async (user: AccessUser, overrides?: Partial<UserRoleAssignmentState>) => {
    if (!canManageTargetUser(user, 'alterar o perfil operacional')) return;

    const state = buildAssignmentState(user, overrides);
    if (!state?.roleKey) {
      toast.error('Selecione um perfil');
      return;
    }

    if (state.roleKey === 'superadmin' && !isRootSuperadmin) {
      toast.error('Somente o superadministrador raiz pode promover superadministradores.');
      return;
    }

    if (isDoctorRole(state.roleKey) && !state.professionalRegistration.trim()) {
      toast.error('Informe o registro profissional para operacionalizar o perfil medico.');
      return;
    }

    if (isDoctorRole(state.roleKey) && !state.specialtyId) {
      toast.error('Selecione a especialidade principal do profissional de saude.');
      return;
    }

    setSaving(true);
    try {
      const structuralGlobalProfile = isGlobalStructuralRole(state.roleKey);
      const scope = structuralGlobalProfile ? null : (overrides?.institutionId !== undefined ? (overrides.institutionId || null) : (state.institutionId || user.primary_institution_id || null));
      const operationName = structuralGlobalProfile ? 'set_user_access_profile' : 'set_user_operational_profile';
      const p_idempotency_key = await buildIdempotencyKey(operationName, {
        user_id: user.id,
        role_key: state.roleKey,
        institution_id: scope,
        professional_council: isDoctorRole(state.roleKey) ? state.professionalCouncil : null,
        professional_registration: isDoctorRole(state.roleKey) ? state.professionalRegistration : null,
        specialty_id: isDoctorRole(state.roleKey) ? state.specialtyId : null,
      });

      if (state.roleKey === 'superadmin') {
        await promoteSuperadminViaServer(user.id);
      } else if (structuralGlobalProfile) {
        const { error } = await chamarApiPost('/api/rpc/set_user_access_profile', {
          p_user_id: user.id,
          p_role_key: state.roleKey,
          p_institution_id: null,
          p_idempotency_key,
        });

        if (error) throw error;
      } else {
        const { error } = await chamarApiPost('/api/rpc/set_user_operational_profile', {
            p_user_id: user.id,
            p_role_key: state.roleKey,
            p_institution_id: scope,
            p_professional_registration: isDoctorRole(state.roleKey) ? state.professionalRegistration : null,
            p_specialty_id: isDoctorRole(state.roleKey) ? state.specialtyId : null,
            p_professional_council: isDoctorRole(state.roleKey) ? state.professionalCouncil : null,
            p_idempotency_key,
          });

        if (error) throw error;
      }
      toast.success('Usuário editado com sucesso!');
      await loadSnapshot();
      await loadRoleSupportCatalogs();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Erro ao editar usuário'));
    } finally {
      setSaving(false);
    }
  };

  const syncUserInstitutions = async (user: AccessUser, institutionIds: string[], roleKey?: string) => {
    if (!canManageTargetUser(user, 'gerenciar vinculos institucionais')) return;
    setSaving(true);
    try {
      const p_idempotency_key = await buildIdempotencyKey('sync_user_institutions', {
        user_id: user.id,
        institution_ids: institutionIds,
        role_key: roleKey,
      });

      const { data, error } = await chamarApiPost('/api/rpc/sync_user_institutions', {
        p_user_id: user.id,
        p_institution_ids: institutionIds,
        p_role_key: roleKey || null,
        p_idempotency_key,
      } as any);

      if (error) {
        // Fallback: faz o unlinking e linking individual
        const currentIds = user.institution_ids || [];
        const added = institutionIds.filter(id => !currentIds.includes(id));
        const removed = currentIds.filter(id => !institutionIds.includes(id));

        for (const id of removed) {
          await chamarApiPost('/api/rpc/link_user_institution', {
            p_user_id: user.id,
            p_institution_id: id,
            p_revoke: true,
          });
        }
        for (const id of added) {
          await chamarApiPost('/api/rpc/link_user_institution', {
            p_user_id: user.id,
            p_institution_id: id,
            p_revoke: false,
          });
        }
      }

      toast.success('Vínculos institucionais atualizados com sucesso!');
      await loadSnapshot();
      return data;
    } catch (error) {
      toast.error(getErrorMessage(error, 'Erro ao atualizar vínculos'));
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const linkInstitution = async (user: AccessUser) => {
    if (!canManageTargetUser(user, 'gerenciar vinculos institucionais')) return;

    if (isSuperadminUser(user)) {
      toast.error('Superadmin possui acesso global e não recebe vínculo institucional direto.');
      return;
    }

    if (isDoctorRole(user.profile_role) || userHasRole(user, 'medico')) {
      toast.error('Profissionais de saúde operam de forma global, sem vínculo institucional.');
      return;
    }

    const institutionId = linkState[user.id];
    if (!institutionId) {
      toast.error('Selecione uma instituição');
      return;
    }

    setSaving(true);
    try {
      const p_idempotency_key = await buildIdempotencyKey('link_user_institution', {
        user_id: user.id,
        institution_id: institutionId,
        revoke: false,
      });

      const { error } = await chamarApiPost('/api/rpc/link_user_institution', {
        p_user_id: user.id,
        p_institution_id: institutionId,
        p_revoke: false,
        p_idempotency_key,
      });

      if (error) throw error;
      toast.success('Vínculo institucional atualizado');
      await loadSnapshot();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Erro ao vincular instituição'));
    } finally {
      setSaving(false);
    }
  };

  /**
   * Vincula um usuário a uma instituição pelo ID direto, sem depender do linkState.
   * Usada pelos checkboxes do modal de gerenciamento.
   */
  const linkInstitutionById = async (user: AccessUser, institutionId: string) => {
    if (!canManageTargetUser(user, 'gerenciar vinculos institucionais')) return;
    if (isSuperadminUser(user)) {
      toast.error('Superadmin possui acesso global e não recebe vínculo institucional direto.');
      return;
    }
    if (isDoctorRole(user.profile_role) || userHasRole(user, 'medico')) {
      toast.error('Profissionais de saúde possuem vínculo exclusivo com sua Instituição Base.');
      return;
    }
    setSaving(true);
    try {
      const p_idempotency_key = await buildIdempotencyKey('link_user_institution', {
        user_id: user.id,
        institution_id: institutionId,
        revoke: false,
      });
      const { error } = await chamarApiPost('/api/rpc/link_user_institution', {
        p_user_id: user.id,
        p_institution_id: institutionId,
        p_revoke: false,
        p_idempotency_key,
      });
      if (error) throw error;
      toast.success('Vínculo institucional atualizado');
      await loadSnapshot();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Erro ao vincular instituição'));
    } finally {
      setSaving(false);
    }
  };

  const unlinkInstitution = async (user: AccessUser, institutionId: string) => {
    if (!canManageTargetUser(user, 'gerenciar vinculos institucionais')) return;

    setSaving(true);
    try {
      const p_idempotency_key = await buildIdempotencyKey('link_user_institution', {
        user_id: user.id,
        institution_id: institutionId,
        revoke: true,
      });

      const { error } = await chamarApiPost('/api/rpc/link_user_institution', {
        p_user_id: user.id,
        p_institution_id: institutionId,
        p_revoke: true,
        p_idempotency_key,
      });

      if (error) throw error;
      toast.success('Vínculo institucional removido.', {
        duration: 6000,
        action: {
          label: 'Desfazer',
          onClick: async () => {
            await linkInstitutionById(user, institutionId);
          },
        },
      });
      await loadSnapshot();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Erro ao desvincular instituição'));
    } finally {
      setSaving(false);
    }
  };

  const setUserActive = async (user: AccessUser, isActive: boolean) => {
    if (!canManageTargetUser(user, 'alterar o status operacional')) return;

    setSaving(true);
    try {

      // Tentativa 1: RPC com idempotency key
      const p_idempotency_key = await buildIdempotencyKey('set_user_active', {
        user_id: user.id,
        is_active: isActive,
      });

      const { data, error } = await chamarApiPost('/api/rpc/set_user_active', {
        p_user_id: user.id,
        p_is_active: isActive,
        p_idempotency_key,
      });

      if (error) {
        console.error('[setUserActive] RPC failed:', error);
        throw error;
      }

      if (data) {
        const payload = data as { success?: boolean; error?: string };
        if (payload.success === false && payload.error) {
          throw new Error(payload.error);
        }
      }

      toast.success(isActive ? 'Usuário ativado com sucesso!' : 'Usuário inativado com sucesso.', {
        duration: 6000,
        action: {
          label: 'Desfazer',
          onClick: async () => {
            await setUserActive(user, !isActive);
          },
        },
      });
      await loadSnapshot();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Erro ao alterar status do usuário'));
    } finally {
      setSaving(false);
    }
  };

  const updateUserName = async (user: AccessUser, newName: string) => {
    const trimmed = newName.trim().toUpperCase();
    if (!trimmed) {
      toast.error('O nome do usuário não pode estar vazio.');
      return false;
    }
    if (!canManageTargetUser(user, 'alterar o nome do usuário')) return false;

    setSaving(true);
    try {
      const { error: userError } = await chamarApiPost('/api/from/users', {});

      if (userError) throw userError;

      // Também atualiza na tabela doctors se houver registro vinculado
      try {
        await chamarApiPost('/api/from/doctors', {});
      } catch {
        // Ignora caso a coluna ou tabela doctors tenha schema diferente
      }

      toast.success('Nome do usuário atualizado com sucesso!');
      await loadSnapshot();
      return true;
    } catch (error) {
      toast.error(getErrorMessage(error, 'Erro ao atualizar o nome'));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const updatePermission = async (permission: PermissionMatrixRow, enabled: boolean) => {
    if (!selectedRole) return;
    if (permission.applicable === false) {
      toast.error(permission.semantic_reason || 'Permissão sem aplicabilidade operacional');
      return;
    }

    if (!permission.editable) {
      toast.error(permission.guardrail_reason || 'Permissão bloqueada por regra de segurança');
      return;
    }

    setSaving(true);
    try {
      const rpcName = enabled ? 'grant_permission' : 'revoke_permission';
      const p_idempotency_key = await buildIdempotencyKey(rpcName, {
        role_id: permission.role_id,
        permission_id: permission.permission_id,
        institution_id: permission.institution_id || null,
      });

      const { error } = await chamarApiPost('/api/rpc/' + rpcName, {
        p_role_id: permission.role_id,
        p_permission_id: permission.permission_id,
        p_institution_id: permission.institution_id || null,
        p_idempotency_key,
      });

      if (error) throw error;
      toast.success('Permissão atualizada');
      await loadSnapshot();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Erro ao atualizar permissão'));
    } finally {
      setSaving(false);
    }
  };

  void updatePermission;

  const applyPermissionChange = async (permission: PermissionMatrixRow, enabled: boolean) => {
    if (permission.applicable === false) {
      toast.error(permission.semantic_reason || 'Permissão sem aplicabilidade operacional');
      return;
    }

    if (!permission.editable) {
      toast.error(permission.guardrail_reason || 'Permissão bloqueada por regra de segurança');
      return;
    }

    setSaving(true);
    try {
      const rpcName = enabled ? 'grant_permission' : 'revoke_permission';
      const p_idempotency_key = await buildIdempotencyKey(rpcName, {
        role_id: permission.role_id,
        permission_id: permission.permission_id,
        institution_id: permission.institution_id || null,
      });

      const { error } = await chamarApiPost('/api/rpc/' + rpcName, {
        p_role_id: permission.role_id,
        p_permission_id: permission.permission_id,
        p_institution_id: permission.institution_id || null,
        p_idempotency_key,
      });

      if (error) throw error;
      toast.success(enabled ? 'Permissão concedida' : 'Permissão revogada');
      await loadPermissionMatrix();
      await loadSnapshot();
      if (activeAccessTab === 'effective-access' && selectedUser?.id) {
        await loadEffectivePermissions(selectedUser.id);
      }
    } catch (error) {
      toast.error(getErrorMessage(error, 'Erro ao atualizar permissão'));
    } finally {
      setSaving(false);
    }
  };

  const applyUserPermissionChange = async (permission: PermissionRow, enabled: boolean) => {
    if (!selectedUser) {
      toast.error('Selecione um usuario para gerenciar permissoes individuais');
      return;
    }

    if (!canManageIndividualPermissions) {
      toast.error('Somente superadmin pode conceder permissoes individuais.');
      return;
    }

    if (isSuperadminUser(selectedUser)) {
      toast.error('Superadmin possui permissao estrutural e nao recebe concessao individual.');
      return;
    }

    setSaving(true);
    try {
      const scope = permission.institution_id || selectedUser.primary_institution_id || institutionId || null;
      const rpcName = enabled ? 'grant_user_permission' : 'revoke_user_permission';
      const p_idempotency_key = await buildIdempotencyKey(rpcName, {
        user_id: selectedUser.id,
        permission_id: permission.id,
        institution_id: scope,
      });

      const { error } = await chamarApiPost('/api/rpc/' + rpcName, {
        p_user_id: selectedUser.id,
        p_permission_id: permission.id,
        p_institution_id: scope,
        p_idempotency_key,
      });

      if (error) throw error;
      toast.success(enabled ? 'Permissao individual concedida' : 'Permissao individual revogada');
      await loadSnapshot({ search: userSearch });
      await loadEffectivePermissions(selectedUser.id);
      if (profile?.user_id === selectedUser.id) {
        await refreshAccessContext();
      }
    } catch (error) {
      toast.error(getErrorMessage(error, 'Erro ao atualizar permissao individual'));
    } finally {
      setSaving(false);
    }
  };


    const renderDoctorAssignmentFields = (user: AccessUser, state: any) => (
      <div className="space-y-4 pt-4 mt-2 border-t border-slate-100">
        <div>
          <p className="text-[13px] font-bold text-[#003B71] uppercase tracking-wider">Dados Profissionais / Clínicos</p>
          <div className="mt-2 border-t border-slate-200" />
        </div>

        {/* Conselho + Registro */}
        <div className="grid grid-cols-12 gap-3.5">
          <div className="col-span-12 sm:col-span-6 space-y-1.5">
            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center">
              Conselho Profissional <span className="text-red-500 font-bold ml-1">*</span>
            </label>
            <Select
              value={state.professionalCouncil}
              onValueChange={(professionalCouncil) => updateAssignState(user, { professionalCouncil })}
            >
              <SelectTrigger className="h-11 rounded-2xl bg-slate-50 border-slate-200 hover:bg-slate-100/60 text-xs font-semibold text-slate-800 w-full transition-all focus:border-blue-400">
                <SelectValue placeholder="Selecione o conselho..." />
              </SelectTrigger>
              <SelectContent>
                {PROFESSIONAL_COUNCIL_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="col-span-12 sm:col-span-6 space-y-1.5">
            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center">
              Nº Registro Profissional <span className="text-red-500 font-bold ml-1">*</span>
            </label>
            <Input
              className="h-11 rounded-2xl bg-slate-50 border-slate-200 text-xs font-bold text-slate-800 placeholder:text-slate-400 focus:border-blue-400 transition-all uppercase"
              value={state.professionalRegistration}
              onChange={(event) => updateAssignState(user, { professionalRegistration: event.target.value })}
              placeholder="Ex: 123456"
            />
          </div>

          {/* Especialidade */}
          <div className="col-span-12 space-y-1.5">
            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center">
              Especialidade Principal <span className="text-red-500 font-bold ml-1">*</span>
            </label>
            <Select
              value={state.specialtyId || ''}
              onValueChange={(specialtyId) => updateAssignState(user, { specialtyId })}
            >
              <SelectTrigger className="h-11 rounded-2xl bg-slate-50 border-slate-200 hover:bg-slate-100/60 text-xs font-semibold text-slate-800 w-full transition-all focus:border-blue-400">
                <SelectValue placeholder="Selecione a especialidade..." />
              </SelectTrigger>
              <SelectContent>
                {specialties.map((specialty) => (
                  <SelectItem key={specialty.id} value={specialty.id}>{specialty.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    );

  return {
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
    individualPermissionsByResource,
    selectedUserAuditEntries,
    fetchInstitutionByCNPJ,
    selectedUserAssignState,
    selectedUserIndividualPermissionRows,
    renderDoctorAssignmentFields,
    unlinkInstitution,

    snapshot, setSnapshot,
    permissionMatrix, setPermissionMatrix,
    effectivePermissions, setEffectivePermissions,
    effectiveLoading, setEffectiveLoading,
    loading, setLoading,
    snapshotLoaded, setSnapshotLoaded,
    permissionMatrixLoading, setPermissionMatrixLoading,
    permissionMatrixLoaded, setPermissionMatrixLoaded,
    saving, setSaving,
    activeAccessTab, setActiveAccessTab,
    selectedUserId, setSelectedUserId,
    auditEntries, setAuditEntries,
    createUserOpen, setCreateUserOpen,
    institutionOpen, setInstitutionOpen,
    manageUserOpen, setManageUserOpen,
    selectedRoleId, setSelectedRoleId,
    assignState, setAssignState,
    linkState, setLinkState,
    userSearch, setUserSearch,
    userPage, setUserPage,
    userPageSize, setUserPageSize,
    filterStatus, setFilterStatus,
    specialties, setSpecialties,
    doctorCatalog, setDoctorCatalog,
    userForm, setUserForm,
    institutionForm, setInstitutionForm,
    hasPermission, institutionId, userRole, profile, refreshAccessContext,
    canCreateUsers, canManageUserRoles, canCreateInstitutions, canReadPermissionMatrix, canReadAudit, canManageIndividualPermissions,
    filteredUsers, visibleUsers, hiddenUsersCount,
    institutionsById,
    doctorCatalogByUserId,
    selectedRole, selectedUser, selectedUserIndividualPermissionKeys,
    isGlobalStructuralRole, isDoctorRole, userRoleRequiresInstitution,
    getAssignableRoles,
    normalizeSnapshot, hydrateUsersWithRoleEvidence,
    loadSnapshot, loadPermissionMatrix, loadAuditEntries, loadRoleSupportCatalogs,
    buildAssignmentState, updateAssignState, canManageTargetUser, loadEffectivePermissions,
    toggleUserInstitution, createUser, saveInstitution, setUserActive, updateUserName,
    linkInstitution, linkInstitutionById, assignRole, syncUserInstitutions,
    updatePermission, applyPermissionChange, applyUserPermissionChange
  };
};

