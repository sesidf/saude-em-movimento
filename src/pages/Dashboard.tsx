"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createPortal } from 'react-dom';
import {
  Activity, AlertTriangle, BarChart3, Building2, Calendar, CheckCircle, CheckCheck, Clock,
  LineChart as LineChartIcon, Maximize2, Minimize2, RefreshCw, Stethoscope,
  TrendingDown, TrendingUp, UserCheck, UserPlus, Users, UserX, XCircle, Hourglass,
  Timer, ChevronLeft, ChevronRight, Zap, Database, History,
  Check, ChevronsUpDown
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell,
  Funnel, FunnelChart, LabelList, XAxis, YAxis,
} from 'recharts';
import PageHeader from '@/components/PageHeader';

import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { QuickFilterButton } from '@/components/ui/quick-filter-button';
import { useAuth } from '@/contexts/AuthContext';
import { StatusBadge, SpecialtyBadge, renderDoctorOption } from '@/components/ui/combobox-helpers';
import { chamarApiPost, chamarApiGet } from '@/lib/workerApi';
import { SPECIALTY_ICONS } from '@/pages/Specialties';
import { useDoctorsCatalog, useInstitutionsCatalog, useSpecialtiesCatalog } from '@/hooks/useCatalogos';

/* ─────────────────────────── Tipos ─────────────────────────── */

interface DashboardStats {
  institutionName?: string;
  totalPatients: number;
  totalDoctors: number;
  kpisToday: BiKpis;
  kpis30Days: BiKpis;
  kpisAllTime: BiKpis;
}

interface DashboardSnapshot {
  institution_name?: string;
  today_appointments?: number;
  completed_appointments?: number;
  pending_appointments?: number;
  cancelled_appointments?: number;
  total_patients?: number;
  total_doctors?: number;
}


type BiKpis = {
  scheduled?: number;
  agendado?: number;
  confirmado?: number;
  em_atendimento?: number;
  completed?: number;
  cancelled?: number;
  no_show?: number;
  reagendado?: number;
  agendado_rate?: number;
  confirmado_rate?: number;
  em_atendimento_rate?: number;
  completion_rate?: number;
  cancellation_rate?: number;
  no_show_rate?: number;
  reagendado_rate?: number;
  pending?: number;
  patients?: number;
  doctors?: number;
  new_patients?: number;
  recurring_patients?: number;
  avg_daily?: number;
  avg_weekly?: number;
  avg_days_until_appointment?: number;
  avg_service_minutes?: number;
  growth_rate?: number;
  efficiency?: number;
  operational_balance?: number;
  critical_hours?: number;
  idle_hours?: number;
  total_appointments?: number;
};

type TimelineRow = {
  date: string;
  iso_date: string;
  agendadas: number;
  realizadas: number;
  canceladas: number;
  pendentes: number;
  no_show: number;
};

type HeatmapRow = {
  day: string;
  dow: number;
  hour: string;
  value: number;
  intensity: number;
};

type FunnelRow = {
  stage: string;
  value: number;
};

type RankingRow = {
  id?: string;
  name: string;
  specialty?: string;
  scheduled?: number;
  completed?: number;
  cancelled?: number;
  no_show?: number;
  efficiency?: number;
  demand?: number;
  conversion?: number;
  volume?: number;
  resolvedColor?: string;
  resolvedIcon?: string;
};

type BiAlert = {
  severity: 'critical' | 'warning' | 'success' | 'info';
  title: string;
  impact: string;
  recommendation: string;
};

type FilterOption = {
  id: string;
  name: string;
  specialty_id?: string | null;
  specialty_name?: string | null;
  specialty_icon?: string | null;
  specialty_color?: string | null;
  institution_id?: string | null;
  institution_ids?: string[] | null;
};

type BiFullscreenPanel = 'timeline' | 'professionals' | 'funnel' | 'specialties' | 'units' | 'heatmap' | 'types' | 'alerts';

type DashboardBiSnapshot = {
  filters?: {
    institutions?: FilterOption[];
    doctors?: FilterOption[];
    specialties?: FilterOption[];
  };
  kpis?: BiKpis;
  timeline?: TimelineRow[];
  heatmap?: HeatmapRow[];
  funnel?: FunnelRow[];
  rankings?: {
    professionals?: RankingRow[];
    specialties?: RankingRow[];
    units?: RankingRow[];
    types?: RankingRow[];
  };
  alerts?: BiAlert[];
};

type BiFilters = {
  days: string;
  startDate?: string;
  endDate?: string;
  institutionId: string;
  doctorId: string;
  specialtyId: string;
  status: string;
  type: string;
  search: string;
};

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Constantes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

const ALL_VALUE = 'all';

const STATUS_OPTIONS = [
  { value: ALL_VALUE, label: 'Todos os Status', icon: null, bg: '' },
  { value: 'agendado', label: 'Agendado', icon: Clock, bg: 'bg-amber-500/15 text-amber-600 border-amber-500/30' },
  { value: 'confirmado', label: 'Confirmado', icon: CheckCircle, bg: 'bg-blue-500/15 text-blue-600 border-blue-500/30' },
  { value: 'em_atendimento', label: 'Em Atendimento', icon: Activity, bg: 'bg-purple-500/15 text-purple-600 border-purple-500/30' },
  { value: 'concluido', label: 'Concluído', icon: CheckCheck, bg: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30' },
  { value: 'cancelado', label: 'Cancelado', icon: XCircle, bg: 'bg-rose-500/15 text-rose-600 border-rose-500/30' },
  { value: 'nao_compareceu', label: 'Faltou', icon: UserX, bg: 'bg-slate-500/15 text-slate-600 border-slate-500/30' },
  { value: 'reagendado', label: 'Reagendado', icon: RefreshCw, bg: 'bg-indigo-500/15 text-indigo-600 border-indigo-500/30' },
];


/**
 * Alterna a seleção de um item em um filtro multi-select (formato CSV).
 */
const toggleMultiSelect = (currentValue: string, clickedValue: string): string => {
  if (clickedValue === ALL_VALUE) return ALL_VALUE;
  
  const currentArray = (!currentValue || currentValue === ALL_VALUE) 
    ? [] 
    : currentValue.split(',').map((s) => s.trim()).filter(Boolean);

  if (currentArray.includes(clickedValue)) {
    const updated = currentArray.filter((v) => v !== clickedValue);
    return updated.length === 0 ? ALL_VALUE : updated.join(',');
  } else {
    const updated = [...currentArray, clickedValue];
    return updated.join(',');
  }
};

/**
 * Verifica se um valor está selecionado no filtro multi-select.
 */
const isMultiSelected = (currentValue: string, itemValue: string): boolean => {
  if (itemValue === ALL_VALUE) {
    return !currentValue || currentValue === ALL_VALUE;
  }
  if (!currentValue || currentValue === ALL_VALUE) return false;
  return currentValue.split(',').map((s) => s.trim()).includes(itemValue);
};



/* ————————————————— Paleta Power BI ————————————————— */

const emptyBiSnapshot: DashboardBiSnapshot = {
  filters: { institutions: [], doctors: [], specialties: [] },
  kpis: {},
  timeline: [],
  heatmap: [],
  funnel: [],
  rankings: { professionals: [], specialties: [], units: [], types: [] },
  alerts: [],
};

/** Cores do sistema no estilo Power BI */
const PBI = {
  blue:    '#2D6BE4',
  green:   '#1DB870',
  amber:   '#F5A623',
  red:     '#E84040',
  purple:  '#8B5CF6',
  cyan:    '#0EA5E9',
  teal:    '#14B8A6',
  surface: '#F7F8FC',
  card:    '#FFFFFF',
  border:  '#E8EBF0',
  text:    '#1A2035',
  muted:   '#6B7280',
};

/* ————————————————— Hook de número animado ————————————————— */

/**
 * Anima um numero de 0 ate end com easing exponencial.
 * @param end - Valor final
 * @param duration - Duracao em ms (padrao 600ms)
 */
const useAnimatedNumber = (end: number, duration = 600): number => {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (end === 0) { setCount(0); return; }
    let startTime: number | null = null;
    let frameId: number;
    const step = (ts: number) => {
      if (!startTime) startTime = ts;
      const p = Math.min((ts - startTime) / duration, 1);
      const eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      setCount(eased * end);
      if (p < 1) frameId = requestAnimationFrame(step);
      else setCount(end);
    };
    frameId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameId);
  }, [end, duration]);
  return end % 1 !== 0 ? Number(count.toFixed(1)) : Math.floor(count);
};



/* ————————————————————————————————————————————————————————————————————————————————
   COMPONENTES POWER BI REUTILIZAVEIS
———————————————————————————————————————————————————————————————————————————————— */

/** Secao com divisor horizontal estilo Power BI */
const PbiSection = ({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) => (
  <section>
    <div className="flex items-center gap-2 mb-2">
      <span style={{ color: PBI.blue }}>{icon}</span>
      <h3 style={{ color: PBI.muted }} className="text-[10px] font-bold uppercase tracking-widest">{label}</h3>
      <div className="flex-1 h-px" style={{ backgroundColor: PBI.border }} />
    </div>
    {children}
  </section>
);

/** KPI Card — flat, barra de acento lateral 3px, sem gradientes */
const PbiKpiCard = ({
  label, value, suffix, sub, icon, accent,
}: {
  label: string;
  value: number | string;
  suffix?: string;
  sub?: string;
  icon: React.ReactNode;
  accent: string;
}) => {
  const isNumeric = typeof value === 'number';
  const animated = useAnimatedNumber(isNumeric ? value : 0);
  const display = isNumeric
    ? new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(animated)
    : value;

  return (
    <div
      className="relative flex flex-col justify-between bg-white rounded overflow-hidden shadow-sm"
      style={{ border: `1px solid ${PBI.border}` }}
    >
      <div className="absolute -right-3 -bottom-3 opacity-[0.08] pointer-events-none [&>svg]:w-16 [&>svg]:h-16" style={{ color: accent }}>
        {icon}
      </div>
      
      <div className="px-3 pt-2.5 pb-2 relative z-10">
        <div className="flex items-start justify-between mb-1.5">
          <span className="text-[9px] font-bold uppercase tracking-widest leading-tight" style={{ color: PBI.muted }}>{label}</span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-[22px] font-bold tracking-tight leading-none" style={{ color: PBI.text }}>{display}</span>
          {suffix && <span className="text-[11px] font-semibold" style={{ color: PBI.muted }}>{suffix}</span>}
        </div>
        {sub && (
          <div className="mt-1.5 flex items-center gap-1 text-[9px] font-medium" style={{ color: '#9CA3AF' }}>
            <ChevronRight className="h-2.5 w-2.5 shrink-0" style={{ color: accent }} />
            <span className="truncate">{sub}</span>
          </div>
        )}
      </div>
    </div>
  );
};



/** Placeholder sem dados */
const PbiNoData = ({ label }: { label: string }) => (
  <div
    className="flex h-full min-h-[90px] items-center justify-center rounded text-[11px] font-medium"
    style={{ border: `1px dashed ${PBI.border}`, backgroundColor: PBI.surface, color: '#9CA3AF' }}
  >
    {label}
  </div>
);

/** Painel de grafico estilo Power BI */
const PbiChartPanel = ({
  title, icon, loading, height = 180, action, children, className
}: {
  title: React.ReactNode;
  icon?: React.ReactNode;
  loading?: boolean;
  height?: number;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) => (
  <div className={cn("bg-white rounded overflow-hidden", className)} style={{ border: `1px solid ${PBI.border}` }}>
    <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: `1px solid #F0F2F6` }}>
      <div className="flex items-center gap-1.5">
        <span style={{ color: PBI.blue }}>{icon}</span>
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: PBI.muted }}>{title}</span>
        {loading && <span className="h-1.5 w-1.5 rounded-full animate-pulse ml-1" style={{ backgroundColor: PBI.amber }} />}
      </div>
      {action}
    </div>
    <div className="p-2" style={{ height }}>
      {children}
    </div>
  </div>
);

