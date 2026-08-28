import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';

export const FormSectionTitle = ({ children, className }: { children: ReactNode; className?: string }) => (
  <h3 className={cn("text-[13px] font-bold uppercase tracking-wider text-blue-600 border-b border-slate-200 pb-2", className)}>
    {children}
  </h3>
);

export const FormGrid = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={cn("grid grid-cols-1 sm:grid-cols-2 md:grid-cols-12 gap-5", className)}>
    {children}
  </div>
);

interface FormFieldProps {
  label: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
  error?: string;
}

export const FormField = ({ label, required, children, className, error }: FormFieldProps) => (
  <div className={cn("space-y-2", className)}>
    <Label className="text-slate-700 font-semibold text-xs uppercase">
      {label} {required && <span className="text-red-500">*</span>}
    </Label>
    {children}
    {error && <span className="text-red-500 text-xs font-bold mt-1 block animate-fade-in">{error}</span>}
  </div>
);
