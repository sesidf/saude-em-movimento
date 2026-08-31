"use client";

import React, { useState, useEffect } from 'react';
import { Loader2, Save, Stethoscope, FileText, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { appointmentService } from '@/servicos/appointments';

interface MedicalRecordDialogProps {
  open?: boolean;
  isOpen?: boolean;
  onClose?: () => void;
  onOpenChange?: (open: boolean) => void;
  appointmentId?: string;
  appointment?: any;
  onSuccess?: () => void;
  onSaveSuccess?: () => void;
  mode?: 'create' | 'view' | 'edit';
  allowClinicalActions?: boolean;
}

export const MedicalRecordDialog = ({
  open,
  isOpen,
  onClose,
  onOpenChange,
  appointmentId,
  appointment,
  onSuccess,
  onSaveSuccess,
}: MedicalRecordDialogProps) => {
  const isModalOpen = open !== undefined ? open : (isOpen || false);
  const handleClose = () => {
    if (onClose) onClose();
    if (onOpenChange) onOpenChange(false);
  };
  const handleSuccess = () => {
    if (onSuccess) onSuccess();
    if (onSaveSuccess) onSaveSuccess();
  };

  const apptId = appointmentId || appointment?.id;

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    diagnosis: '',
    prescription: '',
    notes: '',
    blood_pressure: '',
    weight: '',
    height: '',
    temperature: '',
  });

  useEffect(() => {
    if (!isModalOpen || !apptId) return;

    if (appointment) {
      setFormData({
        diagnosis: appointment.diagnosis || '',
        prescription: appointment.prescription || '',
        notes: appointment.notes || '',
        blood_pressure: appointment.blood_pressure || '',
        weight: appointment.weight ? String(appointment.weight) : '',
        height: appointment.height ? String(appointment.height) : '',
        temperature: appointment.temperature ? String(appointment.temperature) : '',
      });
    } else {
      setLoading(true);
      appointmentService.getById(apptId)
        .then((data) => {
          if (data) {
            setFormData({
              diagnosis: data.diagnosis || '',
              prescription: data.prescription || '',
              notes: data.notes || '',
              blood_pressure: data.blood_pressure || '',
              weight: data.weight ? String(data.weight) : '',
              height: data.height ? String(data.height) : '',
              temperature: data.temperature ? String(data.temperature) : '',
            });
          }
        })
        .catch((err) => {
          console.error('Erro ao carregar dados da consulta:', err);
        })
        .finally(() => setLoading(false));
    }
  }, [isModalOpen, apptId, appointment]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apptId) return;

    try {
      setSaving(true);
      await appointmentService.updateClinicalData(apptId, {
        diagnosis: formData.diagnosis.trim() || undefined,
        prescription: formData.prescription.trim() || undefined,
        notes: formData.notes.trim() || undefined,
        blood_pressure: formData.blood_pressure.trim() || undefined,
        weight: formData.weight ? parseFloat(formData.weight) : undefined,
        height: formData.height ? parseFloat(formData.height) : undefined,
        temperature: formData.temperature ? parseFloat(formData.temperature) : undefined,
      });

      toast.success('Prontuário clínico salvo com sucesso!');
      handleSuccess();
      handleClose();
    } catch (err: any) {
      console.error('Erro ao salvar prontuário:', err);
      toast.error(err.message || 'Erro ao salvar dados clínicos');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isModalOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-2xl p-6 bg-white rounded-3xl shadow-2xl border-0 overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl border border-blue-100">
              <Stethoscope className="w-6 h-6" />
            </div>
            <div>
              <DialogTitle className="text-2xl font-bold text-slate-800 tracking-tight">
                Registro Clínico & Prontuário
              </DialogTitle>
              <DialogDescription className="text-slate-500 font-medium">
                {appointment?.patient_name ? `Paciente: ${appointment.patient_name}` : 'Anotações médicas e prescrição da consulta.'}
              </DialogDescription>
            </div>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
              <span>Carregando dados da consulta...</span>
            </div>
          ) : (
            <form onSubmit={handleSave} className="flex flex-col gap-5">
              {/* Sinais Vitais */}
              <div>
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2.5">
                  Sinais Vitais & Medições
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">Pressão (PA)</label>
                    <Input
                      placeholder="120/80"
                      value={formData.blood_pressure}
                      onChange={(e) => setFormData({ ...formData, blood_pressure: e.target.value })}
                      className="h-10 rounded-xl bg-slate-50 border-slate-200 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">Peso (kg)</label>
                    <Input
                      type="number"
                      step="0.1"
                      placeholder="70.5"
                      value={formData.weight}
                      onChange={(e) => setFormData({ ...formData, weight: e.target.value })}
                      className="h-10 rounded-xl bg-slate-50 border-slate-200 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">Altura (cm)</label>
                    <Input
                      type="number"
                      step="1"
                      placeholder="175"
                      value={formData.height}
                      onChange={(e) => setFormData({ ...formData, height: e.target.value })}
                      className="h-10 rounded-xl bg-slate-50 border-slate-200 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">Temperatura (°C)</label>
                    <Input
                      type="number"
                      step="0.1"
                      placeholder="36.5"
                      value={formData.temperature}
                      onChange={(e) => setFormData({ ...formData, temperature: e.target.value })}
                      className="h-10 rounded-xl bg-slate-50 border-slate-200 text-xs font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Diagnóstico / Hipótese */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Diagnóstico / Hipótese Diagnóstica (CID)
                </label>
                <Textarea
                  rows={3}
                  placeholder="Descreva a avaliação médica e hipóteses diagnósticas..."
                  value={formData.diagnosis}
                  onChange={(e) => setFormData({ ...formData, diagnosis: e.target.value })}
                  className="rounded-2xl bg-slate-50 border-slate-200 text-sm p-3"
                />
              </div>

              {/* Prescrição Médica */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Prescrição / Conduta Médica / Medicamentos
                </label>
                <Textarea
                  rows={4}
                  placeholder="Medicamentos receitados, posologia e orientações ao paciente..."
                  value={formData.prescription}
                  onChange={(e) => setFormData({ ...formData, prescription: e.target.value })}
                  className="rounded-2xl bg-slate-50 border-slate-200 text-sm p-3 font-mono"
                />
              </div>

              {/* Observações Internas */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Observações & Anotações Internas
                </label>
                <Textarea
                  rows={2}
                  placeholder="Anotações para acompanhamento futuro..."
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="rounded-2xl bg-slate-50 border-slate-200 text-sm p-3"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 mt-2">
                <Button type="button" variant="outline" className="h-10 px-6 font-semibold" onClick={handleClose} disabled={saving}>
                  Cancelar
                </Button>
                <Button type="submit" className="h-10 px-6 font-semibold bg-blue-600 hover:bg-blue-700 font-bold" disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                  Salvar Prontuário
                </Button>
              </div>
            </form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default MedicalRecordDialog;
