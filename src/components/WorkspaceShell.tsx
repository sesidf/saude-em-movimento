"use client";

import React, { useState, useEffect, useMemo, Suspense, lazy, useRef } from 'react';
import type { ComponentType, CSSProperties, MouseEvent } from 'react';
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
  Stethoscope,
  Users,
  Users as UsersIcon,
  Database,
  RefreshCw,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import NotificationsPopover from '@/components/NotificationsPopover';
import SystemHealthBanner from '@/components/SystemHealthBanner';
import { ChangePasswordDialog } from '@/components/ChangePasswordDialog';
import { getAvatarColor, getInitials } from '@/utils/formatters';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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

type ModuleDef = {
  path: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  group: 'Recepção' | 'Clínico' | 'Administração' | 'Técnico';
  Component: ComponentType;
};

const modules: ModuleDef[] = [
  // Clínica / Recepção
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, group: 'Clínico', Component: Dashboard },
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
];

const groupLabels: Record<ModuleDef['group'], string> = {
  Recepção: 'Recepção',
  Clínico: 'Clínico',
  Administração: 'Administração',
  Técnico: 'Técnico',
};

const sidebarGroupOrder: ModuleDef['group'][] = ['Recepção', 'Clínico', 'Administração', 'Técnico'];

const WorkspaceShell = () => {
  const { canAccessRoute, firstAllowedRoute, profile, signOut, userRole } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [isSidebarPinned, setIsSidebarPinned] = useState(() => {
    try {
      return localStorage.getItem('sidebar_pinned') !== 'false';
    } catch {
      return true;
    }
  });
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  const currentSidebarExpanded = isSidebarPinned || isSidebarExpanded;

  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);

  // Grupos colapsáveis
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    recepcao: true,
    clinico: true,
    administracao: true,
  });

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const getGroupKey = (group: ModuleDef['group']) => {
    switch (group) {
      case 'Recepção':
        return 'recepcao';
      case 'Clínico':
        return 'clinico';
      case 'Administração':
        return 'administracao';
      default:
        return 'tecnico';
    }
  };

  const allowedModules = useMemo(() => {
    return modules.filter((m) => canAccessRoute(m.path));
  }, [canAccessRoute]);

  const currentPath = location.pathname === '/' || !location.pathname ? '/dashboard' : location.pathname;

  const handleNavigate = (path: string) => {
    navigate(path);
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (err) {
      console.error('Erro ao sair:', err);
    }
  };

  const groupedModules = useMemo(() => {
    return sidebarGroupOrder
      .map((group) => ({
        group,
        modules: allowedModules.filter((m) => m.group === group),
      }))
      .filter((g) => g.modules.length > 0);
  }, [allowedModules]);

  const ActiveComponent = useMemo(() => {
    const mod = modules.find((m) => m.path === currentPath);
    if (mod) return mod.Component;
    const fallback = modules.find((m) => m.path === firstAllowedRoute(['/dashboard']));
    return fallback ? fallback.Component : Dashboard;
  }, [currentPath, firstAllowedRoute]);

  const workspaceLeft = isSidebarPinned ? '16rem' : '4rem';

  const renderNavButton = (item: ModuleDef) => {
    const Icon = item.icon;
    const isActive = currentPath === item.path;
    const buttonContent = (
      <a
        key={item.path}
        href={item.path}
        onClick={(e: MouseEvent) => {
          e.preventDefault();
          handleNavigate(item.path);
        }}
        className={cn(
          'w-full flex items-center rounded-xl transition-all duration-150 relative group select-none',
          currentSidebarExpanded ? 'gap-3 px-3 py-2.5 text-sm' : 'justify-center py-2.5',
          isActive
            ? 'bg-gradient-to-r from-[#00427A]/10 to-[#84C2D4]/5 text-[#00427A] font-bold before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-[3px] before:bg-[#00427A] before:rounded-r-full'
            : 'text-slate-600 font-medium hover:bg-slate-100/80 hover:text-[#00427A]'
        )}
        title={currentSidebarExpanded ? item.label : undefined}
      >
        <Icon
          className={cn(
            'h-[17px] w-[17px] shrink-0 transition-colors',
            isActive ? 'text-[#00427A]' : 'text-slate-400 group-hover:text-[#00427A]'
          )}
        />
        {currentSidebarExpanded && <span className="truncate text-left">{item.label}</span>}
      </a>
    );

    if (currentSidebarExpanded) return buttonContent;
    return (
      <TooltipProvider key={item.path} delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>{buttonContent}</TooltipTrigger>
          <TooltipContent side="right" className="text-sm">
            {item.label}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  return (
    <div className="h-screen overflow-hidden bg-slate-100">
      {/* Sidebar Lateral */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 bg-white border-r border-slate-200 text-slate-900 transition-all duration-[250ms] ease-in-out flex flex-col',
          currentSidebarExpanded
            ? 'w-64 shadow-[12px_0_48px_rgba(0,0,0,0.12)]'
            : 'w-16 shadow-[4px_0_24px_rgba(0,0,0,0.04)]'
        )}
        onMouseEnter={() => setIsSidebarExpanded(true)}
        onMouseLeave={() => setIsSidebarExpanded(false)}
      >
        <div
          className={cn(
            'shrink-0 relative border-b border-slate-100 bg-white flex flex-col items-center',
            currentSidebarExpanded ? 'h-28 justify-center' : 'h-16 justify-center'
          )}
        >
          <div
            className={cn(
              'flex flex-col items-center min-w-0 w-full',
              currentSidebarExpanded ? 'px-5 mt-1' : 'px-2'
            )}
          >
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
                title={isSidebarPinned ? 'Desafixar menu' : 'Fixar menu expandido'}
              >
                {isSidebarPinned ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
            )}
          </div>
        </div>

        <nav
          className={cn(
            'flex-1 overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-200 hover:scrollbar-thumb-slate-300',
            currentSidebarExpanded ? 'px-2 py-3 space-y-3' : 'px-2 py-3 space-y-3'
          )}
        >
          {groupedModules.map(({ group, modules: grpMods }) => {
            const groupKey = getGroupKey(group);
            const isExpanded = expandedGroups[groupKey] !== false;
            const hasActiveItem = grpMods.some((m) => m.path === currentPath);

            return (
              <div key={group} className="space-y-0.5">
                {currentSidebarExpanded ? (
                  <button
                    onClick={() => toggleGroup(groupKey)}
                    className={cn(
                      'w-full flex items-center justify-between px-3 py-1 text-[10px] font-semibold select-none transition-colors rounded-md',
                      hasActiveItem && !isExpanded ? 'text-[#00427A] font-bold' : 'text-slate-400/80 hover:text-slate-500'
                    )}
                  >
                    <span className="tracking-wide">{groupLabels[group]}</span>
                    <ChevronDown
                      className={cn(
                        'h-3 w-3 transition-transform duration-300',
                        isExpanded ? 'text-slate-300' : hasActiveItem ? 'text-[#00427A]' : 'text-slate-300 -rotate-90'
                      )}
                    />
                  </button>
                ) : (
                  <div className="mx-2 border-t border-slate-100 my-2" />
                )}

                <div
                  className={cn(
                    'space-y-0.5 transition-all duration-300 ease-in-out overflow-hidden',
                    currentSidebarExpanded && !isExpanded ? 'max-h-0 opacity-0' : 'max-h-[500px] opacity-100'
                  )}
                >
                  {grpMods.map((item) => renderNavButton(item))}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Rodapé da Sidebar */}
        <div className="shrink-0 bg-white flex flex-col">
          <div className="border-t border-slate-100 p-2">
            <NotificationsPopover expanded={currentSidebarExpanded} />
          </div>

          <div className="border-t border-slate-100 p-3 bg-slate-50/10">
            {currentSidebarExpanded ? (
              <div className="flex items-center justify-between gap-2 px-1">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-bold border shadow-sm ${getAvatarColor(
                      profile?.full_name
                    )}`}
                  >
                    {getInitials(profile?.full_name)}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span
                      className="text-[13px] font-bold text-slate-800 truncate capitalize leading-tight"
                      title={profile?.full_name || 'Usuário'}
                    >
                      {profile?.full_name?.toLowerCase() || 'Usuário'}
                    </span>
                    <span
                      className="text-[11px] text-slate-400 font-medium truncate leading-none mt-0.5"
                      title={profile?.email || ''}
                    >
                      {profile?.email}
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
                    onClick={() => {
                      void handleSignOut();
                    }}
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
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-bold border shadow-sm cursor-default select-none ${getAvatarColor(
                          profile?.full_name
                        )}`}
                      >
                        {getInitials(profile?.full_name)}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent
                      side="right"
                      className="p-2.5 bg-white border border-slate-200 text-slate-800 rounded-xl shadow-xl text-xs min-w-[180px]"
                    >
                      <p className="font-bold text-slate-900 capitalize">
                        {profile?.full_name?.toLowerCase() || 'Usuário'}
                      </p>
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
                        onClick={() => {
                          void handleSignOut();
                        }}
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

      <ChangePasswordDialog open={isPasswordDialogOpen} onOpenChange={setIsPasswordDialogOpen} />

      {/* Conteúdo Principal do Módulo Ativo - Layout Limpo e Direto */}
      <main
        className="fixed inset-y-0 right-0 overflow-y-auto overflow-x-hidden bg-slate-100 transition-all duration-[250ms] pt-3"
        style={{ left: workspaceLeft }}
      >
        <ErrorBoundary key={currentPath}>
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600"></div>
              </div>
            }
          >
            <ActiveComponent />
          </Suspense>
        </ErrorBoundary>
      </main>
    </div>
  );
};

export default WorkspaceShell;
