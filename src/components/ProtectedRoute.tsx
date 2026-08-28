"use client";

import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import Login from '@/pages/Login';
import { WifiOff, RefreshCw, LogOut } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const { user, profile, loading, profileLoaded, canAccessRoute, firstAllowedRoute, connectionError, retryAccessContext, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!loading && !user && location.pathname !== '/') {
      navigate('/', { replace: true });
    }
  }, [loading, location.pathname, navigate, user]);

  useEffect(() => {
    if (loading || !profileLoaded || !user || connectionError) return;

    if (profile?.requires_password_change) {
      return;
    }

    const isWorkspaceShellRoute = location.pathname === '/';
    const routeBlocked = location.pathname !== '/' && location.pathname !== '' && !isWorkspaceShellRoute && !canAccessRoute(location.pathname);

    if (routeBlocked) {
      navigate(firstAllowedRoute(['/dashboard']), { replace: true });
    }
  }, [canAccessRoute, firstAllowedRoute, loading, location.pathname, navigate, profileLoaded, user, profile?.requires_password_change, connectionError]);

  if (connectionError && user) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-white border border-slate-200 shadow-xl rounded-2xl p-6 max-w-md w-full text-center space-y-4">
          <div className="mx-auto w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center border border-red-100 shadow-sm animate-pulse">
            <WifiOff className="h-8 w-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-slate-800">Instabilidade de Conexão</h2>
            <p className="text-sm text-slate-650 leading-relaxed">
              Não conseguimos carregar as suas credenciais no momento. Se você estiver usando internet móvel ou estiver em trânsito, o sinal pode estar temporariamente instável.
            </p>
          </div>
          <div className="flex flex-col gap-2 pt-2">
            <button
              onClick={() => { void retryAccessContext(); }}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold h-10 px-4 rounded-xl shadow-md transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              <RefreshCw className="h-4 w-4" />
              Tentar Novamente
            </button>
            <button
              onClick={() => { void signOut(); }}
              className="w-full flex items-center justify-center gap-2 border border-slate-200 hover:bg-slate-50 text-slate-600 text-sm font-semibold h-10 px-4 rounded-xl shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-slate-300 cursor-pointer"
            >
              <LogOut className="h-4 w-4" />
              Voltar ao Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (loading || (user && !profileLoaded)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user || (user && profile?.requires_password_change)) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-100 via-slate-50 to-white">
        <div className="mx-auto w-full max-w-[2560px] px-4 md:px-6 desktop:px-8 wide:px-10 ultra:px-12">
          <Login />
        </div>
      </div>
    );
  }
  if (location.pathname !== '/' && location.pathname !== '' && location.pathname !== '/forcar-troca-senha' && !canAccessRoute(location.pathname)) return null;

  return <>{children}</>;
};

export default ProtectedRoute;
