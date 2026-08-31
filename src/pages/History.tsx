"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  Clock,
  FileText,
  Search,
  Stethoscope,
  User,
} from 'lucide-react';
import { toast } from 'sonner';
import PageHeader from '@/components/PageHeader';
import { CompactDataGrid, type CompactDataGridColumn } from '@/components/CompactDataGrid';
import { ActionButton } from '@/components/ui/action-button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { appointmentService, Appointment } from '@/servicos/appointments';
import MedicalRecordDialog from '@/components/MedicalRecordDialog';
import { maskCPF } from '@/utils/masks';

const History = () => {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [selectedAppointmentForRecord, setSelectedAppointmentForRecord] = useState<Appointment | null>(null);
  const [isRecordDialogOpen, setIsRecordDialogOpen] = useState(false);

  const fetchHistory = useCallback(async () => {
    try {
      setLoading(true);
      const data = await appointmentService.list({
        status: statusFilter !== 'all' ? statusFilter : undefined,
      });
      setAppointments(data || []);
    } catch (err) {
      console.error('Erro ao carregar histórico:', err);
      toast.error('Erro ao carregar histórico');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const filteredAppointments = appointments.filter((a) => {
    const term = searchTerm.toLowerCase();
    return (
      a.patient_name.toLowerCase().includes(term) ||
      a.doctor_name.toLowerCase().includes(term) ||
      (a.appointment_code && a.appointment_code.toLowerCase().includes(term))
    );
  });

  const columns: Array<CompactDataGridColumn<Appointment>> = useMemo(
    () => [
      {
        key: 'date',
        header: 'Data / Horário',
        className: 'w-[18%] min-w-[150px]',
        render: (item) => (
          <div className="flex flex-col text-xs font-semibold text-slate-800">
            <span className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-blue-600" />
              {item.appointment_date ? item.appointment_date.split('T')[0].split('-').reverse().join('/') : '-'}
            </span>
            <span className="text-slate-400 font-mono ml-5">
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
            <span className="text-xs text-slate-500 font-mono">
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
        className: 'w-[16%] min-w-[120px]',
        render: (item) => (
          <span className="px-2.5 py-1 rounded-md text-xs font-bold uppercase bg-slate-100 text-slate-700">
            {item.status}
          </span>
        ),
      },
      {
        key: 'actions',
        header: 'Ações',
        className: 'w-[1%] whitespace-nowrap',
        sticky: 'right',
        render: (item) => (
          <ActionButton
            onClick={() => {
              setSelectedAppointmentForRecord(item);
              setIsRecordDialogOpen(true);
            }}
            icon={<FileText className="w-4 h-4" />}
            titleTooltip="Ver Prontuário"
          />
        ),
      },
    ],
    []
  );

  return (
    <div className="h-full min-h-0 bg-slate-100 px-3 pb-3 flex flex-col">
      <PageHeader
        title="Histórico de Consultas & Atendimentos"
        description="Consulte o histórico de prontuários, registros e atendimentos realizados"
        className="mb-3"
        compact
        loading={loading}
      >
        <div className="flex flex-col md:flex-row flex-wrap w-full items-end gap-2 justify-end">
          <div className="relative min-w-0 flex-1 w-full md:min-w-[200px]">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Buscar por paciente, médico ou código..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="delphi-input h-9 pl-10 w-full"
            />
          </div>

          <div className="flex-none w-auto min-w-[150px] shrink-0">
            <Select value={statusFilter} onValueChange={(val) => setStatusFilter(val)}>
              <SelectTrigger className="delphi-input h-9 w-full">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Status</SelectItem>
                <SelectItem value="finalizado">Atendido (Finalizado)</SelectItem>
                <SelectItem value="confirmado">Confirmado</SelectItem>
                <SelectItem value="agendado">Agendado</SelectItem>
                <SelectItem value="cancelado">Cancelado</SelectItem>
                <SelectItem value="nao_compareceu">Falta</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </PageHeader>

      <CompactDataGrid
        className="flex-1"
        columns={columns}
        rows={filteredAppointments}
        getRowKey={(a) => a.id}
        emptyMessage="Nenhuma consulta encontrada no histórico"
        minWidth="800px"
        loading={loading}
        pagination={true}
        resetPaginationDependency={searchTerm + statusFilter}
      />

      {selectedAppointmentForRecord && (
        <MedicalRecordDialog
          isOpen={isRecordDialogOpen}
          onOpenChange={setIsRecordDialogOpen}
          appointment={selectedAppointmentForRecord}
          onSaveSuccess={fetchHistory}
        />
      )}
    </div>
  );
};

export default History;
