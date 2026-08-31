"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Calendar as CalendarIcon,
  CheckCircle,
  CheckCircle2,
  Clock,
  Edit2,
  FileText,
  Loader2,
  Plus,
  Search,
  Stethoscope,
  Trash2,
  User,
  UserX,
  XCircle,
  Activity,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { appointmentService, Appointment, AppointmentStatus } from '@/servicos/appointments';
import { patientService, Patient } from '@/servicos/patients';
import { doctorService, Doctor } from '@/servicos/doctors';
import { specialtyService, Specialty } from '@/servicos/specialties';
import { CompactDataGrid, type CompactDataGridColumn } from '@/components/CompactDataGrid';
import PageHeader from '@/components/PageHeader';
import { ActionButton } from '@/components/ui/action-button';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormSectionTitle, FormGrid, FormField } from '@/components/ui/standard-form';
import MedicalRecordDialog from '@/components/MedicalRecordDialog';
import { maskCPF } from '@/utils/masks';
import { useConfirm } from '@/hooks/useConfirm';

const Appointments = () => {
  const { hasRole, institutionId } = useAuth();
  const canManage = hasRole(['admin', 'root', 'recepcao', 'gestor', 'medico']);
  const { confirm, ConfirmationDialog } = useConfirm();

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('');
  const [doctorFilter, setDoctorFilter] = useState('all');

  // Modais
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);
  const [isRecordDialogOpen, setIsRecordDialogOpen] = useState(false);
  const [selectedAppointmentForRecord, setSelectedAppointmentForRecord] = useState<Appointment | null>(null);

  // Form de novo agendamento
  const [formData, setFormData] = useState({
    patient_id: '',
    doctor_id: '',
    specialty_id: '',
    date: '',
    time: '09:00',
    reason: '',
  });

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [appts, pts, docs, specs] = await Promise.all([
        appointmentService.list({
          date: dateFilter || undefined,
          status: statusFilter !== 'all' ? statusFilter : undefined,
          doctor_id: doctorFilter !== 'all' ? doctorFilter : undefined,
        }),
        patientService.list({ limit: 100 }),
        doctorService.list({ showAll: false }),
        specialtyService.list(),
      ]);
      setAppointments(appts || []);
      setPatients(pts || []);
      setDoctors(docs || []);
      setSpecialties(specs || []);
    } catch (error) {
      console.error('Erro ao carregar agendamentos:', error);
      toast.error('Erro ao carregar agendamentos');
    } finally {
      setLoading(false);
    }
  }, [dateFilter, statusFilter, doctorFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreateAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.patient_id || !formData.doctor_id || !formData.date || !formData.time || !formData.reason.trim()) {
      toast.error('Preencha todos os campos obrigatórios.');
      return;
    }

    try {
      const appointmentDateTime = `${formData.date}T${formData.time}:00`;
      const selectedDoc = doctors.find((d) => d.id === formData.doctor_id);

      await appointmentService.create({
        patient_id: formData.patient_id,
        doctor_id: formData.doctor_id,
        specialty_id: formData.specialty_id || selectedDoc?.specialty_id || undefined,
        appointment_date: appointmentDateTime,
        reason: formData.reason.trim(),
        institution_id: institutionId || undefined,
      });

      toast.success('Consulta agendada com sucesso!');
      setIsNewDialogOpen(false);
      setFormData({
        patient_id: '',
        doctor_id: '',
        specialty_id: '',
        date: '',
        time: '09:00',
        reason: '',
      });
      await fetchData();
    } catch (err: any) {
      console.error('Erro ao agendar consulta:', err);
      toast.error(err.message || 'Erro ao agendar consulta');
    }
  };

  const handleUpdateStatus = async (id: string, newStatus: AppointmentStatus) => {
    try {
      await appointmentService.updateStatus(id, newStatus);
      setAppointments((prev) =>
        prev.map((a) => (a.id === id ? { ...a, status: newStatus } : a))
      );
      toast.success(`Status atualizado para '${newStatus}'.`);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao atualizar status');
    }
  };

  const handleCancelAppointment = async (id: string) => {
    const ok = await confirm('Deseja realmente cancelar este agendamento?');
    if (!ok) return;

    try {
      await appointmentService.updateStatus(id, 'cancelado', 'Cancelado pelo usuário');
      setAppointments((prev) =>
        prev.map((a) => (a.id === id ? { ...a, status: 'cancelado' } : a))
      );
      toast.success('Agendamento cancelado com sucesso.');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao cancelar');
    }
  };

  const filteredAppointments = appointments.filter((a) => {
    const term = searchTerm.toLowerCase();
    const matches =
      a.patient_name.toLowerCase().includes(term) ||
      a.doctor_name.toLowerCase().includes(term) ||
      (a.appointment_code && a.appointment_code.toLowerCase().includes(term));
    return matches;
  });

  const getStatusBadge = (status: AppointmentStatus) => {
    switch (status) {
      case 'confirmado':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle className="w-3 h-3 text-emerald-600" /> Confirmado
          </span>
        );
      case 'em_atendimento':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
            <Activity className="w-3 h-3 text-indigo-600 animate-pulse" /> Em Atendimento
          </span>
        );
      case 'finalizado':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-slate-100 text-slate-700 border border-slate-300">
            <CheckCircle2 className="w-3 h-3 text-slate-500" /> Atendido
          </span>
        );
      case 'cancelado':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle className="w-3 h-3 text-rose-600" /> Cancelado
          </span>
        );
      case 'nao_compareceu':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <UserX className="w-3 h-3 text-amber-600" /> Ausente
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
            <Clock className="w-3 h-3 text-blue-600" /> Agendado
          </span>
        );
    }
  };

  const columns: Array<CompactDataGridColumn<Appointment>> = useMemo(
    () => [
      {
        key: 'date',
        header: 'Data / Horário',
        className: 'w-[18%] min-w-[150px]',
        render: (item) => (
          <div className="flex flex-col text-xs font-semibold text-slate-800">
            <span className="flex items-center gap-1.5">
              <CalendarIcon className="w-3.5 h-3.5 text-blue-600" />
              {item.appointment_date ? item.appointment_date.split('T')[0].split('-').reverse().join('/') : '-'}
            </span>
            <span className="text-slate-500 ml-5">
              {item.appointment_date ? item.appointment_date.split('T')[1]?.substring(0, 5) : ''}
            </span>
          </div>
        ),
      },
      {
        key: 'patient',
        header: 'Paciente',
        className: 'w-[28%] min-w-[200px]',
        render: (item) => (
          <div className="flex flex-col min-w-0">
            <span className="font-bold text-slate-900 truncate" title={item.patient_name}>
              {item.patient_name}
            </span>
            <span className="text-xs text-slate-500 font-medium font-mono">
              CPF: {item.patient_cpf ? maskCPF(item.patient_cpf) : 'Não informado'}
            </span>
          </div>
        ),
      },
      {
        key: 'doctor',
        header: 'Profissional / Especialidade',
        className: 'w-[28%] min-w-[200px]',
        render: (item) => (
          <div className="flex flex-col min-w-0">
            <span className="font-bold text-slate-800 truncate" title={item.doctor_name}>
              {item.doctor_name}
            </span>
            <span className="text-xs text-slate-500 font-medium">
              {item.specialty_name || 'Clínica Geral'}
            </span>
          </div>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        className: 'w-[18%] min-w-[140px]',
        render: (item) => getStatusBadge(item.status),
      },
      {
        key: 'actions',
        header: 'Ações',
        className: 'w-[1%] whitespace-nowrap',
        sticky: 'right',
        render: (item) => (
          <div className="flex items-center gap-1.5">
            <ActionButton
              onClick={() => {
                setSelectedAppointmentForRecord(item);
                setIsRecordDialogOpen(true);
              }}
              icon={<FileText className="w-4 h-4" />}
              titleTooltip="Prontuário e Prescrição"
            />
            {item.status === 'agendado' && (
              <ActionButton
                onClick={() => handleUpdateStatus(item.id, 'confirmado')}
                icon={<CheckCircle className="w-4 h-4" />}
                titleTooltip="Confirmar Presença"
              />
            )}
            {item.status === 'confirmado' && (
              <ActionButton
                onClick={() => handleUpdateStatus(item.id, 'em_atendimento')}
                icon={<Activity className="w-4 h-4" />}
                titleTooltip="Iniciar Atendimento"
              />
            )}
            {item.status === 'em_atendimento' && (
              <ActionButton
                onClick={() => handleUpdateStatus(item.id, 'finalizado')}
                icon={<CheckCircle2 className="w-4 h-4" />}
                titleTooltip="Finalizar Consulta"
              />
            )}
            {item.status !== 'cancelado' && item.status !== 'finalizado' && (
              <ActionButton
                onClick={() => handleCancelAppointment(item.id)}
                icon={<Trash2 className="w-4 h-4" />}
                titleTooltip="Cancelar Consulta"
                danger
              />
            )}
          </div>
        ),
      },
    ],
    []
  );

  return (
    <div className="h-full min-h-0 bg-slate-100 px-3 pb-3">
      <div className="flex h-full min-h-0 w-full flex-col">
        <PageHeader
          title="Agendamentos & Consultas"
          description="Gestão de fluxo clínico, marcações e recepção"
          className="mb-3"
          compact
          actionsClassName="lg:flex-1"
          loading={loading}
        >
          <div className="flex flex-col md:flex-row flex-wrap w-full items-end gap-2 justify-end">
            <div className="relative min-w-0 flex-1 w-full md:min-w-[200px]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Buscar por paciente ou médico..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="delphi-input h-9 pl-10 w-full"
              />
            </div>

            <div className="flex-none w-auto min-w-[140px] shrink-0">
              <Input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="delphi-input h-9 w-full"
              />
            </div>

            <div className="flex-none w-auto min-w-[150px] shrink-0">
              <Select value={statusFilter} onValueChange={(val) => setStatusFilter(val)}>
                <SelectTrigger className="delphi-input h-9 w-full">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos Status</SelectItem>
                  <SelectItem value="agendado">Agendado</SelectItem>
                  <SelectItem value="confirmado">Confirmado</SelectItem>
                  <SelectItem value="em_atendimento">Em Atendimento</SelectItem>
                  <SelectItem value="finalizado">Finalizado</SelectItem>
                  <SelectItem value="cancelado">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              className="h-9 min-w-[120px] bg-blue-600 text-white hover:bg-blue-700 font-bold"
              onClick={() => setIsNewDialogOpen(true)}
              disabled={!canManage}
            >
              <Plus className="h-4 w-4 mr-2" />
              Nova Consulta
            </Button>
          </div>
        </PageHeader>

        <CompactDataGrid
          className="flex-1"
          columns={columns}
          rows={filteredAppointments}
          getRowKey={(a) => a.id}
          emptyMessage="Nenhuma consulta encontrada"
          minWidth="900px"
          loading={loading}
          pagination={true}
          resetPaginationDependency={searchTerm + statusFilter + dateFilter + doctorFilter}
        />
      </div>

      {/* Modal de Nova Consulta */}
      <Dialog open={isNewDialogOpen} onOpenChange={setIsNewDialogOpen}>
        <DialogContent className="max-w-xl p-6 bg-white rounded-3xl shadow-2xl border-0 overflow-hidden max-h-[90vh] overflow-y-auto">
          <div className="flex flex-col gap-6">
            <div>
              <DialogTitle className="text-2xl font-bold text-slate-800 tracking-tight">
                Agendar Nova Consulta
              </DialogTitle>
              <DialogDescription className="text-slate-500 font-medium">
                Selecione o paciente, o profissional e a data para marcar o atendimento.
              </DialogDescription>
            </div>

            <form onSubmit={handleCreateAppointment} className="flex flex-col gap-6">
              <div className="space-y-4">
                <FormSectionTitle>Dados do Agendamento</FormSectionTitle>
                <FormGrid>
                  <FormField label="Paciente" required className="md:col-span-12">
                    <Select
                      value={formData.patient_id}
                      onValueChange={(val) => setFormData({ ...formData, patient_id: val })}
                    >
                      <SelectTrigger className="h-11 rounded-2xl bg-slate-50 border-slate-200 text-sm">
                        <SelectValue placeholder="Selecione o paciente cadastrado" />
                      </SelectTrigger>
                      <SelectContent>
                        {patients.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.full_name} (CPF: {maskCPF(p.cpf)})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormField>

                  <FormField label="Profissional Médico" required className="md:col-span-12">
                    <Select
                      value={formData.doctor_id}
                      onValueChange={(val) => {
                        const doc = doctors.find((d) => d.id === val);
                        setFormData({
                          ...formData,
                          doctor_id: val,
                          specialty_id: doc?.specialty_id || '',
                        });
                      }}
                    >
                      <SelectTrigger className="h-11 rounded-2xl bg-slate-50 border-slate-200 text-sm">
                        <SelectValue placeholder="Selecione o profissional" />
                      </SelectTrigger>
                      <SelectContent>
                        {doctors.map((d) => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.name} • {d.specialty_name || 'Clínica Geral'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormField>

                  <FormField label="Data da Consulta" required className="md:col-span-6">
                    <Input
                      type="date"
                      value={formData.date}
                      onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                      className="h-11 rounded-2xl bg-slate-50 border-slate-200 text-sm"
                    />
                  </FormField>

                  <FormField label="Horário" required className="md:col-span-6">
                    <Input
                      type="time"
                      value={formData.time}
                      onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                      className="h-11 rounded-2xl bg-slate-50 border-slate-200 text-sm"
                    />
                  </FormField>

                  <FormField label="Motivo da Consulta" required className="md:col-span-12">
                    <Textarea
                      rows={3}
                      placeholder="Ex: Consulta de rotina, queixa de dor de cabeça, retorno..."
                      value={formData.reason}
                      onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                      className="rounded-2xl bg-slate-50 border-slate-200 text-sm p-3"
                    />
                  </FormField>
                </FormGrid>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <Button type="button" variant="outline" className="h-10 px-6 font-semibold" onClick={() => setIsNewDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" className="h-10 px-6 font-semibold bg-blue-600 hover:bg-blue-700 font-bold">
                  Confirmar Agendamento
                </Button>
              </div>
            </form>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de Prontuário */}
      {selectedAppointmentForRecord && (
        <MedicalRecordDialog
          isOpen={isRecordDialogOpen}
          onOpenChange={setIsRecordDialogOpen}
          appointment={selectedAppointmentForRecord}
          onSaveSuccess={fetchData}
        />
      )}

      <ConfirmationDialog />
    </div>
  );
};

export default Appointments;
