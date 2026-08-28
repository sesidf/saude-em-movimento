type InstitutionRow = {
  id: string;
  name: string;
  cnpj?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  is_active?: boolean;
};

export type RoleRow = {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  institution_id?: string | null;
  is_system?: boolean;
  is_active?: boolean;
  scope_label?: string | null;
  assignable?: boolean;
  permissions_editable?: boolean;
  operational_summary?: {
    purpose?: string;
    scope?: string;
    risk_level?: string;
    allowed_summary?: string[];
    blocked_summary?: string[];
  } | null;
};

export type PermissionRow = {
  id: string;
  resource: string;
  action: string;
  description?: string | null;
  institution_id?: string | null;
};

type RolePermissionRow = {
  role_id: string;
  permission_id: string;
  institution_id?: string | null;
  revoked_at?: string | null;
};

type UserPermissionRow = {
  user_id: string;
  permission_id: string;
  institution_id?: string | null;
  revoked_at?: string | null;
};

export type AccessUser = {
  id: string;
  auth_user_id?: string | null;
  email: string;
  full_name: string;
  phone?: string | null;
  primary_institution_id?: string | null;
  profile_role?: string | null;
  is_active: boolean;
  auth_status: 'pending_auth' | 'active' | 'disabled';
  roles?: Array<{
    role_key?: string | null;
    role_name?: string | null;
    institution_id?: string | null;
  }>;
  institution_ids?: string[];
  linked_institutions?: Array<{
    id: string;
    name: string;
    is_active?: boolean;
  }>;
};

export type SpecialtyOption = {
  id: string;
  name: string;
};

export type DoctorCatalogRow = {
  id: string;
  user_id: string;
  professional_council?: string | null;
  professional_registration?: string | null;
  crm: string;
  specialty_id?: string | null;
  is_active?: boolean | null;
};

export type UserRoleAssignmentState = {
  roleKey: string;
  institutionId: string;
  professionalCouncil: string;
  professionalRegistration: string;
  specialtyId: string;
  consultationDuration: number;
};

export type AccessSnapshot = {
  institutions: InstitutionRow[];
  users: AccessUser[];
  users_total?: number;
  users_limit?: number;
  users_page?: number;
  users_page_size?: number;
  users_search?: string | null;
  roles: RoleRow[];
  permissions: PermissionRow[];
  role_permissions: RolePermissionRow[];
  user_permissions: UserPermissionRow[];
};

export type PermissionMatrixRow = {
  role_id: string;
  role_key: string;
  role_name: string;
  permission_id: string;
  resource: string;
  resource_label?: string;
  action: string;
  action_label?: string;
  scope: string;
  scope_label?: string;
  institution_id?: string | null;
  granted: boolean;
  applicable?: boolean;
  semantic_reason?: string | null;
  effective_allowed: boolean;
  blocked_by_guardrail?: boolean;
  editable: boolean;
  locked: boolean;
  guardrail_status?: string | null;
  guardrail_reason?: string | null;
  source?: string | null;
  used_by_function?: boolean;
  used_by_policy?: boolean;
  rpc_functions?: string[];
  rls_policies?: Array<{ table?: string; policy?: string; command?: string }>;
};

export type PermissionsMatrix = {
  generated_at?: string;
  roles: RoleRow[];
  resources: string[];
  actions: string[];
  matrix: PermissionMatrixRow[];
  rls_policies: Array<{ table?: string; policy?: string; command?: string }>;
  rpc_functions: Array<{ name?: string; arguments?: string; has_authorization_check?: boolean }>;
  inconsistencies?: {
    permissions_without_detected_usage?: Array<{ resource: string; action: string }>;
    rpc_without_authorization_marker?: Array<{ name?: string; arguments?: string }>;
  };
};

export type EffectivePermission = {
  role_id?: string;
  role_key?: string;
  role_name?: string;
  permission_id?: string;
  resource: string;
  resource_label?: string;
  action: string;
  action_label?: string;
  scope?: string;
  scope_label?: string;
  institution_id?: string | null;
  origin?: string;
  applicable?: boolean;
  semantic_reason?: string | null;
  effective_allowed?: boolean;
  blocked_by_guardrail?: boolean;
  guardrail_status?: string | null;
  guardrail_reason?: string | null;
  enforcement?: string[];
};

export type AuditEntry = {
  id: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  table_name: string;
  record_id: string;
  created_at: string;
  user_id: string;
  user_name?: string | null;
  user_email?: string | null;
};

export type AccessTab = 'users' | 'roles_management' | 'institutions';
