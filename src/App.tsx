import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Suspense, lazy, useEffect } from "react";
import { HashRouter, Routes, Route, useLocation } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import { InactivityTimer } from "@/components/InactivityTimer";

const WorkspaceShell = lazy(() => import("@/components/WorkspaceShell"));
const NotFound = lazy(() => import("./pages/NotFound"));
const ForcePasswordChange = lazy(() => import("./pages/ForcePasswordChange"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));


const normalizeHashUrl = () => {
  if (typeof window === 'undefined') return;
  const { origin, pathname, hash, search } = window.location;

  if (
    hash.includes('reset-password') ||
    hash.includes('type=recovery') ||
    hash.includes('access_token=') ||
    search.includes('type=recovery') ||
    search.includes('token_hash=')
  ) {
    return;
  }

  const legacyPath = pathname !== '/' ? (pathname === '/app' ? '/' : pathname) : '';
  const hashRoute = hash.match(/^#\/([^?#]*)/)?.[1] || '';
  const shouldCollapseHashRoute = hashRoute.length > 0;
  const nextHash = '#';

  if (pathname === '/' && !shouldCollapseHashRoute && (hash === '#/' || hash === '#')) return;
  if (!legacyPath && !shouldCollapseHashRoute && hash) return;

  window.history.replaceState(null, '', `${origin}/${nextHash}`);
};

normalizeHashUrl();

const HashMaskEnforcer = () => {
  const location = useLocation();

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const { hash, search } = window.location;
      if (
        hash.includes('reset-password') ||
        hash.includes('forcar-troca-senha') ||
        hash.includes('type=recovery') ||
        hash.includes('access_token=') ||
        search.includes('type=recovery') ||
        search.includes('token_hash=')
      ) {
        return;
      }
      if (window.location.hash !== '#') {
        window.history.replaceState(null, '', `${window.location.origin}/#`);
      }
    }
  }, [location.pathname, location.search]);

  return null;
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 2 minutos: dados raramente mudam tão rápido; evita refetches a cada troca de aba
      staleTime: 2 * 60_000,
      gcTime: 10 * 60_000,
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      networkMode: 'online',
    },
    mutations: {
      retry: 1,
      retryDelay: 1200,
      networkMode: 'online',
    },
  },
});

const RouteFallback = () => (
  <div className="min-h-screen flex items-center justify-center bg-slate-100">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
  </div>
);

const App = () => {
  useEffect(() => {
    // Limpa os sinalizadores de recarga após 5 segundos de execução estável.
    // Isso garante que se um chunk lazy-loaded falhar logo após a montagem do App,
    // a trava de cooldown do cache-buster no sessionStorage ainda estará ativa para evitar loops.
    const timer = setTimeout(() => {
      try {
        sessionStorage.removeItem("sms_chunk_reload_attempted");
        sessionStorage.removeItem("ultimo_reload_cache_buster");
      } catch (e) {
        console.error("Erro ao limpar sessionStorage:", e);
      }
    }, 5000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AuthProvider>
            <Sonner />
            <InactivityTimer />
            <HashMaskEnforcer />
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/privacidade" element={<PrivacyPolicy />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route
                  path="/forcar-troca-senha"
                  element={
                    <ProtectedRoute>
                      <ForcePasswordChange />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/*"
                  element={
                    <ProtectedRoute>
                      <WorkspaceShell />
                    </ProtectedRoute>
                  }
                />

                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </AuthProvider>
        </HashRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
