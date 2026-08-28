import React from 'react';
import { Button } from './button';
import { cn } from '@/lib/utils';

interface ActionButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> {
  onClick?: (e: React.MouseEvent) => void;
  icon: React.ReactNode;
  label?: string;
  titleTooltip?: string;
  primary?: boolean;
  danger?: boolean;
  disabled?: boolean;
  className?: string;
}

/**
 * Botão de ação para colunas de tabela.
 * Mostra ícone + texto (se fornecido) com tamanho adaptável.
 */
export const ActionButton = React.forwardRef<HTMLButtonElement, ActionButtonProps>(({ onClick, icon, label, titleTooltip, primary, danger, disabled, className, ...props }, ref) => {
  let variantClass = "bg-white hover:bg-slate-50 text-slate-700 border-slate-200 hover:border-slate-300 hover:text-slate-900"; // default outline
  
  if (primary) {
    variantClass = "bg-blue-50/50 hover:bg-blue-100/70 text-blue-700 border-blue-200/80 hover:border-blue-300 hover:text-blue-800";
  } else if (danger) {
    variantClass = "bg-rose-50/50 hover:bg-rose-100/70 text-rose-700 border-rose-200/80 hover:border-rose-300 hover:text-rose-800";
  }

  return (
    <Button
      ref={ref}
      title={titleTooltip}
      variant="outline"
      size={label ? "sm" : "icon"}
      className={cn(
        label ? "inline-flex items-center gap-1.5 h-8 px-2.5 whitespace-nowrap" : "h-8 w-8 shrink-0",
        "font-bold uppercase tracking-wider text-[11px] leading-none transition-all duration-200 hover:-translate-y-[0.5px] active:translate-y-[0.5px] shadow-sm hover:shadow-md active:shadow-none border",
        variantClass,
        className
      )}
      onClick={onClick}
      disabled={disabled}
      {...props}
    >
      <span className="shrink-0 flex items-center justify-center">
        {icon}
      </span>
      {label && (
        <span className="text-[10px] font-bold uppercase tracking-wider leading-none">
          {label}
        </span>
      )}
    </Button>
  );
});

ActionButton.displayName = "ActionButton";;
