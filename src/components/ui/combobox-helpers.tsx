
import { Stethoscope } from 'lucide-react';
import { SPECIALTY_ICONS } from '@/pages/Specialties';

export interface BaseDoctorOption {
  id: string;
  full_name?: string | null;
  specialty_name?: string | null;
  specialty_icon?: string | null;
  specialty_color?: string | null;
}

export const renderDoctorOption = (doctor: BaseDoctorOption) => {
  const nomeMaiusculo = (doctor.full_name || 'Profissional').toUpperCase();
  const label = `${nomeMaiusculo} ${doctor.specialty_name ? `(${doctor.specialty_name.toUpperCase()})` : ''}`;
  
  return {
    value: doctor.id,
    label,
    render: (
      <div className="flex items-center justify-between gap-3 py-0.5 w-full whitespace-nowrap">
        <span className="font-semibold text-slate-800 text-xs uppercase whitespace-nowrap">{nomeMaiusculo}</span>
        {doctor.specialty_name && (() => {
          const Icon = doctor.specialty_icon && SPECIALTY_ICONS[doctor.specialty_icon]
            ? SPECIALTY_ICONS[doctor.specialty_icon]
            : Stethoscope;
          return (
            <span
              className="rounded-[4px] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 shrink-0"
              style={{
                backgroundColor: `${doctor.specialty_color || '#8b5cf6'}15`,
                color: doctor.specialty_color || '#7c3aed',
                border: `1px solid ${doctor.specialty_color || '#8b5cf6'}30`
              }}
            >
              <Icon className="h-3 w-3" />
              {doctor.specialty_name.toUpperCase()}
            </span>
          );
        })()}
      </div>
    )
  };
};

export interface BaseSpecialtyOption {
  id: string;
  name?: string;
  icon?: string | null;
  color?: string | null;
}

export const SpecialtyBadge = ({ spec }: { spec: BaseSpecialtyOption }) => {
  const bgHex = spec.color || '#64748b';
  const name = spec.name || 'Especialidade';
  
  const Icon = spec.icon && SPECIALTY_ICONS[spec.icon]
    ? SPECIALTY_ICONS[spec.icon]
    : Stethoscope;

  return (
    <>
      <div 
        className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 border"
        style={{
          backgroundColor: `${bgHex}15`,
          color: bgHex,
          borderColor: `${bgHex}30`,
        }}
      >
        <Icon className="h-3 w-3" />
      </div>
      <span className="font-bold text-slate-800 text-[10px] uppercase tracking-wider">{name}</span>
    </>
  );
};

export const renderSpecialtyOption = (spec: BaseSpecialtyOption) => {
  return {
    value: spec.id,
    label: spec.name || 'Especialidade',
    render: (
      <div className="flex items-center gap-2 truncate">
        <SpecialtyBadge spec={spec} />
      </div>
    )
  };
};

import { Clock, CheckCircle, Activity, CheckCheck, XCircle, UserX, RefreshCw, Calendar, Microscope } from 'lucide-react';

const STATUS_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
  agendado: { label: 'Agendado', icon: Clock, color: 'text-amber-600 bg-amber-500/15 border-amber-500/30' },
  confirmado: { label: 'Confirmado', icon: CheckCircle, color: 'text-blue-600 bg-blue-500/15 border-blue-500/30' },
  em_atendimento: { label: 'Em Atendimento', icon: Activity, color: 'text-purple-600 bg-purple-500/15 border-purple-500/30' },
  concluido: { label: 'Concluído', icon: CheckCheck, color: 'text-emerald-600 bg-emerald-500/15 border-emerald-500/30' },
  cancelado: { label: 'Cancelado', icon: XCircle, color: 'text-rose-600 bg-rose-500/15 border-rose-500/30' },
  nao_compareceu: { label: 'Faltou', icon: UserX, color: 'text-slate-600 bg-slate-500/15 border-slate-500/30' },
  reagendado: { label: 'Reagendado', icon: RefreshCw, color: 'text-indigo-600 bg-indigo-500/15 border-indigo-500/30' },
  all: { label: 'Todos os Status', icon: null, color: '' },
};

export const StatusBadge = ({ statusId, labelOverride }: { statusId: string; labelOverride?: string }) => {
  const config = STATUS_CONFIG[statusId] || { label: statusId, icon: null, color: 'text-slate-600 bg-slate-500/15 border-slate-500/30' };
  const label = labelOverride || config.label;
  const Icon = config.icon;

  if (statusId === 'all' || !Icon) {
    return <span className="font-medium text-slate-700">{label}</span>;
  }

  return (
    <>
      <div className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 border ${config.color}`}>
        <Icon className="h-3 w-3" />
      </div>
      <span className="font-medium text-slate-700">{label}</span>
    </>
  );
};

export const renderStatusOption = (statusId: string, labelOverride?: string) => {
  const config = STATUS_CONFIG[statusId] || { label: statusId };
  return {
    value: statusId,
    label: labelOverride || config.label,
    render: (
      <div className="flex items-center gap-2">
        <StatusBadge statusId={statusId} labelOverride={labelOverride} />
      </div>
    )
  };
};

const TYPE_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
  consulta: { label: 'Consulta', icon: Calendar, color: 'text-blue-600 bg-blue-500/15 border-blue-500/30' },
  retorno: { label: 'Retorno', icon: RefreshCw, color: 'text-emerald-600 bg-emerald-500/15 border-emerald-500/30' },
  exame: { label: 'Exame', icon: Microscope, color: 'text-orange-600 bg-orange-500/15 border-orange-500/30' },
  all: { label: 'Todos os tipos', icon: null, color: '' },
};

const TypeBadge = ({ typeId, labelOverride }: { typeId: string; labelOverride?: string }) => {
  const config = TYPE_CONFIG[typeId] || { label: typeId, icon: null, color: 'text-slate-600 bg-slate-500/15 border-slate-500/30' };
  const label = labelOverride || config.label;
  const Icon = config.icon;

  if (typeId === 'all' || !Icon) {
    return <span className="font-medium text-slate-700">{label}</span>;
  }

  return (
    <>
      <div className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 border ${config.color}`}>
        <Icon className="h-3 w-3" />
      </div>
      <span className="font-medium text-slate-700">{label}</span>
    </>
  );
};

const renderTypeOption = (typeId: string, labelOverride?: string) => {
  const config = TYPE_CONFIG[typeId] || { label: typeId };
  return {
    value: typeId,
    label: labelOverride || config.label,
    render: (
      <div className="flex items-center gap-2">
        <TypeBadge typeId={typeId} labelOverride={labelOverride} />
      </div>
    )
  };
};
