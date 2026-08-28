"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { addDays, endOfMonth, format, isValid, parse, startOfMonth, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Download, ShieldCheck, Users, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Filter, Search as SearchIcon, AlertTriangle, Eye, EyeOff, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { getErrorMessage } from '@/lib/errors';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { QuickFilterButton } from '@/components/ui/quick-filter-button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MultiSelect } from '@/components/ui/multi-select';
import { renderDoctorOption, renderSpecialtyOption, renderStatusOption } from '@/components/ui/combobox-helpers';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { buildIdempotencyKey } from '@/lib/idempotency';
import { downloadReportFile, type ExportFormat } from '@/lib/officialExports';
import { chamarApiPost, chamarApiGet } from '@/lib/workerApi';
import { censorCPF, censorPhone } from '@/utils/masks';
import { SPECIALTY_ICONS } from '@/pages/Specialties';
import { Logger } from '@/utils/logger';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface InstitutionOption {
  id: string;
  name: string;
}

interface SpecialtyOption {
  id: string;
  name: string;
  color?: string;
  icon?: string;
}

interface DoctorOption {
  id: string;
  full_name?: string;
  specialty_name?: string;
  specialty_color?: string;
}

interface ReportResult {
  report_id?: string;
  report_code?: string;
  title?: string;
  rows_count?: number;
  content_hash?: string;
  signature_hash?: string;
  validation_payload?: Record<string, unknown>;
  pdf_file_name?: string;
  snapshot?: {
    rows?: Array<Record<string, unknown>>;
    indicators?: Record<string, number | string | null>;
    consolidated_rows?: Array<Record<string, unknown>>;
    ranking_specialties?: Array<{ name: string; total: number }>;
    ranking_doctors?: Array<{ name: string; total: number }>;
    unit_productivity?: Array<{ name: string; total: number; finalizados?: number }>;
    period_chart?: Array<{ date: string; total: number }>;
  };
}

const reportTypes = [
  { value: 'analytical_attendance', label: 'Relatório Analítico de Atendimentos' },
  { value: 'operational_consolidated', label: 'Relatório Operacional Consolidado' },
  { value: 'general_attendance', label: 'Relatório Geral de Atendimentos' },
];

/**
 * Formata e exibe um valor de célula da tabela.
 * Usado tanto para renderização visual (ReactNode) quanto para texto plano (string) nos filtros.
 * @param key - Chave da coluna
 * @param valor - Valor bruto da célula
 * @param modo - 'node' para JSX | 'text' para string (filtros)
 */
