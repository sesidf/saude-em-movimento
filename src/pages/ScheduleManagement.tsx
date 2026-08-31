"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  Clock,
  Plus,
  Stethoscope,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { CompactDataGrid, type CompactDataGridColumn } from '@/components/CompactDataGrid';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { ActionButton } from '@/components/ui/action-button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { FormGrid, FormField } from '@/components/ui/standard-form';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { scheduleService, DoctorAvailability } from '@/servicos/schedules';
import { doctorService, Doctor } from '@/servicos/doctors';
import { useConfirm } from '@/hooks/useConfirm';

const WEEKDAYS = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
];

const ScheduleManagement = () => {
  const { hasRole } = useAuth();
  const canManage = hasRole(['admin', 'root']);
  const { confirm, ConfirmationDialog } = useConfirm();

  const [availabilities, setAvailabilities] = useState<DoctorAvailability[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedDoctorFilter, setSelectedDoctorFilter] = useState('all');

  const [formData, setFormData] = useState({
    doctor_id: '',
    weekday: '1',
    starts_at: '08:00',
    ends_at: '12:00',
    slot_minutes: '15',
  });

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [avails, docs] = await Promise.all([
        scheduleService.listAvailability(),
        doctorService.list({ showAll: false }),
      ]);
      setAvailabilities(avails || []);
      setDoctors(docs || []);
    } catch (error) {
      console.error('Erro ao buscar grade de atendimento:', error);
      toast.error('Erro ao carregar horários');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.doctor_id) {
      toast.error('Selecione o profissional de saúde.');
      return;
    }

    try {
      await scheduleService.createAvailability({
        doctor_id: formData.doctor_id,
        weekday: parseInt(formData.weekday, 10),
        starts_at: formData.starts_at,
        ends_at: formData.ends_at,
        slot_minutes: parseInt(formData.slot_minutes, 10),
      });

      toast.success('Horário adicionado com sucesso!');
      setIsDialogOpen(false);
      await fetchData();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar horário');
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirm('Deseja realmente remover esta disponibilidade?');
    if (!ok) return;

    try {
      await scheduleService.removeAvailability(id);
      setAvailabilities((prev) => prev.filter((a) => a.id !== id));
      toast.success('Horário removido com sucesso!');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao remover');
    }
  };

  const filteredAvailabilities = availabilities.filter((a) => {
    if (selectedDoctorFilter !== 'all' && a.doctor_id !== selectedDoctorFilter) {
      return false;
    }
    return true;
  });

  const columns: Array<CompactDataGridColumn<DoctorAvailability>> = useMemo(
    () => [
      {
        key: 'doctor',
        header: 'Profissional / Especialidade',
        className: 'w-[40%] min-w-[240px]',
        render: (item) => (
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl border border-blue-100">
              <Stethoscope className="w-4 h-4" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-bold text-slate-900 truncate">{item.doctor_name}</span>
              <span className="text-xs text-slate-500 font-medium">{item.specialty_name || 'Clínica Geral'}</span>
            </div>
          </div>
        ),
      },
      {
        key: 'weekday',
        header: 'Dia da Semana',
        className: 'w-[25%] min-w-[160px]',
        render: (item) => (
          <div className="flex items-center gap-2 font-medium text-slate-700 text-xs">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span>{WEEKDAYS[item.weekday] || `Dia ${item.weekday}`}</span>
          </div>
        ),
      },
      {
        key: 'time',
        header: 'Horário & Duração',
        className: 'w-[25%] min-w-[160px]',
        render: (item) => (
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>
              {item.starts_at} às {item.ends_at} ({item.slot_minutes} min/consulta)
            </span>
          </div>
        ),
      },
      {
        key: 'actions',
        header: 'Ações',
        className: 'w-[1%] whitespace-nowrap',
        sticky: 'right',
        render: (item) =>
          canManage ? (
            <ActionButton
              onClick={() => handleDelete(item.id)}
              icon={<Trash2 className="h-4 w-4" />}
              titleTooltip="Remover Horário"
              danger
            />
          ) : null,
      },
    ],
    [canManage]
  );

  return (
    <div className="h-full min-h-0 bg-slate-100 px-3 pb-3">
      <div className="flex h-full min-h-0 w-full flex-col">
        <PageHeader
          title="Gestão de Grades e Horários"
          description="Configure as janelas de disponibilidade semanal e duração dos atendimentos"
          className="mb-3"
          compact
          actionsClassName="lg:flex-1"
          loading={loading}
        >
          <div className="flex flex-col md:flex-row flex-wrap w-full items-end gap-2 justify-end">
            <div className="flex-none w-auto min-w-[200px]">
              <Select value={selectedDoctorFilter} onValueChange={(val) => setSelectedDoctorFilter(val)}>
                <SelectTrigger className="delphi-input h-9 w-full">
                  <SelectValue placeholder="Filtrar por Médico" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Médicos</SelectItem>
                  {doctors.map((doc) => (
                    <SelectItem key={doc.id} value={doc.id}>
                      {doc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              className="h-9 min-w-[120px] bg-blue-600 text-white hover:bg-blue-700 font-bold"
              onClick={() => setIsDialogOpen(true)}
              disabled={!canManage}
            >
              <Plus className="h-4 w-4 mr-2" />
              Novo Horário
            </Button>
          </div>
        </PageHeader>

        <CompactDataGrid
          className="flex-1"
          columns={columns}
          rows={filteredAvailabilities}
          getRowKey={(item) => item.id}
          emptyMessage="Nenhum horário cadastrado"
          minWidth="800px"
          loading={loading}
          pagination={true}
          resetPaginationDependency={selectedDoctorFilter}
        />
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md p-6 bg-white rounded-3xl shadow-2xl border-0 overflow-hidden">
          <div className="flex flex-col gap-5">
            <div>
              <DialogTitle className="text-xl font-bold text-slate-800">
                Cadastrar Janela de Atendimento
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500 mt-0.5">
                Defina o dia da semana e o período de atendimento do profissional.
              </DialogDescription>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <FormField label="Profissional de Saúde" required>
                <Select
                  value={formData.doctor_id}
                  onValueChange={(val) => setFormData({ ...formData, doctor_id: val })}
                >
                  <SelectTrigger className="h-11 rounded-2xl bg-slate-50 border-slate-200 text-sm">
                    <SelectValue placeholder="Selecione o médico" />
                  </SelectTrigger>
                  <SelectContent>
                    {doctors.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name} {d.specialty_name ? `(${d.specialty_name})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>

              <FormField label="Dia da Semana" required>
                <Select
                  value={formData.weekday}
                  onValueChange={(val) => setFormData({ ...formData, weekday: val })}
                >
                  <SelectTrigger className="h-11 rounded-2xl bg-slate-50 border-slate-200 text-sm">
                    <SelectValue placeholder="Selecione o dia" />
                  </SelectTrigger>
                  <SelectContent>
                    {WEEKDAYS.map((name, idx) => (
                      <SelectItem key={idx} value={String(idx)}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>

              <div className="grid grid-cols-2 gap-3">
                <FormField label="Início" required>
                  <Input
                    type="time"
                    value={formData.starts_at}
                    onChange={(e) => setFormData({ ...formData, starts_at: e.target.value })}
                    className="h-11 rounded-2xl bg-slate-50 border-slate-200 text-sm"
                  />
                </FormField>
                <FormField label="Término" required>
                  <Input
                    type="time"
                    value={formData.ends_at}
                    onChange={(e) => setFormData({ ...formData, ends_at: e.target.value })}
                    className="h-11 rounded-2xl bg-slate-50 border-slate-200 text-sm"
                  />
                </FormField>
              </div>

              <FormField label="Duração da Consulta (minutos)" required>
                <Select
                  value={formData.slot_minutes}
                  onValueChange={(val) => setFormData({ ...formData, slot_minutes: val })}
                >
                  <SelectTrigger className="h-11 rounded-2xl bg-slate-50 border-slate-200 text-sm">
                    <SelectValue placeholder="Minutos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10 minutos</SelectItem>
                    <SelectItem value="15">15 minutos</SelectItem>
                    <SelectItem value="20">20 minutos</SelectItem>
                    <SelectItem value="30">30 minutos</SelectItem>
                    <SelectItem value="45">45 minutos</SelectItem>
                    <SelectItem value="60">60 minutos (1h)</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100 mt-2">
                <Button type="button" variant="outline" className="h-10 px-5" onClick={() => setIsDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" className="h-10 px-5 bg-blue-600 hover:bg-blue-700 font-bold">
                  Salvar Horário
                </Button>
              </div>
            </form>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmationDialog />
    </div>
  );
};

export default ScheduleManagement;
