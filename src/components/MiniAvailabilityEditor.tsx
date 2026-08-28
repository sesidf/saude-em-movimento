import React, { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, Trash2, AlertTriangle } from 'lucide-react';
import { chamarApiPost, chamarApiGet } from '@/lib/workerApi';
import { toast } from 'sonner';
import { buildIdempotencyKey } from '@/lib/idempotency';
import { cn } from '@/lib/utils';

interface MiniAvailabilityEditorProps {
  doctorId: string;
  weekday: number;
  weekdayLabel: string;
  item: any; // AvailabilityRow
  canManageAvailability: boolean;
  onSuccess: () => void;
  children: React.ReactNode;
}

export function MiniAvailabilityEditor({
  doctorId,
  weekday,
  weekdayLabel,
  item,
  canManageAvailability,
  onSuccess,
  children
}: MiniAvailabilityEditorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  const [isActive, setIsActive] = useState(item ? item.is_active : true);
  const [startsAt, setStartsAt] = useState(item ? item.starts_at.slice(0, 5) : '08:00');
  const [endsAt, setEndsAt] = useState(item ? item.ends_at.slice(0, 5) : '17:00');
  const [slotMinutes, setSlotMinutes] = useState(item ? item.slot_minutes : 5);

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open) {
      setIsActive(item ? item.is_active : true);
      setStartsAt(item ? item.starts_at.slice(0, 5) : '08:00');
      setEndsAt(item ? item.ends_at.slice(0, 5) : '17:00');
      setSlotMinutes(item ? item.slot_minutes : 5);
      setShowDeleteConfirm(false);
    }
  };

  const toMinutes = (timeStr: string) => {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + (m || 0);
  };

  const handleSave = async () => {
    if (!canManageAvailability) return;
    
    if (toMinutes(startsAt) >= toMinutes(endsAt)) {
      toast.error('O horário de início deve ser anterior ao término.');
      return;
    }

    setIsSaving(true);
    try {
      const idempotencyKey = await buildIdempotencyKey('schedule_admin_mini_editor', {
        doctor_id: doctorId,
        weekday,
        starts_at: startsAt,
        ends_at: endsAt,
        is_active: isActive,
        slot_minutes: slotMinutes,
      });

      const { error } = await chamarApiPost('/api/rpc/api_set_doctor_availability', {
        p_doctor_id: doctorId,
        p_weekday: weekday,
        p_starts_at: startsAt,
        p_ends_at: endsAt,
        p_slot_minutes: slotMinutes,
        p_is_active: isActive,
        p_idempotency_key: idempotencyKey,
        p_availability_id: item ? item.availability_id : null,
      });

      if (error) throw error;
      toast.success(item ? 'Escala atualizada com sucesso!' : 'Escala cadastrada com sucesso!');
      setIsOpen(false);
      onSuccess();
    } catch (error) {
      console.error('Erro ao salvar escala:', error);
      toast.error('Erro ao salvar escala. Tente novamente.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteConfirmed = async () => {
    if (!item || !canManageAvailability) return;
    
    setIsSaving(true);
    try {
      const idempotencyKey = await buildIdempotencyKey('schedule_admin_mini_deactivate', {
        availability_id: item.availability_id,
        is_active: false,
      });
      const { error } = await chamarApiPost('/api/rpc/api_set_doctor_availability', {
        p_institution_id: null,
        p_doctor_id: item.doctor_id,
        p_weekday: item.weekday,
        p_starts_at: item.starts_at,
        p_ends_at: item.ends_at,
        p_slot_minutes: item.slot_minutes,
        p_is_active: false,
        p_idempotency_key: idempotencyKey,
        p_availability_id: item.availability_id,
      });
      if (error) throw error;
      toast.success('Escala desativada com sucesso!');
      setIsOpen(false);
      onSuccess();
    } catch (error) {
      console.error('Erro ao excluir:', error);
      toast.error('Erro ao desativar escala.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        {children}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-3 rounded-2xl bg-white shadow-xl border border-slate-200">
        {showDeleteConfirm ? (
          /* ── Painel de confirmação de exclusão ── */
          <div className="space-y-3">
            <div className="flex flex-col items-center text-center gap-2 py-1">
              <div className="h-10 w-10 rounded-full bg-rose-50 flex items-center justify-center border border-rose-100">
                <AlertTriangle className="h-5 w-5 text-rose-500" />
              </div>
              <p className="text-xs font-bold text-slate-800 leading-snug">
                Excluir escala de <span className="text-rose-600">{weekdayLabel}</span>?
              </p>
              <p className="text-[10px] text-slate-400 font-medium leading-relaxed">
                Esta ação não pode ser desfeita.
              </p>
            </div>
            <div className="flex gap-1.5 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isSaving}
                className="h-8 flex-1 rounded-xl text-xs font-bold text-slate-600"
              >
                Cancelar
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleDeleteConfirmed}
                disabled={isSaving}
                className="h-8 flex-1 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold"
              >
                {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Excluir'}
              </Button>
            </div>
          </div>
        ) : (
          /* ── Painel de edição normal ── */
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">{weekdayLabel}</span>
              <div className="flex items-center gap-1.5">
                <span className={cn("text-[10px] font-bold uppercase", isActive ? "text-emerald-600" : "text-rose-500")}>
                  {isActive ? 'Ativo' : 'Inativo'}
                </span>
                <Switch 
                  checked={isActive} 
                  onCheckedChange={setIsActive} 
                  disabled={!canManageAvailability || isSaving}
                  className="scale-75"
                />
              </div>
            </div>
            
            <div className="flex gap-2">
              <div className="space-y-1 flex-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Início</label>
                <Input
                  type="time"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                  disabled={!canManageAvailability || isSaving}
                  className="h-8 text-xs font-semibold px-2"
                />
              </div>
              <div className="space-y-1 flex-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Fim</label>
                <Input
                  type="time"
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                  disabled={!canManageAvailability || isSaving}
                  className="h-8 text-xs font-semibold px-2"
                />
              </div>
            </div>

            <div className="flex gap-1.5 pt-2">
              {item && canManageAvailability && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={isSaving}
                  className="h-8 px-2 border-rose-200 text-rose-600 hover:bg-rose-50 rounded-xl"
                  title="Excluir escala"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                onClick={handleSave}
                disabled={!canManageAvailability || isSaving}
                className="h-8 flex-1 bg-[#003B71] hover:bg-[#002a52] text-white rounded-xl text-xs font-bold"
              >
                {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Salvar'}
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
