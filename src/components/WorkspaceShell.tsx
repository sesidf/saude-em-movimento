"use client";

import React, { useState, useEffect, useMemo, Suspense, lazy, useRef } from 'react';
import type { ComponentType, CSSProperties, MouseEvent, DragEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Building2,
  Calendar,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  FileText,
  Grid3x3,
  HeartPulse,
  LayoutDashboard,
  LogOut,
  Key,
  PieChart,
  ShieldCheck,
  Stethoscope,
  Syringe,
  Users,
  Users as UsersIcon,
  X,
  Database,
  RefreshCw,
  FileSpreadsheet,
  Loader2,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { chamarApiPost, chamarApiGet } from '@/lib/workerApi';
import { Button } from '@/components/ui/button';
import NotificationsPopover from '@/components/NotificationsPopover';
import SystemHealthBanner from '@/components/SystemHealthBanner';
import { ChangePasswordDialog } from '@/components/ChangePasswordDialog';
import { GlobalSearch } from './GlobalSearch';
import { getAvatarColor, getInitials } from '@/utils/formatters';
import { extrairIntencaoNavegacao } from '@/lib/intencaoNavegacao';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Agenda = lazy(() => import('@/pages/Agenda'));
const Appointments = lazy(() => import('@/pages/Appointments'));
const Patients = lazy(() => import('@/pages/Patients'));
const Doctors = lazy(() => import('@/pages/Doctors'));
const History = lazy(() => import('@/pages/History'));
const Reports = lazy(() => import('@/pages/Reports'));
const Institutions = lazy(() => import('@/pages/Institutions'));
const UsersPage = lazy(() => import('@/pages/Users'));
const Specialties = lazy(() => import('@/pages/Specialties'));


const ScheduleManagement = lazy(() => import('@/pages/ScheduleManagement'));
const AuditLog = lazy(() => import('@/pages/AuditLog'));

type ModuleDef = {
  path: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  showIndicator?: boolean;
  group: 'Recepção' | 'Clínico' | 'Administração' | 'Técnico';
  Component: ComponentType;
  closable?: boolean;
};

type TabItem = {
  path: string;
  label: string;
  stateKey?: number;
};

const MAX_OPEN_TABS = 8;
const EXIBIR_ABAS_SUPERIORES = false; // Altere para true se desejar reativar as guias/abas superiores no futuro
const DEFAULT_TAB: TabItem = { path: '/dashboard', label: 'Dashboard' };
const APP_PUBLIC_PATH = '/';

const modules: ModuleDef[] = [
  // Clínica / Recepção
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, group: 'Clínico', Component: Dashboard, closable: false },
  { path: '/agenda', label: 'Agenda', icon: Grid3x3, group: 'Recepção', Component: Agenda },
  { path: '/appointments', label: 'Consultas', icon: Calendar, group: 'Recepção', Component: Appointments },
  { path: '/patients', label: 'Pacientes', icon: Users, group: 'Recepção', Component: Patients },
  { path: '/doctors', label: 'Profissionais', icon: Stethoscope, group: 'Clínico', Component: Doctors },
  { path: '/history', label: 'Histórico', icon: FileText, group: 'Clínico', Component: History },

  // Administração
  { path: '/institutions', label: 'Instituições', icon: Building2, group: 'Administração', Component: Institutions },
  { path: '/users', label: 'Usuários', icon: UsersIcon, group: 'Administração', Component: UsersPage },
  { path: '/specialties', label: 'Especialidades', icon: HeartPulse, group: 'Administração', Component: Specialties },
  { path: '/schedule-management', label: 'Gestão de Agendas', icon: CalendarDays, group: 'Administração', Component: ScheduleManagement },
  { path: '/reports', label: 'Relatórios', icon: PieChart, group: 'Administração', Component: Reports },
  { path: '/audit-log', label: 'Governança e Auditoria', icon: ShieldCheck, group: 'Administração', Component: AuditLog },


];

const groupLabels: Record<ModuleDef['group'], string> = {
  Recepção: 'Recepção',
  Clínico: 'Clínico',
  Administração: 'Administração',

  Técnico: 'Técnico',
};

const sidebarGroupOrder: ModuleDef['group'][] = ['Recepção', 'Clínico', 'Administração', 'Técnico'];

const sanitizeWorkspaceTabs = (tabs: unknown, isReception = false, isMedico = false): TabItem[] => {
  const defaultTab: TabItem = (isReception || isMedico) ? { path: '/agenda', label: 'Agenda' } : DEFAULT_TAB;
  const source = Array.isArray(tabs) ? tabs : [];
  const seen = new Set<string>();
  const sanitized: TabItem[] = [];

  for (const item of source) {
    if (!item || typeof item !== 'object') continue;

    const path = typeof (item as TabItem).path === 'string' ? (item as TabItem).path : '';
    const module = modules.find((candidate) => candidate.path === path);
    if (!module || seen.has(module.path)) continue;
    if (isReception && (module.group === 'Administração' || module.group === 'Clínico')) continue;
    if (isMedico && ['/dashboard', '/patients', '/institutions', '/specialties'].includes(module.path)) continue;

    sanitized.push({ path: module.path, label: module.label });
    seen.add(module.path);
  }

  while (sanitized.length > MAX_OPEN_TABS) {
    const firstClosableIdx = sanitized.findIndex(
      (t: TabItem) => modules.find((m: ModuleDef) => m.path === t.path)?.closable !== false
    );
    if (firstClosableIdx !== -1) {
      const removed = sanitized.splice(firstClosableIdx, 1)[0];
      seen.delete(removed.path);
    } else {
      const removed = sanitized.shift();
      if (removed) seen.delete(removed.path);
    }
  }

  if (!seen.has(defaultTab.path) && modules.some((module) => module.path === defaultTab.path)) {
    sanitized.unshift(defaultTab);
  }

  if (sanitized.length > MAX_OPEN_TABS) {
    sanitized.pop();
  }

  return sanitized.length > 0 ? sanitized : [defaultTab];
};

