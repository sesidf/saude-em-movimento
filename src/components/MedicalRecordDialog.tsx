"use client";

import React, { useState, useEffect, useCallback, FormEvent } from 'react';
import { CheckCircle2, ClipboardList, Loader2, Lock, Save, Stethoscope } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { censorCPF } from '@/utils/masks';
import { Textarea } from '@/components/ui/textarea';
import { buildIdempotencyKey } from '@/lib/idempotency';
import { chamarApiPost, chamarApiGet } from '@/lib/workerApi';
import { formatarRegistroProfissional } from '@/utils/formatar-registro';

interface MedicalRecordDialogProps {
  open: boolean;
  onClose: () => void;
  appointmentId: string;
  onSuccess: () => void;
  allowClinicalActions?: boolean;
  initialData?: {
    anamnesis?: string | null;
    diagnosis?: string | null;
    appointment_date?: string | null;
    patient_name?: string | null;
    patient_cpf?: string | null;
    patient_gender?: string | null;
    doctor_name?: string | null;
    doctor_crm?: string | null;
    doctor_council?: string | null;
    doctor_registration_label?: string | null;
    specialty_name?: string | null;
  };
  mode?: 'create' | 'view' | 'edit';
}

const MedicalRecordDialog = ({ open, onClose, appointmentId, onSuccess, initialData, mode = 'create', allowClinicalActions = true }: MedicalRecordDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [encounterId, setEncounterId] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const [snapshotContext, setSnapshotContext] = useState<MedicalRecordDialogProps['initialData'] | null>(null);
  const [formData, setFormData] = useState({
    anamnesis: initialData?.anamnesis || '',
    diagnosis: initialData?.diagnosis || '',
  });

  const [hasRestoredDraft, setHasRestoredDraft] = useState(false);

  const clearLocalDraft = useCallback(() => {
    try {
      sessionStorage.removeItem(`medco_draft_encounter_${appointmentId}`);
      setHasRestoredDraft(false);
    } catch (e) {
      // Ignora erro de acesso ao sessionStorage
    }
  }, [appointmentId]);

  const discardDraft = useCallback(() => {
    clearLocalDraft();
    if (snapshotContext || initialData) {
      const appt = snapshotContext || initialData || {};
      setFormData({
        anamnesis: appt.anamnesis || '',
        diagnosis: appt.diagnosis || '',
      });
    }
    toast.info('Rascunho descartado.');
  }, [clearLocalDraft, initialData, snapshotContext]);

  const buildClinicalPayload = () => ({
    anamnesis: formData.anamnesis,
    diagnosis: formData.diagnosis,
  });

  // Auto-save em tempo real no sessionStorage
  useEffect(() => {
    if (!open || mode === 'view' || !appointmentId) return;
    const draftKey = `medco_draft_encounter_${appointmentId}`;
    const timeout = setTimeout(() => {
      try {
        const hasContent = Object.values(formData).some(val => val && val.trim() !== '');
        if (hasContent) {
          sessionStorage.setItem(draftKey, JSON.stringify(formData));
        }
      } catch (e) {
        // Ignora erro de sessionStorage
      }
    }, 500);

    return () => clearTimeout(timeout);
  }, [formData, open, mode, appointmentId]);

  // Carregamento de snapshot do atendimento e dados iniciais
  useEffect(() => {
    if (!open || !appointmentId) return;

    setAccessDenied(false);
    setEncounterId(null);
    setSnapshotContext(null);

    setFormData({
      anamnesis: initialData?.anamnesis || '',
      diagnosis: initialData?.diagnosis || '',
    });

    const loadEncounterSnapshot = async () => {
      try {
        const { data, error } = await chamarApiPost('/api/rpc/get_encounter_snapshot', { p_appointment_id: appointmentId });
        if (error) throw error;

        const snapshot = (data || {}) as {
          encounter_id?: string | null;
          clinical_data?: Partial<typeof formData>;
          appointment?: MedicalRecordDialogProps['initialData'];
        };
        setEncounterId(snapshot.encounter_id || null);
        setSnapshotContext(snapshot.appointment || null);
        const appt = snapshot.appointment || {};
        const payload = snapshot.clinical_data || {};
        
        let loadedData = {
          anamnesis: payload.anamnesis || appt.anamnesis || initialData?.anamnesis || '',
          diagnosis: payload.diagnosis || appt.diagnosis || initialData?.diagnosis || '',
        };

        try {
          const draftKey = `medco_draft_encounter_${appointmentId}`;
          const savedDraft = sessionStorage.getItem(draftKey);
          if (savedDraft && mode !== 'view') {
            const parsed = JSON.parse(savedDraft);
            const hasDraftContent = Object.values(parsed).some(v => v && String(v).trim() !== '');
            if (hasDraftContent) {
              loadedData = { ...loadedData, ...parsed };
              setHasRestoredDraft(true);
            }
          }
        } catch (e) {
          // Ignora erro de leitura do storage
        }

        setFormData(loadedData);
      } catch (err: any) {
        console.error('[MedicalRecordDialog] Erro ao carregar snapshot:', err);
        if (err.message?.includes('Acesso negado') || err.code === '42501' || err.message?.includes('permissao')) {
          setAccessDenied(true);
        }
      }
    };

    void loadEncounterSnapshot();
  }, [open, appointmentId, initialData, mode]);

  const handleSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    setLoading(true);

    try {
      const payload = buildClinicalPayload();
      let activeEncounterId = encounterId;

      if (!activeEncounterId) {
        const { data: startData, error: startErr } = await chamarApiPost('/api/rpc/start_encounter', {
          p_appointment_id: appointmentId,
          p_idempotency_key: buildIdempotencyKey('start_encounter', appointmentId),
        });
        if (startErr) throw startErr;
        activeEncounterId = (startData as any)?.encounter_id || startData;
        setEncounterId(activeEncounterId);
      }

      if (activeEncounterId) {
        const { error: entryErr } = await chamarApiPost('/api/rpc/add_medical_record_entry', {
          p_encounter_id: activeEncounterId,
          p_entry_type: 'evolucao',
          p_clinical_data: payload,
          p_idempotency_key: buildIdempotencyKey('add_entry', `${activeEncounterId}_${Date.now()}`),
        });
        if (entryErr) throw entryErr;
      }

      clearLocalDraft();
      toast.success(mode === 'edit' ? 'Prontuário atualizado com sucesso!' : 'Rascunho salvo com sucesso!');
      onSuccess();
      if (mode === 'edit') {
        onClose();
      }
    } catch (err: any) {
      console.error('[MedicalRecordDialog] Erro ao salvar:', err);
      toast.error(err.message || 'Erro ao salvar prontuário.');
    } finally {
      setLoading(false);
    }
  };

  const handleFinalize = async () => {
    if (!allowClinicalActions) return;

    setLoading(true);
    try {
      const payload = buildClinicalPayload();

      let activeEncounterId = encounterId;
      if (!activeEncounterId) {
        const { data: startData, error: startErr } = await chamarApiPost('/api/rpc/start_encounter', {
          p_appointment_id: appointmentId,
          p_idempotency_key: buildIdempotencyKey('start_encounter', appointmentId),
        });
        if (startErr) throw startErr;
        activeEncounterId = (startData as any)?.encounter_id || startData;
      }

      const { error: finalizeErr } = await chamarApiPost('/api/rpc/api_finalize_encounter', {
        p_encounter_id: activeEncounterId,
        p_final_data: payload,
        p_idempotency_key: buildIdempotencyKey('finalize_encounter', activeEncounterId || appointmentId),
      });
      if (finalizeErr) throw finalizeErr;

      clearLocalDraft();
      toast.success('Atendimento finalizado com sucesso!');
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('[MedicalRecordDialog] Erro ao finalizar:', err);
      toast.error(err.message || 'Erro ao finalizar atendimento.');
    } finally {
      setLoading(false);
    }
  };

  const effectiveContext = snapshotContext || initialData;
  const isReadOnly = mode === 'view' || !allowClinicalActions;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 overflow-hidden rounded-2xl border-0 shadow-2xl bg-white">
        <DialogTitle className="sr-only">Prontuário Médico de Atendimento</DialogTitle>
        <DialogDescription className="sr-only">Registro e visualização do que foi feito na consulta.</DialogDescription>

        {/* ── Header ─────────────────────────────────────── */}
        <div
          className="flex-none relative px-7 pt-6 pb-5 pr-14 overflow-hidden"
          style={{
            backgroundImage: 'url(/images/fundo-m.png)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          {/* Overlay escuro sobre a imagem — opacidade alta para legibilidade */}
          <div className="absolute inset-0 bg-[#002A54]/[0.97] pointer-events-none" />

          {/* Brilho sutil no canto superior direito */}
          <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-white/4 blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col md:flex-row md:items-start justify-between gap-4">

            {/* Paciente */}
            <div className="flex items-center gap-3.5">
              <div>
                <p className="text-[10px] font-bold text-white/50 uppercase tracking-widest mb-0.5">Prontuário Clínico</p>
                <h2 className="text-lg font-black text-white leading-tight tracking-tight drop-shadow-sm">
                  {effectiveContext?.patient_name || 'Paciente'}
                </h2>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  {effectiveContext?.patient_cpf && (
                    <span className="text-[11px] font-mono text-white/65 bg-white/10 px-2 py-0.5 rounded-md backdrop-blur-sm border border-white/10">
                      CPF: {censorCPF(effectiveContext.patient_cpf)}
                    </span>
                  )}
                  {effectiveContext?.patient_gender && (
                    <span className="text-[11px] font-semibold text-white/65 bg-white/10 px-2 py-0.5 rounded-md capitalize backdrop-blur-sm border border-white/10">
                      {effectiveContext.patient_gender}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Profissional */}
            <div className="flex flex-col md:items-end gap-1 select-none">
              <span className="text-[10px] font-bold text-white/50 uppercase tracking-widest flex items-center gap-1.5">
                <Stethoscope className="h-3 w-3" /> Responsável
              </span>
              <span className="text-sm font-bold text-white drop-shadow-sm">
                {effectiveContext?.doctor_name || 'Profissional Responsável'}
              </span>
              <div className="flex items-center gap-2 mt-0.5">
                {(effectiveContext?.doctor_registration_label || effectiveContext?.doctor_crm) && (
                  <span className="text-[11px] font-semibold text-white/75 bg-white/10 px-2 py-0.5 rounded-md border border-white/15 backdrop-blur-sm">
                    {formatarRegistroProfissional((effectiveContext as Record<string, unknown>)?.doctor_council as string, effectiveContext?.doctor_crm)}
                  </span>
                )}
                {effectiveContext?.specialty_name && (
                  <span className="text-[10px] font-bold text-[#7DD3F8] uppercase bg-white/10 px-2 py-0.5 rounded-md border border-white/15 tracking-wider backdrop-blur-sm">
                    {effectiveContext.specialty_name}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>


        {/* Rascunho restaurado */}
        {hasRestoredDraft && !isReadOnly && (
          <div className="flex-none bg-amber-50 border-b border-amber-200/70 px-7 py-2.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-800">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
              </span>
              Rascunho não salvo restaurado automaticamente da sua sessão anterior.
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={discardDraft}
              className="h-6 px-2.5 text-[11px] font-bold text-amber-700 hover:bg-amber-100 hover:text-amber-900 rounded-lg shrink-0"
            >
              Descartar
            </Button>
          </div>
        )}

        {/* ── Body ───────────────────────────────────────── */}
        {accessDenied ? (
          <div className="flex-1 flex flex-col items-center justify-center p-10 text-center">
            <div className="bg-red-50 text-red-400 rounded-full p-5 mb-4 shadow-inner border border-red-100">
              <Lock className="h-9 w-9" />
            </div>
            <h3 className="text-lg font-black text-slate-800 mb-2 tracking-tight">Acesso Restrito — Sigilo Médico</h3>
            <p className="text-sm text-slate-500 font-medium max-w-sm leading-relaxed">
              Por diretrizes de privacidade e sigilo médico, o conteúdo deste prontuário só pode ser acessado pelo profissional responsável ou pela auditoria médica.
            </p>
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <form onSubmit={handleSubmit} className="p-7 space-y-5">

              {/* Card: Evolução Clínica */}
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
                <div className="px-5 py-3.5 bg-slate-50/70 border-b border-slate-100 flex items-center gap-2.5">
                  <div className="h-7 w-7 rounded-lg bg-[#003B71]/8 flex items-center justify-center">
                    <ClipboardList className="h-3.5 w-3.5 text-[#003B71]" />
                  </div>
                  <h3 className="text-xs font-black text-[#003B71] uppercase tracking-widest select-none">
                    O que foi feito nesta consulta
                  </h3>
                  <span
                    className="ml-auto text-[10px] font-bold bg-[#eef8fc] text-[#3CA2C8] rounded-full w-4 h-4 flex items-center justify-center cursor-help hover:scale-110 transition-transform select-none"
                    title="Registro detalhado dos procedimentos, orientações, condutas e evolução clínica realizada nesta consulta."
                  >?</span>
                </div>
                <div className="p-5">
                  <Textarea
                    value={formData.anamnesis}
                    onChange={(e) => setFormData({ ...formData, anamnesis: e.target.value })}
                    rows={11}
                    disabled={isReadOnly}
                    className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50/40 px-4 py-3 text-sm text-slate-800 placeholder-slate-400 leading-relaxed focus:outline-none focus:border-[#3CA2C8] focus:ring-2 focus:ring-[#3CA2C8]/15 focus:bg-white transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
                    placeholder="Descreva detalhadamente o que foi feito nesta consulta: procedimentos realizados, orientações dadas, condutas clínicas e evolução do paciente..."
                  />
                  {!isReadOnly && (
                    <p className="mt-2 text-[11px] text-slate-400 font-medium">Salvo automaticamente enquanto você digita.</p>
                  )}
                </div>
              </div>

            </form>
          </div>
        )}

        {/* ── Footer ─────────────────────────────────────── */}
        {!isReadOnly && !accessDenied && (
          <div className="flex-none px-7 py-4 bg-slate-50/80 border-t border-slate-200/60 flex justify-end gap-2.5 items-center">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="inline-flex items-center gap-2 h-9 px-4 rounded-xl text-sm font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 hover:border-slate-300 active:scale-[0.97] transition-all duration-150 disabled:opacity-50 select-none cursor-pointer shadow-xs"
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={() => { void handleSubmit(); }}
              disabled={loading}
              className="inline-flex items-center gap-2 h-9 px-4 rounded-xl text-sm font-semibold text-amber-800 bg-amber-50 border border-amber-200 hover:bg-amber-100 hover:border-amber-300 active:scale-[0.97] transition-all duration-150 disabled:opacity-50 shadow-xs select-none cursor-pointer"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin text-amber-600" /> : <Save className="h-4 w-4 text-amber-600" />}
              {mode === 'edit' ? 'Salvar Alterações' : 'Salvar Rascunho'}
            </button>

            {mode === 'create' && (
              <button
                type="button"
                onClick={() => { void handleFinalize(); }}
                disabled={loading}
                className="inline-flex items-center gap-2 h-9 px-5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 active:scale-[0.97] transition-all duration-200 disabled:opacity-50 shadow-sm shadow-emerald-500/20 hover:shadow-md hover:shadow-emerald-500/30 border-0 select-none cursor-pointer"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Finalizar Consulta
              </button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default MedicalRecordDialog;