const formatarCelulaTabela = (key: string, valor: unknown, modo: 'node' | 'text' = 'node'): string | ReactNode => {
  if (valor === null || valor === undefined || valor === '') return modo === 'node' ? '-' : '-';
  const texto = String(valor);

  if (key === 'status') {
    const statusMap: Record<string, { label: string; className: string }> = {
      agendado:       { label: 'Agendado',                 className: 'bg-blue-50 text-blue-700 border-blue-200' },
      confirmado:     { label: 'Confirmado',               className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
      reagendado:     { label: 'Reagendado',               className: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
      em_atendimento: { label: 'Em Atendimento',           className: 'bg-amber-50 text-amber-700 border-amber-200' },
      concluido:      { label: 'Concluído',              className: 'bg-teal-50 text-teal-700 border-teal-200' },
      cancelado:      { label: 'Cancelado',                className: 'bg-rose-50 text-rose-700 border-rose-200' },
      nao_compareceu: { label: 'Falta (Não Compareceu)', className: 'bg-slate-50 text-slate-600 border-slate-200' },
    };
    const mapped = statusMap[texto.toLowerCase()] || { label: texto, className: 'bg-slate-50 text-slate-600 border-slate-200' };
    if (modo === 'text') return mapped.label;
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap ${mapped.className}`}>
        {mapped.label}
      </span>
    );
  }

  if (key === 'patient_cpf' || key === 'cpf') {
    if (texto.includes('*')) return texto;
    return censorCPF(texto);
  }

  if (key === 'patient_phone' || key === 'phone') {
    if (texto.includes('*')) return texto;
    return censorPhone(texto);
  }

  const formatarDataPtBR = (str: string, comHora = false): string => {
    try {
      const parts = str.split('-');
      if (!comHora && parts.length === 3 && parts[0].length === 4) return `${parts[2]}/${parts[1]}/${parts[0]}`;
      return new Intl.DateTimeFormat('pt-BR', { timeZone: comHora ? 'America/Sao_Paulo' : 'UTC', dateStyle: 'short', ...(comHora ? { timeStyle: 'short' } : {}) }).format(new Date(str));
    } catch {
      return str;
    }
  };

  if (key === 'patient_birth_date' || key === 'birth_date') {
    return formatarDataPtBR(texto, false);
  }

  if (key === 'appointment_date') {
    return formatarDataPtBR(texto, true);
  }

  return texto;
};

/** Atalho para texto puro (usado nos filtros de coluna). */
const obterTextoValorTabela = (key: string, valor: unknown): string =>
  String(formatarCelulaTabela(key, valor, 'text'));

/** Atalho para renderizau00e7u00e3o visual (usado nas cu00e9lulas da tabela). */
const formatarValorTabela = (key: string, valor: unknown): ReactNode =>
  formatarCelulaTabela(key, valor, 'node') as ReactNode;


const STATUS_OPTIONS = [
  { value: 'all', label: 'Todos os status' },
  { value: 'agendado', label: 'Agendado' },
  { value: 'confirmado', label: 'Confirmado' },
  { value: 'reagendado', label: 'Reagendado' },
  { value: 'em_atendimento', label: 'Em Atendimento' },
  { value: 'concluido', label: 'Concluído' },
  { value: 'cancelado', label: 'Cancelado' },
  { value: 'nao_compareceu', label: 'Não Compareceu (Falta)' },
  { value: 'ativos', label: 'Ativas (Sem Cancelados)' },
  { value: 'em_aberto', label: 'Em Aberto (Pendentes)' },
];


const Reports = () => {
  const { user, profile, userRole, hasPermission, isRoot, institutionId, doctorId } = useAuth();
  const dateFromRef = useRef<HTMLInputElement>(null);
  const dateToRef = useRef<HTMLInputElement>(null);
  const isRootSuperadmin = isRoot;

  const [includeInactive, setIncludeInactive] = useState(true);
  const effectiveIncludeInactive = includeInactive;

  // 1. Query do Catálogo de Relatórios (Com Cache de 5min)
  const { data: catalog = { institutions: [], specialties: [], doctors: [], my_doctor_id: null } } = useQuery({
    queryKey: ['reports-catalog', effectiveIncludeInactive],
    queryFn: async () => {
      const { data, error } = await chamarApiPost('/api/rpc/get_reports_catalog', {
        p_include_inactive: effectiveIncludeInactive,
      } as any);
      
      if (error) {
        console.warn('[Reports] Fallback usado para o catálogo devido a erro na RPC:', error);
        return {
          institutions: [],
          specialties: [],
          doctors: [],
          my_doctor_id: null,
        };
      }

      return (data || {}) as {
        institutions: InstitutionOption[];
        specialties: SpecialtyOption[];
        doctors: DoctorOption[];
        my_doctor_id?: string | null;
      };
    },
    staleTime: 5 * 60 * 1000,
  });

  const institutions = catalog.institutions || [];
  const specialties = catalog.specialties || [];
  const doctors = catalog.doctors || [];
  const [reportType, setReportType] = useState('analytical_attendance');
  const [selectedInstitutions, setSelectedInstitutions] = useState<string[]>([]);
  const [selectedSpecialties, setSelectedSpecialties] = useState<string[]>([]);
  const [selectedDoctors, setSelectedDoctors] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  const [activeFilter, setActiveFilter] = useState<string>('thisMonth');
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [lastReport, setLastReport] = useState<ReportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [excelFilters, setExcelFilters] = useState<Record<string, string[]>>({});
  const [filterSearch, setFilterSearch] = useState<Record<string, string>>({});
  const [filtersCollapsed, setFiltersCollapsed] = useState(false);
  const [tableCollapsed, setTableCollapsed] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');
  const [showOnlyAlerts, setShowOnlyAlerts] = useState(false);

  // Limpa filtros de coluna ao mudar tipo de relatu00f3rio (fix #6)
  const handleReportTypeChange = useCallback((newType: string) => {
    setReportType(newType);
    setExcelFilters({});
    setFilterSearch({});
  }, []);

  const toggleExcelFilterValue = (colKey: string, val: string, uniqueValues: string[]) => {
    setExcelFilters((prev) => {
      const current = prev[colKey];
      if (!current) {
        return {
          ...prev,
          [colKey]: uniqueValues.filter((v) => v !== val)
        };
      }
      const next = current.includes(val)
        ? current.filter((v) => v !== val)
        : [...current, val];
      
      if (next.length === uniqueValues.length) {
        const copy = { ...prev };
        delete copy[colKey];
        return copy;
      }
      return { ...prev, [colKey]: next };
    });
  };

  const permissionInstitutionId = selectedInstitutions.length === 1 ? selectedInstitutions[0] : institutionId;
  const canExportReports = hasPermission('reports', 'export', permissionInstitutionId);

  const parseDateBR = (value: string): Date | null => {
    const parsed = parse(value, 'dd/MM/yyyy', new Date());
    return isValid(parsed) ? parsed : null;
  };

  const dateBRToInputValue = (value: string) => {
    const parsed = value ? parseDateBR(value) : null;
    return parsed ? format(parsed, 'yyyy-MM-dd') : '';
  };

  const inputValueToDateBR = (value: string) => {
    const parsed = parse(value, 'yyyy-MM-dd', new Date());
    return value && isValid(parsed) ? format(parsed, 'dd/MM/yyyy') : '';
  };

  useEffect(() => {
    if (doctorId || catalog.my_doctor_id) {
      const defaultDoc = doctorId || catalog.my_doctor_id || '';
      setSelectedDoctors((prev) => (prev.length === 0 ? [defaultDoc] : prev));

      if (userRole === 'medico') {
        const docRecord = (catalog.doctors || []).find((d) => d.id === defaultDoc);
        if (docRecord?.specialty_name) {
          const matchedSpecialty = (catalog.specialties || []).find((s) => s.name === docRecord.specialty_name);
          if (matchedSpecialty) {
            setSelectedSpecialties([matchedSpecialty.id]);
          }
        }
      }
    }
  }, [catalog, doctorId, userRole]);

  useEffect(() => {
    const now = new Date();
    setDateRange({ from: format(startOfMonth(now), 'dd/MM/yyyy'), to: format(endOfMonth(now), 'dd/MM/yyyy') });
    setSelectedInstitutions([]);
    setSelectedSpecialties([]);
  }, []);

  const handleQuickFilter = async (type: '7days' | '15days' | '30days' | 'thisMonth' | 'all' | 'clear') => {
    setActiveFilter(type === 'clear' ? '' : type);
    const now = new Date();
    if (type === '7days') return setDateRange({ from: format(subDays(now, 6), 'dd/MM/yyyy'), to: format(now, 'dd/MM/yyyy') });
    if (type === '15days') return setDateRange({ from: format(subDays(now, 14), 'dd/MM/yyyy'), to: format(now, 'dd/MM/yyyy') });
    if (type === '30days') return setDateRange({ from: format(subDays(now, 29), 'dd/MM/yyyy'), to: format(now, 'dd/MM/yyyy') });
    if (type === 'thisMonth') return setDateRange({ from: format(startOfMonth(now), 'dd/MM/yyyy'), to: format(endOfMonth(now), 'dd/MM/yyyy') });
    if (type === 'all') {
      setLoading(true);
      try {
        const { data, error } = await chamarApiPost<any>('/api/appointments/date_range', {
          institution_id: selectedInstitutions.length === 1 ? selectedInstitutions[0] : null
        });

        if (error) {
          throw new Error(error);
        }

        if (data && data.first_date && data.last_date) {
          const firstDate = new Date(data.first_date);
          const lastDate = new Date(data.last_date);
          if (isValid(firstDate) && isValid(lastDate)) {
            setDateRange({
              from: format(firstDate, 'dd/MM/yyyy'),
              to: format(lastDate, 'dd/MM/yyyy')
            });
            setLoading(false);
            return;
          }
        }

      } catch (err) {
        console.error('Erro ao buscar limites de data:', err);
      } finally {
        setLoading(false);
      }
      return setDateRange({ from: '', to: '' });
    }
    setDateRange({ from: '', to: '' });
  };



  const validatedRange = () => {
    // Se ambos estiverem em branco, significa "Tudo" (sem limite de data)
    if (!dateRange.from && !dateRange.to) {
      return {
        from: '1970-01-01',
        to: '2099-12-31',
      };
    }

    const fromDate = dateRange.from ? parseDateBR(dateRange.from) : null;
    const toDate = dateRange.to ? parseDateBR(dateRange.to) : null;

    if (dateRange.from && !fromDate) {
      toast.error('Data inicial inválida. Use DD/MM/AAAA.');
      return null;
    }
    if (dateRange.to && !toDate) {
      toast.error('Data final inválida. Use DD/MM/AAAA.');
      return null;
    }
    if (fromDate && toDate && fromDate > toDate) {
      toast.error('A data inicial deve ser anterior a data final.');
      return null;
    }

    return {
      from: fromDate ? format(fromDate, 'yyyy-MM-dd') : '1970-01-01',
      to: toDate ? format(toDate, 'yyyy-MM-dd') : '2099-12-31',
    };
  };

  const handleGenerateReport = async () => {
    const range = validatedRange();
    if (!range) return;

    // Guarda o estado inicial para identificar se os campos estavam vazios
    const originalFromEmpty = !dateRange.from;
    const originalToEmpty = !dateRange.to;

    setLoading(true);
    try {
      const p_idempotency_key = await buildIdempotencyKey('generate_operational_report', {
        reportType,
        institutions: selectedInstitutions.join(',') || 'all',
        specialties: selectedSpecialties.join(',') || 'all',
        doctors: selectedDoctors.join(',') || 'all',
        from: range.from,
        to: range.to,
        status: selectedStatuses.join(','),
        includeInactive: effectiveIncludeInactive,
        request_id: typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Date.now(),
      });

      const { data, error } = await chamarApiPost('/api/rpc/generate_operational_report_snapshot', {
        p_report_type: reportType,
        p_date_from: range.from,
        p_date_to: range.to,
        p_institution_id: selectedInstitutions.length === 1 ? selectedInstitutions[0] : null,
        p_specialty_id: selectedSpecialties.length === 1 ? selectedSpecialties[0] : null,
        p_doctor_id: selectedDoctors.length === 1 ? selectedDoctors[0] : null,
        p_status: null, // Sempre busca todos para permitir filtragem e recalculo local ultrarrapido
        p_idempotency_key,
        p_include_inactive: effectiveIncludeInactive,
      } as any);

      if (error) throw error;
      const report = data as ReportResult;
      setLastReport(report);
      setExcelFilters({});
      setFilterSearch({});
      setFiltersCollapsed(true);
      setTableCollapsed(false);

      // Descobre a primeira e a última data nos registros obtidos
      let minDate: Date | null = null;
      let maxDate: Date | null = null;
      const rowsToCheck = [
        ...(report.snapshot?.rows || []),
        ...(report.snapshot?.consolidated_rows || [])
      ];

      rowsToCheck.forEach((row) => {
        const dateStr = (row.appointment_date || row.operational_at) as string | undefined;
        if (dateStr) {
          try {
            const parsed = new Date(dateStr);
            if (isValid(parsed)) {
              if (!minDate || parsed < minDate) minDate = parsed;
              if (!maxDate || parsed > maxDate) maxDate = parsed;
            }
          } catch (e) {
            Logger.warn('Data inválida ignorada no cálculo do intervalo do relatório', { dateStr, error: e });
          }
        }
      });

      const newRange = { ...dateRange };
      if (originalFromEmpty && minDate) {
        newRange.from = format(minDate, 'dd/MM/yyyy');
      }
      if (originalToEmpty && maxDate) {
        newRange.to = format(maxDate, 'dd/MM/yyyy');
      }
      if (originalFromEmpty || originalToEmpty) {
        setDateRange(newRange);
      }

      toast.success('Relatório operacional gerado.');
    } catch (error) {
      console.error('Erro ao gerar relatório:', error, typeof error === 'object' && error !== null ? { ...error } : error);
      toast.error(getErrorMessage(error, 'Erro ao gerar relatório'));
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (format: ExportFormat) => {
    if (!lastReport) return;
    setExporting(format);
    try {
      // Cria uma cópia filtrada do relatório para a exportação
      const filteredSnapshot = {
        ...lastReport.snapshot,
        rows: previewRows,
        consolidated_rows: isConsolidated ? previewRows : [],
        indicators,
        ranking_specialties: rankingSpecialties,
        ranking_doctors: rankingDoctors,
        unit_productivity: unitProductivity,
        period_chart: periodChart,
      };

      const filteredReport = {
        ...lastReport,
        snapshot: filteredSnapshot,
        rows_count: previewRows.length,
      };

      await downloadReportFile(filteredReport, format);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Não foi possível gerar o arquivo.'));
    } finally {
      setExporting(null);
    }
  };

  const isConsolidated = reportType === 'operational_consolidated';

  const expandedSelectedStatuses = useMemo(() => {
    if (selectedStatuses.length === 0 || selectedStatuses.includes('all')) {
      return ['all'];
    }
    const expanded = new Set<string>();
    selectedStatuses.forEach((status) => {
      expanded.add(status);
    });
    return Array.from(expanded);
  }, [selectedStatuses]);

  /**
   * Rows brutos do snapshot (respeitando tipo de relatu00f3rio).
   * Para consolidado, usa consolidated_rows; para analiu00edtico usa rows.
   */
  const snapshotRows = useMemo(() => {
    if (!lastReport) return [];
    return isConsolidated
      ? lastReport.snapshot?.consolidated_rows || []
      : lastReport.snapshot?.rows || [];
  }, [lastReport, isConsolidated]);

  /**
   * Rows filtradas pelo filtro de status — compartilhado entre todos os
   * computed values para evitar recalcular 4x (fix #12).
   */
  const filteredRows = useMemo(() => {
    let result = snapshotRows;

    if (!includeInactive) {
      result = result.filter(row => row.patient_is_active !== false);
    }

    if (!expandedSelectedStatuses.includes('all')) {
      result = result.filter(row => expandedSelectedStatuses.includes(String(row.status).toLowerCase()));
    }

    if (selectedInstitutions.length > 0) {
      result = result.filter(row => selectedInstitutions.includes(String(row.institution_id)));
    }

    if (selectedSpecialties.length > 0) {
      result = result.filter(row => selectedSpecialties.includes(String(row.specialty_id)));
    }

    if (selectedDoctors.length > 0) {
      result = result.filter(row => selectedDoctors.includes(String(row.doctor_id)));
    }

    return result;
  }, [snapshotRows, expandedSelectedStatuses, selectedInstitutions, selectedSpecialties, selectedDoctors, includeInactive]);

  const cpfsWithDiffNames = useMemo(() => {
    const cpfToNames: Record<string, Set<string>> = {};
    filteredRows.forEach((row) => {
      const rawCpf = String(row.patient_cpf || '').replace(/\D/g, '');
      const name = String(row.patient_name || '').trim().toUpperCase();
      if (rawCpf && name && name !== 'PATIENTE' && name !== 'PACIENTE') {
        if (!cpfToNames[rawCpf]) cpfToNames[rawCpf] = new Set();
        cpfToNames[rawCpf].add(name);
      }
    });
    const result = new Set<string>();
    Object.entries(cpfToNames).forEach(([cpf, names]) => {
      if (names.size > 1) result.add(cpf);
    });
    return result;
  }, [filteredRows]);

  const cpfsWithDuplicateSpecs = useMemo(() => {
    const cpfSpecCount: Record<string, Record<string, number>> = {};
    const genericCpfs = ['00000000000', '11111111111', '22222222222', '33333333333', '44444444444', '55555555555', '66666666666', '77777777777', '88888888888', '99999999999', '12345678909'];
    filteredRows.forEach((row) => {
      const rawCpf = String(row.patient_cpf || '').replace(/\D/g, '');
      const spec = String(row.specialty_name || 'Sem especialidade');
      if (rawCpf && !genericCpfs.includes(rawCpf)) {
        if (!cpfSpecCount[rawCpf]) cpfSpecCount[rawCpf] = {};
        cpfSpecCount[rawCpf][spec] = (cpfSpecCount[rawCpf][spec] || 0) + 1;
      }
    });
    const result = new Set<string>();
    Object.entries(cpfSpecCount).forEach(([cpf, specs]) => {
      Object.entries(specs).forEach(([spec, count]) => {
        if (count > 1) result.add(`${cpf}-${spec}`);
      });
    });
    return result;
  }, [filteredRows]);

  const previewColumns = isConsolidated
    ? ([
        ['institution_name', 'Instituição'],
        ['specialty_name', 'Especialidade'],
        ['doctor_name', 'Profissional'],
        ['status', 'Status'],
        ['quantidade', 'Quantidade'],
      ] as const)
    : ([
        ['appointment_date', 'Data'],
        ['patient_name', 'Paciente'],
        ['patient_cpf', 'CPF'],
        ['patient_birth_date', 'Data de Nasc.'],
        ['specialty_name', 'Especialidade'],
        ['doctor_name', 'Profissional'],
        ['institution_name', 'Instituição'],
        ['status', 'Status'],
      ] as const);

  /** Rows do preview da tabela (pós filtro de status). */
  const previewRowsRaw = filteredRows;

  /** Rows do preview com filtros de coluna Excel aplicados (fix #6 — colunas corretas por tipo). */
  const previewRows = useMemo(() => {
    let filtered = previewRowsRaw.filter((row) => {
      return Object.entries(excelFilters).every(([colKey, activeValues]) => {
        if (!activeValues || activeValues.length === 0) return true;
        const val = obterTextoValorTabela(colKey, row[colKey]);
        return activeValues.includes(val);
      });
    });

    if (globalSearch.trim()) {
      const searchLower = globalSearch.toLowerCase().trim();
      filtered = filtered.filter((row) => {
        return (previewColumns as unknown as readonly (readonly [string, string])[]).some(([colKey]) => {
          const val = obterTextoValorTabela(colKey, row[colKey]);
          return val.toLowerCase().includes(searchLower);
        });
      });
    }

    if (showOnlyAlerts) {
      const genericCpfs = ['00000000000', '11111111111', '22222222222', '33333333333', '44444444444', '55555555555', '66666666666', '77777777777', '88888888888', '99999999999', '12345678909'];
      const genericPhones = ['000000000', '111111111', '999999999', '123456789', '00000000000', '11111111111', '99999999999'];

      filtered = filtered.filter((row) => {
        const rawCpf = String(row.patient_cpf || '').replace(/\D/g, '');
        const spec = String(row.specialty_name || 'Sem especialidade');
        const birth = String(row.patient_birth_date || '');
        const phone = String(row.patient_phone || '').replace(/\D/g, '');

        const hasDiffNames = rawCpf && cpfsWithDiffNames.has(rawCpf);
        const hasDuplicateSpec = rawCpf && cpfsWithDuplicateSpecs.has(`${rawCpf}-${spec}`);
        const hasGenericCpf = rawCpf && genericCpfs.includes(rawCpf);
        const hasGenericBirth = birth.startsWith('1900-01-01') || birth.startsWith('1900-01-02') || birth.includes('01/01/1900');
        
        let hasGenericPhone = false;
        if (phone) {
          const phoneSuffix = phone.slice(-9);
          hasGenericPhone = genericPhones.includes(phoneSuffix) || phoneSuffix.split('').every(c => c === phoneSuffix[0]);
        }

        return hasDiffNames || hasDuplicateSpec || hasGenericCpf || hasGenericBirth || hasGenericPhone;
      });
    }

    return filtered;
  }, [previewRowsRaw, excelFilters, globalSearch, previewColumns, showOnlyAlerts, cpfsWithDiffNames, cpfsWithDuplicateSpecs]);

  /**
   * Indicadores calculados localmente a partir das rows analiu00edticas.
   * Para relatu00f3rios consolidados, usa snapshotRows analiu00edticos do snapshot
   * quando disponu00edvel, garantindo mu00e9tricas corretas (fix #4).
   */
  const indicators = useMemo(() => {
    if (!lastReport) return {};
    // Sempre usa rows analiu00edticos para indicadores, mesmo em tipo consolidado
    const rawRows = lastReport.snapshot?.rows || [];
    const rows = expandedSelectedStatuses.includes('all')
      ? rawRows
      : rawRows.filter((row) => expandedSelectedStatuses.includes(String(row.status).toLowerCase()));

    const total = rows.length;
    const agendados       = rows.filter(r => String(r.status).toLowerCase() === 'agendado').length;
    const confirmado      = rows.filter(r => String(r.status).toLowerCase() === 'confirmado').length;
    const reagendado      = rows.filter(r => String(r.status).toLowerCase() === 'reagendado').length;
    const confirmados     = confirmado + reagendado;
    const em_atendimento  = rows.filter(r => String(r.status).toLowerCase() === 'em_atendimento').length;
    const concluidos      = rows.filter(r => String(r.status).toLowerCase() === 'concluido').length;
    const cancelados      = rows.filter(r => String(r.status).toLowerCase() === 'cancelado').length;
    const nao_compareceu  = rows.filter(r => String(r.status).toLowerCase() === 'nao_compareceu').length;
    const total_ativos    = total - cancelados;

    const durations = rows.map(r => r.duration_minutes).filter(d => typeof d === 'number') as number[];
    const tempo_medio_minutos = durations.length > 0
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : null;

    return {
      total_atendimentos: total,
      total_ativos,
      agendados,
      confirmados,
      em_atendimento,
      concluidos,
      finalizados: concluidos,
      cancelados,
      cancelamentos: cancelados,
      nao_compareceu,
      faltas: nao_compareceu,
      tempo_medio_minutos,
    };
  }, [lastReport, expandedSelectedStatuses]);

  const totalAtendimentos = Number(indicators.total_atendimentos ?? lastReport?.rows_count ?? 0) || 0;

  /**
   * Calcula percentual de um valor sobre o total de atendimentos.
   * Retorna '0%' em caso de division-by-zero ou valor nu00e3o-numu00e9rico (fix #20).
   */
  const metricPercent = (value: unknown): string => {
    const numeric = typeof value === 'number' ? value : Number(String(value ?? '0').replace(/[^0-9.]/g, '')) || 0;
    if (totalAtendimentos <= 0 || !isFinite(numeric)) return '0%';
    return `${((numeric / totalAtendimentos) * 100).toFixed(1)}%`;
  };

  /** Ranking de especialidades derivado de filteredRows compartilhado. */
  const rankingSpecialties = useMemo(() => {
    const counts: Record<string, { total: number; color?: string; icon?: string }> = {};
    filteredRows.forEach(r => {
      const name = String(r.specialty_name || 'Sem especialidade');
      if (!counts[name]) {
        const specOpt = specialties.find(s => s.name === name);
        counts[name] = { 
          total: 0, 
          color: specOpt?.color || undefined, 
          icon: specOpt?.icon || undefined 
        };
      }
      counts[name].total += 1;
    });
    return Object.entries(counts)
      .map(([name, val]) => ({ 
        name, 
        total: val.total, 
        specialty_color: val.color, 
        specialty_icon: val.icon 
      }))
      .sort((a, b) => b.total - a.total);
  }, [filteredRows, specialties]);

  /** Ranking de profissionais derivado de filteredRows compartilhado. */
  const rankingDoctors = useMemo(() => {
    const counts: Record<string, { total: number; specialty_name?: string; specialty_color?: string }> = {};
    filteredRows.forEach(r => {
      const name = String(r.doctor_name || 'Sem profissional');
      if (!counts[name]) {
        const docOpt = doctors.find(d => d.full_name === name);
        counts[name] = { 
          total: 0, 
          specialty_name: docOpt?.specialty_name || (r.specialty_name ? String(r.specialty_name) : undefined), 
          specialty_color: docOpt?.specialty_color || undefined
        };
      }
      counts[name].total += 1;
    });
    return Object.entries(counts)
      .map(([name, val]) => ({ 
        name, 
        total: val.total, 
        specialty_name: val.specialty_name, 
        specialty_color: val.specialty_color 
      }))
      .sort((a, b) => b.total - a.total);
  }, [filteredRows, doctors]);

  /** Produtividade por unidade derivada de filteredRows compartilhado. */
  const unitProductivity = useMemo(() => {
    const counts: Record<string, { total: number; finalizados: number }> = {};
    filteredRows.forEach(r => {
      const name = String(r.institution_name || 'Sem unidade');
      if (!counts[name]) counts[name] = { total: 0, finalizados: 0 };
      counts[name].total += 1;
      if (String(r.status).toLowerCase() === 'concluido') counts[name].finalizados += 1;
    });
    return Object.entries(counts)
      .map(([name, val]) => ({ name, total: val.total, finalizados: val.finalizados }))
      .sort((a, b) => b.total - a.total);
  }, [filteredRows]);

  /**
   * Gru00e1fico por peru00edodo — usa o campo correto conforme o tipo de relatu00f3rio (fix #3).
   * Para analu00edtico: appointment_date. Para consolidado: operational_at.
   * Datas formatadas em PT-BR para exibiu00e7u00e3o (fix #10).
   */
  const periodChart = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredRows.forEach(r => {
      const rawDate = isConsolidated
        ? (r.operational_at ? String(r.operational_at).slice(0, 10) : '')
        : (r.appointment_date ? String(r.appointment_date).slice(0, 10) : '');
      if (rawDate) {
        counts[rawDate] = (counts[rawDate] || 0) + 1;
      }
    });
    return Object.entries(counts)
      .map(([dateIso, total]) => {
        // Formata para PT-BR para exibiu00e7u00e3o no ranking (fix #10)
        const parts = dateIso.split('-');
        const datePtBR = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dateIso;
        return { date: datePtBR, total };
      })
      .sort((a, b) => {
        // Ordena pelas partes da data PT-BR convertida de volta
        const toIso = (d: string) => d.split('/').reverse().join('-');
        return toIso(a.date).localeCompare(toIso(b.date));
      });
  }, [filteredRows, isConsolidated]);



  const intelligentAlerts = useMemo(() => {
    const alerts: Array<{
      id: string;
      type: 'danger' | 'warning' | 'info';
      title: string;
      description: string;
      count: number;
    }> = [];

    const cpfToNames: Record<string, Set<string>> = {};
    let genericCpfCount = 0;
    let genericBirthDateCount = 0;
    let genericPhoneCount = 0;

    const genericCpfs = ['00000000000', '11111111111', '22222222222', '33333333333', '44444444444', '55555555555', '66666666666', '77777777777', '88888888888', '99999999999', '12345678909'];
    const genericPhones = ['000000000', '111111111', '999999999', '123456789', '00000000000', '11111111111', '99999999999'];

    filteredRows.forEach((row) => {
      const rawCpf = String(row.patient_cpf || '').replace(/\D/g, '');
      const name = String(row.patient_name || '').trim().toUpperCase();
      const birth = String(row.patient_birth_date || '');
      const phone = String(row.patient_phone || '').replace(/\D/g, '');

      if (rawCpf) {
        if (name && name !== 'PATIENTE' && name !== 'PACIENTE') {
          if (!cpfToNames[rawCpf]) cpfToNames[rawCpf] = new Set();
          cpfToNames[rawCpf].add(name);
        }

        if (genericCpfs.includes(rawCpf)) {
          genericCpfCount++;
        }
      }

      if (birth.startsWith('1900-01-01') || birth.startsWith('1900-01-02') || birth.includes('01/01/1900')) {
        genericBirthDateCount++;
      }

      if (phone) {
        const phoneSuffix = phone.slice(-9);
        if (genericPhones.includes(phoneSuffix) || phoneSuffix.split('').every(c => c === phoneSuffix[0])) {
          genericPhoneCount++;
        }
      }
    });

    Object.entries(cpfToNames).forEach(([cpf, names]) => {
      if (names.size > 1) {
        const fullCpf = censorCPF(cpf);
        alerts.push({
          id: `diff-names-${cpf}`,
          type: 'danger',
          title: 'Divergência: CPF em nomes diferentes',
          description: `O CPF ${fullCpf} está registrado com nomes divergentes: ${Array.from(names).join(', ')}.`,
          count: names.size,
        });
      }
    });

    const duplicateMap: Record<string, Set<string>> = {};
    cpfsWithDuplicateSpecs.forEach((key) => {
      const [cpf, spec] = key.split('-');
      if (!duplicateMap[cpf]) duplicateMap[cpf] = new Set();
      duplicateMap[cpf].add(spec);
    });

    Object.entries(duplicateMap).forEach(([cpf, specs]) => {
      const fullCpf = censorCPF(cpf);
      alerts.push({
        id: `multi-app-${cpf}`,
        type: 'warning',
        title: 'Duplicidade: Consultas repetidas',
        description: `O paciente de CPF ${fullCpf} possui agendamentos repetidos nas especialidades: ${Array.from(specs).join(', ')}.`,
        count: specs.size,
      });
    });

    if (genericCpfCount > 0) {
      alerts.push({
        id: 'generic-cpf',
        type: 'info',
        title: 'Dados genéricos: CPFs inválidos',
        description: `Há ${genericCpfCount} agendamentos utilizando CPFs de teste ou inválidos (ex: 000.000.000-00).`,
        count: genericCpfCount,
      });
    }

    if (genericBirthDateCount > 0) {
      alerts.push({
        id: 'generic-birth',
        type: 'info',
        title: 'Dados genéricos: Data de nascimento padrão',
        description: `Há ${genericBirthDateCount} agendamentos com data de nascimento genérica (01/01/1900).`,
        count: genericBirthDateCount,
      });
    }

    if (genericPhoneCount > 0) {
      alerts.push({
        id: 'generic-phone',
        type: 'info',
        title: 'Dados genéricos: Telefones padrão',
        description: `Há ${genericPhoneCount} agendamentos com números de telefone de teste ou inválidos (ex: 99999-9999).`,
        count: genericPhoneCount,
      });
    }

    return alerts;
  }, [filteredRows, cpfsWithDuplicateSpecs]);

  // =====================================================================
  // GUARD de permissu00e3o — deve ficar DEPOIS de todos os hooks (fix #2)
  // =====================================================================
  if (!hasPermission('reports', 'read', institutionId)) {
    return <div className="pt-20 pb-16 px-4 min-h-screen flex items-center justify-center bg-slate-100">Acesso negado</div>;
  }


  return (
    <div className="h-full min-h-0 bg-slate-100 px-3 pb-3">
      <div className="flex h-full min-h-0 w-full flex-col">
        <PageHeader title="Relatórios" description="Análises operacionais consolidadas, oficiais e rastreáveis" className="mb-0 border-b-0 shadow-none pb-3" compact loading={loading} />
        <div className="-mx-3 lg:-mx-4 mb-6 bg-slate-50/80 border-b border-slate-200/60 shadow-[0_4px_20px_-10px_rgba(0,0,0,0.05)] px-6 py-3.5 backdrop-blur-md">
          <div className="flex items-center justify-between cursor-pointer select-none" onClick={() => setFiltersCollapsed(!filtersCollapsed)}>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Parâmetros do Relatório</span>
              {lastReport && filtersCollapsed && (
                <span className="text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full border border-blue-100 font-medium">
                  {lastReport.title} ({String(lastReport.rows_count ?? 0)} registros)
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-400 font-medium">{filtersCollapsed ? "Expandir" : "Recolher"}</span>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 hover:bg-slate-200/50 rounded-lg text-slate-500">
                {filtersCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {!filtersCollapsed && (
            <div className="space-y-4 mt-3 animate-in fade-in duration-200">
              <div className="grid w-full grid-cols-2 items-end gap-2 md:grid-cols-4 lg:grid-cols-7">
                <Field label="Início">
                  <div className="flex h-9 items-center gap-1.5 rounded-xl border border-slate-200/90 bg-white px-1.5 shadow-2xs w-full">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        const parsed = dateRange.from ? parseDateBR(dateRange.from) : new Date();
                        if (parsed) {
                          setDateRange({ ...dateRange, from: format(subDays(parsed, 1), 'dd/MM/yyyy') });
                          setActiveFilter('');
                        }
                      }}
                      className="h-7 w-7 text-slate-500 hover:bg-slate-100 hover:text-slate-800 shrink-0 rounded-lg"
                      title="Dia anterior"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Input
                      ref={dateFromRef}
                      type="date"
                      value={dateBRToInputValue(dateRange.from)}
                      onChange={(event) => {
                        setDateRange({ ...dateRange, from: inputValueToDateBR(event.target.value) });
                        setActiveFilter('');
                      }}
                      className="delphi-input h-7 w-[105px] border-0 bg-transparent px-0 text-center text-xs font-semibold shadow-none cursor-pointer"
                      onClick={(e) => {
                        try { e.currentTarget.showPicker(); } catch (err) { void err; }
                      }}
                      aria-label="Data inicial do relatório"
                    />
                    <Calendar
                      className="h-3.5 w-3.5 text-slate-400 shrink-0 cursor-pointer hover:text-slate-600 transition-colors"
                      onClick={() => {
                        if (dateFromRef.current && 'showPicker' in HTMLInputElement.prototype) {
                          try { dateFromRef.current.showPicker(); } catch (e) { dateFromRef.current.focus(); }
                        } else {
                          dateFromRef.current?.focus();
                        }
                      }}
                    />
                    {dateRange.from && (() => {
                      const parsed = parseDateBR(dateRange.from);
                      if (parsed && isValid(parsed)) {
                        return (
                          <span className="rounded-lg bg-blue-50 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-[#003B71] border border-blue-100/80 shrink-0 select-none ml-0.5">
                            {format(parsed, "EEEE", { locale: ptBR })}
                          </span>
                        );
                      }
                      return null;
                    })()}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        const parsed = dateRange.from ? parseDateBR(dateRange.from) : new Date();
                        if (parsed) {
                          setDateRange({ ...dateRange, from: format(addDays(parsed, 1), 'dd/MM/yyyy') });
                          setActiveFilter('');
                        }
                      }}
                      className="h-7 w-7 text-slate-500 hover:bg-slate-100 hover:text-slate-800 shrink-0 rounded-lg"
                      title="Próximo dia"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </Field>

                <Field label="Fim">
                  <div className="flex h-9 items-center gap-1.5 rounded-xl border border-slate-200/90 bg-white px-1.5 shadow-2xs w-full">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        const parsed = dateRange.to ? parseDateBR(dateRange.to) : new Date();
                        if (parsed) {
                          setDateRange({ ...dateRange, to: format(subDays(parsed, 1), 'dd/MM/yyyy') });
                          setActiveFilter('');
                        }
                      }}
                      className="h-7 w-7 text-slate-500 hover:bg-slate-100 hover:text-slate-800 shrink-0 rounded-lg"
                      title="Dia anterior"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Input
                      ref={dateToRef}
                      type="date"
                      value={dateBRToInputValue(dateRange.to)}
                      onChange={(event) => {
                        setDateRange({ ...dateRange, to: inputValueToDateBR(event.target.value) });
                        setActiveFilter('');
                      }}
                      className="delphi-input h-7 w-[105px] border-0 bg-transparent px-0 text-center text-xs font-semibold shadow-none cursor-pointer"
                      onClick={(e) => {
                        try { e.currentTarget.showPicker(); } catch (err) { void err; }
                      }}
                      aria-label="Data final do relatório"
                    />
                    <Calendar
                      className="h-3.5 w-3.5 text-slate-400 shrink-0 cursor-pointer hover:text-slate-600 transition-colors"
                      onClick={() => {
                        if (dateToRef.current && 'showPicker' in HTMLInputElement.prototype) {
                          try { dateToRef.current.showPicker(); } catch (e) { dateToRef.current.focus(); }
                        } else {
                          dateToRef.current?.focus();
                        }
                      }}
                    />
                    {dateRange.to && (() => {
                      const parsed = parseDateBR(dateRange.to);
                      if (parsed && isValid(parsed)) {
                        return (
                          <span className="rounded-lg bg-blue-50 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-[#003B71] border border-blue-100/80 shrink-0 select-none ml-0.5">
                            {format(parsed, "EEEE", { locale: ptBR })}
                          </span>
                        );
                      }
                      return null;
                    })()}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        const parsed = dateRange.to ? parseDateBR(dateRange.to) : new Date();
                        if (parsed) {
                          setDateRange({ ...dateRange, to: format(addDays(parsed, 1), 'dd/MM/yyyy') });
                          setActiveFilter('');
                        }
                      }}
                      className="h-7 w-7 text-slate-500 hover:bg-slate-100 hover:text-slate-800 shrink-0 rounded-lg"
                      title="Próximo dia"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </Field>

                <Field label="Tipo">
                  <Select value={reportType} onValueChange={handleReportTypeChange}>
                    <SelectTrigger className="delphi-input h-9 bg-white"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {reportTypes.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Status">
                  <MultiSelect
                    options={STATUS_OPTIONS.filter(o => !['all', 'ativos', 'em_aberto'].includes(o.value)).map(o => renderStatusOption(o.value, o.label))}
                    selected={selectedStatuses}
                    onChange={setSelectedStatuses}
                    placeholder="Todos os status"
                    className="h-9"
                  />
                </Field>
                <Field label="Instituição">
                  <MultiSelect
                    options={institutions.map(i => ({
                      label: `${i.name}${(i as any).is_active === false ? ' (Inativa)' : ''}`,
                      value: i.id
                    }))}
                    selected={selectedInstitutions}
                    onChange={setSelectedInstitutions}
                    placeholder="Todas as instituições"
                    className="h-9"
                  />
                </Field>
                <Field label="Especialidade">
                  <MultiSelect
                    options={specialties.map(s => {
                      const base = renderSpecialtyOption(s);
                      if ((s as any).is_active === false) {
                        return {
                          ...base,
                          label: `${base.label} (Inativa)`
                        };
                      }
                      return base;
                    })}
                    selected={selectedSpecialties}
                    onChange={setSelectedSpecialties}
                    placeholder="Todas as especialidades"
                    disabled={userRole === 'medico'}
                    className="h-9"
                  />
                </Field>
                <Field label="Profissional">
                  <MultiSelect
                    options={doctors.map(d => {
                      const base = renderDoctorOption(d);
                      if ((d as any).is_active === false) {
                        return {
                          ...base,
                          label: `${base.label} (Inativo)`
                        };
                      }
                      return base;
                    })}
                    selected={selectedDoctors}
                    onChange={setSelectedDoctors}
                    placeholder="Todos os profissionais"
                    disabled={Boolean(doctorId)}
                    className="h-9"
                  />
                </Field>
              </div>
              <div className="flex w-full flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-slate-200/60">
                <div className="flex flex-wrap items-center gap-2">
                  <QuickFilterButton label="7 dias" active={activeFilter === '7days'} onClick={() => { void handleQuickFilter('7days'); }} />
                  <QuickFilterButton label="15 dias" active={activeFilter === '15days'} onClick={() => { void handleQuickFilter('15days'); }} />
                  <QuickFilterButton label="30 dias" active={activeFilter === '30days'} onClick={() => { void handleQuickFilter('30days'); }} />
                  <QuickFilterButton label="Este mês" active={activeFilter === 'thisMonth'} onClick={() => { void handleQuickFilter('thisMonth'); }} />
                  <div className="h-5 w-[1px] bg-slate-300 shrink-0 mx-0.5 self-center" />
                  <QuickFilterButton label="Tudo" active={activeFilter === 'all'} onClick={() => { void handleQuickFilter('all'); }} />
                  <QuickFilterButton variant="clear" onClick={() => { void handleQuickFilter('clear'); }} label="Limpar" />
                  {isRootSuperadmin && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const nextState = !includeInactive;
                        setIncludeInactive(nextState);
                        if (nextState) {
                          toast.info('Opções inativadas incluídas nos filtros do relatório.');
                        } else {
                          toast.info('Exibindo apenas opções ativas nos filtros.');
                        }
                      }}
                      className={cn(
                        "h-8 px-3 text-xs font-bold rounded-xl transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer",
                        includeInactive
                          ? "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100/80 hover:border-amber-400"
                          : "border-slate-200/90 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      )}
                      title={includeInactive ? "Inativos visíveis nos filtros do relatório" : "Exibir registros inativados nos filtros"}
                    >
                      {includeInactive ? <Eye className="h-3.5 w-3.5 text-amber-600 shrink-0" /> : <EyeOff className="h-3.5 w-3.5 text-slate-400 shrink-0" />}
                      <span>{includeInactive ? "Inativos Visíveis" : "Exibir Inativos"}</span>
                      <span className={cn(
                        "ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-extrabold tracking-wider uppercase",
                        includeInactive ? "bg-amber-200/80 text-amber-900" : "bg-slate-100 text-slate-500"
                      )}>
                        {includeInactive ? "ON" : "OFF"}
                      </span>
                    </Button>
                  )}
                </div>
                <Button onClick={() => { void handleGenerateReport(); }} className="h-9 whitespace-nowrap w-full sm:w-auto shadow-sm" disabled={loading}>
                  <Download className="mr-2 h-4 w-4" />
                  {loading ? 'Gerando...' : 'Gerar Relatório'}
                </Button>
              </div>
            </div>
          )}
        </div>

          {lastReport && (
          <div className="space-y-6 mt-6 pb-6">
            {/* Cabecalho e Acoes do Relatorio */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <div className="space-y-1.5">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-100">
                  <ShieldCheck className="h-3 w-3" /> Relatório Oficial
                </span>
                <h2 className="text-xl font-bold text-slate-800 tracking-tight">{lastReport.title || 'Relatório Gerado'}</h2>
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 font-medium">
                  <span>Código: <strong className="text-slate-700 font-semibold">{lastReport.report_code || '-'}</strong></span>
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                  <span>Registros: <strong className="text-slate-700 font-semibold">{lastReport.rows_count ?? 0}</strong></span>
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                  <span className="text-emerald-600 font-semibold">Documento Assinado e Rastreável</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {canExportReports && (
                  <>
                    <Button 
                      variant="outline" 
                      onClick={() => { void handleDownload('excel'); }} 
                      disabled={exporting !== null}
                      className="h-9 px-3.5 bg-white hover:bg-emerald-50 text-emerald-700 hover:text-emerald-800 border border-emerald-200 hover:border-emerald-300 rounded-xl text-xs font-semibold shadow-sm transition-all duration-200 shrink-0"
                    >
                      <Download className="h-4 w-4 mr-1.5" />
                      {exporting === 'excel' ? 'Gerando...' : 'Baixar Excel'}
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={() => { void handleDownload('csv'); }} 
                      disabled={exporting !== null}
                      className="h-9 px-3.5 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-800 border border-slate-200 hover:border-slate-300 rounded-xl text-xs font-semibold shadow-sm transition-all duration-200 shrink-0"
                    >
                      <Download className="h-4 w-4 mr-1.5" />
                      {exporting === 'csv' ? 'Gerando...' : 'Baixar CSV'}
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* Layout principal: Métricas no topo + Rankings e Gráficos abaixo */}
            <div className="flex flex-col gap-4 w-full">

              {/* Métricas no topo — Grid de 8 colunas */}
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-2 w-full">
                <Metric label="Total" value={totalAtendimentos} detail={null} accent="blue" />
                <Metric label="Ativos" value={indicators.total_ativos ?? (totalAtendimentos - Number(indicators.cancelados || 0))} detail={metricPercent(indicators.total_ativos ?? (totalAtendimentos - Number(indicators.cancelados || 0)))} accent="emerald" />
                <Metric label="Agendados" value={indicators.agendados ?? 0} detail={metricPercent(indicators.agendados)} accent="cyan" />
                <Metric label="Confirmados" value={indicators.confirmados ?? 0} detail={metricPercent(indicators.confirmados)} accent="indigo" />
                <Metric label="Em Atend." value={indicators.em_atendimento ?? 0} detail={metricPercent(indicators.em_atendimento)} accent="amber" />
                <Metric label="Concluídos" value={indicators.concluidos ?? indicators.finalizados ?? 0} detail={metricPercent(indicators.concluidos ?? indicators.finalizados)} accent="teal" />
                <Metric label="Cancelados" value={indicators.cancelados ?? indicators.cancelamentos ?? 0} detail={metricPercent(indicators.cancelados ?? indicators.cancelamentos)} accent="rose" />
                <Metric label="Faltas" value={indicators.nao_compareceu ?? indicators.faltas ?? 0} detail={metricPercent(indicators.nao_compareceu ?? indicators.faltas)} accent="slate" />
              </div>

              {/* Sistema de Avisos Inteligente */}
              {intelligentAlerts.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                      </span>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Alertas Operacionais ({intelligentAlerts.length})</h3>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-40 overflow-y-auto pr-1">
                    {intelligentAlerts.map((alert) => {
                      const typeStyles = {
                        danger: 'bg-red-50 text-red-800 border-red-100',
                        warning: 'bg-amber-50 text-amber-800 border-amber-100',
                        info: 'bg-blue-50 text-blue-800 border-blue-100',
                      }[alert.type];

                      return (
                        <div key={alert.id} className={`p-3 rounded-xl border ${typeStyles} text-xs flex items-start gap-2.5 shadow-sm`}>
                          <div className="flex-1 space-y-0.5">
                            <p className="font-bold flex items-center gap-1.5">{alert.title}</p>
                            <p className="text-[11px] leading-relaxed opacity-90">{alert.description}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 3 cards de Ranking lado a lado */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
                <Ranking title="Ranking de Especialidades" rows={rankingSpecialties} color="bg-indigo-500" />
                <Ranking title="Ranking de Profissionais" rows={rankingDoctors} color="bg-emerald-500" />
                <Ranking title="Produtividade por Unidade" rows={unitProductivity.map((item) => ({ name: item.name, total: item.total }))} color="bg-amber-500" />
              </div>

              {/* Gráfico cronológico por período */}
              <PeriodChartPanel data={periodChart.map((item) => ({ date: item.date, total: item.total }))} />

            </div>

            {/* Tabela de Registros de Pacientes */}
            <div className="border border-slate-200 rounded-2xl bg-white overflow-hidden shadow-sm">
              <div
                className="flex items-center justify-between px-5 py-3.5 bg-slate-50 border-b border-slate-200 select-none"
              >
                <div 
                  className="flex items-center gap-2 cursor-pointer flex-1" 
                  onClick={() => setTableCollapsed(!tableCollapsed)}
                >
                  <Users className="h-4 w-4 text-slate-500" />
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-600">Registros de Pacientes ({previewRows.length} exibidos)</span>
                  {Object.keys(excelFilters).length > 0 && (
                    <span className="text-[10px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full border border-amber-100 font-bold animate-pulse">
                      Filtro Excel Ativo
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowOnlyAlerts(!showOnlyAlerts);
                    }}
                    className={`h-7 px-2.5 rounded-lg text-[10px] font-bold shadow-sm transition-all duration-200 shrink-0 ${
                      showOnlyAlerts
                        ? 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100 hover:text-rose-800'
                        : 'bg-white hover:bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    Apenas com avisos
                  </Button>
                  <div className="relative flex items-center" onClick={(e) => e.stopPropagation()}>
                    <SearchIcon className="absolute left-2.5 h-3.5 w-3.5 text-slate-400" />
                    <Input
                      type="text"
                      placeholder="Filtrar tabela..."
                      value={globalSearch}
                      onChange={(e) => setGlobalSearch(e.target.value)}
                      className="h-7 pl-8 pr-2 text-xs bg-white border-slate-200 focus-visible:ring-1 w-44 md:w-56 rounded-lg shadow-sm"
                    />
                  </div>
                  <div className="h-5 w-px bg-slate-300 mx-1 shrink-0" />
                  <div 
                    className="flex items-center gap-1.5 cursor-pointer"
                    onClick={() => setTableCollapsed(!tableCollapsed)}
                  >
                    <span className="text-[10px] text-slate-400 font-medium">{tableCollapsed ? 'Expandir' : 'Recolher'}</span>
                    <Button variant="ghost" size="sm" className="h-5 w-5 p-0 hover:bg-slate-200/50 rounded text-slate-500">
                      {tableCollapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </div>
              </div>

              {!tableCollapsed && (
                <div className="overflow-auto max-h-[500px]">
                  {previewRowsRaw.length === 0 ? (
                    <div className="p-5 text-slate-500 text-xs">Relatório agregado sem exposição de registros individuais para este perfil.</div>
                  ) : previewRows.length === 0 ? (
                    <div className="p-5 text-slate-500 text-xs">Nenhum registro corresponde aos filtros do Excel selecionados.</div>
                  ) : (
                    <table className="w-full min-w-[980px] text-left text-xs border-collapse">
                      <thead className="bg-slate-50 text-slate-600 uppercase border-b border-slate-200 sticky top-0 z-10">
                        <tr>
                          {previewColumns.map(([key, label]) => {
                            const uniqueValues = Array.from(new Set(previewRowsRaw.map((row) => obterTextoValorTabela(key, row[key])))).sort();
                            const activeValues = excelFilters[key];
                            const hasActiveFilter = !!activeValues;
                            const query = filterSearch[key] || '';
                            const filteredUniqueValues = uniqueValues.filter((val) =>
                              val.toLowerCase().includes(query.toLowerCase())
                            );
                            return (
                              <th key={key} className="px-4 py-3 font-bold select-none bg-slate-50 border-r border-slate-100 last:border-r-0">
                                <div className="flex items-center justify-between gap-1.5">
                                  <span>{label}</span>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <button
                                        type="button"
                                        className={`p-1 hover:bg-slate-200/60 rounded cursor-pointer transition-colors duration-150 ${hasActiveFilter ? 'text-blue-600 bg-blue-50/80 border border-blue-200/50' : 'text-slate-400'}`}
                                        title={`Filtrar ${label}`}
                                      >
                                        <Filter className="h-3 w-3" />
                                      </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent className="w-60 p-3.5 bg-white border border-slate-200 rounded-xl shadow-xl z-[9999] space-y-2.5">
                                      <div className="text-xs font-bold text-slate-700">Filtro de {label}</div>
                                      <div className="relative flex items-center">
                                        <SearchIcon className="absolute left-2.5 h-3.5 w-3.5 text-slate-400" />
                                        <Input
                                          type="text"
                                          placeholder="Pesquisar..."
                                          value={query}
                                          onChange={(e) => setFilterSearch((prev) => ({ ...prev, [key]: e.target.value }))}
                                          className="h-8 pl-8 text-xs bg-slate-50 border-slate-200 focus-visible:ring-1"
                                        />
                                      </div>
                                      <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 border-b border-slate-100 pb-1.5 px-1">
                                        <button
                                          type="button"
                                          onClick={() => { const copy = { ...excelFilters }; delete copy[key]; setExcelFilters(copy); }}
                                          className="hover:text-blue-600 transition-colors"
                                        >
                                          Marcar Todos
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setExcelFilters((prev) => ({ ...prev, [key]: [] }))}
                                          className="hover:text-rose-600 transition-colors"
                                        >
                                          Limpar
                                        </button>
                                      </div>
                                      <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1 text-slate-600">
                                        {filteredUniqueValues.length === 0 ? (
                                          <div className="text-[11px] text-slate-400 p-1 text-center">Nenhum resultado</div>
                                        ) : (
                                          filteredUniqueValues.map((val) => {
                                            const isChecked = !activeValues || activeValues.includes(val);
                                            return (
                                              <label
                                                key={val}
                                                className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-slate-50 cursor-pointer select-none text-[11px] font-medium"
                                              >
                                                <input
                                                  type="checkbox"
                                                  checked={isChecked}
                                                  onChange={() => toggleExcelFilterValue(key, val, uniqueValues)}
                                                  className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                                />
                                                <span className="truncate" title={val}>{val}</span>
                                              </label>
                                            );
                                          })
                                        )}
                                      </div>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map((row: Record<string, unknown>, index: number) => {
                          const rawCpf = String(row.patient_cpf || '').replace(/\D/g, '');
                          const spec = String(row.specialty_name || 'Sem especialidade');
                          const birth = String(row.patient_birth_date || '');
                          const phone = String(row.patient_phone || '').replace(/\D/g, '');

                          const genericCpfs = ['00000000000', '11111111111', '22222222222', '33333333333', '44444444444', '55555555555', '66666666666', '77777777777', '88888888888', '99999999999', '12345678909'];
                          const genericPhones = ['000000000', '111111111', '999999999', '123456789', '00000000000', '11111111111', '99999999999'];

                          const hasDiffNames = rawCpf && cpfsWithDiffNames.has(rawCpf);
                          const hasDuplicateSpec = rawCpf && cpfsWithDuplicateSpecs.has(`${rawCpf}-${spec}`);
                          const hasGenericCpf = rawCpf && genericCpfs.includes(rawCpf);
                          const hasGenericBirth = birth.startsWith('1900-01-01') || birth.startsWith('1900-01-02') || birth.includes('01/01/1900');
                          
                          let hasGenericPhone = false;
                          if (phone) {
                            const phoneSuffix = phone.slice(-9);
                            hasGenericPhone = genericPhones.includes(phoneSuffix) || phoneSuffix.split('').every(c => c === phoneSuffix[0]);
                          }

                          let rowBgClass = "border-b border-slate-100 hover:bg-slate-50/50 transition-colors last:border-b-0";
                          if (hasDiffNames) {
                            rowBgClass = "border-b border-red-100 bg-red-50/10 hover:bg-red-50/20 transition-colors last:border-b-0";
                          } else if (hasDuplicateSpec) {
                            rowBgClass = "border-b border-amber-100 bg-amber-50/10 hover:bg-amber-50/20 transition-colors last:border-b-0";
                          }

                          return (
                            <tr key={index} className={rowBgClass}>
                              {(previewColumns as unknown as readonly (readonly [string, string])[]).map(([key]) => (
                                <td key={key} className="px-4 py-3 text-slate-700">
                                  {key === 'patient_name' ? (
                                    <div className="flex flex-col gap-1">
                                      <span className="font-semibold text-slate-900">{formatarValorTabela(key, row[key])}</span>
                                      <div className="flex flex-wrap gap-1">
                                        {hasDiffNames && (
                                          <span className="inline-flex items-center px-1.5 py-0.2 rounded bg-red-50 text-red-700 border border-red-100 text-[9px] font-bold whitespace-nowrap">
                                            ⚠️ CPF em nomes diferentes
                                          </span>
                                        )}
                                        {hasDuplicateSpec && (
                                          <span className="inline-flex items-center px-1.5 py-0.2 rounded bg-amber-50 text-amber-700 border border-amber-100 text-[9px] font-bold whitespace-nowrap">
                                            ⚠️ Consultas repetidas ({spec})
                                          </span>
                                        )}
                                        {hasGenericCpf && (
                                          <span className="inline-flex items-center px-1.5 py-0.2 rounded bg-blue-50 text-blue-700 border border-blue-100 text-[9px] font-bold whitespace-nowrap">
                                            ℹ️ CPF genérico
                                          </span>
                                        )}
                                        {hasGenericBirth && (
                                          <span className="inline-flex items-center px-1.5 py-0.2 rounded bg-blue-50 text-blue-700 border border-blue-100 text-[9px] font-bold whitespace-nowrap">
                                            ℹ️ Nascimento 01/01/1900
                                          </span>
                                        )}
                                        {hasGenericPhone && (
                                          <span className="inline-flex items-center px-1.5 py-0.2 rounded bg-blue-50 text-blue-700 border border-blue-100 text-[9px] font-bold whitespace-nowrap">
                                            ℹ️ Telefone genérico
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  ) : (
                                    formatarValorTabela(key, row[key])
                                  )}
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>

          </div>
        )}
      </div>

    </div>
  );
};

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="space-y-1">
    <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wide">{label}</label>
    {children}
  </div>
);

const ACCENT_MAP: Record<string, { border: string; bg: string; pill: string; pillText: string; num: string }> = {
  blue:    { border: 'border-t-2 border-t-blue-500',    bg: 'bg-blue-50/40',    pill: 'bg-blue-100',    pillText: 'text-blue-700',    num: 'text-blue-700' },
  emerald: { border: 'border-t-2 border-t-emerald-500', bg: 'bg-emerald-50/40', pill: 'bg-emerald-100', pillText: 'text-emerald-700', num: 'text-emerald-700' },
  cyan:    { border: 'border-t-2 border-t-cyan-500',    bg: 'bg-cyan-50/40',    pill: 'bg-cyan-100',    pillText: 'text-cyan-700',    num: 'text-cyan-700' },
  indigo:  { border: 'border-t-2 border-t-indigo-500',  bg: 'bg-indigo-50/40',  pill: 'bg-indigo-100',  pillText: 'text-indigo-700',  num: 'text-indigo-700' },
  amber:   { border: 'border-t-2 border-t-amber-500',   bg: 'bg-amber-50/40',   pill: 'bg-amber-100',   pillText: 'text-amber-700',   num: 'text-amber-700' },
  teal:    { border: 'border-t-2 border-t-teal-500',    bg: 'bg-teal-50/40',    pill: 'bg-teal-100',    pillText: 'text-teal-700',    num: 'text-teal-700' },
  rose:    { border: 'border-t-2 border-t-rose-500',    bg: 'bg-rose-50/40',    pill: 'bg-rose-100',    pillText: 'text-rose-700',    num: 'text-rose-700' },
  slate:   { border: 'border-t-2 border-t-slate-400',   bg: 'bg-slate-50/60',   pill: 'bg-slate-100',   pillText: 'text-slate-600',   num: 'text-slate-700' },
  violet:  { border: 'border-t-2 border-t-violet-500',  bg: 'bg-violet-50/40',  pill: 'bg-violet-100',  pillText: 'text-violet-700',  num: 'text-violet-700' },
};

const Metric = ({ label, value, detail, accent = 'blue' }: { label: string; value: string | number | null; detail?: string | null; accent?: string }) => {
  const a = ACCENT_MAP[accent] ?? ACCENT_MAP['blue'];
  return (
    <div className={`rounded-xl border border-slate-200/80 bg-white ${a.border} px-3 py-2.5 shadow-sm transition-all duration-200 hover:shadow-md flex flex-col gap-0.5`}>
      <p className="text-[9px] uppercase font-bold tracking-widest text-slate-500 truncate">{label}</p>
      <p className={`text-xl font-black leading-none ${a.num}`}>{value ?? '0'}</p>
      {detail ? (
        <span className={`mt-0.5 self-start inline-block text-[9px] font-bold px-1.5 py-0.5 rounded-full ${a.pill} ${a.pillText}`}>{detail}</span>
      ) : null}
    </div>
  );
};

const Ranking = ({ title, rows, color = 'bg-blue-600' }: { title: string; rows: Array<{ name: string; total: number; specialty_name?: string; specialty_color?: string; specialty_icon?: string }>; color?: string }) => {
  const maxVal = Math.max(...rows.map((r) => r.total), 1);
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm flex flex-col h-[320px]">
      <p className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-4 border-b border-slate-100 pb-2 shrink-0">{title}</p>
      {rows.length === 0 ? (
        <p className="text-xs text-slate-400 py-4 text-center">Sem dados no período correspondente.</p>
      ) : (
        <div className="space-y-3.5 overflow-y-auto pr-1 flex-1">
          {rows.map((row) => {
            const percentage = Math.round((row.total / maxVal) * 100);
            const barBgColor = row.specialty_color || '';
            const IconComponent = (row.specialty_icon && SPECIALTY_ICONS[row.specialty_icon]) || null;
            return (
              <div key={`${title}-${row.name}`} className="space-y-1 pr-1">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-1.5 truncate">
                    {IconComponent && (
                      <div 
                        className="w-5 h-5 rounded-lg flex items-center justify-center shrink-0 border"
                        style={{
                          backgroundColor: `${row.specialty_color || '#64748b'}15`,
                          color: row.specialty_color || '#64748b',
                          borderColor: `${row.specialty_color || '#64748b'}30`,
                        }}
                      >
                        <IconComponent className="h-3 w-3" />
                      </div>
                    )}
                    <span className="truncate text-slate-600 font-semibold" title={row.name}>{row.name}</span>
                    {row.specialty_name && (
                      <span 
                        className="inline-flex items-center px-1.5 py-0.2 rounded-md text-[9px] font-extrabold uppercase tracking-wider shrink-0"
                        style={{
                          backgroundColor: `${row.specialty_color || '#64748b'}15`,
                          color: row.specialty_color || '#64748b',
                          border: `1px solid ${row.specialty_color || '#64748b'}30`
                        }}
                      >
                        {row.specialty_name}
                      </span>
                    )}
                  </div>
                  <span className="font-bold text-slate-900 shrink-0 bg-slate-100 px-1.5 py-0.5 rounded text-[10px]">{row.total}</span>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <div 
                    style={{ 
                      width: `${percentage}%`,
                      backgroundColor: barBgColor || undefined
                    }} 
                    className={barBgColor ? "h-full rounded-full transition-all duration-500" : `h-full rounded-full transition-all duration-500 ${color}`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const PeriodChartPanel = ({ data }: { data: Array<{ date: string; total: number }> }) => {
  const maxTotal = Math.max(...data.map((d) => d.total), 0);
  const peakDays = data.filter((d) => d.total === maxTotal && d.total > 0);

  const CustomDot = (props: any) => {
    const { cx, cy, value } = props;
    if (value === maxTotal && maxTotal > 0) {
      return (
        <g key={`dot-${cx}-${cy}`}>
          <circle cx={cx} cy={cy} r={8} fill="#EF4444" opacity={0.3} className="animate-ping" style={{ transformOrigin: `${cx}px ${cy}px` }} />
          <circle cx={cx} cy={cy} r={5} fill="#EF4444" stroke="#FFFFFF" strokeWidth={1.5} />
        </g>
      );
    }
    return <path d="" />;
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm flex flex-col h-[280px] w-full">
      <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-2 shrink-0">
        <p className="font-bold text-slate-800 text-xs uppercase tracking-wider">Gráfico por Período</p>
        {peakDays.length > 0 && (
          <div className="flex items-center gap-1.5 bg-rose-50 border border-rose-100 rounded-full px-2.5 py-0.5 text-[10px] font-bold text-rose-700 animate-pulse">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
            </span>
            Pico de Atendimento: {peakDays.map(d => d.date).join(', ')} ({maxTotal} consultas)
          </div>
        )}
      </div>
      {data.length === 0 ? (
        <p className="text-xs text-slate-400 py-4 text-center flex-1 flex items-center justify-center">Sem dados no período correspondente.</p>
      ) : (
        <div className="flex-1 w-full min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 15, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
              <XAxis 
                dataKey="date" 
                tickLine={false} 
                axisLine={false} 
                fontSize={10} 
                tick={{ fill: '#64748B' }} 
              />
              <YAxis 
                tickLine={false} 
                axisLine={false} 
                fontSize={10} 
                tick={{ fill: '#64748B' }} 
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#FFFFFF', 
                  border: '1px solid #E2E8F0', 
                  borderRadius: '8px', 
                  fontSize: '11px',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                }}
                labelStyle={{ fontWeight: 'bold', color: '#1E293B' }}
                itemStyle={{ color: '#2563EB' }}
                formatter={(value: number) => [`${value} atendimentos`, 'Quantidade']}
                labelFormatter={(label: string) => `Data: ${label}`}
              />
              <Area 
                type="monotone" 
                dataKey="total" 
                stroke="#2563EB" 
                strokeWidth={2} 
                fillOpacity={1} 
                fill="url(#colorTotal)" 
                dot={CustomDot}
                activeDot={{ r: 6, strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};

export default Reports;

