"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Calendar,
  CheckCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  Plus,
  Stethoscope,
  User,
  UserX,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { appointmentService, Appointment, AppointmentStatus } from '@/servicos/appointments';
import { doctorService, Doctor } from '@/servicos/doctors';
import { specialtyService, Specialty } from '@/servicos/specialties';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import MedicalRecordDialog from '@/components/MedicalRecordDialog';
import { maskCPF } from '@/utils/masks';

const Agenda = () => {
  const { hasRole } = useAuth();
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [selectedDoctorId, setSelectedDoctorId] = useState('all');
  const [selectedSpecialtyId, setSelectedSpecialtyId] = useState('all');

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedAppointmentForRecord, setSelectedAppointmentForRecord] = useState<Appointment | null>(null);
  const [isRecordDialogOpen, setIsRecordDialogOpen] = useState(false);

  const fetchAgendaData = useCallback(async () => {
    try {
      setLoading(true);
      const [appts, docs, specs] = await Promise.all([
        appointmentService.list({
          date: selectedDate,
          doctor_id: selectedDoctorId !== 'all' ? selectedDoctorId : undefined,
          specialty_id: selectedSpecialtyId !== 'all' ? selectedSpecialtyId : undefined,
        }),
        doctorService.list({ showAll: false }),
        specialtyService.list(),
      ]);
      setAppointments(appts || []);
      setDoctors(docs || []);
      setSpecialties(specs || []);
    } catch (err) {
      console.error('Erro ao carregar dados da agenda:', err);
      toast.error('Erro ao carregar a agenda');
    } finally {
      setLoading(false);
    }
  }, [selectedDate, selectedDoctorId, selectedSpecialtyId]);

  useEffect(() => {
    fetchAgendaData();
  }, [fetchAgendaData]);

  const handlePrevDay = () => {
    const d = new Date(`${selectedDate}T00:00:00`);
    d.setDate(d.getDate() - 1);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const handleNextDay = () => {
    const d = new Date(`${selectedDate}T00:00:00`);
    d.setDate(d.getDate() + 1);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const handleToday = () => {
    setSelectedDate(new Date().toISOString().split('T')[0]);
  };

  const handleStatusChange = async (id: string, status: AppointmentStatus) => {
    try {
      await appointmentService.updateStatus(id, status);
      setAppointments((prev) =>
        prev.map((a) => (a.id === id ? { ...a, status } : a))
      );
      toast.success(`Status da consulta alterado para '${status}'.`);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao alterar status');
    }
  };

  const sortedAppointments = useMemo(() => {
    return [...appointments].sort((a, b) =>
      a.appointment_date.localeCompare(b.appointment_date)
    );
  }, [appointments]);

  return (
    <div className="h-full min-h-0 bg-slate-100 px-3 pb-3 flex flex-col">
      <PageHeader
        title="Agenda Operacional"
        description="Visualização diária de consultas e fluxo de atendimento"
        className="mb-3"
        compact
        loading={loading}
      >
        <div className="flex flex-col md:flex-row flex-wrap w-full items-end gap-2 justify-end">
          {/* Navegação de Data */}
          <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 shadow-2xs">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handlePrevDay} title="Dia anterior">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" className="h-8 px-3 text-xs font-bold" onClick={handleToday}>
              Hoje
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleNextDay} title="Próximo dia">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex-none w-auto min-w-[140px]">
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="delphi-input h-9 w-full"
            />
          </div>

          <div className="flex-none w-auto min-w-[170px]">
            <Select value={selectedDoctorId} onValueChange={(val) => setSelectedDoctorId(val)}>
              <SelectTrigger className="delphi-input h-9 w-full">
                <SelectValue placeholder="Todos os Profissionais" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Médicos</SelectItem>
                {doctors.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex-none w-auto min-w-[160px]">
            <Select value={selectedSpecialtyId} onValueChange={(val) => setSelectedSpecialtyId(val)}>
              <SelectTrigger className="delphi-input h-9 w-full">
                <SelectValue placeholder="Todas Especialidades" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas Especialidades</SelectItem>
                {specialties.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </PageHeader>

      {/* Grid / Timeline de Consultas do Dia */}
      <div className="flex-1 min-h-0 bg-white rounded-2xl border border-slate-200 p-6 overflow-y-auto shadow-2xs">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-6">
          <div>
            <h2 className="text-lg font-bold text-slate-800">
              Grade do Dia:{' '}
              <span className="text-blue-600">
                {selectedDate.split('-').reverse().join('/')}
              </span>
            </h2>
            <p className="text-xs text-slate-400 font-medium">
              {sortedAppointments.length} atendimento(s) registrado(s) para esta data
            </p>
          </div>
        </div>

        {sortedAppointments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center text-slate-400">
            <Calendar className="w-12 h-12 stroke-1 text-slate-300 mb-3" />
            <p className="text-base font-bold text-slate-600">Nenhum atendimento para este dia</p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm">
              Altere os filtros acima ou a data para visualizar outros horários.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {sortedAppointments.map((appt) => {
              const time = appt.appointment_date.split('T')[1]?.substring(0, 5) || '00:00';
              return (
                <div
                  key={appt.id}
                  className="bg-slate-50/70 border border-slate-200/80 rounded-2xl p-5 flex flex-col justify-between hover:shadow-md hover:border-blue-300 transition-all gap-4"
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-sm font-extrabold bg-blue-50 text-blue-700 border border-blue-200">
                        <Clock className="w-4 h-4" /> {time}
                      </span>
                      <span className="text-xs font-mono font-bold text-slate-400">
                        {appt.appointment_code}
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-start gap-2">
                        <User className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-900 truncate" title={appt.patient_name}>
                            {appt.patient_name}
                          </p>
                          <p className="text-xs text-slate-500 font-mono">
                            CPF: {appt.patient_cpf ? maskCPF(appt.patient_cpf) : 'Não informado'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-1">
                        <Stethoscope className="w-4 h-4 text-slate-400 shrink-0" />
                        <p className="text-xs font-semibold text-slate-700 truncate">
                          {appt.doctor_name} • <span className="text-slate-500">{appt.specialty_name || 'Geral'}</span>
                        </p>
                      </div>

                      {appt.reason && (
                        <p className="text-xs text-slate-500 italic mt-2 line-clamp-2 bg-white/80 p-2 rounded-xl border border-slate-100">
                          "{appt.reason}"
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-200/60 flex items-center justify-between gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs font-semibold"
                      onClick={() => {
                        setSelectedAppointmentForRecord(appt);
                        setIsRecordDialogOpen(true);
                      }}
                    >
                      <FileText className="w-3.5 h-3.5 mr-1" /> Prontuário
                    </Button>

                    <div className="flex items-center gap-1">
                      {appt.status === 'agendado' && (
                        <Button
                          size="sm"
                          className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                          onClick={() => handleStatusChange(appt.id, 'confirmado')}
                        >
                          <CheckCircle className="w-3.5 h-3.5 mr-1" /> Confirmar
                        </Button>
                      )}
                      {appt.status === 'confirmado' && (
                        <Button
                          size="sm"
                          className="h-8 text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
                          onClick={() => handleStatusChange(appt.id, 'em_atendimento')}
                        >
                          <Activity className="w-3.5 h-3.5 mr-1" /> Atender
                        </Button>
                      )}
                      {appt.status === 'em_atendimento' && (
                        <Button
                          size="sm"
                          className="h-8 text-xs bg-slate-800 hover:bg-slate-900 text-white font-bold"
                          onClick={() => handleStatusChange(appt.id, 'finalizado')}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Finalizar
                        </Button>
                      )}
                      {appt.status === 'finalizado' && (
                        <span className="text-xs font-bold text-slate-500 px-2 py-1 bg-slate-200/60 rounded-lg">
                          Atendido
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal de Prontuário */}
      {selectedAppointmentForRecord && (
        <MedicalRecordDialog
          isOpen={isRecordDialogOpen}
          onOpenChange={setIsRecordDialogOpen}
          appointment={selectedAppointmentForRecord}
          onSaveSuccess={fetchAgendaData}
        />
      )}
    </div>
  );
};

export default Agenda;
