import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type PageHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  compact?: boolean;
  titleClassName?: string;
  descriptionClassName?: string;
  actionsClassName?: string;
  loading?: boolean;
}; 

const PageHeader = ({
  title,
  description,
  actions,
  children,
  className,
  titleClassName,
  descriptionClassName,
  actionsClassName,
  loading = false,
}: PageHeaderProps) => {
  return (
    <div
      className={cn(
        'flex-none bg-white p-4 md:p-5 border-b border-slate-200 sticky top-0 z-10 -mx-3 mt-0 mb-3 px-6 shadow-sm overflow-hidden relative',
        className,
      )}
    >
      {loading && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-blue-50 overflow-hidden z-50">
          <div className="h-full bg-blue-600 w-1/2 rounded animate-progress-bar" />
        </div>
      )}
      {/* Top row: Title and Subtitle on the left, Actions on the right */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className={cn('text-2xl md:text-3xl font-extrabold tracking-tight text-[#00427A] drop-shadow-sm', titleClassName)}>
            {title}
          </h1>
          {description ? (
            <div className={cn('mt-1 text-xs md:text-[13px] font-bold text-slate-500 uppercase tracking-widest leading-relaxed', descriptionClassName)}>
              {description}
            </div>
          ) : null}
        </div>

        {actions ? (
          <div className={cn('flex flex-wrap gap-2 sm:gap-3 justify-start sm:justify-end items-center shrink-0 self-start sm:self-center', actionsClassName)}>
            {actions}
          </div>
        ) : null}
      </div>

      {/* Bottom row: Filters and Controls placed strictly BELOW the subtitle */}
      {children ? (
        <div className="mt-3 pt-3 border-t border-slate-100 w-full flex flex-col gap-2.5">
          {children}
        </div>
      ) : null}
    </div>
  );
};

export default PageHeader;
