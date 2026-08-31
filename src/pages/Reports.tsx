"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Download,
  Search,
  Calendar,
  FileText,
  Clock,
  Filter,
} from 'lucide-react';
import { toast } from 'sonner';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CompactDataGrid, type CompactDataGridColumn } from '@/components/CompactDataGrid';
import { appointmentService, Appointment } from '@/servicos/appointments';
import { doctorService, Doctor } from '@/servicos/doctors';
import { specialtyService, Specialty } from '@/servicos/specialties';
import { maskCPF } from '@/utils/masks';

const Reports = () => {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [loading, setLoading] = useState(true);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedDoctor, setSelectedDoctor] = useState('all');
  const [selectedSpecialty, setSelectedSpecialty] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  const fetchReports = useCallback(async () => {
    try {
      setLoading(true);
      const [appts, docs, specs] = await Promise.all([
        appointmentService.list({
          start_date: startDate || undefined,
          end_date: endDate || undefined,
          doctor_id: selectedDoctor !== 'all' ? selectedDoctor : undefined,
          specialty_id: selectedSpecialty !== 'all' ? selectedSpecialty : undefined,
          status: selectedStatus !== 'all' ? selectedStatus : undefined,
        }),
        doctorService.list({ showAll: true }),
        specialtyService.list(),
      ]);
      setAppointments(appts || []);
      setDoctors(docs || []);
      setSpecialties(specs || []);
    } catch (err) {
      console.error('Erro ao gerar relatório:', err);
      toast.error('Erro ao carregar relatório');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, selectedDoctor, selectedSpecialty, selectedStatus]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const handleExportCSV = () => {
    if (appointments.length === 0) {
      toast.info('Nenhum dado para exportar.');
      return;
    }

    const headers = ['Código', 'Data', 'Horário', 'Paciente', 'CPF', 'Médico', 'Especialidade', 'Status', 'Motivo'];
    const rows = appointments.map((a) => [
      a.appointment_code,
      a.appointment_date ? a.appointment_date.split('T')[0] : '',
      a.appointment_date ? a.appointment_date.split('T')[1]?.substring(0, 5) : '',
      `"${a.patient_name}"`,
      `"${a.patient_cpf || ''}"`,
      `"${a.doctor_name}"`,
      `"${a.specialty_name || ''}"`,
      a.status,
      `"${a.reason.replace(/"/g, '""')}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `relatorio_consultas_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Relatório CSV exportado com sucesso!');
  };

  const filteredData = appointments.filter((a) => {
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
        header: 'Data / Hora',
        className: 'w-[15%] min-w-[140px]',
        render: (item) => (
          <div className="flex flex-col text-xs font-semibold text-slate-800">
            <span>
              {item.appointment_date ? item.appointment_date.split('T')[0].split('-').reverse().join('/') : '-'}
            </span>
            <span className="text-slate-400 font-mono">
              {item.appointment_date ? item.appointment_date.split('T')[1]?.substring(0, 5) : ''}
            </span>
          </div>
        ),
      },
      {
        key: 'patient',
        header: 'Paciente',
        className: 'w-[25%] min-w-[180px]',
        render: (item) => (
          <div className="flex flex-col min-w-0">
            <span className="font-bold text-slate-900 truncate">{item.patient_name}</span>
            <span className="text-xs text-slate-500 font-mono">
              {item.patient_cpf ? maskCPF(item.patient_cpf) : '-'}
            </span>
          </div>
        ),
      },
      {
        key: 'doctor',
        header: 'Profissional',
        className: 'w-[25%] min-w-[180px]',
        render: (item) => (
          <div className="flex flex-col min-w-0">
            <span className="font-bold text-slate-800 truncate">{item.doctor_name}</span>
            <span className="text-xs text-slate-500 font-medium">
              {item.specialty_name || 'Clínica Geral'}
            </span>
          </div>
        ),
      },
      {
        key: 'reason',
        header: 'Motivo / Conduta',
        className: 'w-[20%] min-w-[150px]',
        render: (item) => (
          <span className="text-xs text-slate-600 truncate block" title={item.reason}>
            {item.reason}
          </span>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        className: 'w-[15%] min-w-[120px]',
        render: (item) => (
          <span className="px-2 py-0.5 rounded-md text-xs font-bold uppercase bg-slate-100 text-slate-700">
            {item.status}
          </span>
        ),
      },
    ],
    []
  );

  return (
    <div className="h-full min-h-0 bg-slate-100 px-3 pb-3 flex flex-col">
      <PageHeader
        title="Relatórios Analíticos"
        description="Geração de relatórios operacionais consolidados e exportação de dados"
        className="mb-3"
        compact
        loading={loading}
      >
        <div className="flex flex-col md:flex-row flex-wrap w-full items-end gap-2 justify-end">
          <div className="flex-none w-auto min-w-[130px]">
            <Input
              type="date"
              placeholder="Data Início"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="delphi-input h-9 w-full"
            />
          </div>

          <div className="flex-none w-auto min-w-[130px]">
            <Input
              type="date"
              placeholder="Data Fim"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="delphi-input h-9 w-full"
            />
          </div>

          <div className="flex-none w-auto min-w-[150px]">
            <Select value={selectedDoctor} onValueChange={(val) => setSelectedDoctor(val)}>
              <SelectTrigger className="delphi-input h-9 w-full">
                <SelectValue placeholder="Profissional" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Médicos</SelectItem>
                {doctors.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex-none w-auto min-w-[140px]">
            <Select value={selectedStatus} onValueChange={(val) => setSelectedStatus(val)}>
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
                <SelectItem value="nao_compareceu">Ausente</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button
            className="h-9 min-w-[130px] bg-emerald-600 text-white hover:bg-emerald-700 font-bold"
            onClick={handleExportCSV}
          >
            <Download className="w-4 h-4 mr-2" />
            Exportar CSV
          </Button>
        </div>
      </PageHeader>

      <CompactDataGrid
        className="flex-1"
        columns={columns}
        rows={filteredData}
        getRowKey={(a) => a.id}
        emptyMessage="Nenhum atendimento no período selecionado"
        minWidth="800px"
        loading={loading}
        pagination={true}
        resetPaginationDependency={startDate + endDate + selectedDoctor + selectedStatus}
      />
    </div>
  );
};

export default Reports;