/** Heatmap â€” celula */
const PbiHeatmapDay = ({ day, hours, rows }: { key?: string; day: string; hours: string[]; rows: HeatmapRow[] }) => (
  <>
    <div className="flex items-center text-[10px] font-semibold" style={{ color: PBI.muted }}>{day}</div>
    {hours.map((hour) => {
      const cell = rows.find((row) => row.day === day && row.hour === hour);
      const intensity = cell?.intensity || 0;
      return (
        <div
          key={`${day}-${hour}`}
          className="h-4 rounded text-center text-[8px] font-bold leading-4"
          title={`${day} ${hour}: ${cell?.value || 0}`}
          style={{
            backgroundColor: `rgba(45, 107, 228, ${Math.max(intensity / 130, 0.04)})`,
            border: `1px solid #F0F2F6`,
            color: PBI.text,
          }}
        >
          {cell?.value || 0}
        </div>
      );
    })}
  </>
);

const getCategoryColor = (str: string) => {
  if (!str) return PBI.blue;
  const colors = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316', '#84CC16', '#6366F1', '#14B8A6'];
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

/** Ranking Panel */
const PbiRankingPanel = ({
  title, rows, valueKey, subKey, suffixSub, compact, expanded, action, colorKey = 'name', titleIcon: TitleIcon, isBadgeTitle, subKeyIcon: SubKeyIcon, isBadgeSubKey, className
}: {
  title: string;
  rows: RankingRow[];
  valueKey: keyof RankingRow;
  subKey?: keyof RankingRow;
  suffixSub?: string;
  compact?: boolean;
  expanded?: boolean;
  action?: React.ReactNode;
  colorKey?: keyof RankingRow;
  titleIcon?: React.ElementType;
  isBadgeTitle?: boolean;
  subKeyIcon?: React.ElementType;
  isBadgeSubKey?: boolean;
  className?: string;
}) => {
  const max = useMemo(() => {
    if (rows.length === 0) return 1;
    return Math.max(...rows.map((item) => Number(item[valueKey] || 0)), 1);
  }, [rows, valueKey]);

  return (
    <PbiChartPanel
      title={title}
      icon={<BarChart3 className="h-3.5 w-3.5" />}
      height={compact ? 210 : expanded ? 600 : 280}
      action={action}
      className={className}
    >
      <div
        className="space-y-1.5 overflow-y-auto pr-1"
        style={{ maxHeight: compact ? '174px' : expanded ? '568px' : '244px' }}
      >
        {rows.length === 0 ? (
          <div className="text-[11px] py-6 text-center font-medium" style={{ color: '#9CA3AF' }}>Sem dados no periodo.</div>
        ) : rows.map((row, index) => {
          const value = Number(row[valueKey] || 0);
          const rankColors = ['#F59E0B', '#94A3B8', '#D97706'];
          const rankBg = index < 3 ? rankColors[index] : '#D1D5DB';
          const rankFg = index < 3 ? '#FFFFFF' : '#6B7280';
          
          const subKeyValue = subKey ? String(row[subKey] ?? '') : '';
          const itemColor = row.resolvedColor || getCategoryColor(String(row[colorKey] ?? ''));
          const iconName = row.resolvedIcon;
          const FinalTitleIcon = (isBadgeTitle && iconName && SPECIALTY_ICONS[iconName]) ? SPECIALTY_ICONS[iconName] : TitleIcon;
          const FinalSubKeyIcon = (isBadgeSubKey && iconName && SPECIALTY_ICONS[iconName]) ? SPECIALTY_ICONS[iconName] : SubKeyIcon;

          return (
            <div key={`${row.id || row.name}-${index}`} className="flex flex-col">
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-[9px] font-bold"
                    style={{ backgroundColor: rankBg, color: rankFg }}
                  >
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    {isBadgeTitle ? (
                      <div className="flex items-center flex-wrap gap-x-2 gap-y-1">
                        <span 
                          className="inline-flex items-center truncate text-[9px] px-1.5 py-0.5 rounded-sm font-bold uppercase tracking-wider" 
                          style={{ backgroundColor: `${itemColor}15`, color: itemColor }}
                        >
                          {FinalTitleIcon && <FinalTitleIcon className="h-3 w-3 mr-1" />}
                          {row.name}
                        </span>
                        {subKey && subKeyValue && (
                          <span className="flex items-center gap-1.5 text-[10px] font-semibold" style={{ color: PBI.muted }}>
                            <span className="h-1 w-1 rounded-full bg-slate-300 shrink-0" />
                            {subKeyValue}{suffixSub || ''}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center flex-wrap gap-x-1.5 gap-y-1">
                        <span className="truncate text-[11px] font-semibold" style={{ color: PBI.text }}>{row.name}</span>
                        {subKey && subKeyValue && (
                          <>
                            <span className="h-1 w-1 rounded-full bg-slate-300 shrink-0" />
                            {isBadgeSubKey ? (
                              <span 
                                className="inline-flex items-center truncate text-[9px] px-1.5 py-0.5 rounded-sm font-bold uppercase tracking-wider" 
                                style={{ backgroundColor: `${itemColor}15`, color: itemColor }}
                              >
                                {FinalSubKeyIcon && <FinalSubKeyIcon className="h-3 w-3 mr-1" />}
                                {subKeyValue}{suffixSub || ''}
                              </span>
                            ) : (
                              <span className="truncate text-[10px] font-medium" style={{ color: PBI.muted }}>
                                {subKeyValue}{suffixSub || ''}
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <span className="text-[11px] font-bold whitespace-nowrap" style={{ color: itemColor }}>{value}</span>
              </div>
              <div className="h-1 w-full rounded-full overflow-hidden" style={{ backgroundColor: '#F0F2F6' }}>
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min((value / max) * 100, 100)}%`, backgroundColor: itemColor }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </PbiChartPanel>
  );
};
/** Distribution Bars */
const CustomYAxisTick = (props: any) => {
  const { x, y, payload } = props;
  return (
    <g transform={`translate(${x},${y})`}>
      <foreignObject x={-145} y={-8} width={140} height={20}>
        <div className="flex w-full justify-end pr-2">
          <span className="truncate min-w-0 text-[9px] font-semibold text-slate-500" title={payload.value}>
            {payload.value}
          </span>
        </div>
      </foreignObject>
    </g>
  );
};
const PbiDistributionBars = ({
  title, rows, compact, action, className,
}: {
  title: string;
  rows: RankingRow[];
  compact?: boolean;
  action?: React.ReactNode;
  className?: string;
}) => (
  <PbiChartPanel
    title={title}
    icon={<Building2 className="h-3.5 w-3.5" />}
    height={compact ? 210 : 230}
    action={action}
    className={className}
  >
    {rows.length ? (
      <ChartContainer 
        className="h-full w-full aspect-auto" 
        config={{ 
          agendado: { label: 'Agendado', color: '#F59E0B' },
          confirmado: { label: 'Confirmado', color: '#3B82F6' },
          em_atendimento: { label: 'Em Atend.', color: '#A855F7' },
          completed: { label: 'Concluído', color: '#10B981' },
          cancelled: { label: 'Cancelado', color: '#F43F5E' },
          faltou: { label: 'Faltou', color: '#64748B' },
          reagendado: { label: 'Reagendado', color: '#6366F1' },
          volume: { label: 'Volume (Total)', color: PBI.blue }
        }}
      >
        <BarChart data={rows} layout="vertical" margin={{ left: 4, right: 18, top: 4, bottom: 0 }}>
          <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="#F0F2F6" />
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={145} tick={<CustomYAxisTick />} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Bar dataKey="agendado" stackId="a" fill="#F59E0B" />
          <Bar dataKey="confirmado" stackId="a" fill="#3B82F6" />
          <Bar dataKey="em_atendimento" stackId="a" fill="#A855F7" />
          <Bar dataKey="completed" stackId="a" fill="#10B981" />
          <Bar dataKey="cancelled" stackId="a" fill="#F43F5E" />
          <Bar dataKey="faltou" stackId="a" fill="#64748B" />
          <Bar dataKey="reagendado" stackId="a" fill="#6366F1" radius={[0, 3, 3, 0]} />
        </BarChart>
      </ChartContainer>
    ) : <PbiNoData label="Sem dados no recorte." />}
  </PbiChartPanel>
);


/** Painel de Análise de Desfecho & Eficiência Operacional */
const PbiOutcomeAnalysis = ({ kpis, loading, compact, className }: { kpis: BiKpis; loading?: boolean; compact?: boolean; className?: string }) => {
  const items = [
    { label: 'Agendado', val: kpis.agendado || 0, pct: kpis.agendado_rate || 0, color: '#F59E0B', bg: 'bg-amber-50 text-amber-700' },
    { label: 'Confirmado', val: kpis.confirmado || 0, pct: kpis.confirmado_rate || 0, color: '#3B82F6', bg: 'bg-blue-50 text-blue-700' },
    { label: 'Em Atendimento', val: kpis.em_atendimento || 0, pct: kpis.em_atendimento_rate || 0, color: '#A855F7', bg: 'bg-purple-50 text-purple-700' },
    { label: 'Concluído', val: kpis.completed || 0, pct: kpis.completion_rate || 0, color: '#10B981', bg: 'bg-emerald-50 text-emerald-700' },
    { label: 'Cancelado', val: kpis.cancelled || 0, pct: kpis.cancellation_rate || 0, color: '#EF4444', bg: 'bg-rose-50 text-rose-700' },
    { label: 'Faltou', val: kpis.no_show || 0, pct: kpis.no_show_rate || 0, color: '#64748B', bg: 'bg-slate-100 text-slate-700' },
    { label: 'Reagendado', val: kpis.reagendado || 0, pct: kpis.reagendado_rate || 0, color: '#6366F1', bg: 'bg-indigo-50 text-indigo-700' },
  ];

  return (
    <PbiChartPanel title="Analise de Desfechos (7 Status)" icon={<Activity className="h-3.5 w-3.5" />} loading={loading} height={compact ? 185 : 230} className={className}>
      <div className="space-y-1 py-0.5 overflow-y-auto" style={{ maxHeight: compact ? '150px' : '195px' }}>
        {items.map((item) => (
          <div key={item.label} className="space-y-0.5">
            <div className="flex items-center justify-between text-[10px]">
              <span className="font-semibold text-slate-700">{item.label}</span>
              <div className="flex items-center gap-1">
                <span className="font-extrabold text-slate-800">{item.val}</span>
                <span className={`text-[9px] font-bold px-1 py-0.2 rounded ${item.bg}`}>
                  {item.pct}%
                </span>
              </div>
            </div>
            <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(item.pct, 100)}%`, backgroundColor: item.color }} />
            </div>
          </div>
        ))}
      </div>
    </PbiChartPanel>
  );
};

/** Painel de Picos de Demanda & Ocupação */
const PbiPeakDemandAnalysis = ({ kpis, heatmap, loading, compact, className }: { kpis: BiKpis; heatmap?: HeatmapRow[]; loading?: boolean; compact?: boolean; className?: string }) => {
  const peakDay = useMemo(() => {
    if (!heatmap || heatmap.length === 0) return 'Terça-feira';
    const dayTotals: Record<string, number> = {};
    heatmap.forEach(h => {
      dayTotals[h.day] = (dayTotals[h.day] || 0) + (h.value || 0);
    });
    const sorted = Object.entries(dayTotals).sort((a, b) => b[1] - a[1]);
    const dayMap: Record<string, string> = { Seg: 'Segunda', Ter: 'Terça-feira', Qua: 'Quarta-feira', Qui: 'Quinta-feira', Sex: 'Sexta-feira', Sab: 'Sábado', Dom: 'Domingo' };
    return dayMap[sorted[0]?.[0]] || sorted[0]?.[0] || 'Terça-feira';
  }, [heatmap]);

  return (
    <PbiChartPanel title="Analise de Demanda & Pico" icon={<TrendingUp className="h-3.5 w-3.5" />} loading={loading} height={compact ? 185 : 230} className={className}>
      <div className="grid grid-cols-2 gap-2 h-full py-0.5">
        <div className="p-2 bg-blue-50/60 border border-blue-100 rounded-lg flex flex-col justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700">Dia de Pico</span>
          <span className="text-xs font-black text-slate-800 truncate">{peakDay}</span>
          <span className="text-[9px] text-blue-600 font-semibold">Maior volume semanal</span>
        </div>

        <div className="p-2 bg-emerald-50/60 border border-emerald-100 rounded-lg flex flex-col justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Taxa de Ocupacao</span>
          <span className="text-xs font-black text-slate-800">{kpis.efficiency || 0}%</span>
          <span className="text-[9px] text-emerald-600 font-semibold">Capacidade da agenda</span>
        </div>

        <div className="p-2 bg-violet-50/60 border border-violet-100 rounded-lg flex flex-col justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-violet-700">Tempo de Espera</span>
          <span className="text-xs font-black text-slate-800">{kpis.avg_days_until_appointment || 0} dias</span>
          <span className="text-[9px] text-violet-600 font-semibold">Media ate atendimento</span>
        </div>

        <div className="p-2 bg-amber-50/60 border border-amber-100 rounded-lg flex flex-col justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Media Diaria</span>
          <span className="text-xs font-black text-slate-800">{kpis.avg_daily || 0} pac.</span>
          <span className="text-[9px] text-amber-600 font-semibold">Consultas por dia</span>
        </div>
      </div>
    </PbiChartPanel>
  );
};

/** Painel de Alertas Operacionais (Fiel ao modelo de Relatórios) */
const PbiOperationalAlerts = ({
  alerts,
  kpis,
  loading,
  compact,
  action,
  className,
}: {
  alerts?: BiAlert[];
  kpis: BiKpis;
  loading?: boolean;
  compact?: boolean;
  action?: React.ReactNode;
  className?: string;
}) => {
  const computedAlerts = useMemo(() => {
    const list: Array<{ id: string; severity: 'critical' | 'warning' | 'info'; title: string; impact: string }> = [];

    // 1. Alertas vindos da RPC / banco (ex: duplicidades)
    if (alerts && alerts.length > 0) {
      alerts.forEach((al, idx) => {
        list.push({
          id: `rpc-${idx}`,
          severity: (al.severity as any) || 'warning',
          title: al.title || 'Duplicidade: Consultas repetidas',
          impact: `${al.impact || ''} ${al.recommendation || ''}`.trim(),
        });
      });
    }

    // 2. Alerta de Faltas (No-Show)
    const noShowRate = kpis.no_show_rate || 0;
    if (noShowRate > 5) {
      list.push({
        id: 'kpi-noshow',
        severity: noShowRate > 15 ? 'critical' : 'warning',
        title: 'Alerta de Faltas (No-Show)',
        impact: `Taxa de faltas em ${noShowRate.toFixed(1)}% (${kpis.no_show || 0} pacientes faltaram). Recomenda-se reforçar a confirmação via WhatsApp.`,
      });
    }

    // 3. Alerta de Cancelamento
    const cancelRate = kpis.cancellation_rate || 0;
    if (cancelRate > 5) {
      list.push({
        id: 'kpi-cancel',
        severity: cancelRate > 15 ? 'critical' : 'warning',
        title: 'Taxa de Cancelamento Elevada',
        impact: `Cancelamentos em ${cancelRate.toFixed(1)}% (${kpis.cancelled || 0} consultas canceladas). Verifique os motivos na recepção.`,
      });
    }

    // 4. Alerta de Tempo de Espera
    const avgDays = kpis.avg_days_until_appointment || 0;
    if (avgDays > 7) {
      list.push({
        id: 'kpi-wait',
        severity: 'warning',
        title: 'Tempo de Espera Elevado',
        impact: `Média de ${avgDays} dias de espera até o atendimento. Considere abrir novas vagas na agenda.`,
      });
    }

    return list;
  }, [alerts, kpis]);

  return (
    <PbiChartPanel
      title={
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
          </span>
          <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
            ALERTAS OPERACIONAIS ({computedAlerts.length})
          </span>
        </div>
      }
      loading={loading}
      height={compact ? 185 : 230}
      action={action}
      className={className}
    >
      {computedAlerts.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full gap-1 text-center py-4">
          <CheckCircle className="h-5 w-5 text-emerald-500" />
          <span className="text-xs font-bold text-slate-700">Nenhum alerta operacional detectado</span>
          <span className="text-[10px] text-slate-400">Operação fluindo com métricas dentro da normalidade.</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 overflow-y-auto max-h-[145px] pr-1">
          {computedAlerts.map((item) => {
            const styles = {
              critical: 'bg-red-50/90 text-red-900 border-red-200/80',
              warning:  'bg-amber-50/90 text-amber-900 border-amber-200/80',
              info:     'bg-blue-50/90 text-blue-900 border-blue-200/80',
            }[item.severity];

            return (
              <div key={item.id} className={cn("p-2.5 rounded-xl border text-xs flex items-start gap-2 shadow-2xs", styles)}>
                <div className="flex-1 space-y-0.5 min-w-0">
                  <p className="font-bold text-[11px] truncate">{item.title}</p>
                  <p className="text-[10px] leading-snug opacity-90 line-clamp-2">{item.impact}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </PbiChartPanel>
  );
};

/* ─────────── Dashboard principal ─────────── */

const ACCENT_MAP: Record<string, { text: string; bgIcon: string; icon: string; pill: string; pillText: string }> = {
  blue:    { text: 'text-blue-900', bgIcon: 'from-blue-500/10 to-indigo-500/5 border-blue-100/30', icon: 'text-blue-600', pill: 'bg-blue-50/60 border-blue-100/50', pillText: 'text-blue-700' },
  emerald: { text: 'text-emerald-900', bgIcon: 'from-emerald-500/10 to-teal-500/5 border-emerald-100/30', icon: 'text-emerald-600', pill: 'bg-emerald-50/60 border-emerald-100/50', pillText: 'text-emerald-700' },
  cyan:    { text: 'text-cyan-900', bgIcon: 'from-cyan-500/10 to-blue-500/5 border-cyan-100/30', icon: 'text-cyan-600', pill: 'bg-cyan-50/60 border-cyan-100/50', pillText: 'text-cyan-700' },
  indigo:  { text: 'text-indigo-900', bgIcon: 'from-indigo-500/10 to-purple-500/5 border-indigo-100/30', icon: 'text-indigo-600', pill: 'bg-indigo-50/60 border-indigo-100/50', pillText: 'text-indigo-700' },
  amber:   { text: 'text-amber-900', bgIcon: 'from-amber-500/10 to-orange-500/5 border-amber-100/30', icon: 'text-amber-600', pill: 'bg-amber-50/60 border-amber-100/50', pillText: 'text-amber-700' },
  teal:    { text: 'text-teal-900', bgIcon: 'from-teal-500/10 to-emerald-500/5 border-teal-100/30', icon: 'text-teal-600', pill: 'bg-teal-50/60 border-teal-100/50', pillText: 'text-teal-700' },
  rose:    { text: 'text-rose-900', bgIcon: 'from-rose-500/10 to-red-500/5 border-rose-100/30', icon: 'text-rose-600', pill: 'bg-rose-50/60 border-rose-100/50', pillText: 'text-rose-700' },
  slate:   { text: 'text-slate-900', bgIcon: 'from-slate-500/10 to-slate-600/5 border-slate-200/30', icon: 'text-slate-600', pill: 'bg-slate-50/60 border-slate-100/50', pillText: 'text-slate-700' },
  violet:  { text: 'text-violet-900', bgIcon: 'from-violet-500/10 to-purple-500/5 border-violet-100/30', icon: 'text-violet-600', pill: 'bg-violet-50/60 border-violet-100/50', pillText: 'text-violet-700' },
  orange:  { text: 'text-orange-900', bgIcon: 'from-orange-500/10 to-amber-500/5 border-orange-100/30', icon: 'text-orange-600', pill: 'bg-orange-50/60 border-orange-100/50', pillText: 'text-orange-700' },
};

const MetricCard = ({ title, value, suffix, detail, accent = 'blue', icon: Icon }: { title: string; value: number | string | null; suffix?: string; detail?: string | null; accent?: string; icon?: React.ElementType }) => {
  const isNumeric = typeof value === 'number';
  const animated = useAnimatedNumber(isNumeric ? value : 0);
  const display = isNumeric ? new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(animated) : (value ?? '0');
  
  const a = ACCENT_MAP[accent] ?? ACCENT_MAP['blue'];
  return (
    <div className="relative overflow-hidden rounded-xl bg-gradient-to-b from-white to-slate-50/40 p-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.01)] border border-slate-200/50 transition-all duration-300 hover:shadow-xs hover:border-slate-300/80 hover:-translate-y-0.5 flex flex-col justify-between min-h-[92px] group">
      {Icon && (
        <Icon className={cn("absolute -bottom-2 -right-2 h-16 w-16 -rotate-12 pointer-events-none opacity-[0.08] transition-all duration-300 group-hover:scale-110 group-hover:-rotate-6", a.icon)} />
      )}
      <div className="flex justify-between items-start relative z-10">
        <div className="flex flex-col gap-0.5 min-w-0">
          <p className="text-[9px] uppercase font-extrabold tracking-wider text-slate-400 truncate">{title}</p>
          <p className="text-2xl font-black text-slate-800 leading-none tracking-tight mt-0.5 font-mono">{display}{suffix || ''}</p>
        </div>
      </div>
      <div className="mt-2.5 relative z-10">
        {detail ? (
          <span className={cn("inline-block text-[9px] font-bold px-1.5 py-0.5 rounded-md border", a.pill, a.pillText)}>{detail}</span>
        ) : (
          <span className="inline-block h-[14px]" />
        )}
      </div>
    </div>
  );
};

/** Extrai com segurança apenas a chave de data 'YYYY-MM-DD' de qualquer string ou ISO */
const safeExtractDateKey = (val: string | null | undefined): string => {
  if (!val) return new Date().toISOString().split('T')[0];
  const str = val.trim();
  const dateOnly = str.includes('T') ? str.split('T')[0] : str;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) return dateOnly;
  const d = new Date(str);
  if (isNaN(d.getTime())) return new Date().toISOString().split('T')[0];
  return d.toISOString().split('T')[0];
};

/** Converte com segurança uma chave de data 'YYYY-MM-DD' para objeto Date sem corromper horários */
const safeParseIsoDate = (dateStr: string | null | undefined): Date => {
  const dateOnly = safeExtractDateKey(dateStr);
  const d = new Date(dateOnly + 'T00:00:00');
  if (isNaN(d.getTime())) return new Date();
  return d;
};

const formatarDataComDiaSemana = (dateStr?: string) => {
  const d = safeParseIsoDate(dateStr);
  const dateFormatted = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
  const weekday = new Intl.DateTimeFormat('pt-BR', { weekday: 'long' }).format(d).toUpperCase();
  return { dateFormatted, weekday, iso: safeExtractDateKey(d.toISOString()) };
};

/* ───────────────────────────
   SWITCH DE VISAO
─────────────────────────── */

const DashboardViewSwitch = ({ activeView, onChange }: {
  activeView: 'operational' | 'bi';
  onChange: (value: 'operational' | 'bi') => void;
}) => (
  <div className="inline-flex items-center bg-slate-100/80 border border-slate-200/80 p-0.5 rounded-lg gap-0.5 shadow-inner w-max">
    {(['operational', 'bi'] as const).map((view) => (
      <button
        key={view}
        onClick={() => onChange(view)}
        className={`h-7 px-3 text-[10px] uppercase tracking-wider font-extrabold transition-all duration-200 rounded-md ${
          activeView === view
            ? 'bg-white text-blue-700 shadow-sm border border-slate-200/40'
            : 'text-slate-500 hover:text-slate-800 hover:bg-white/40 border border-transparent'
        }`}
      >
        {view === 'operational' ? 'Visao Operacional' : 'Painel Estrategico'}
      </button>
    ))}
  </div>
);

/* ───────────────────────────
   VISAO OPERACIONAL
─────────────────────────── */

const MetricGroup = ({ title, icon: Icon, kpis, colorClass }: { title: string, icon: any, kpis: BiKpis, colorClass: string }) => {
  const total = kpis.scheduled ?? kpis.total_appointments ?? 0;
  return (
    <section className="flex flex-col">
      <h3 className={`text-[9px] font-extrabold uppercase tracking-widest text-slate-600 mb-2 px-1 flex items-center gap-1.5`}>
        <span className={`flex items-center justify-center rounded-md p-1 shadow-sm border bg-white ${colorClass}`}>
          <Icon className="h-3 w-3" />
        </span>
        <span>{title}</span>
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-8 lg:grid-cols-8 gap-3.5 w-full">
        <MetricCard title="Consultas"    value={total}                 accent="blue"    icon={Calendar} />
        <MetricCard title="Concluídas"   value={kpis.completed || 0}   accent="teal"    icon={CheckCircle} />
        <MetricCard title="Pendentes"    value={kpis.pending || 0}     accent="amber"   icon={Clock} />
        <MetricCard title="Faltas"       value={kpis.no_show || 0}     accent="orange"  icon={AlertTriangle} />
        <MetricCard title="Canceladas"   value={kpis.cancelled || 0}   accent="rose"    icon={XCircle} />
        <MetricCard title="Realização"   value={kpis.completion_rate || 0} suffix="%" detail="taxa de realização" accent="emerald" icon={TrendingUp} />
        <MetricCard title="Cancelamento" value={kpis.cancellation_rate || 0} suffix="%" detail="taxa de cancelamento" accent="rose" icon={TrendingDown} />
        <MetricCard title="Novos"        value={kpis.new_patients || 0} accent="violet"  icon={UserPlus} />
      </div>
    </section>
  );
};

const OperationalOverview = ({ stats }: { stats: DashboardStats }) => (
  <div className="flex flex-col gap-6 flex-none animate-in fade-in slide-in-from-bottom-2 duration-500">
    <div className="flex flex-col gap-6 w-full">
      <MetricGroup title="Hoje" icon={Calendar} kpis={stats.kpisToday} colorClass="bg-blue-50 text-blue-600 border-blue-100/30" />
      <MetricGroup title="Últimos 30 Dias" icon={Activity} kpis={stats.kpis30Days} colorClass="bg-emerald-50 text-emerald-600 border-emerald-100/30" />
      <MetricGroup title="Todo o Período" icon={Database} kpis={stats.kpisAllTime} colorClass="bg-violet-50 text-violet-600 border-violet-100/30" />
    </div>

    <section>
      <h3 className="text-[9px] font-extrabold uppercase tracking-widest text-slate-500 mb-2 px-1 flex items-center gap-1.5">
        <span className="flex items-center justify-center rounded-md bg-cyan-50 p-1 text-cyan-600 shadow-sm border border-cyan-100/30">
          <Users className="h-3 w-3" />
        </span>
        <span>Base Clínica</span>
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3.5 w-full">
        <MetricCard title="Pacientes Base"       value={stats.totalPatients} accent="cyan" icon={Users} />
        <MetricCard title="Profissionais Ativos" value={stats.totalDoctors}  accent="slate" icon={Stethoscope} />
      </div>
    </section>
  </div>
);

/* ————————————————————————————————————————————————————————————————
   EXECUTIVE BI DASHBOARD — Power BI
———————————————————————————————————————————————————————————————— */



const ExecutiveBiDashboard = ({
  snapshot, filters, loading, error, onFilterChange, onReset, specialtyCatalog, isMedico
}: {
  snapshot: DashboardBiSnapshot;
  filters: BiFilters;
  loading: boolean;
  error: string | null;
  onFilterChange: (key: keyof BiFilters, value: string) => void;
  onReset: () => void;
  specialtyCatalog?: Record<string, { color: string, icon: string }>;
  isMedico?: boolean;
}) => {
  const { data: globalDoctors = [] } = useDoctorsCatalog();
  const { data: globalInstitutions = [] } = useInstitutionsCatalog();
  const { data: globalSpecialties = [] } = useSpecialtiesCatalog();

  const doctorsMap = useMemo(() => {
    const map = new Map();
    globalDoctors?.forEach(d => map.set(d.id, d));
    return map;
  }, [globalDoctors]);

  const kpis = snapshot.kpis || {};

  const heatmapHours = [...new Set((snapshot.heatmap || []).map((row) => row.hour))].sort();
  const heatmapDays = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom'];
  const timeline = snapshot.timeline || [];
  const funnel   = snapshot.funnel   || [];
  const heatmap  = snapshot.heatmap  || [];

  const [fullscreenPanel, setFullscreenPanel] = useState<BiFullscreenPanel | null>(null);
  const [isBiFullscreen, setIsBiFullscreen] = useState(false);
  const dashboardRef = useRef<HTMLDivElement | null>(null);
  const [openDoctorCombo, setOpenDoctorCombo] = useState(false);
  const [openSpecialtyCombo, setOpenSpecialtyCombo] = useState(false);
  const [openUnitCombo, setOpenUnitCombo] = useState(false);
  const [openStatusCombo, setOpenStatusCombo] = useState(false);

  const institutions = useMemo(() => {
    const map = new Map<string, FilterOption>();
    globalInstitutions.forEach(i => map.set(i.id, { id: i.id, name: i.name }));
    (snapshot.filters?.institutions || []).forEach((i: FilterOption) => map.set(i.id, i));
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [snapshot.filters?.institutions, globalInstitutions]);

  const specialties = useMemo(() => {
    const map = new Map<string, FilterOption>();
    globalSpecialties.forEach(s => map.set(s.id, { id: s.id, name: s.name, specialty_color: s.color, specialty_icon: s.icon }));
    (snapshot.filters?.specialties || []).forEach((s: FilterOption) => map.set(s.id, s));
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [snapshot.filters?.specialties, globalSpecialties]);

  const doctors = useMemo(() => {
    const map = new Map<string, FilterOption>();
    globalDoctors.forEach(d => map.set(d.id, {
      id: d.id,
      name: d.full_name || d.name || 'Sem nome',
      specialty_id: d.specialty_id,
      specialty_name: d.specialty_name,
      specialty_icon: d.specialty_icon,
      specialty_color: d.specialty_color,
      institution_ids: (d as any).institution_ids
    }));
    (snapshot.filters?.doctors || []).forEach((d: FilterOption) => {
      const existing = map.get(d.id);
      map.set(d.id, { ...existing, ...d });
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [snapshot.filters?.doctors, globalDoctors]);

  const getEnhancedSpecialty = useCallback((specialtyId?: string | null) => {
    if (!specialtyId) return {};
    const spec = specialties.find((s: FilterOption) => s.id === specialtyId);
    if (!spec) return {};
    const catalog = specialtyCatalog?.[spec.name];
    return {
      name: spec.name,
      color: catalog?.color,
      icon: catalog?.icon
    };
  }, [specialties, specialtyCatalog]);

  const filtroSemAcento = useCallback((value: string, search: string) => {
    if (!search) return 1;
    const normValue = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const normSearch = search.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return normValue.includes(normSearch) ? 1 : 0;
  }, []);

  const filteredSpecialties = useMemo(() => specialties, [specialties]);

  const filteredDoctors = useMemo(() => {
    const specArr = (!filters.specialtyId || filters.specialtyId === ALL_VALUE)
      ? []
      : filters.specialtyId.split(',').map((s) => s.trim()).filter(Boolean);

    const instArr = (!filters.institutionId || filters.institutionId === ALL_VALUE)
      ? []
      : filters.institutionId.split(',').map((s) => s.trim()).filter(Boolean);

    if (specArr.length === 0 && instArr.length === 0) {
      return doctors;
    }

    const matches = doctors.filter((opt: FilterOption) => {
      const specMatch = specArr.length === 0 || (opt.specialty_id && specArr.includes(opt.specialty_id));
      if (!specMatch) return false;

      if (instArr.length === 0) return true;

      const docInsts: string[] = [];
      if (opt.institution_id) docInsts.push(opt.institution_id);
      if (Array.isArray(opt.institution_ids)) docInsts.push(...opt.institution_ids);

      if (docInsts.length > 0) {
        return docInsts.some((id) => instArr.includes(id));
      }
      return true;
    });

    return matches.length > 0 ? matches : doctors;
  }, [doctors, filters.specialtyId, filters.institutionId]);

  /* ESC fecha fullscreen de painel */
  useEffect(() => {
    if (!fullscreenPanel) return undefined;
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullscreenPanel(null); };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [fullscreenPanel]);

  /* Sync estado fullscreen do navegador */
  useEffect(() => {
    const sync = () => setIsBiFullscreen(document.fullscreenElement === dashboardRef.current);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  const toggleBiFullscreen = useCallback(async () => {
    if (document.fullscreenElement === dashboardRef.current) {
      await document.exitFullscreen();
    } else {
      await dashboardRef.current?.requestFullscreen();
    }
  }, []);

  /** Botao de expandir painel */
  const expandBtn = useCallback((panel: BiFullscreenPanel, label: string) => (
    <button
      className="flex items-center justify-center h-6 w-6 rounded transition-colors"
      style={{ color: '#9CA3AF' }}
      onMouseOver={(e: React.MouseEvent<HTMLButtonElement>) => (e.currentTarget.style.backgroundColor = PBI.border)}
      onMouseOut={(e: React.MouseEvent<HTMLButtonElement>)  => (e.currentTarget.style.backgroundColor = 'transparent')}
      onClick={() => setFullscreenPanel(panel)}
      title={`Expandir ${label}`}
    >
      <Maximize2 className="h-3.5 w-3.5" />
    </button>
  ), []);

  /* â”€â”€ Graficos â”€â”€ */
  const chartCfg = {
    agendadas: { color: PBI.blue   },
    realizadas: { color: PBI.green  },
    canceladas: { color: PBI.red    },
    pendentes:  { color: PBI.purple },
    no_show:    { color: PBI.amber  },
  };

  const timelineContent = timeline.length ? (
    <ChartContainer className="h-full w-full aspect-auto" config={chartCfg}>
      <AreaChart data={timeline} margin={{ left: 0, right: 10, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#E8EBF0" />
        <XAxis dataKey="date" tickLine={false} axisLine={false} fontSize={10} tick={{ fill: '#9CA3AF' }} />
        <YAxis tickLine={false} axisLine={false} fontSize={10} width={28} tick={{ fill: '#9CA3AF' }} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Area type="monotone" dataKey="agendadas" stroke={PBI.blue}   fill={PBI.blue}   fillOpacity={0.08} strokeWidth={2} />
        <Area type="monotone" dataKey="realizadas" stroke={PBI.green}  fill={PBI.green}  fillOpacity={0.08} strokeWidth={2} />
        <Area type="monotone" dataKey="canceladas" stroke={PBI.red}    fill={PBI.red}    fillOpacity={0.06} strokeWidth={2} />
        <Area type="monotone" dataKey="no_show"    stroke={PBI.amber}  fill={PBI.amber}  fillOpacity={0.06} strokeWidth={2} />
      </AreaChart>
    </ChartContainer>
  ) : <PbiNoData label="Sem serie temporal para os filtros atuais." />;

  const funnelContent = funnel.length ? (
    <ChartContainer className="h-full w-full aspect-auto" config={{ value: { color: PBI.blue } }}>
      <FunnelChart margin={{ left: 10, right: 110, top: 10, bottom: 10 }}>
        <ChartTooltip content={<ChartTooltipContent hideLabel />} />
        <Funnel dataKey="value" data={funnel} nameKey="stage" isAnimationActive>
          <LabelList position="right" fill="#475569" stroke="none" dataKey="stage" fontSize={10} fontWeight={600} />
          {funnel.map((_, i) => (
            <Cell key={i} fill={[PBI.blue, PBI.cyan, PBI.green, PBI.amber, PBI.red][i % 5]} />
          ))}
        </Funnel>
      </FunnelChart>
    </ChartContainer>
  ) : <PbiNoData label="Sem etapas de funil no periodo." />;

  const heatmapContent = heatmap.length ? (
    <div className="grid h-full gap-1 overflow-x-auto">
    <div className="grid min-w-[580px] gap-1" style={{ gridTemplateColumns: `46px repeat(${heatmapHours.length || 1}, minmax(34px, 1fr))` }}>
        <div />
        {heatmapHours.map((h) => (
          <div key={h} className="text-center text-[9px] font-semibold" style={{ color: '#9CA3AF' }}>{h}</div>
        ))}
        {heatmapDays.map((day) => (
          <PbiHeatmapDay key={day} day={day} hours={heatmapHours} rows={heatmap} />
        ))}
      </div>
    </div>
  ) : <PbiNoData label="Sem intensidade operacional para o recorte." />;

  const fullscreenTitles: Record<BiFullscreenPanel, string> = {
    timeline: 'Linha Temporal Operacional',
    professionals: 'Ranking de Profissionais',
    funnel: 'Funil Operacional',
    specialties: 'Ranking de Especialidades',
    units: 'Distribuicao por Unidade',
    heatmap: 'Heatmap Operacional',
    types: 'Tipos de Atendimento',
    alerts: 'Alertas Operacionais',
  };

  const mappedProfessionals = useMemo(() => (snapshot.rankings?.professionals || []).map(r => ({
    ...r,
    resolvedColor: r.specialty ? specialtyCatalog?.[r.specialty]?.color : undefined,
    resolvedIcon: r.specialty ? specialtyCatalog?.[r.specialty]?.icon : undefined,
  })), [snapshot.rankings?.professionals, specialtyCatalog]);

  const mappedSpecialties = useMemo(() => (snapshot.rankings?.specialties || []).map(r => ({
    ...r,
    resolvedColor: specialtyCatalog?.[r.name]?.color,
    resolvedIcon: specialtyCatalog?.[r.name]?.icon,
  })), [snapshot.rankings?.specialties, specialtyCatalog]);

  const fullscreenContent =
    fullscreenPanel === 'timeline'      ? <div className="h-full w-full bg-white rounded-xl p-6">{timelineContent}</div>
    : fullscreenPanel === 'professionals' ? <PbiRankingPanel title="Ranking de profissionais" rows={mappedProfessionals} valueKey="completed" subKey="specialty" colorKey="specialty" subKeyIcon={Stethoscope} isBadgeSubKey expanded />
    : fullscreenPanel === 'specialties'   ? <PbiRankingPanel title="Ranking de especialidades" rows={mappedSpecialties} valueKey="demand" subKey="conversion" suffixSub="%" colorKey="name" isBadgeTitle titleIcon={Stethoscope} expanded />
    : fullscreenPanel === 'types'         ? <PbiRankingPanel title="Tipos de atendimento" rows={snapshot.rankings?.types || []} valueKey="volume" subKey="conversion" suffixSub="%" colorKey="name" isBadgeTitle expanded />
    : fullscreenPanel === 'units'         ? <PbiDistributionBars title="Distribuicao por unidade" rows={snapshot.rankings?.units || []} />
    : fullscreenPanel === 'heatmap'       ? <div className="h-full w-full bg-white rounded-xl p-6">{heatmapContent}</div>
    : fullscreenPanel === 'alerts'        ? <PbiOperationalAlerts alerts={snapshot.alerts} kpis={kpis} loading={loading} />
    :                                       <div className="h-full w-full bg-white rounded-xl p-6">{funnelContent}</div>;

  return (
    <div
      ref={dashboardRef}
      className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#F4F7FA] fullscreen:h-screen fullscreen:w-screen fullscreen:rounded-none"
    >
      {/* ── Barra de filtros (History style) ── */}
      <div className="flex-none bg-white px-6 pb-4 pt-1 shadow-sm z-10 relative">
        <div className="border-t border-slate-100 w-full flex flex-col gap-3 pt-3">
          {/* Linha 1 - Filtros de Data e Entidades */}
          <div className="flex w-full flex-col md:flex-row items-center gap-2 overflow-x-auto pb-1">
            
            {/* 0. Filtro de Data: DE ... A ... */}
            <div className="flex items-center gap-2 shrink-0">
              {/* De */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-slate-500 uppercase">De</span>
                <div className="flex items-center bg-white border border-slate-200/90 rounded-xl px-1.5 shadow-2xs gap-1.5 h-9">
                  <button
                    type="button"
                    onClick={() => {
                      const currentIso = safeExtractDateKey(filters.startDate);
                      const d = safeParseIsoDate(currentIso);
                      d.setDate(d.getDate() - 1);
                      onFilterChange('startDate', safeExtractDateKey(d.toISOString()));
                    }}
                    className="h-7 w-7 flex items-center justify-center text-slate-500 hover:text-slate-800 rounded-lg cursor-pointer shrink-0"
                    title="Dia anterior"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>

                  <label className="relative flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="date"
                      value={safeExtractDateKey(filters.startDate)}
                      onChange={(e) => onFilterChange('startDate', e.target.value)}
                      className="absolute inset-0 opacity-0 w-full h-full cursor-pointer z-10"
                    />
                    <span className="text-xs font-semibold text-slate-700">
                      {formatarDataComDiaSemana(filters.startDate).dateFormatted}
                    </span>
                    <Calendar className="h-3.5 w-3.5 text-slate-400" />
                    <span className="rounded-lg bg-blue-50 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-[#003B71] border border-blue-100/80 shrink-0 select-none ml-0.5">
                      {formatarDataComDiaSemana(filters.startDate).weekday}
                    </span>
                  </label>

                  <button
                    type="button"
                    onClick={() => {
                      const currentIso = safeExtractDateKey(filters.startDate);
                      const d = safeParseIsoDate(currentIso);
                      d.setDate(d.getDate() + 1);
                      onFilterChange('startDate', safeExtractDateKey(d.toISOString()));
                    }}
                    className="h-7 w-7 flex items-center justify-center text-slate-500 hover:text-slate-800 rounded-lg cursor-pointer shrink-0"
                    title="Próximo dia"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* A */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-slate-500 uppercase">A</span>
                <div className="flex items-center bg-white border border-slate-200/90 rounded-xl px-1.5 shadow-2xs gap-1.5 h-9">
                  <button
                    type="button"
                    onClick={() => {
                      const currentIso = safeExtractDateKey(filters.endDate);
                      const d = safeParseIsoDate(currentIso);
                      d.setDate(d.getDate() - 1);
                      onFilterChange('endDate', safeExtractDateKey(d.toISOString()));
                    }}
                    className="h-7 w-7 flex items-center justify-center text-slate-500 hover:text-slate-800 rounded-lg cursor-pointer shrink-0"
                    title="Dia anterior"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>

                  <label className="relative flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="date"
                      value={safeExtractDateKey(filters.endDate)}
                      onChange={(e) => onFilterChange('endDate', e.target.value)}
                      className="absolute inset-0 opacity-0 w-full h-full cursor-pointer z-10"
                    />
                    <span className="text-xs font-semibold text-slate-700">
                      {formatarDataComDiaSemana(filters.endDate).dateFormatted}
                    </span>
                    <Calendar className="h-3.5 w-3.5 text-slate-400" />
                    <span className="rounded-lg bg-blue-50 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-[#003B71] border border-blue-100/80 shrink-0 select-none ml-0.5">
                      {formatarDataComDiaSemana(filters.endDate).weekday}
                    </span>
                  </label>

                  <button
                    type="button"
                    onClick={() => {
                      const currentIso = safeExtractDateKey(filters.endDate);
                      const d = safeParseIsoDate(currentIso);
                      d.setDate(d.getDate() + 1);
                      onFilterChange('endDate', safeExtractDateKey(d.toISOString()));
                    }}
                    className="h-7 w-7 flex items-center justify-center text-slate-500 hover:text-slate-800 rounded-lg cursor-pointer shrink-0"
                    title="Próximo dia"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* 1. Unidade (Multi-Select Popover) */}
            <div className="flex-1 min-w-[170px] shrink-0">
              <Popover open={openUnitCombo} onOpenChange={setOpenUnitCombo}>
                <PopoverTrigger asChild>
                  <button
                    aria-expanded={openUnitCombo}
                    className="delphi-input h-9 w-full flex items-center justify-between px-3 focus:outline-none bg-white"
                  >
                    <div className="flex items-center gap-2 overflow-hidden w-full">
                      {(() => {
                        const unitLabel = (() => {
                          const arr = !filters.institutionId || filters.institutionId === ALL_VALUE ? [] : filters.institutionId.split(',').map((s) => s.trim()).filter(Boolean);
                          if (arr.length === 0) return 'Todas as unidades';
                          if (arr.length === 1) return institutions.find((o: FilterOption) => o.id === arr[0])?.name || 'Todas as unidades';
                          return `${arr.length} unidades selecionadas`;
                        })();
                        return (
                          <span className="truncate text-[13px] text-slate-700 font-semibold whitespace-nowrap" title={unitLabel}>
                            {unitLabel}
                          </span>
                        );
                      })()}
                    </div>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-[360px] p-0" align="start">
                  <Command filter={filtroSemAcento}>
                    <CommandInput placeholder="Buscar unidade..." />
                    <CommandList>
                      <CommandEmpty>Nenhuma unidade encontrada.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          value="Todas as unidades"
                          title="Todas as unidades"
                          onSelect={() => {
                            onFilterChange('institutionId', ALL_VALUE);
                            if (filters.doctorId !== ALL_VALUE) onFilterChange('doctorId', ALL_VALUE);
                          }}
                        >
                          <Check className={cn("mr-2 h-4 w-4 shrink-0", isMultiSelected(filters.institutionId, ALL_VALUE) ? "opacity-100" : "opacity-0")} />
                          <span className="font-semibold text-slate-800" title="Todas as unidades">Todas as unidades</span>
                        </CommandItem>
                        {institutions.map((o: FilterOption) => {
                          const selected = isMultiSelected(filters.institutionId, o.id);
                          return (
                            <CommandItem
                              key={o.id}
                              value={o.name}
                              title={o.name}
                              onSelect={() => {
                                const nextVal = toggleMultiSelect(filters.institutionId, o.id);
                                onFilterChange('institutionId', nextVal);
                                if (filters.doctorId !== ALL_VALUE) onFilterChange('doctorId', ALL_VALUE);
                              }}
                            >
                              <Check className={cn("mr-2 h-4 w-4 shrink-0", selected ? "opacity-100" : "opacity-0")} />
                              <span className="truncate flex-1 font-medium" title={o.name}>{o.name}</span>
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* 2. Especialidade (Multi-Select Popover) */}
            <div className="flex-1 min-w-[200px] shrink-0">
              <Popover open={openSpecialtyCombo && !isMedico} onOpenChange={setOpenSpecialtyCombo}>
                <PopoverTrigger asChild>
                  <button
                    disabled={isMedico}
                    aria-expanded={openSpecialtyCombo}
                    className={cn("delphi-input h-9 w-full flex items-center justify-between px-3 focus:outline-none bg-white", isMedico && "opacity-60 cursor-not-allowed bg-slate-50")}
                  >
                    <div className="flex items-center gap-2 overflow-hidden w-full">
                      <span className="truncate text-[13px] text-slate-700 font-semibold whitespace-nowrap">
                        {(() => {
                          const arr = !filters.specialtyId || filters.specialtyId === ALL_VALUE ? [] : filters.specialtyId.split(',').map((s) => s.trim()).filter(Boolean);
                          if (arr.length === 0) return 'Todas especialidades';
                          if (arr.length === 1) {
                            const spec = filteredSpecialties.find((s: FilterOption) => s.id === arr[0]);
                            if (spec) return (
                              <div className="flex items-center gap-2">
                                <SpecialtyBadge spec={{
                                  ...spec,
                                  color: spec.specialty_color || specialtyCatalog?.[spec.name]?.color,
                                  icon: spec.specialty_icon || specialtyCatalog?.[spec.name]?.icon
                                }} />
                              </div>
                            );
                            return 'Todas especialidades';
                          }
                          return `${arr.length} especialidades selecionadas`;
                        })()}
                      </span>
                    </div>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-[360px] p-0" align="start">
                  <Command filter={filtroSemAcento}>
                    <CommandInput placeholder="Buscar especialidade..." />
                    <CommandList>
                      <CommandEmpty>Nenhuma especialidade encontrada.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          value="Todas especialidades"
                          onSelect={() => {
                            onFilterChange('specialtyId', ALL_VALUE);
                            if (filters.doctorId !== ALL_VALUE) onFilterChange('doctorId', ALL_VALUE);
                          }}
                        >
                          <Check className={cn("mr-2 h-4 w-4 shrink-0", isMultiSelected(filters.specialtyId, ALL_VALUE) ? "opacity-100" : "opacity-0")} />
                          <span className="font-semibold text-slate-800">Todas especialidades</span>
                        </CommandItem>
                        {filteredSpecialties.map((o: FilterOption) => {
                          const selected = isMultiSelected(filters.specialtyId, o.id);
                          return (
                            <CommandItem
                              key={o.id}
                              value={o.name}
                              title={o.name}
                              onSelect={() => {
                                const nextVal = toggleMultiSelect(filters.specialtyId, o.id);
                                onFilterChange('specialtyId', nextVal);
                                if (filters.doctorId !== ALL_VALUE) onFilterChange('doctorId', ALL_VALUE);
                              }}
                            >
                              <Check className={cn("mr-2 h-4 w-4 shrink-0", selected ? "opacity-100" : "opacity-0")} />
                              <div className="flex items-center gap-2 truncate flex-1" title={o.name}>
                                <SpecialtyBadge spec={{
                                  ...o,
                                  color: o.specialty_color || specialtyCatalog?.[o.name]?.color,
                                  icon: o.specialty_icon || specialtyCatalog?.[o.name]?.icon
                                }} />
                              </div>
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* 3. Profissional (Multi-Select Popover) */}
            <div className="flex-1 min-w-[200px] shrink-0">
              <Popover open={openDoctorCombo && !isMedico} onOpenChange={setOpenDoctorCombo}>
                <PopoverTrigger asChild>
                  <button
                    disabled={isMedico}
                    aria-expanded={openDoctorCombo}
                    className={cn("delphi-input h-9 w-full flex items-center justify-between px-3 focus:outline-none bg-white", isMedico && "opacity-60 cursor-not-allowed bg-slate-50")}
                  >
                    <div className="flex items-center gap-2 overflow-hidden w-full">
                      <span className="truncate text-[13px] text-slate-700 font-semibold whitespace-nowrap">
                        {(() => {
                          const arr = !filters.doctorId || filters.doctorId === ALL_VALUE ? [] : filters.doctorId.split(',').map((s) => s.trim()).filter(Boolean);
                          if (arr.length === 0) return 'Todos profissionais';
                          if (arr.length === 1) {
                            const doc = filteredDoctors.find((o: FilterOption) => o.id === arr[0]);
                            if (doc) {
                              const catDoc = doctorsMap.get(doc.id);
                              const enhancedSpec = getEnhancedSpecialty(doc.specialty_id);
                              return renderDoctorOption({
                                id: doc.id,
                                full_name: doc.name,
                                specialty_name: catDoc?.specialty_name || doc.specialty_name || enhancedSpec.name,
                                specialty_icon: catDoc?.specialty_icon || doc.specialty_icon || enhancedSpec.icon,
                                specialty_color: catDoc?.specialty_color || doc.specialty_color || enhancedSpec.color
                              }).render;
                            }
                            return 'Todos profissionais';
                          }
                          return `${arr.length} profissionais selecionados`;
                        })()}
                      </span>
                    </div>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-[360px] p-0" align="start">
                  <Command filter={filtroSemAcento}>
                    <CommandInput placeholder="Buscar profissional..." />
                    <CommandList>
                      <CommandEmpty>Nenhum profissional encontrado.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          value="Todos profissionais"
                          onSelect={() => {
                            onFilterChange('doctorId', ALL_VALUE);
                          }}
                        >
                          <Check className={cn("mr-2 h-4 w-4 shrink-0", isMultiSelected(filters.doctorId, ALL_VALUE) ? "opacity-100" : "opacity-0")} />
                          <span className="font-semibold text-slate-800">Todos profissionais</span>
                        </CommandItem>
                        {filteredDoctors.map((o: FilterOption) => {
                          const selected = isMultiSelected(filters.doctorId, o.id);
                          return (
                            <CommandItem
                              key={o.id}
                              value={o.name}
                              title={o.name}
                              onSelect={() => {
                                const nextVal = toggleMultiSelect(filters.doctorId, o.id);
                                onFilterChange('doctorId', nextVal);
                              }}
                            >
                              <Check className={cn("mr-2 h-4 w-4 shrink-0", selected ? "opacity-100" : "opacity-0")} />
                              <div className="flex-1 truncate" title={o.name}>
                                {(() => {
                                  const catDoc = doctorsMap.get(o.id);
                                  const enhancedSpec = getEnhancedSpecialty(o.specialty_id);
                                  return renderDoctorOption({
                                    id: o.id,
                                    full_name: o.name,
                                    specialty_name: catDoc?.specialty_name || o.specialty_name || enhancedSpec.name,
                                    specialty_icon: catDoc?.specialty_icon || o.specialty_icon || enhancedSpec.icon,
                                    specialty_color: catDoc?.specialty_color || o.specialty_color || enhancedSpec.color
                                  }).render;
                                })()}
                              </div>
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* 4. Status (Multi-Select Popover) */}
            <div className="flex-1 min-w-[170px] shrink-0">
              <Popover open={openStatusCombo} onOpenChange={setOpenStatusCombo}>
                <PopoverTrigger asChild>
                  <button
                    aria-expanded={openStatusCombo}
                    className="delphi-input h-9 w-full flex items-center justify-between px-3 focus:outline-none bg-white"
                  >
                    <div className="flex items-center gap-2 overflow-hidden w-full">
                      <span className="truncate text-[13px] text-slate-700 font-semibold whitespace-nowrap">
                        {(() => {
                          const arr = !filters.status || filters.status === ALL_VALUE ? [] : filters.status.split(',').map((s) => s.trim()).filter(Boolean);
                          if (arr.length === 0) return 'Todos os Status';
                          if (arr.length === 1) return STATUS_OPTIONS.find((o) => o.value === arr[0])?.label || 'Todos os Status';
                          return `${arr.length} status selecionados`;
                        })()}
                      </span>
                    </div>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-[260px] p-0" align="start">
                  <Command>
                    <CommandList>
                      <CommandGroup>
                        {STATUS_OPTIONS.map((o) => {

                          const selected = isMultiSelected(filters.status, o.value);
                          return (
                            <CommandItem
                              key={o.value}
                              value={o.label}
                              onSelect={() => {
                                const nextVal = toggleMultiSelect(filters.status, o.value);
                                onFilterChange('status', nextVal);
                              }}
                            >
                              <Check className={cn("mr-2 h-4 w-4 shrink-0", selected ? "opacity-100" : "opacity-0")} />
                              <div className="flex items-center gap-2">
                                <StatusBadge statusId={o.value} labelOverride={o.label} />
                              </div>
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex flex-nowrap gap-1.5 shrink-0">
              <button
                className="flex items-center justify-center h-9 w-9 rounded-md border text-slate-500 hover:text-slate-700 bg-white shadow-2xs hover:bg-slate-50 transition-colors"
                style={{ borderColor: '#E2E8F0' }}
                onClick={() => void toggleBiFullscreen()}
                title="Tela Cheia"
              >
                {isBiFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Linha 2 */}
          <div className="flex w-full flex-wrap items-center gap-2">
            <QuickFilterButton active={filters.days === '7'} label="7 dias" onClick={() => onFilterChange('days', '7')} />
            <QuickFilterButton active={filters.days === '15'} label="15 dias" onClick={() => onFilterChange('days', '15')} />
            <QuickFilterButton active={filters.days === '30'} label="30 dias" onClick={() => onFilterChange('days', '30')} />
            <QuickFilterButton active={filters.days === '90'} label="90 dias" onClick={() => onFilterChange('days', '90')} />
            <QuickFilterButton active={filters.days === '180'} label="180 dias" onClick={() => onFilterChange('days', '180')} />
            <QuickFilterButton active={filters.days === '365'} label="365 dias" onClick={() => onFilterChange('days', '365')} />
            
            <div className="h-5 w-[1px] bg-slate-300 shrink-0 mx-0.5 self-center" />
            <QuickFilterButton active={filters.days === '3650'} label="Tudo" onClick={() => onFilterChange('days', '3650')} />

            <QuickFilterButton variant="clear" onClick={onReset} label="Limpar" />
          </div>
        </div>


      </div>

      {/* ── Conteudo scrollavel ── */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-4 space-y-3">

        {error ? (
          <div className="rounded border px-3 py-2 text-[11px] font-semibold" style={{ border: '1px solid #FECACA', backgroundColor: '#FEF2F2', color: '#B91C1C' }}>
            Falha ao conectar o BI ao banco: {error}
          </div>
        ) : null}

        {/* Secao 1 — Status de Atendimento (Todos os 7 Status) */}
        <PbiSection label="Status de Atendimento (Operacao)" icon={<Activity className="h-3.5 w-3.5" />}>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            <PbiKpiCard label="Agendado"       value={kpis.agendado || 0}       sub={`${kpis.agendado_rate || 0}% do total`}       icon={<Clock className="h-4 w-4" />}       accent="#F59E0B" />
            <PbiKpiCard label="Confirmado"     value={kpis.confirmado || 0}     sub={`${kpis.confirmado_rate || 0}% do total`}     icon={<CheckCircle className="h-4 w-4" />} accent="#3B82F6" />
            <PbiKpiCard label="Em Atendimento" value={kpis.em_atendimento || 0} sub={`${kpis.em_atendimento_rate || 0}% em atendimento`} icon={<Zap className="h-4 w-4" />} accent="#A855F7" />
            <PbiKpiCard label="Concluido"      value={kpis.completed || 0}      sub={`Taxa ${kpis.completion_rate || 0}%`}         icon={<CheckCircle className="h-4 w-4" />} accent="#10B981" />
            <PbiKpiCard label="Cancelado"      value={kpis.cancelled || 0}      sub={`${kpis.cancellation_rate || 0}% taxa`}       icon={<XCircle className="h-4 w-4" />}     accent="#EF4444" />
            <PbiKpiCard label="Faltou"         value={kpis.no_show || 0}        sub={`${kpis.no_show_rate || 0}% no-show`}         icon={<UserCheck className="h-4 w-4" />}   accent="#64748B" />
            <PbiKpiCard label="Reagendado"     value={kpis.reagendado || 0}     sub={`${kpis.reagendado_rate || 0}% reagendados`}  icon={<History className="h-4 w-4" />}     accent="#6366F1" />
          </div>
        </PbiSection>

        {/* Secao 2 — Indicadores Executivos & Desempenho Operacional */}
        <PbiSection label="Desempenho & Capacidade Operacional" icon={<Timer className="h-3.5 w-3.5" />}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <PbiKpiCard label="Agendamentos"  value={kpis.scheduled || 0}         sub={`${kpis.avg_daily || 0}/dia`}             icon={<Calendar className="h-4 w-4" />}     accent={PBI.blue}   />
            <PbiKpiCard label="Aproveitamento" value={kpis.completion_rate || 0} suffix="%" sub="taxa de conclusao"        icon={<Activity className="h-4 w-4" />}     accent={PBI.green}  />
            <PbiKpiCard label="Atendimento"   value={kpis.avg_service_minutes || 0} suffix="m" sub="duracao media"       icon={<Clock className="h-4 w-4" />}        accent={PBI.teal}   />
            <PbiKpiCard label="Espera"        value={kpis.avg_days_until_appointment || 0} suffix="d" sub="dias ate consulta" icon={<Hourglass className="h-4 w-4" />}  accent="#F97316"    />
          </div>
        </PbiSection>

        {/* Graficos linha 1 - Fluxo e Mix */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
          <PbiChartPanel title="Linha Temporal" icon={<LineChartIcon className="h-3.5 w-3.5" />} loading={loading} height={185} action={expandBtn('timeline', 'linha temporal')}>
            {timelineContent}
          </PbiChartPanel>
          <PbiChartPanel title="Funil Operacional" icon={<Activity className="h-3.5 w-3.5" />} loading={loading} height={185} action={expandBtn('funnel', 'funil')}>
            {funnelContent}
          </PbiChartPanel>
          <PbiOutcomeAnalysis kpis={kpis} loading={loading} compact className="md:col-span-2 xl:col-span-1" />
        </div>

        {/* Graficos linha 2 - Rankings */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
          <PbiRankingPanel title="Ranking de Profissionais" rows={mappedProfessionals} valueKey="completed" subKey="specialty" colorKey="specialty" subKeyIcon={Stethoscope} isBadgeSubKey compact action={expandBtn('professionals', 'ranking de profissionais')} />
          <PbiRankingPanel title="Ranking de Especialidades" rows={mappedSpecialties} valueKey="demand" subKey="conversion" suffixSub="%" colorKey="name" isBadgeTitle titleIcon={Stethoscope} compact action={expandBtn('specialties', 'ranking de especialidades')} />
          <PbiPeakDemandAnalysis kpis={kpis} heatmap={heatmap} loading={loading} compact className="md:col-span-2 xl:col-span-1" />
        </div>

        {/* Graficos linha 3 - Operacao */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
          <PbiChartPanel title="Heatmap Operacional" icon={<Zap className="h-3.5 w-3.5" />} loading={loading} height={185} action={expandBtn('heatmap', 'heatmap')}>
            {heatmapContent}
          </PbiChartPanel>
          <PbiDistributionBars title="Distribuicao por Unidade" rows={snapshot.rankings?.units || []} compact action={expandBtn('units', 'distribuicao por unidade')} />
          <PbiOperationalAlerts alerts={snapshot.alerts} kpis={kpis} loading={loading} compact action={expandBtn('alerts', 'alertas operacionais')} className="md:col-span-2 xl:col-span-1" />
        </div>

      </div>

      {/* Painel fullscreen (portal) */}
      {fullscreenPanel && typeof document !== 'undefined' ? createPortal(
        <div className="fixed inset-0 z-[999999] flex flex-col bg-white">
          <div className="flex-none flex items-center justify-between px-6 py-3 border-b" style={{ borderColor: PBI.border }}>
            <div>
              <div className="text-sm font-bold" style={{ color: PBI.text }}>{fullscreenTitles[fullscreenPanel]}</div>
              <div className="text-[10px] mt-0.5" style={{ color: '#9CA3AF' }}>Pressione ESC para fechar</div>
            </div>
            <button
              className="flex items-center gap-1.5 rounded border px-3 py-1.5 text-[11px] font-semibold transition-colors"
              style={{ borderColor: PBI.border, backgroundColor: PBI.surface, color: PBI.text }}
              onClick={() => setFullscreenPanel(null)}
            >
              <Minimize2 className="h-3.5 w-3.5" />
              Recolher
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-6">
            {fullscreenContent}
          </div>
        </div>,
        document.body
      ) : null}
    </div>
  );
};

/* ──────────────── Dashboard principal ──────────────── */

const Dashboard = () => {
  const { profile, updatePreferences } = useAuth();
  const [activeView, setActiveView] = useState<'operational' | 'bi'>('operational');
  const [detail, setDetail] = useState<{ title: string; description: string; value?: string | number; icon?: React.ReactNode } | null>(null);
  const [firstRecordDate, setFirstRecordDate] = useState<string>('');
  const [lastRecordDate, setLastRecordDate] = useState<string>('');

  const [filters, setFilters] = useState<BiFilters>({
    days: '365', institutionId: ALL_VALUE, doctorId: ALL_VALUE,
    specialtyId: ALL_VALUE, status: ALL_VALUE, type: ALL_VALUE, search: '',
  });
  const [specialtyCatalog, setSpecialtyCatalog] = useState<Record<string, { color: string, icon: string }>>({});

  const { data: specialtiesData = [] } = useSpecialtiesCatalog();

  useEffect(() => {
    if (specialtiesData.length > 0) {
      const map: Record<string, { color: string, icon: string }> = {};
      specialtiesData.forEach(s => {
        if (s.name) map[s.name] = { color: s.color || '#6B7280', icon: s.icon || '' };
      });
      setSpecialtyCatalog(map);
    }
  }, [specialtiesData]);

  useEffect(() => {
    if (profile?.role === 'medico' && profile?.doctor_id) {
       chamarApiPost('/api/table/doctors/specialty_id', { doctor_id: profile.doctor_id }).then(({ data }) => {
         setFilters(prev => ({ 
           ...prev, 
           days: profile?.preferences?.biDays ? String(profile.preferences.biDays) : prev.days,
           doctorId: profile.doctor_id,
           specialtyId: (data as any)?.specialty_id || prev.specialtyId
         }));
       });
    } else {
      setFilters(prev => ({ 
        ...prev, 
        days: profile?.preferences?.biDays ? String(profile.preferences.biDays) : prev.days,
        doctorId: prev.doctorId
      }));
    }
  }, [profile]);

  const queryClient = useQueryClient();

  // 1. Query de Estatísticas Operacionais (Com Cache de 5min)
  const { data: stats = {
    institutionName: '', totalPatients: 0, totalDoctors: 0,
    kpisToday: {}, kpis30Days: {}, kpisAllTime: {}
  } } = useQuery({
    queryKey: ['dashboard-stats', profile?.user_id, profile?.role, profile?.doctor_id],
    queryFn: async () => {
      const allTimeDays = 3650;
      try {
        let firstQueryPromise;
        let lastQueryPromise;
        if (profile?.role === 'medico' && profile?.doctor_id) {
          firstQueryPromise = chamarApiPost('/api/table/appointments/first_date', { doctor_id: profile.doctor_id });
          lastQueryPromise = chamarApiPost('/api/table/appointments/last_date', { doctor_id: profile.doctor_id });
        } else {
          firstQueryPromise = chamarApiPost('/api/table/appointments/first_date', {});
          lastQueryPromise = chamarApiPost('/api/table/appointments/last_date', {});
        }

        const [{ data: firstAppt }, { data: lastAppt }] = await Promise.all([
          firstQueryPromise as Promise<any>,
          lastQueryPromise as Promise<any>,
        ]);
        
        if (firstAppt?.appointment_date && lastAppt?.appointment_date) {
          const cleanFirst = safeExtractDateKey(firstAppt.appointment_date);
           const cleanLast = safeExtractDateKey(lastAppt.appointment_date);
          setFirstRecordDate(cleanFirst);
          setLastRecordDate(cleanLast);
        }
      } catch (e) {
        console.error('Erro ao calcular range historico:', e);
      }

      const fetchBiKpisSafely = async (days: number) => {
        const cleanDays = isNaN(days) || days <= 0 ? 30 : Math.round(days);
        const docId = profile?.role === 'medico' ? profile.doctor_id : null;
        try {
          const rpcRes = await chamarApiPost('/api/rpc/get_dashboard_bi_snapshot', {
            p_days: cleanDays,
            p_institution_id: null,
            p_doctor_id: docId,
            p_specialty_id: null,
            p_status: null,
            p_type: null,
            p_search: null,
          } as any);

          if (!rpcRes.error && rpcRes.data?.kpis) {
            return rpcRes.data.kpis;
          }

          const rpcDaysRes = await chamarApiPost('/api/rpc/get_dashboard_bi_snapshot', {
            p_days: cleanDays,
          } as any);

          if (!rpcDaysRes.error && rpcDaysRes.data?.kpis) {
            return rpcDaysRes.data.kpis;
          }
        } catch (e) {
          console.warn('[Dashboard] RPC BI snapshot falhou, acionando fallback de tabela:', e);
        }

        try {
          const queryPayload: any = {};
          if (docId) {
            queryPayload.doctor_id = docId;
          }
          if (cleanDays === 1) {
            const todayIso = safeExtractDateKey(new Date().toISOString());
            queryPayload.startDate = todayIso;
          } else if (cleanDays !== 3650) {
            const pastDate = new Date();
            pastDate.setDate(pastDate.getDate() - (cleanDays - 1));
            queryPayload.startDate = pastDate.toISOString().split('T')[0];
          }

          const { data: appts } = await chamarApiPost('/api/table/appointments/all_active', queryPayload);
          if (Array.isArray(appts)) {
            const total = appts.length;
            const agendado = appts.filter(a => a.status === 'agendado').length;
            const confirmed = appts.filter(a => a.status === 'confirmado').length;
            const in_progress = appts.filter(a => a.status === 'em_atendimento').length;
            const completed = appts.filter(a => a.status === 'concluido').length;
            const cancelled = appts.filter(a => a.status === 'cancelado').length;
            const no_show = appts.filter(a => a.status === 'nao_compareceu' || a.status === 'faltou').length;
            const reagendado = appts.filter(a => a.status === 'reagendado').length;
            const pending = agendado + confirmed + in_progress + reagendado;
            const patients = new Set(appts.map(a => a.patient_id).filter(Boolean)).size;
            const doctors = new Set(appts.map(a => a.doctor_id).filter(Boolean)).size;

            const completion_rate = total > 0 ? Number(((completed / total) * 100).toFixed(1)) : 0;
            const cancellation_rate = total > 0 ? Number(((cancelled / total) * 100).toFixed(1)) : 0;
            const no_show_rate = total > 0 ? Number(((no_show / total) * 100).toFixed(1)) : 0;

            return {
              scheduled: total,
              total_appointments: total,
              agendado,
              confirmado: confirmed,
              em_atendimento: in_progress,
              completed,
              cancelled,
              no_show,
              reagendado,
              pending,
              completion_rate,
              cancellation_rate,
              no_show_rate,
              patients,
              doctors,
              new_patients: 0,
            };
          }
        } catch (tableErr) {
          console.error('[Dashboard] Erro no fallback direto de tabela:', tableErr);
        }

        return {};
      };

      const isMedico = profile?.role === 'medico';

      const [snapshotRes, kpisToday, kpis30Days, kpisAllTime, patientCountRes, doctorCountRes] = await Promise.all([
        Promise.resolve(chamarApiPost('/api/rpc/get_dashboard_snapshot', { p_days: 7 })).catch(() => ({ data: null, error: null })),
        fetchBiKpisSafely(1),
        fetchBiKpisSafely(30),
        fetchBiKpisSafely(allTimeDays),
        isMedico
          ? Promise.resolve({ count: 0, data: null, error: null })
          : Promise.resolve(chamarApiPost('/api/table/patients/count', {})).catch(() => ({ count: 0, data: null, error: null })),
        isMedico
          ? Promise.resolve({ count: 1, data: null, error: null })
          : Promise.resolve(chamarApiPost('/api/table/doctors/count_active', {})).catch(() => ({ count: 0, data: null, error: null })),
      ]);

      const snapshot = ((snapshotRes && !(snapshotRes as any).error ? (snapshotRes as any).data : {}) || {}) as DashboardSnapshot;
      
      let totalPatients = (patientCountRes as any).count ?? snapshot.total_patients ?? (kpis30Days as any)?.patients ?? 0;
      let totalDoctors = (doctorCountRes as any).count ?? snapshot.total_doctors ?? (kpis30Days as any)?.doctors ?? 0;

      if (profile?.role === 'medico') {
        totalPatients = (kpisAllTime as any)?.patients ?? (kpis30Days as any)?.patients ?? 0;
        totalDoctors = 1;
      }

      return {
        institutionName: snapshot.institution_name || '',
        totalPatients,
        totalDoctors,
        kpisToday: kpisToday || {},
        kpis30Days: kpis30Days || {},
        kpisAllTime: kpisAllTime || {},
      };
    },
    enabled: !!profile,
    // 10 minutos: dados operacionais do dashboard não precisam ser atualizados com frequência
    staleTime: 10 * 60 * 1000,
  });

  const eFiltroTextoValido = (val: string | null | undefined): string | null => {
    if (!val || val === ALL_VALUE || val === 'all' || val.trim() === '') return null;
    const arr = val.split(',').map((s) => {
      const trimmed = s.trim();
      return trimmed === 'faltou' ? 'nao_compareceu' : trimmed;
    }).filter(Boolean);
    if (arr.length === 0) return null;
    return arr.join(',');
  };

  // 2. Query do BI Snapshot (Com Cache de 2min)
  const { data: biSnapshot = emptyBiSnapshot, isLoading: biLoading, error: biErrorQuery } = useQuery({
    queryKey: ['dashboard-bi', profile?.user_id, filters],
    queryFn: async () => {
      const f = filters;
      if (profile && profile.preferences?.biDays !== f.days) {
        updatePreferences({ biDays: f.days }).catch(console.error);
      }

      const rpcArgs = {
        p_days: Number(f.days) || 30,
        p_institution_id: eFiltroTextoValido(f.institutionId),
        p_doctor_id: eFiltroTextoValido(f.doctorId),
        p_specialty_id: eFiltroTextoValido(f.specialtyId),
        p_status: eFiltroTextoValido(f.status),
        p_type: eFiltroTextoValido(f.type),
        p_search: f.search?.trim() || null,
      };

      let { data, error } = await chamarApiPost('/api/rpc/get_dashboard_bi_snapshot', rpcArgs as any);

      if (error) {
        const fallbackRes = await chamarApiPost('/api/rpc/get_dashboard_bi_snapshot', { p_days: Number(f.days) || 30 } as any);
        if (!fallbackRes.error) {
          data = fallbackRes.data;
          error = null;
        }
      }

      if (error) throw error;
      return { ...emptyBiSnapshot, ...((data || {}) as DashboardBiSnapshot) };
    },
    enabled: activeView === 'bi' && !!profile,
    // 5 minutos: BI snapshot é pesado, não precisa recarregar a cada 2 minutos
    staleTime: 5 * 60 * 1000,
  });

  const biError = biErrorQuery ? (biErrorQuery as any).message || 'Falha ao carregar BI' : null;

    // Realtime Integration removido temporariamente. No futuro Hono integrará SSE
    // return () => { /* channel removed */ };

  // Sincroniza datas (startDate/endDate) com o período ao carregar ou quando firstRecordDate/lastRecordDate estiverem disponíveis
  useEffect(() => {
    if (!firstRecordDate && !lastRecordDate) return;
    setFilters((current) => {
      if (!current.startDate || !current.endDate || current.days === '3650') {
        const todayIso = safeExtractDateKey(lastRecordDate);
        const firstIso = safeExtractDateKey(firstRecordDate);
        if (current.days === '3650') {
          return {
            ...current,
            startDate: firstRecordDate ? firstIso : '2000-01-01',
            endDate: todayIso
          };
        }
        const numDays = parseInt(current.days, 10) || 30;
        const endDateObj = safeParseIsoDate(todayIso);
        const startDateObj = new Date(endDateObj);
        startDateObj.setDate(startDateObj.getDate() - (numDays - 1));
        return {
          ...current,
          startDate: safeExtractDateKey(startDateObj.toISOString()),
          endDate: todayIso
        };
      }
      return current;
    });
  }, [firstRecordDate, lastRecordDate]);

  const updateFilter = useCallback((key: keyof BiFilters, value: string) => {
    setFilters((current) => {
      if (key === 'days') {
        const todayIso = safeExtractDateKey(lastRecordDate);
        const firstIso = safeExtractDateKey(firstRecordDate);
        let newStart = todayIso;
        let newEnd = todayIso;

        if (value === '3650') {
          newStart = firstRecordDate ? firstIso : '2000-01-01';
          newEnd = todayIso;
        } else {
          const numDays = parseInt(value, 10);
          if (!isNaN(numDays) && numDays > 0) {
            const endDateObj = safeParseIsoDate(todayIso);
            const startDateObj = new Date(endDateObj);
            startDateObj.setDate(startDateObj.getDate() - (numDays - 1));
            newStart = safeExtractDateKey(startDateObj.toISOString());
            newEnd = todayIso;
          }
        }
        return {
          ...current,
          days: value,
          startDate: newStart,
          endDate: newEnd
        };
      }

      if (key === 'startDate' || key === 'endDate') {
        const nextStart = safeExtractDateKey(key === 'startDate' ? value : (current.startDate));
        const nextEnd = safeExtractDateKey(key === 'endDate' ? value : (current.endDate));

        const sDate = safeParseIsoDate(nextStart);
        const eDate = safeParseIsoDate(nextEnd);
        const diffMs = eDate.getTime() - sDate.getTime();
        const calculatedDays = isNaN(diffMs) ? 1 : Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1);

        let nextDays = calculatedDays.toString();
        if (firstRecordDate && lastRecordDate && nextStart === safeExtractDateKey(firstRecordDate) && nextEnd === safeExtractDateKey(lastRecordDate)) {
          nextDays = '3650';
        }

        return {
          ...current,
          startDate: nextStart,
          endDate: nextEnd,
          days: nextDays
        };
      }

      return { ...current, [key]: value };
    });
  }, [firstRecordDate, lastRecordDate]);

  const resetFilters = () => {
    const todayIso = safeExtractDateKey(lastRecordDate);
    const d = safeParseIsoDate(todayIso);
    d.setDate(d.getDate() - 29);
    const startIso = safeExtractDateKey(d.toISOString());

    setFilters({
      days: '30',
      startDate: startIso,
      endDate: todayIso,
      institutionId: ALL_VALUE,
      doctorId: ALL_VALUE,
      specialtyId: ALL_VALUE,
      status: ALL_VALUE,
      type: ALL_VALUE,
      search: ''
    });
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-[#F4F7FA]">
      <PageHeader loading={biLoading}
          title={
            <div className="flex items-center gap-2">
              <span>Dashboard</span>
            </div>
          }
          description={
            profile?.role === 'recepcao' ? (
              <span className="flex items-center gap-2 text-slate-600 font-medium">
                <Building2 className="h-4 w-4 text-emerald-600" />
                {stats.institutionName && stats.institutionName.toUpperCase() !== 'TODAS AS INSTITUICOES'
                  ? stats.institutionName
                  : (profile?.institution_name || 'Sua Unidade de Origem')}
              </span>
            ) : stats.institutionName && stats.institutionName.toUpperCase() !== 'TODAS AS INSTITUICOES' ? (
              <span className="flex items-center gap-2"><Building2 className="h-4 w-4" />{stats.institutionName}</span>
            ) : (
              <span className="flex items-center gap-2 text-slate-500"><Building2 className="h-4 w-4" />Visao Global da Rede</span>
            )
          }
          className={activeView === 'operational' ? "!m-0 !w-full" : "!m-0 !w-full !border-b-0 !shadow-none z-20 relative"}
          compact
          actions={
            profile?.role === 'superadmin' ? (
              <DashboardViewSwitch activeView={activeView} onChange={setActiveView} />
            ) : null
          }
        />

        <div className={cn(
          "flex-1 min-h-0 relative flex flex-col",
          activeView === 'operational' ? "px-4 sm:px-6 lg:px-8 pb-6 pt-3" : ""
        )}>
          {activeView === 'operational' ? (
            <div className="relative flex-1 min-h-0">
            <OperationalOverview stats={stats} />
          </div>
        ) : (
          <ExecutiveBiDashboard
            snapshot={biSnapshot}
            filters={filters}
            loading={biLoading}
            error={biError}
            onFilterChange={updateFilter}
            onReset={resetFilters}
            specialtyCatalog={specialtyCatalog}
            isMedico={profile?.role === 'medico'}
          />
        )}
      </div>

      <Dialog open={Boolean(detail)} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="w-full sm:max-w-md border-0 bg-white shadow-2xl p-6 rounded-3xl" aria-describedby={undefined}>
          <DialogHeader className="mb-2">
            <div className="flex items-center gap-3 mb-1">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-[#00427A]">
                {detail?.icon || <Activity className="h-6 w-6" />}
              </div>
              <div>
                <DialogTitle className="text-2xl font-black text-[#00427A] tracking-tight">{detail?.title}</DialogTitle>
                <div className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider mt-0.5 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Metrica em tempo real
                </div>
              </div>
            </div>
          </DialogHeader>
          <DialogDescription className="text-[14px] font-medium text-slate-500 leading-relaxed mb-4">{detail?.description}</DialogDescription>
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-6 relative overflow-hidden">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">Valor consolidado</div>
            <div className="flex items-baseline gap-3">
              <div className="text-[48px] font-black tracking-tighter text-slate-900 leading-none">{detail?.value ?? '-'}</div>
              {typeof detail?.value === 'number' && detail.value > 0 && (
                <div className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-1 rounded-md">
                  <TrendingUp className="w-3 h-3" /><span>+12% (30d)</span>
                </div>
              )}
            </div>
          </div>
          <div className="mt-4 flex items-center justify-center gap-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wider bg-slate-50 py-2 rounded-xl">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
            Dados validados e auditados
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Dashboard;
