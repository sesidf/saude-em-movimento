import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { definirMotivoLogout } from '@/lib/motivoLogout';
import { getOperationalErrorMessage } from '@/lib/errors';

// Simulated User type to match Cloudflare D1's signature
export interface User {
  id: string;
  email?: string;
  // add other standard JWT payload fields
}

// Simulated Session type
export interface Session {
  access_token: string;
  user: User | null;
}

type AccessPermission = {
  resource: string;
  action: string;
  institution_id: string | null;
};

type UserProfile = {
  user_id: string;
  role: string | null;
  doctor_id?: string | null;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  institution_id: string | null;
  institution_name?: string | null;
  institution_ids: string[];
  permissions: AccessPermission[];
  allowed_routes: string[];
  is_active: boolean;
  requires_password_change?: boolean;
  preferences?: Record<string, any> | null;
};

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  profileLoaded: boolean;
  userRole: string | null;
  profile: UserProfile | null;
  institutionId: string | null;
  institutionIds: string[];
  doctorId: string | null;
  allowedRoutes: string[];
  permissions: AccessPermission[];
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, metadata: Record<string, unknown>) => Promise<void>;
  signOut: (isAutomatic?: boolean) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
  refreshAccessContext: () => Promise<void>;
  updatePreferences: (newPreferences: Record<string, any>) => Promise<void>;
  hasRole: (roles: string[]) => boolean;
  hasPermission: (resource: string, action?: string, institutionId?: string | null) => boolean;
  canAccessRoute: (path: string) => boolean;
  firstAllowedRoute: (candidates?: string[], fallback?: string) => string;
  isAssistidor: () => boolean;
  connectionError: boolean;
  retryAccessContext: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const browserUserAgent = () => (typeof navigator === 'undefined' ? '' : navigator.userAgent);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [connectionError, setConnectionError] = useState(false);
  
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inactivityWarningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const explicitSignInInProgressRef = useRef(false);
  
  const inactivityTimeoutMs = 30 * 60 * 1000;
  const inactivityWarningMs = 29 * 60 * 1000;

  const clearAuthState = useCallback(() => {
    setSession(null);
    setUser(null);
    setProfile(null);
    setProfileLoaded(true);
    setLoading(false);
    setConnectionError(false);
    localStorage.removeItem('medco_access_token');
    localStorage.removeItem('medco_user');
  }, []);

  const getStoredSession = useCallback(() => {
    const token = localStorage.getItem('medco_access_token');
    const storedUser = localStorage.getItem('medco_user');
    if (token && storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        return { session: { access_token: token, user: parsedUser }, user: parsedUser };
      } catch (e) {
        return { session: null, user: null };
      }
    }
    return { session: null, user: null };
  }, []);

  const fetchAccessContext = useCallback(async () => {
    try {
      const currentSession = getStoredSession();
      if (!currentSession.session) throw new Error('No session');

      const response = await fetch('/api/auth/me', {
        headers: {
          'Authorization': `Bearer ${currentSession.session.access_token}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Falha ao carregar contexto');
      }

      const data = await response.json();
      
      setProfile(data.profile);
      setProfileLoaded(true);
      setConnectionError(false);
      return data.profile;
    } catch (error) {
      setConnectionError(true);
      return null;
    } finally {
      setLoading(false);
    }
  }, [getStoredSession]);

  useEffect(() => {
    const initAuth = async () => {
      setLoading(true);
      const { session: storedSession, user: storedUser } = getStoredSession();
      if (storedSession) {
        setSession(storedSession);
        setUser(storedUser);
        await fetchAccessContext();
      } else {
        clearAuthState();
      }
    };
    initAuth();
  }, [getStoredSession, clearAuthState, fetchAccessContext]);

  const signIn = useCallback(async (email: string, password: string) => {
    explicitSignInInProgressRef.current = true;
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Erro ao fazer login');
      }

      const data = await res.json();
      localStorage.setItem('medco_access_token', data.token);
      localStorage.setItem('medco_user', JSON.stringify(data.user));
      
      setSession({ access_token: data.token, user: data.user });
      setUser(data.user);
      
      await fetchAccessContext();
      toast.success('Login realizado com sucesso.');
    } catch (error: any) {
      toast.error((error as any)?.message || error || 'Erro ao fazer login');
      throw error;
    } finally {
      explicitSignInInProgressRef.current = false;
    }
  }, [fetchAccessContext]);

  const signUp = useCallback(async (email: string, password: string, metadata: Record<string, unknown>) => {
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, metadata }),
      });
      
      if (!res.ok) throw new Error('Erro ao fazer cadastro');
      toast.success('Cadastro realizado com sucesso.');
    } catch (error: any) {
      toast.error((error as any)?.message || error || 'Erro ao fazer cadastro');
      throw error;
    }
  }, []);

  const signOut = useCallback(async (isAutomatic = false) => {
    if (isAutomatic) definirMotivoLogout('afk');
    try {
      const { session } = getStoredSession();
      if (session) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${session.access_token}` }
        }).catch(() => {});
      }
    } finally {
      clearAuthState();
      if (!isAutomatic) toast.success('Logout realizado com sucesso.');
    }
  }, [clearAuthState, getStoredSession]);

  const requestPasswordReset = useCallback(async (email: string) => {
    // Implementar rota /api/auth/reset-password
    toast.success('Link de redefinição simulado (API requer implementação).');
  }, []);

  const updatePassword = useCallback(async (newPassword: string) => {
    // Implementar rota /api/auth/update-password
    toast.success('Senha atualizada (API requer implementação).');
  }, []);

  const refreshAccessContext = useCallback(async () => {
    await fetchAccessContext();
  }, [fetchAccessContext]);

  const retryAccessContext = useCallback(async () => {
    await fetchAccessContext();
  }, [fetchAccessContext]);

  const updatePreferences = useCallback(async (newPreferences: Record<string, any>) => {
    if (!profile) return;
    const updated = { ...profile.preferences, ...newPreferences };
    
    // Atualizar na API real aqui (fetch)
    setProfile({ ...profile, preferences: updated });
  }, [profile]);

  const permissions = useMemo(() => profile?.permissions ?? [], [profile?.permissions]);
  const allowedRoutes = useMemo(() => profile?.allowed_routes ?? [], [profile?.allowed_routes]);
  const userRole = profile?.role ?? null;
  const institutionId = profile?.institution_id ?? null;
  const institutionIds = useMemo(() => profile?.institution_ids ?? [], [profile?.institution_ids]);
  const doctorId = profile?.doctor_id ?? null;

  const hasRole = useCallback((roles: string[]) => {
    return userRole ? roles.includes(userRole) : false;
  }, [userRole]);

  const hasPermission = useCallback((resource: string, action: string = 'read', targetInstitutionId?: string | null) => {
    return permissions.some((permission: AccessPermission) => {
      const matchesResource = permission.resource === resource;
      const matchesAction = permission.action === action || permission.action === 'manage';
      const matchesScope = !targetInstitutionId || !permission.institution_id || permission.institution_id === targetInstitutionId;
      return matchesResource && matchesAction && matchesScope;
    });
  }, [permissions]);

  const canAccessRoute = useCallback((path: string) => {
    return allowedRoutes.includes(path);
  }, [allowedRoutes]);

  const firstAllowedRoute = useCallback((candidates: string[] = [], fallback = '/dashboard') => {
    const isRecepcao = profile?.role === 'recepcao';
    const effectiveFallback = isRecepcao ? '/agenda' : fallback;
    for (const candidate of candidates) {
      if (allowedRoutes.includes(candidate)) return candidate;
    }
    if (allowedRoutes.includes(effectiveFallback)) return effectiveFallback;
    return allowedRoutes[0] || (isRecepcao ? '/agenda' : '/dashboard');
  }, [allowedRoutes, profile?.role]);

  const isAssistidor = useCallback(() => {
    return hasPermission('users', 'read', institutionId) || hasPermission('institutions', 'update', institutionId);
  }, [hasPermission, institutionId]);

  const value = useMemo<AuthContextType>(() => ({
    user, session, loading, profileLoaded, userRole, profile,
    institutionId, institutionIds, doctorId, allowedRoutes, permissions,
    signIn, signUp, signOut, requestPasswordReset, updatePassword,
    refreshAccessContext, updatePreferences, hasRole, hasPermission,
    canAccessRoute, firstAllowedRoute, isAssistidor, connectionError, retryAccessContext
  }), [
    user, session, loading, profileLoaded, userRole, profile,
    institutionId, institutionIds, doctorId, allowedRoutes, permissions,
    signIn, signUp, signOut, requestPasswordReset, updatePassword,
    refreshAccessContext, updatePreferences, hasRole, hasPermission,
    canAccessRoute, firstAllowedRoute, isAssistidor, connectionError, retryAccessContext
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth deve ser usado dentro de um AuthProvider');
  return context;
};
