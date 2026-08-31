import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { authService, User as AuthUser } from '@/servicos/auth';
import { getStoredToken, setStoredToken } from '@/servicos/api';

export type UserProfile = {
  user_id: string;
  role: string;
  doctor_id?: string | null;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  institution_id: string | null;
  institution_name?: string | null;
  institution_ids: string[];
  permissions: any[];
  allowed_routes: string[];
  is_active: boolean;
  requires_password_change?: boolean;
  preferences?: Record<string, any> | null;
  is_root?: boolean;
};

interface AuthContextType {
  user: { id: string; email?: string } | null;
  session: { access_token: string; user: any } | null;
  loading: boolean;
  profileLoaded: boolean;
  userRole: string | null;
  profile: UserProfile | null;
  institutionId: string | null;
  institutionIds: string[];
  doctorId: string | null;
  allowedRoutes: string[];
  permissions: any[];
  signIn: (email: string, password: string) => Promise<void>;
  signOut: (isAutomatic?: boolean) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
  refreshAccessContext: () => Promise<void>;
  hasRole: (roles: string[]) => boolean;
  hasPermission: (resource: string, action?: string, institutionId?: string | null) => boolean;
  canAccessRoute: (path: string) => boolean;
  firstAllowedRoute: (candidates?: string[], fallback?: string) => string;
  isRoot: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoaded, setProfileLoaded] = useState(false);

  const fetchSession = useCallback(async () => {
    const token = getStoredToken();
    if (!token) {
      setProfile(null);
      setProfileLoaded(true);
      setLoading(false);
      return;
    }

    try {
      const res = await authService.getMe();
      if (res && res.user) {
        const u = res.user;
        const institutionIds = res.institutions ? res.institutions.map(i => i.id) : [];

        const userProfile: UserProfile = {
          user_id: u.id,
          role: u.role || 'user',
          full_name: u.fullName,
          email: u.email,
          institution_id: u.institutionId || u.primaryInstitutionId || null,
          institution_name: u.institutionName || null,
          institution_ids: institutionIds,
          permissions: [],
          allowed_routes: ['/dashboard', '/agendamentos', '/agenda', '/pacientes', '/profissionais', '/especialidades', '/instituicoes', '/usuarios', '/relatorios', '/auditoria'],
          is_active: true,
          requires_password_change: u.requiresPasswordChange || u.authStatus === 'pending_auth',
          is_root: u.isRoot || u.role === 'admin',
        };

        setProfile(userProfile);
      } else {
        setStoredToken(null);
        setProfile(null);
      }
    } catch (err) {
      console.warn('[AuthContext] Sessão expirada ou inválida:', err);
      setStoredToken(null);
      setProfile(null);
    } finally {
      setProfileLoaded(true);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  const signIn = useCallback(async (email: string, password: string) => {
    setLoading(true);
    try {
      const res = await authService.login(email, password);
      if (res && res.user) {
        const u = res.user;
        const userProfile: UserProfile = {
          user_id: u.id,
          role: u.role || 'user',
          full_name: u.fullName,
          email: u.email,
          institution_id: u.institutionId || u.primaryInstitutionId || null,
          institution_name: u.institutionName || null,
          institution_ids: u.primaryInstitutionId ? [u.primaryInstitutionId] : [],
          permissions: [],
          allowed_routes: ['/dashboard', '/agendamentos', '/agenda', '/pacientes', '/profissionais', '/especialidades', '/instituicoes', '/usuarios', '/relatorios', '/auditoria'],
          is_active: true,
          requires_password_change: u.requiresPasswordChange || u.authStatus === 'pending_auth',
          is_root: u.isRoot || u.role === 'admin',
        };
        setProfile(userProfile);
        setProfileLoaded(true);
        toast.success(`Bem-vindo, ${u.fullName}!`);
      }
    } catch (err: any) {
      toast.error(err.message || 'Falha ao autenticar.');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const signOut = useCallback(async (isAutomatic = false) => {
    try {
      await authService.logout();
    } catch (e) {
      console.warn('[AuthContext] Erro ao deslogar:', e);
    } finally {
      setProfile(null);
      setProfileLoaded(true);
      setStoredToken(null);
      if (!isAutomatic) {
        toast.info('Sessão encerrada com sucesso.');
      }
    }
  }, []);

  const updatePassword = useCallback(async (newPassword: string) => {
    try {
      await authService.changePassword('', newPassword);
      if (profile) {
        setProfile({ ...profile, requires_password_change: false });
      }
      toast.success('Senha atualizada com sucesso!');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao alterar senha.');
      throw err;
    }
  }, [profile]);

  const hasRole = useCallback((roles: string[]) => {
    if (!profile) return false;
    if (profile.is_root) return true;
    return roles.includes(profile.role);
  }, [profile]);

  const hasPermission = useCallback((_resource: string, _action?: string) => {
    return true; // Simplificado para admin/gestor
  }, []);

  const canAccessRoute = useCallback((_path: string) => {
    return true;
  }, []);

  const firstAllowedRoute = useCallback((candidates: string[] = ['/dashboard', '/agendamentos'], fallback = '/dashboard') => {
    return candidates[0] || fallback;
  }, []);

  const value = useMemo(() => {
    const user = profile ? { id: profile.user_id, email: profile.email || '' } : null;
    const token = getStoredToken();
    const session = profile && token ? { access_token: token, user } : null;

    return {
      user,
      session,
      loading,
      profileLoaded,
      userRole: profile?.role || null,
      profile,
      institutionId: profile?.institution_id || null,
      institutionIds: profile?.institution_ids || [],
      doctorId: profile?.doctor_id || null,
      allowedRoutes: profile?.allowed_routes || [],
      permissions: profile?.permissions || [],
      signIn,
      signOut,
      updatePassword,
      refreshAccessContext: fetchSession,
      hasRole,
      hasPermission,
      canAccessRoute,
      firstAllowedRoute,
      isRoot: Boolean(profile?.is_root),
    };
  }, [profile, loading, profileLoaded, signIn, signOut, updatePassword, fetchSession, hasRole, hasPermission, canAccessRoute, firstAllowedRoute]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider');
  }
  return context;
};
