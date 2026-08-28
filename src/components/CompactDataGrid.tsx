"use client";

import { ReactNode, useState, useMemo, useEffect, useRef } from 'react';
import { Filter, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { PaginationControl } from './PaginationControl';
export type CompactDataGridColumn<T> = {
  key: string;
  header: ReactNode;
  headerTitle?: string;
  className?: string;
  cellClassName?: string;
  sticky?: 'right';
  render: (row: T) => ReactNode;
  filterable?: boolean;
  filterValue?: (row: T) => string;
  filterLabel?: (val: string) => ReactNode;
};

type CompactDataGridProps<T> = {
  columns: Array<CompactDataGridColumn<T>>;
  rows: T[];
  getRowKey: (row: T) => string;
  loading?: boolean;
  emptyMessage?: string | ReactNode;
  className?: string;
  minWidth?: string;
  rowClassName?: (row: T) => string;
  pagination?: boolean;
  itemsPerPage?: number;
  fixedItemsPerPage?: boolean;
  estimatedRowHeight?: number; // Permite passar altura customizada para o auto-cálculo
  resetPaginationDependency?: any;
};

function ColumnFilter<T>({
  column,
  rows,
  activeFilters,
  setActiveFilters,
}: {
  column: CompactDataGridColumn<T>;
  rows: T[];
  activeFilters: Record<string, Set<string>>;
  setActiveFilters: React.Dispatch<React.SetStateAction<Record<string, Set<string>>>>;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  
  const uniqueValues = useMemo(() => {
    if (!column.filterValue) return [];
    const values = new Set<string>();
    rows.forEach((row) => {
      const val = column.filterValue!(row);
      if (val !== undefined && val !== null && val !== '') {
        values.add(val);
      }
    });
    return Array.from(values).sort();
  }, [column, rows]);

  const activeSet = activeFilters[column.key];
  const isFiltered = activeSet !== undefined && activeSet.size > 0 && activeSet.size < uniqueValues.length;

  const filteredValues = useMemo(() => {
    if (!searchQuery) return uniqueValues;
    const lowerQuery = searchQuery.toLowerCase();
    return uniqueValues.filter(v => v.toLowerCase().includes(lowerQuery));
  }, [uniqueValues, searchQuery]);

  if (!column.filterable || !column.filterValue) {
    return <>{column.header}</>;
  }

  const isChecked = (val: string) => {
    if (!activeSet || activeSet.size === 0) return true;
    return activeSet.has(val);
  };

  const handleToggle = (val: string) => {
    setActiveFilters((prev) => {
      const next = { ...prev };
      const current = next[column.key] ? new Set(next[column.key]) : new Set(uniqueValues);
      
      if (current.has(val)) {
        current.delete(val);
      } else {
        current.add(val);
      }

      if (current.size === 0 || current.size === uniqueValues.length) {
        delete next[column.key];
      } else {
        next[column.key] = current;
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    setActiveFilters((prev) => {
      const next = { ...prev };
      const current = next[column.key] ? new Set(next[column.key]) : new Set(uniqueValues);
      const allFilteredChecked = filteredValues.every(v => current.has(v));

      if (allFilteredChecked) {
        filteredValues.forEach(v => current.delete(v));
      } else {
        filteredValues.forEach(v => current.add(v));
      }

      if (current.size === 0 || current.size === uniqueValues.length) {
        delete next[column.key];
      } else {
        next[column.key] = current;
      }
      return next;
    });
  };

  const handleClear = () => {
    setActiveFilters((prev) => {
      const next = { ...prev };
      delete next[column.key];
      return next;
    });
    setSearchQuery('');
  };

  const displayTitle = column.headerTitle || (typeof column.header === 'string' ? column.header : 'Coluna');

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex-1 overflow-hidden">{column.header}</div>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "p-1 rounded transition-colors focus:outline-none flex-shrink-0 cursor-pointer",
              isFiltered
                ? "text-blue-600 bg-blue-50 border border-blue-200/80 shadow-2xs"
                : "text-slate-400 hover:text-slate-600 hover:bg-slate-200/60"
            )}
            title={`Filtrar por ${displayTitle}`}
          >
            <Filter className="h-3 w-3" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0 shadow-lg border-slate-200/90 rounded-xl" align="start">
          <div className="px-3 pt-3 pb-1.5 border-b border-slate-50">
            <h4 className="text-xs font-bold text-slate-800 tracking-tight">
              Filtro de {displayTitle}
            </h4>
          </div>
          <div className="px-3 py-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              <Input
                placeholder="Pesquisar..."
                className="pl-8 h-8 text-xs bg-slate-50/70 border-slate-200 focus:bg-white rounded-lg transition-colors"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
          <div className="px-3 py-1 flex items-center justify-between text-[11px] font-semibold border-b border-slate-100 mb-1">
            <button
              type="button"
              onClick={handleSelectAll}
              className="text-slate-500 hover:text-blue-600 transition-colors cursor-pointer"
            >
              Marcar Todos
            </button>
            <button
              type="button"
              onClick={handleClear}
              className="text-slate-500 hover:text-rose-600 transition-colors cursor-pointer"
            >
              Limpar
            </button>
          </div>
          <div className="max-h-60 overflow-y-auto px-1.5 pb-2 space-y-0.5 text-slate-700">
            {filteredValues.length === 0 ? (
              <div className="p-3 text-xs text-center text-slate-400 italic">Nenhum valor encontrado</div>
            ) : (
              filteredValues.map((val) => {
                const checked = isChecked(val);
                return (
                  <label key={val} className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 rounded-md cursor-pointer text-xs select-none">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => handleToggle(val)}
                    />
                    <span className="truncate flex items-center gap-1.5 font-medium text-slate-700" title={val}>
                      {column.filterLabel ? column.filterLabel(val) : val}
                    </span>
                  </label>
                );
              })
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function CompactDataGrid<T>({
  columns,
  rows,
  getRowKey,
  loading = false,
  emptyMessage = 'Nenhum registro encontrado',
  className,
  minWidth = '900px',
  rowClassName,
  pagination = false,
  itemsPerPage = 50,
  fixedItemsPerPage = false,
  estimatedRowHeight = 48,
  resetPaginationDependency,
}: CompactDataGridProps<T>) {
  const [activeFilters, setActiveFilters] = useState<Record<string, Set<string>>>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [dynamicItemsPerPage, setDynamicItemsPerPage] = useState(itemsPerPage);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pagination || !containerRef.current || fixedItemsPerPage) {
      setDynamicItemsPerPage(itemsPerPage);
      return;
    }

    const calculateItems = () => {
      if (!containerRef.current) return;
      
      // Lógica Inteligente e Auto-Adaptativa
      const containerHeight = containerRef.current.clientHeight;
      
      // Se o container não tiver uma altura definida (ex: sem flex-1), fazemos o fallback
      // para o cálculo baseado na janela para garantir que sempre funcione.
      if (containerHeight < 200) {
        const rect = containerRef.current.getBoundingClientRect();
        const fallbackAvailableHeight = window.innerHeight - rect.top - 120; 
        setDynamicItemsPerPage(Math.max(1, Math.floor(fallbackAvailableHeight / estimatedRowHeight)));
        return;
      }
      
      // Altura disponível = Altura Total - Cabeçalho (~42px) - Paginação (~54px) - Margem de segurança (~14px)
      const availableHeight = containerHeight - 110; 
      
      const calculatedItems = Math.max(1, Math.floor(availableHeight / estimatedRowHeight));
      
      setDynamicItemsPerPage(calculatedItems);
    };

    // Calcular inicialmente
    calculateItems();

    // Re-calcular de forma inteligente ao redimensionar a tela
    const observer = new ResizeObserver(() => {
      // Usamos requestAnimationFrame para evitar erro de loop do ResizeObserver
      window.requestAnimationFrame(() => {
        calculateItems();
      });
    });

    observer.observe(containerRef.current);
    window.addEventListener('resize', calculateItems);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', calculateItems);
    };
  }, [pagination, itemsPerPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeFilters, resetPaginationDependency]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      return Object.entries(activeFilters).every(([colKey, activeValues]) => {
        if (!activeValues || activeValues.size === 0) return true;
        const colDef = columns.find((c) => c.key === colKey);
        if (!colDef || !colDef.filterValue) return true;
        const val = colDef.filterValue(row);
        return activeValues.has(val);
      });
    });
  }, [rows, activeFilters, columns]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / dynamicItemsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginatedRows = useMemo(() => {
    if (!pagination) return filteredRows;
    const startIndex = (safeCurrentPage - 1) * dynamicItemsPerPage;
    return filteredRows.slice(startIndex, startIndex + dynamicItemsPerPage);
  }, [filteredRows, pagination, safeCurrentPage, dynamicItemsPerPage]);

  return (
    <div className={cn("flex flex-col min-h-0", className)} ref={containerRef}>
      <div className={cn('isolate flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm flex-1')}>
        <div className="grid-scroll min-h-0 flex-1 overflow-auto">
          <table className="w-full border-collapse text-left text-xs" style={{ minWidth }}>
            <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm text-[11px] font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-200">
              <tr>
                {columns.map((column) => (
                  <th
                    key={column.key}
                    className={cn(
                      'px-3 py-3 font-semibold tracking-wider text-slate-500 border-b border-slate-200',
                      column.sticky === 'right' && 'sticky right-0 z-10 bg-slate-50/95 backdrop-blur-sm shadow-[-8px_0_12px_-12px_rgba(15,23,42,0.1)]',
                      column.className,
                    )}
                  >
                    <ColumnFilter 
                      column={column} 
                      rows={rows} 
                      activeFilters={activeFilters} 
                      setActiveFilters={setActiveFilters} 
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 7 }).map((_, rowIndex) => (
                  <tr key={`skel-row-${rowIndex}`}>
                    {columns.map((_col, colIndex) => (
                      <td key={`skel-col-${rowIndex}-${colIndex}`} className="px-4 py-3 align-middle border-b border-slate-100/60">
                        <Skeleton className="h-5 w-full max-w-[85%] rounded-md opacity-60" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : paginatedRows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-3 py-8 text-center text-slate-500">
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                paginatedRows.map((row) => (
                  <tr id={`row-${String(getRowKey(row))}`} key={getRowKey(row)} className={cn('group bg-white transition-colors hover:bg-blue-50/40', rowClassName?.(row))}>
                    {columns.map((column) => (
                      <td
                        key={column.key}
                        className={cn(
                          'px-4 py-3 align-middle text-slate-600 border-b border-slate-100/60',
                          column.sticky === 'right' && 'sticky right-0 z-[1] bg-inherit shadow-[-8px_0_12px_-12px_rgba(15,23,42,0.1)]',
                          column.cellClassName,
                        )}
                      >
                        {column.render(row)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {pagination && (
        <PaginationControl
          currentPage={safeCurrentPage}
          totalPages={totalPages}
          totalItems={filteredRows.length}
          onPageChange={setCurrentPage}
        />
      )}
    </div>
  );
}
