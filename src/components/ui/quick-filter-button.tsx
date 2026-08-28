import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { 
  Timer, 
  Calendar, 
  CalendarDays, 
  CalendarRange, 
  CalendarClock, 
  History, 
  Infinity as InfinityIcon, 
  FilterX 
} from "lucide-react";

export interface QuickFilterButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  label?: React.ReactNode;
  icon?: React.ReactNode;
  variant?: 'filter' | 'clear';
}

const getStandardIcon = (label?: React.ReactNode, variant?: 'filter' | 'clear', active?: boolean) => {
  const iconColor = active ? "text-blue-600" : "text-slate-400";
  if (variant === 'clear') return <FilterX className="h-3.5 w-3.5 text-rose-500" />;
  if (typeof label !== 'string') return null;
  
  const clean = label.trim().toLowerCase();
  if (clean === '7 dias') return <Timer className={cn("h-3.5 w-3.5", iconColor)} />;
  if (clean === '15 dias') return <Calendar className={cn("h-3.5 w-3.5", iconColor)} />;
  if (clean === '30 dias') return <CalendarDays className={cn("h-3.5 w-3.5", iconColor)} />;
  if (clean === 'este mês') return <CalendarRange className={cn("h-3.5 w-3.5", iconColor)} />;
  if (clean === '90 dias') return <CalendarRange className={cn("h-3.5 w-3.5", iconColor)} />;
  if (clean === '180 dias') return <CalendarClock className={cn("h-3.5 w-3.5", iconColor)} />;
  if (clean === '365 dias') return <History className={cn("h-3.5 w-3.5", iconColor)} />;
  if (clean === 'tudo') return <InfinityIcon className={cn("h-3.5 w-3.5", iconColor)} />;
  if (clean === 'limpar') return <FilterX className="h-3.5 w-3.5 text-rose-500" />;
  
  return null;
};

/**
 * Botão padronizado para atalhos de filtros rápidos de período e ações de limpar.
 * Garante alinhamento visual perfeito, altura uniforme (h-8) e ícones padrão do sistema.
 */
export const QuickFilterButton = React.forwardRef<HTMLButtonElement, QuickFilterButtonProps>(
  ({ active = false, label, icon, variant = 'filter', className, children, ...props }, ref) => {
    const resolvedIcon = icon ?? getStandardIcon(label, variant, active);

    if (variant === 'clear') {
      return (
        <Button
          ref={ref}
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            "h-8 px-3 text-xs font-bold rounded-xl border border-rose-200/80 bg-rose-50/50 text-rose-600 hover:bg-rose-100/70 hover:border-rose-300 hover:text-rose-700 transition-all duration-200 shadow-2xs flex items-center gap-1.5 shrink-0",
            className
          )}
          {...props}
        >
          {resolvedIcon}
          {label ?? children}
        </Button>
      );
    }

    return (
      <Button
        ref={ref}
        type="button"
        variant="ghost"
        size="sm"
        className={cn(
          "h-8 px-3 text-xs font-bold rounded-xl border transition-all duration-200 shadow-2xs flex items-center gap-1.5 shrink-0",
          active
            ? "bg-blue-50 text-blue-700 border-blue-200/80 font-black shadow-2xs hover:bg-blue-100/80 hover:text-blue-800"
            : "bg-white text-slate-700 border-slate-200/90 hover:bg-slate-50 hover:text-slate-900 hover:border-slate-300",
          className
        )}
        {...props}
      >
        {resolvedIcon}
        {label ?? children}
      </Button>
    );
  }
);
QuickFilterButton.displayName = "QuickFilterButton";