/**
 * Detecta se há uma intenção de agendamento ativa no state (via React Router state padronizado).
 * Usado pelo WorkspaceShell para ativar a aba correta automaticamente.
 */
const inferModuleFromState = (state: unknown): string | null => {
  const intencao = extrairIntencaoNavegacao(state);
  if (
    intencao?.abrirNovoAgendamento ||
    intencao?.reagendar ||
    intencao?.iniciarAtendimento ||
    intencao?.focarAgendamento
  ) {
    return '/appointments';
  }
  return null;
};

const WorkspaceShell = () => {
  const { canAccessRoute, firstAllowedRoute, profile, signOut, updatePreferences, userRole, user } = useAuth();
  
  // Estados para importação da planilha corrigida (Superadmin-Root)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [previewStats, setPreviewStats] = useState<{
    totalRows: number;
    pacientesUnicos: number;
    medicosUnicos: number;
    especialidadesUnicas: number;
    instituicoesUnicas: number;
    primeirasLinhas: any[];
  } | null>(null);
  const [importResult, setImportResult] = useState<any>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportButtonClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = evt.target?.result;
        const XLSX = await import('xlsx');
        const workbook = XLSX.read(data, { type: 'binary', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(worksheet) as any[];

        if (rows.length === 0) {
          toast.error('A planilha selecionada está vazia.');
          return;
        }

        // Validar se pelo menos algumas colunas básicas batem
        const colunasObrigatorias = ['Paciente', 'Patient Cpf', 'Data da consulta'];
        const primeiraLinhaKeys = Object.keys(rows[0]);
        const possuiColunas = colunasObrigatorias.every(col => 
          primeiraLinhaKeys.some(k => k.toLowerCase().trim() === col.toLowerCase().trim())
        );

        if (!possuiColunas) {
          toast.error('Colunas obrigatórias ausentes. Certifique-se de ter: "Paciente", "Patient Cpf" e "Data da consulta".');
          return;
        }

        // Calcular estatísticas de prévia
        const cpfs = new Set();
        const medicos = new Set();
        const especialidades = new Set();
        const instituicoes = new Set();

        rows.forEach(r => {
          const cpf = String(r['Patient Cpf'] || r['patient cpf'] || '').replace(/\D/g, '');
          const medico = String(r['Profissional'] || r['profissional'] || '').trim().toLowerCase();
          const esp = String(r['Especialidade'] || r['especialidade'] || '').trim().toLowerCase();
          const inst = String(r['Instituição'] || r['Instituicao'] || r['instituição'] || r['instituicao'] || '').trim().toLowerCase();

          if (cpf) cpfs.add(cpf);
          if (medico) medicos.add(medico);
          if (esp) especialidades.add(esp);
          if (inst) instituicoes.add(inst);
        });

        setParsedRows(rows);
        setPreviewStats({
          totalRows: rows.length,
          pacientesUnicos: cpfs.size,
          medicosUnicos: medicos.size,
          especialidadesUnicas: especialidades.size,
          instituicoesUnicas: instituicoes.size,
          primeirasLinhas: rows.slice(0, 5),
        });
        setImportError(null);
        setImportResult(null);
        setIsImportModalOpen(true);
      } catch (err) {
        console.error('Erro ao ler planilha:', err);
        toast.error('Erro ao processar o arquivo de planilha.');
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const executarImportacao = async () => {
    if (parsedRows.length === 0 || !user?.id) return;
    setImporting(true);
    setImportError(null);
    setImportResult(null);

    try {
      const { data, error } = await chamarApiPost('/api/rpc/importar_dados_planilha', {
        p_linhas: parsedRows,
        p_actor_id: user.id
      });

      if (error) {
        throw error;
      }

      setImportResult(data);
      toast.success('Importação concluída com sucesso!');
    } catch (err: any) {
      console.error('Erro na transação de importação:', err);
      setImportError(err.message || String(err));
      toast.error('A importação falhou. Nenhuma alteração foi salva.');
    } finally {
      setImporting(false);
    }
  };
  
  interface DbStats {
    current_size_bytes: number;
    current_size_pretty: string;
    limit_bytes: number;
    limit_pretty: string;
    free_bytes: number;
    free_pretty: string;
    usage_percentage: number;
    top_tables: Array<{
      table_name: string;
      size_bytes: number;
      size_pretty: string;
    }>;
  }

  const [dbStats, setDbStats] = useState<DbStats | null>(null);
  const [loadingDbStats, setLoadingDbStats] = useState<boolean>(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    'recepcao': true,
    'clinico': true,
    'administracao': true
  });

  const toggleGroup = (groupKey: string) => {
    setExpandedGroups(prev => ({
      ...prev,
      [groupKey]: !prev[groupKey]
    }));
  };

  const getGroupKey = (group: string): string => {
    if (group === 'Recepção') return 'recepcao';
    if (group === 'Clínico') return 'clinico';
    return 'administracao';
  };

  const isSuperadminRoot = userRole === 'superadmin' || profile?.role === 'superadmin';

  const fetchDbStats = async () => {
    if (!isSuperadminRoot) return;
    setLoadingDbStats(true);
    try {
      const { data, error } = await chamarApiPost('/api/rpc/get_database_size_stats');
      if (error) throw error;
      setDbStats(data as DbStats);
    } catch (err) {
      console.error('Erro ao buscar estatísticas do banco:', err);
    } finally {
      setLoadingDbStats(false);
    }
  };

  useEffect(() => {
    if (isSuperadminRoot) {
      void fetchDbStats();
      const interval = setInterval(() => {
        void fetchDbStats();
      }, 300000);
      return () => clearInterval(interval);
    }
  }, [isSuperadminRoot]);

  const location = useLocation();
  const navigate = useNavigate();

  const isReception = profile?.role === 'recepcao' || userRole === 'recepcao';
  const isMedico = profile?.role === 'medico' || userRole === 'medico';

  const allowedModules = useMemo(() => {
    return modules.filter((item: ModuleDef) => {
      if (isReception && (item.group === 'Administração' || item.group === 'Clínico')) {
        return false;
      }
      if (isMedico && ['/dashboard', '/patients', '/institutions', '/specialties'].includes(item.path)) {
        return false;
      }
      return canAccessRoute(item.path);
    });
  }, [canAccessRoute, isReception, isMedico]);

  const moduleByPath = useMemo(() => Object.fromEntries(modules.map((item: ModuleDef) => [item.path, item])), []);
  const groupedAllowedModules = useMemo(
    () =>
      sidebarGroupOrder
        .map((group: ModuleDef['group']) => ({ group, modules: allowedModules.filter((item: ModuleDef) => item.group === group) }))
        .filter((item: { group: ModuleDef['group']; modules: ModuleDef[] }) => item.modules.length > 0),
    [allowedModules],
  );

  const [isSidebarExpanded, setIsSidebarExpanded] = useState<boolean>(false);
  const [isSidebarPinned, setIsSidebarPinned] = useState<boolean>(() => {
    try {
      return localStorage.getItem('sidebar_pinned') === 'true';
    } catch {
      return false;
    }
  });
  const currentSidebarExpanded = isSidebarPinned || isSidebarExpanded;
  const [openTabs, setOpenTabs] = useState<TabItem[]>(() => {
    try {
      const saved = sessionStorage.getItem('workspace_open_tabs');
      if (saved) return sanitizeWorkspaceTabs(JSON.parse(saved), isReception, isMedico);
    } catch (e) {
      console.warn('Erro ao carregar workspace_open_tabs', e);
    }
    return [isReception || isMedico ? { path: '/agenda', label: 'Agenda' } : DEFAULT_TAB];
  });
  const [activeTabPath, setActiveTabPath] = useState<string>(() => {
    const saved = sessionStorage.getItem('workspace_active_tab');
    if (saved) {
      if (isReception && ['/dashboard', '/reports', '/users', '/institutions', '/specialties', '/schedule-management', '/doctors', '/history', '/audit-log'].includes(saved)) {
        return firstAllowedRoute(['/agenda', '/appointments']);
      }
      if (isMedico && ['/dashboard', '/patients', '/institutions', '/specialties'].includes(saved)) {
        return firstAllowedRoute(['/agenda', '/appointments']);
      }
      return saved;
    }
    return firstAllowedRoute(isMedico || isReception ? ['/agenda', '/appointments'] : ['/dashboard']);
  });
  const [draggingTabPath, setDraggingTabPath] = useState<string | null>(null);
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const previousActiveTabPathRef = useRef(activeTabPath);
  const syncedProfileRef = useRef(false);

  useEffect(() => {
    if (previousActiveTabPathRef.current === activeTabPath) return;
    previousActiveTabPathRef.current = activeTabPath;
  }, [activeTabPath]);

  useEffect(() => {
    sessionStorage.setItem('workspace_open_tabs', JSON.stringify(openTabs));
  }, [openTabs]);

  useEffect(() => {
    sessionStorage.setItem('workspace_active_tab', activeTabPath);
  }, [activeTabPath]);

  useEffect(() => {
    const activeTabLabel = openTabs.find((t: TabItem) => t.path === activeTabPath)?.label;
    if (activeTabLabel) {
      document.title = `${activeTabLabel} | Saúde em Movimento`;
    } else {
      document.title = 'Saúde em Movimento';
    }
  }, [activeTabPath, openTabs]);

  useEffect(() => {
    if (location.pathname === APP_PUBLIC_PATH) {
      // Detecta intenção de agendamento via React Router state (padrão centralizado, sem URL params)
      const inferredPath = inferModuleFromState(location.state);
      if (inferredPath && moduleByPath[inferredPath] && canAccessRoute(inferredPath)) {
        const moduleDef = moduleByPath[inferredPath];
        setOpenTabs((previous: TabItem[]) => {
          const filtered = sanitizeWorkspaceTabs(previous, isReception, isMedico).filter((tab: TabItem) => moduleByPath[tab.path] && canAccessRoute(tab.path));
          if (filtered.some((tab: TabItem) => tab.path === inferredPath)) return filtered;
          return sanitizeWorkspaceTabs([...filtered, { path: inferredPath, label: moduleDef.label }], isReception, isMedico);
        });
        setActiveTabPath(inferredPath);
      }
      return;
    }

    const fallbackPath = (isReception || isMedico) ? '/agenda' : firstAllowedRoute(['/dashboard']);
    const requestedPath = moduleByPath[location.pathname] ? location.pathname : fallbackPath;

    if (!canAccessRoute(requestedPath)) {
      setActiveTabPath(fallbackPath);
      navigate(APP_PUBLIC_PATH, { replace: true });
      return;
    }

    const moduleDef = moduleByPath[requestedPath];
    setOpenTabs((previous: TabItem[]) => {
      const filtered = sanitizeWorkspaceTabs(previous, isReception, isMedico).filter((tab: TabItem) => moduleByPath[tab.path] && canAccessRoute(tab.path));
      if (filtered.some((tab: TabItem) => tab.path === requestedPath)) {
        if (JSON.stringify(previous) === JSON.stringify(filtered)) return previous;
        return filtered;
      }
      return sanitizeWorkspaceTabs([...filtered, { path: requestedPath, label: moduleDef.label }], isReception, isMedico);
    });
    setActiveTabPath(requestedPath);
    if (location.pathname !== APP_PUBLIC_PATH) {
      navigate({ pathname: APP_PUBLIC_PATH, search: location.search }, { replace: true, state: location.state });
    }
  }, [canAccessRoute, firstAllowedRoute, isReception, isMedico, location.pathname, location.search, location.state, moduleByPath, navigate]);

  useEffect(() => {
    setOpenTabs((previous: TabItem[]) => {
      const next = sanitizeWorkspaceTabs(previous, isReception, isMedico).filter((tab: TabItem) => moduleByPath[tab.path] && canAccessRoute(tab.path));
      if (JSON.stringify(previous) === JSON.stringify(next)) return previous;
      return next;
    });
  }, [canAccessRoute, isReception, isMedico, moduleByPath]);

  const handleOpenModule = (path: string) => {
    if (!moduleByPath[path] || !canAccessRoute(path)) return;
    
    setOpenTabs((previous: TabItem[]) => {
      if (previous.some((tab: TabItem) => tab.path === path)) {
        if (activeTabPath === path) {
          // Se o usuário clicar na aba que já está ativa, recarrega a página inteira
          window.location.reload();
          return previous;
        }
        return sanitizeWorkspaceTabs(previous, isReception, isMedico);
      }
      return sanitizeWorkspaceTabs([...previous, { path, label: moduleByPath[path].label }], isReception, isMedico);
    });
    
    setActiveTabPath(path);
    if (location.pathname !== APP_PUBLIC_PATH || location.search) navigate(APP_PUBLIC_PATH);
  };

  const handleSelectTab = (path: string) => {
    if (activeTabPath === path) {
      // Se clicar na aba superior que já está ativa, recarrega a página
      window.location.reload();
      return;
    }
    setActiveTabPath(path);
    if (location.pathname !== APP_PUBLIC_PATH || location.search) navigate(APP_PUBLIC_PATH);
  };

  useEffect(() => {
    // Sincroniza a aba ativa caso a aba atual tenha sido fechada
    if (openTabs.length > 0 && !openTabs.some((tab: TabItem) => tab.path === activeTabPath)) {
      const fallbackPath = openTabs[openTabs.length - 1].path;
      setActiveTabPath(fallbackPath);
      navigate(APP_PUBLIC_PATH);
    }
  }, [openTabs, activeTabPath, navigate]);

  const handleCloseTab = (path: string) => {
    const module = moduleByPath[path];
    if (module?.closable === false) return;

    setOpenTabs((previous: TabItem[]) => {
      const nextTabs = previous.filter((tab: TabItem) => tab.path !== path);
      return nextTabs.length > 0 ? nextTabs : [isReception ? { path: '/agenda', label: 'Agenda' } : DEFAULT_TAB];
    });
  };

  const handleCloseOtherTabs = (path: string) => {
    const keepSet = new Set(['/dashboard', '/agenda', path]);
    setOpenTabs((previous: TabItem[]) => {
      const nextTabs = previous.filter((tab: TabItem) => keepSet.has(tab.path));
      return nextTabs.length > 0 ? nextTabs : [isReception ? { path: '/agenda', label: 'Agenda' } : DEFAULT_TAB];
    });
  };

  const handleCloseTabsToRight = (path: string) => {
    setOpenTabs((previous: TabItem[]) => {
      const index = previous.findIndex((tab: TabItem) => tab.path === path);
      if (index < 0) return previous;

      const rightPaths = previous
        .slice(index + 1)
        .map((tab: TabItem) => tab.path)
        .filter((tabPath: string) => moduleByPath[tabPath]?.closable !== false);

      if (rightPaths.length < 1) return previous;

      const removeSet = new Set(rightPaths);
      return previous.filter((tab: TabItem) => !removeSet.has(tab.path));
    });
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } finally {
      navigate('/', { replace: true });
    }
  };

  const reorderTabs = (sourcePath: string, targetPath: string) => {
    if (sourcePath === targetPath) return;
    setOpenTabs((previous: TabItem[]) => {
      const sourceIndex = previous.findIndex((tab: TabItem) => tab.path === sourcePath);
      const targetIndex = previous.findIndex((tab: TabItem) => tab.path === targetPath);
      if (sourceIndex < 0 || targetIndex < 0) return previous;

      const next = [...previous];
      const [moved] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
  };

  const activeTab = openTabs.find((t: TabItem) => t.path === activeTabPath);
  const ActiveModule = moduleByPath[activeTabPath]?.Component ?? moduleByPath[firstAllowedRoute(['/dashboard'])]?.Component;
  // Usa o stateKey da aba (gerado ao clicar no mesmo link do menu) para forçar remontagem do componente
  const activeModuleKey = activeTabPath + (activeTab?.stateKey ? `:${activeTab.stateKey}` : '');

  const workspaceLeft = isSidebarPinned ? '16rem' : '4rem';
  const workspaceTop = 'calc(var(--app-header-height, 0px) + var(--system-health-banner-height, 0px) + var(--workspace-tabs-height, 3rem))';
  
  const workspaceChromeStyle = {
    '--app-header-height': '0px',
    '--workspace-tabs-height': EXIBIR_ABAS_SUPERIORES ? '3.5rem' : '0px',
    '--sidebar-width-offset': isSidebarPinned ? '16rem' : '4rem',
  } as CSSProperties;

  const renderNavButton = (item: ModuleDef) => {
    const Icon = item.icon;
    const isActive = activeTabPath === item.path;
    const buttonContent = (
      <a
        key={item.path}
        href={`#${item.path}`}
        onClick={(e: MouseEvent) => {
          e.preventDefault();
          handleOpenModule(item.path);
        }}
        onMouseEnter={() => {
          // Prefetch lazy module chunk on hover com captura de exceção
          if (typeof item.Component === 'function' && 'preload' in item.Component) {
            try {
              const promise = (item.Component as { preload: () => Promise<any> }).preload();
              if (promise && typeof promise.catch === 'function') {
                promise.catch(() => {});
              }
            } catch (e) {
              // Silencia erro de pré-carregamento no hover
            }
          }
        }}
        className={cn(
          'w-full flex items-center rounded-lg transition-all duration-150 relative group select-none',
          currentSidebarExpanded ? 'gap-3 px-3 py-2.5 text-sm' : 'justify-center py-2.5',
          isActive 
            ? 'bg-gradient-to-r from-[#00427A]/10 to-[#84C2D4]/5 text-[#00427A] font-bold before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-[3px] before:bg-[#00427A] before:rounded-r-full'
            : 'text-slate-600 font-medium hover:bg-slate-100/80 hover:text-[#00427A]',
        )}
        title={currentSidebarExpanded ? item.label : undefined}
      >
        <Icon className={cn("h-[17px] w-[17px] shrink-0 transition-colors", isActive ? "text-[#00427A]" : "text-slate-400 group-hover:text-[#00427A]")} />
        {currentSidebarExpanded && <span className="truncate text-left">{item.label}</span>}
      </a>
    );

    if (currentSidebarExpanded) return buttonContent;
    return (
      <TooltipProvider key={item.path} delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            {buttonContent}
          </TooltipTrigger>
          <TooltipContent side="right" className="text-sm">
            {item.label}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  return (
    <div className="h-screen overflow-hidden bg-slate-100" style={workspaceChromeStyle}>
      <aside 
        className={cn('fixed inset-y-0 left-0 z-40 bg-white border-r border-slate-200 text-slate-900 transition-all duration-[250ms] ease-in-out flex flex-col', currentSidebarExpanded ? 'w-64 shadow-[12px_0_48px_rgba(0,0,0,0.12)]' : 'w-16 shadow-[4px_0_24px_rgba(0,0,0,0.04)]')}
        onMouseEnter={() => setIsSidebarExpanded(true)}
        onMouseLeave={() => setIsSidebarExpanded(false)}
      >
        <div className={cn("shrink-0 relative border-b border-slate-100 bg-white flex flex-col items-center", currentSidebarExpanded ? "h-28 justify-center" : "h-16 justify-center")}>
          <div className={cn("flex flex-col items-center min-w-0 w-full", currentSidebarExpanded ? "px-5 mt-1" : "px-2")}>
            {currentSidebarExpanded ? (
              <img src="/images/logo2.png" alt="Logo" className="object-contain h-14 w-full max-w-[160px]" />
            ) : (
              <img src="/images/logo1.png" alt="Logo" className="object-contain h-8 w-8" />
            )}
            {currentSidebarExpanded && (
              <div className="flex flex-col items-center mt-1.5">
                <div className="font-black tracking-[0.14em] text-[11px] uppercase whitespace-nowrap text-[#00427A] select-none">
                  SAÚDE <span className="text-[#84C2D4]">EM MOVIMENTO</span>
                </div>
              </div>
            )}
            {currentSidebarExpanded && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const nextPinned = !isSidebarPinned;
                  setIsSidebarPinned(nextPinned);
                  try {
                    localStorage.setItem('sidebar_pinned', String(nextPinned));
                  } catch (err) {
                    console.error(err);
                  }
                }}
                className="absolute right-2 top-2 p-1 rounded-md text-slate-400 hover:text-[#00427A] hover:bg-slate-100 transition-colors"
                title={isSidebarPinned ? "Desafixar menu" : "Fixar menu expandido"}
              >
                {isSidebarPinned ? (
                  <ChevronLeft className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </button>
            )}
          </div>
        </div>


        <nav className={cn('flex-1 overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-200 hover:scrollbar-thumb-slate-300', currentSidebarExpanded ? 'px-2 py-3 space-y-3' : 'px-2 py-3 space-y-3')}>
          {groupedAllowedModules.map(({ group, modules: groupedModules }: { group: ModuleDef['group']; modules: ModuleDef[] }) => {
            const groupKey = getGroupKey(group);
            const isExpanded = expandedGroups[groupKey] !== false;
            const hasActiveItem = groupedModules.some((m: ModuleDef) => m.path === activeTabPath);
            
            return (
              <div key={group} className="space-y-0.5">
                {currentSidebarExpanded ? (
                  <button
                    onClick={() => toggleGroup(groupKey)}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-1 text-[10px] font-semibold select-none transition-colors rounded-md",
                      hasActiveItem && !isExpanded
                        ? "text-[#00427A] font-bold"
                        : "text-slate-400/80 hover:text-slate-500"
                    )}
                  >
                    <span className="tracking-wide">{groupLabels[group]}</span>
                    <ChevronDown className={cn("h-3 w-3 transition-transform duration-300", isExpanded ? "text-slate-300" : hasActiveItem ? "text-[#00427A]" : "text-slate-300 -rotate-90")} />
                  </button>
                ) : (
                  <div className="mx-2 border-t border-slate-100 my-2" />
                )}
                
                <div className={cn(
                  "space-y-0.5 transition-all duration-300 ease-in-out overflow-hidden",
                  currentSidebarExpanded && !isExpanded ? "max-h-0 opacity-0" : "max-h-[500px] opacity-100"
                )}>
                  {groupedModules.map((item: ModuleDef) => renderNavButton(item))}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="shrink-0 bg-white flex flex-col">
          {isSuperadminRoot && dbStats && (
            <div className="p-2 select-none border-t border-slate-100 bg-slate-50/20">
              {currentSidebarExpanded ? (
                <div className="px-1">
                  <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    <span className="flex items-center gap-1.5 font-bold tracking-wide text-slate-600">
                      <Database className={cn("h-3.5 w-3.5 text-blue-500", loadingDbStats && "animate-pulse")} />
                      Capacidade Banco
                    </span>
                    <button
                      onClick={() => { void fetchDbStats(); }}
                      disabled={loadingDbStats}
                      className="text-slate-400 hover:text-blue-500 transition-colors disabled:opacity-50 p-0.5 rounded hover:bg-slate-100"
                      title="Atualizar tamanho"
                    >
                      <RefreshCw className={cn("h-3 w-3 transition-transform duration-500", loadingDbStats ? "animate-spin" : "hover:rotate-180")} />
                    </button>
                  </div>
                  <div className="flex items-end justify-between mt-2.5">
                    <span className="text-sm font-extrabold text-slate-800 leading-none font-mono">
                      {dbStats.usage_percentage}%
                    </span>
                    <span className="text-[10px] text-slate-500 font-bold leading-none">
                      {dbStats.current_size_pretty} <span className="text-slate-400 font-medium">/ {dbStats.limit_pretty}</span>
                    </span>
                  </div>
                  <div className="w-full bg-slate-200/60 rounded-full h-1.5 overflow-hidden mt-1.5">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-500 ease-out",
                        dbStats.usage_percentage < 70 ? "bg-gradient-to-r from-emerald-400 to-teal-500" :
                        dbStats.usage_percentage < 90 ? "bg-gradient-to-r from-amber-400 to-orange-500" : "bg-gradient-to-r from-red-500 to-rose-600"
                      )}
                      style={{ width: `${Math.min(dbStats.usage_percentage, 100)}%` }}
                    />
                  </div>
                  <div className="text-[9px] text-slate-400 font-bold mt-1.5 flex justify-between tracking-wide">
                    <span>Livre: {dbStats.free_pretty}</span>
                    {dbStats.usage_percentage >= 90 && (
                      <span className="text-red-500 font-black animate-pulse">ESPAÇO CRÍTICO</span>
                    )}
                  </div>
                </div>
              ) : (
                <TooltipProvider>
                  <Tooltip delayDuration={200}>
                    <TooltipTrigger asChild>
                      <div className="flex justify-center my-1">
                        <button
                          onClick={() => { void fetchDbStats(); }}
                          className="flex items-center justify-center h-9 w-9 rounded-xl hover:bg-slate-100/80 hover:border hover:border-slate-200/50 transition-all text-slate-600 relative group"
                        >
                          <Database 
                            className={cn(
                              "h-[18px] w-[18px] transition-transform duration-300 group-hover:scale-110",
                              dbStats.usage_percentage < 70 ? "text-emerald-500" :
                              dbStats.usage_percentage < 90 ? "text-amber-500" : "text-red-500",
                              loadingDbStats && "animate-spin"
                            )} 
                          />
                          <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-blue-500 animate-ping group-hover:block hidden" />
                        </button>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="p-3 bg-white border border-slate-200 text-slate-800 rounded-xl shadow-xl space-y-2 text-xs min-w-[200px]">
                      <div className="font-bold border-b border-slate-100 pb-1 text-slate-900 flex items-center justify-between gap-2">
                        <span>Capacidade do Banco</span>
                        <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-md">{dbStats.usage_percentage}%</span>
                      </div>
                      <div className="space-y-1 text-[11px] font-medium text-slate-600">
                        <div className="flex justify-between">
                          <span>Usado:</span>
                          <span className="font-bold text-slate-800">{dbStats.current_size_pretty}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Limite:</span>
                          <span className="font-bold text-slate-800">{dbStats.limit_pretty}</span>
                        </div>
                        <div className="flex justify-between border-t border-slate-50 pt-1">
                          <span>Disponível:</span>
                          <span className="font-bold text-emerald-600">{dbStats.free_pretty}</span>
                        </div>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}

              {/* Botão de upload de planilha para o superadmin-root */}
              {currentSidebarExpanded ? (
                <div className="px-1 mt-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleImportButtonClick}
                    className="w-full flex items-center justify-center gap-2 text-[11px] font-bold text-blue-700 hover:bg-blue-100/60 shadow-none h-8.5 rounded-lg transition-colors"
                  >
                    <FileSpreadsheet className="h-4 w-4 text-blue-600" />
                    Importar Planilha
                  </Button>
                </div>
              ) : (
                <div className="flex justify-center mt-2.5">
                  <TooltipProvider>
                    <Tooltip delayDuration={200}>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={handleImportButtonClick}
                          className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 h-9 w-9 rounded-xl border border-transparent hover:border-blue-200/40"
                        >
                          <FileSpreadsheet className="h-[18px] w-[18px]" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="font-bold text-xs bg-blue-600 text-white rounded-lg p-2 shadow-lg">
                        Importar Planilha Corrigida
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              )}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".xlsx,.xls,.csv"
                className="hidden"
              />
            </div>
          )}

          <div className="border-t border-slate-100 p-2">
            <NotificationsPopover expanded={currentSidebarExpanded} />
          </div>
          
          <div className="border-t border-slate-100 p-3 bg-slate-50/10">
            {currentSidebarExpanded ? (
              <div className="flex items-center justify-between gap-2 px-1">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-bold border shadow-sm ${getAvatarColor(profile?.full_name)}`}>
                    {getInitials(profile?.full_name)}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-[13px] font-bold text-slate-800 truncate capitalize leading-tight" title={profile?.full_name || 'Usuário'}>
                      {profile?.full_name?.toLowerCase() || 'Usuário'}
                    </span>
                    <span className="text-[11px] text-slate-400 font-medium truncate leading-none mt-0.5" title={profile?.email || 'usuario@sistemafiep.org.br'}>
                      {profile?.email || 'usuario@sistemafiep.org.br'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center shrink-0 gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsPasswordDialogOpen(true)}
                    className="text-slate-400 hover:text-blue-500 hover:bg-slate-100 shadow-none h-8 w-8 transition-all duration-200"
                    title="Trocar Senha"
                  >
                    <Key className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => { void handleSignOut(); }}
                    className="text-slate-400 hover:text-red-500 hover:bg-slate-100 shadow-none h-8 w-8 transition-all duration-200"
                    title="Sair"
                  >
                    <LogOut className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2.5 py-1.5">
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-bold border shadow-sm cursor-default select-none ${getAvatarColor(profile?.full_name)}`}>
                        {getInitials(profile?.full_name)}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="p-2.5 bg-white border border-slate-200 text-slate-800 rounded-xl shadow-xl text-xs min-w-[180px]">
                      <p className="font-bold text-slate-900 capitalize">{profile?.full_name?.toLowerCase() || 'Usuário'}</p>
                      <p className="text-slate-400 text-[11px] mt-0.5">{profile?.email}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <div className="w-8 h-[1px] bg-slate-100 my-0.5" />
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setIsPasswordDialogOpen(true)}
                        className="text-slate-400 hover:text-blue-500 hover:bg-slate-100 h-8 w-8 rounded-lg"
                      >
                        <Key className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="font-bold text-xs bg-slate-900 text-white rounded-lg p-2 shadow-lg">
                      Trocar Senha
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => { void handleSignOut(); }}
                        className="text-slate-400 hover:text-red-500 hover:bg-slate-100 h-8 w-8 rounded-lg"
                      >
                        <LogOut className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="font-bold text-xs bg-red-600 text-white rounded-lg p-2 shadow-lg">
                      Sair
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            )}
          </div>
        </div>
      </aside>

      <ChangePasswordDialog 
        open={isPasswordDialogOpen} 
        onOpenChange={setIsPasswordDialogOpen} 
      />

      <Dialog open={isImportModalOpen} onOpenChange={(open) => { if (!importing) setIsImportModalOpen(open); }}>
        <DialogContent className="max-w-2xl bg-white border border-slate-200 rounded-2xl shadow-2xl p-6 select-none">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-blue-600" />
              Importar Planilha Corrigida
            </DialogTitle>
            <DialogDescription className="text-slate-500 text-sm">
              Revise a prévia dos dados antes de confirmar a importação operacional.
            </DialogDescription>
          </DialogHeader>

          {importError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex gap-3 text-red-800 text-sm my-3 select-text">
              <AlertCircle className="h-5 w-5 shrink-0 text-red-600 mt-0.5" />
              <div>
                <p className="font-bold">A importação falhou e todas as alterações foram descartadas:</p>
                <p className="font-mono mt-1.5 text-xs text-red-700 bg-red-100/50 p-2.5 rounded-lg border border-red-200/50 break-all whitespace-pre-wrap max-h-40 overflow-y-auto">{importError}</p>
              </div>
            </div>
          )}

          {importResult && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex gap-3 text-emerald-800 text-sm my-3">
              <CheckCircle className="h-5 w-5 shrink-0 text-emerald-600 mt-0.5" />
              <div className="flex-1">
                <p className="font-bold text-base text-emerald-950">Dados importados com sucesso!</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mt-3 text-xs text-emerald-900 font-medium">
                  <div className="bg-emerald-100/50 p-2.5 rounded-lg border border-emerald-200/30">
                    <span className="text-slate-500 block">Instituições:</span>
                    <span className="font-extrabold text-sm">{importResult.institutions_created}</span>
                  </div>
                  <div className="bg-emerald-100/50 p-2.5 rounded-lg border border-emerald-200/30">
                    <span className="text-slate-500 block">Especialidades:</span>
                    <span className="font-extrabold text-sm">{importResult.specialties_created}</span>
                  </div>
                  <div className="bg-emerald-100/50 p-2.5 rounded-lg border border-emerald-200/30">
                    <span className="text-slate-500 block">Médicos:</span>
                    <span className="font-extrabold text-sm">{importResult.doctors_created}</span>
                  </div>
                  <div className="bg-emerald-100/50 p-2.5 rounded-lg border border-emerald-200/30">
                    <span className="text-slate-500 block">Pacientes:</span>
                    <span className="font-extrabold text-sm">{importResult.patients_created}</span>
                  </div>
                  <div className="bg-emerald-100/50 p-2.5 rounded-lg border border-emerald-200/30">
                    <span className="text-slate-500 block">Consultas:</span>
                    <span className="font-extrabold text-sm">{importResult.appointments_created}</span>
                  </div>
                  <div className="bg-emerald-100/50 p-2.5 rounded-lg border border-emerald-200/30">
                    <span className="text-slate-500 block">Atendimentos:</span>
                    <span className="font-extrabold text-sm">{importResult.encounters_created}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {!importResult && previewStats && (
            <div className="space-y-4 my-3">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="bg-slate-50 border border-slate-100 p-3 rounded-xl">
                  <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block">Total Linhas</span>
                  <span className="text-base font-extrabold text-slate-800 leading-none mt-1 block">{previewStats.totalRows}</span>
                </div>
                <div className="bg-slate-50 border border-slate-100 p-3 rounded-xl">
                  <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block">Pacientes</span>
                  <span className="text-base font-extrabold text-slate-800 leading-none mt-1 block">{previewStats.pacientesUnicos}</span>
                </div>
                <div className="bg-slate-50 border border-slate-100 p-3 rounded-xl">
                  <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block">Médicos</span>
                  <span className="text-base font-extrabold text-slate-800 leading-none mt-1 block">{previewStats.medicosUnicos}</span>
                </div>
                <div className="bg-slate-50 border border-slate-100 p-3 rounded-xl">
                  <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block">Especialidades</span>
                  <span className="text-base font-extrabold text-slate-800 leading-none mt-1 block">{previewStats.especialidadesUnicas}</span>
                </div>
                <div className="bg-slate-50 border border-slate-100 p-3 rounded-xl">
                  <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block">Unidades</span>
                  <span className="text-base font-extrabold text-slate-800 leading-none mt-1 block">{previewStats.instituicoesUnicas}</span>
                </div>
              </div>

              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Visualização das primeiras linhas:</p>
                <div className="border border-slate-100 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                  <table className="w-full text-[11px] text-left text-slate-600 border-collapse">
                    <thead className="bg-slate-50 text-[10px] font-bold uppercase text-slate-400 border-b border-slate-100">
                      <tr>
                        <th className="p-2 border-r border-slate-100">Paciente</th>
                        <th className="p-2 border-r border-slate-100">CPF</th>
                        <th className="p-2 border-r border-slate-100">Data Consulta</th>
                        <th className="p-2 border-r border-slate-100">Profissional</th>
                        <th className="p-2">Situação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {previewStats.primeirasLinhas.map((r: any, idx: number) => (
                        <tr key={idx} className="hover:bg-slate-50/50">
                          <td className="p-2 border-r border-slate-100 font-medium text-slate-900 truncate max-w-[120px]">{r['Paciente'] || r['paciente']}</td>
                          <td className="p-2 border-r border-slate-100 font-mono">{r['Patient Cpf'] || r['patient cpf']}</td>
                          <td className="p-2 border-r border-slate-100">{String(r['Data da consulta'] || r['data da consulta'] || '').slice(0, 16)}</td>
                          <td className="p-2 border-r border-slate-100 truncate max-w-[100px]">{r['Profissional'] || r['profissional']}</td>
                          <td className="p-2 capitalize font-semibold">{r['Situação'] || r['Situação'] || r['situacao']}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-amber-800 text-[11px] leading-relaxed flex gap-2 font-medium">
                <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <p>
                  <strong>ATENÇÃO:</strong> Os dados serão inseridos diretamente em uma transação do PostgreSQL. Se qualquer erro ocorrer no caminho, <strong>toda a operação será cancelada e nenhum dado será salvo</strong>, garantindo que o banco de dados permaneça limpo.
                </p>
              </div>
            </div>
          )}

          <DialogFooter className="mt-6 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <Button
              type="button"
              variant="outline"
              disabled={importing}
              onClick={() => setIsImportModalOpen(false)}
              className="text-slate-600 hover:text-slate-800 font-semibold"
            >
              {importResult ? 'Fechar' : 'Cancelar'}
            </Button>

            {!importResult && (
              <Button
                type="button"
                onClick={executarImportacao}
                disabled={importing || parsedRows.length === 0}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold gap-2 px-5"
              >
                {importing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Processando Transação...
                  </>
                ) : (
                  <>
                    <FileSpreadsheet className="h-4 w-4" />
                    Confirmar e Gravar Banco
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className={cn("transition-all duration-200", isSidebarPinned ? "ml-64" : "ml-16")}>
        <SystemHealthBanner />

        <div>
          {EXIBIR_ABAS_SUPERIORES && (
            <div
              className="fixed right-0 z-30 h-14 bg-white border-b border-slate-200 px-3 flex items-end justify-between transition-all duration-200 pt-2"
              style={{
                left: workspaceLeft,
                top: 'calc(var(--app-header-height, 0px) + var(--system-health-banner-height, 0px))',
              }}
            >
              <div className="flex flex-1 min-w-0 items-end gap-1.5 overflow-x-auto whitespace-nowrap scroll-smooth [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              {openTabs.map((tab: TabItem) => {
                const isActive = activeTabPath === tab.path;
                const tabModule = moduleByPath[tab.path];
                const canClose = tabModule?.closable !== false;
                const isDragging = draggingTabPath === tab.path;

                const hasClosableOthers = openTabs.some((candidate: TabItem) => candidate.path !== tab.path && moduleByPath[candidate.path]?.closable !== false);
                const tabIndex = openTabs.findIndex((candidate: TabItem) => candidate.path === tab.path);
                const hasClosableRight = openTabs.slice(tabIndex + 1).some((candidate: TabItem) => moduleByPath[candidate.path]?.closable !== false);

                return (
                  <ContextMenu key={tab.path}>
                    <ContextMenuTrigger asChild>
                      <div
                        draggable
                        onDragStart={() => setDraggingTabPath(tab.path)}
                        onDragEnd={() => setDraggingTabPath(null)}
                        onDragOver={(event: DragEvent) => event.preventDefault()}
                        onDrop={(event: DragEvent) => {
                          event.preventDefault();
                          if (!draggingTabPath) return;
                          reorderTabs(draggingTabPath, tab.path);
                          setDraggingTabPath(null);
                        }}
                        className={cn(
                          'inline-flex items-center h-10 rounded-t-lg border-x border-t px-4 text-sm cursor-grab active:cursor-grabbing transition-all relative',
                          isDragging && 'opacity-60',
                          isActive
                            ? 'bg-white text-[#00427A] border-slate-200 border-t-[3px] border-t-[#00427A] font-semibold z-10 after:absolute after:-bottom-[1px] after:left-0 after:right-0 after:h-[2px] after:bg-white'
                            : 'bg-slate-50/50 text-slate-500 border-slate-200/60 hover:bg-slate-100 hover:text-slate-700 hover:border-slate-200',
                        )}
                      >
                        <button type="button" className="mr-2 outline-none" onClick={() => handleSelectTab(tab.path)}>
                          {tab.label}
                        </button>
                        {canClose && (
                          <button
                            type="button"
                            onClick={() => handleCloseTab(tab.path)}
                            className={cn('rounded p-0.5 ml-1 transition-colors', isActive ? 'text-slate-400 hover:text-red-500 hover:bg-slate-100' : 'text-slate-400 hover:text-red-500 hover:bg-slate-200')}
                            aria-label={`Fechar ${tab.label}`}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </ContextMenuTrigger>
                    <ContextMenuContent>
                      <ContextMenuItem onClick={() => handleSelectTab(tab.path)}>Ativar aba</ContextMenuItem>
                      <ContextMenuItem disabled={!canClose} onClick={() => handleCloseTab(tab.path)}>
                        Fechar aba
                      </ContextMenuItem>
                      <ContextMenuSeparator />
                      <ContextMenuItem disabled={!hasClosableOthers} onClick={() => handleCloseOtherTabs(tab.path)}>
                        Fechar outras abas
                      </ContextMenuItem>
                      <ContextMenuItem disabled={!hasClosableRight} onClick={() => handleCloseTabsToRight(tab.path)}>
                        Fechar abas a direita
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                );
              })}
              </div>
              {/* GlobalSearch temporariamente oculto — remover `hidden` para reativar */}
              <div className="hidden items-center gap-1 shrink-0 mb-[6px] pl-2 pr-2 md:pr-4">
                <div className="h-7 w-[1px] bg-slate-200 mr-1 md:mr-2" aria-hidden="true"></div>
                <GlobalSearch />
              </div>
            </div>
          )}

          <main
            className="fixed right-0 bottom-0 overflow-y-auto overflow-x-hidden bg-slate-100 transition-all duration-200"
            style={{ left: workspaceLeft, top: workspaceTop }}
          >
            {openTabs.map((tab: TabItem) => {
              const tabModule = moduleByPath[tab.path];
              if (!tabModule) return null;
              const ModuleComponent = tabModule.Component;
              const isActive = activeTabPath === tab.path;
              const moduleKey = tab.path + (tab.stateKey ? `:${tab.stateKey}` : '');

              return (
                <div
                  key={tab.path}
                  className={cn("w-full h-full min-h-0", isActive ? "block" : "hidden")}
                >
                  <ErrorBoundary key={moduleKey}>
                    <Suspense fallback={null}>
                      <ModuleComponent />
                    </Suspense>
                  </ErrorBoundary>
                </div>
              );
            })}
          </main>
        </div>
      </div>
    </div>
  );
};

export default WorkspaceShell;
