"use client";

import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  Calendar,
  CheckCircle2,
  Clock,
  Stethoscope,
  Users,
  UserX,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import PageHeader from '@/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { reportService, DashboardMetrics } from '@/servicos/reports';
import { appointmentService, Appointment } from '@/servicos/appointments';

const Dashboard = () => {
  const { profile, institutionId } = useAuth();
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [recentAppointments, setRecentAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      const [data, appts] = await Promise.all([
        reportService.getDashboardMetrics(institutionId || undefined),
        appointmentService.list({}),
      ]);
      setMetrics(data);
      setRecentAppointments(appts?.slice(0, 8) || []);
    } catch (err) {
      console.error('Erro ao buscar dados do dashboard:', err);
      toast.error('Erro ao carregar indicadores');
    } finally {
      setLoading(false);
    }
  }, [institutionId]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const today = metrics?.today || {
    total: 0,
    completed: 0,
    inProgress: 0,
    waiting: 0,
    canceled: 0,
    noShow: 0,
  };

  const system = metrics?.system || {
    totalPatients: 0,
    totalDoctors: 0,
    totalSpecialties: 0,
  };

  return (
    <div className="h-full min-h-0 bg-slate-100 px-3 pb-3 flex flex-col overflow-y-auto">
      <PageHeader
        title="Painel de Controle"
        description={`Visão geral da operação clínica • ${profile?.institution_name || 'Rede Geral'}`}
        className="mb-3"
        compact
        loading={loading}
      />

      <div className="space-y-4">
        {/* KPI Cards Superiores */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="rounded-3xl border-slate-200 shadow-2xs bg-white">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Consultas Hoje
              </CardTitle>
              <div className="p-2 bg-blue-50 text-blue-600 rounded-xl border border-blue-100">
                <Calendar className="w-4 h-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-slate-900">{today.total}</div>
              <p className="text-xs text-slate-400 mt-1 font-medium">Atendimentos na agenda de hoje</p>
            </CardContent>
          </Card>

          <Card className="rounded-3xl border-slate-200 shadow-2xs bg-white">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Atendidos
              </CardTitle>
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-emerald-700">{today.completed}</div>
              <p className="text-xs text-slate-400 mt-1 font-medium">Consultas concluídas com sucesso</p>
            </CardContent>
          </Card>

          <Card className="rounded-3xl border-slate-200 shadow-2xs bg-white">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Em Andamento
              </CardTitle>
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100">
                <Activity className="w-4 h-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-indigo-700">{today.inProgress}</div>
              <p className="text-xs text-slate-400 mt-1 font-medium">Pacientes no consultório agora</p>
            </CardContent>
          </Card>

          <Card className="rounded-3xl border-slate-200 shadow-2xs bg-white">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Cancelados / Faltas
              </CardTitle>
              <div className="p-2 bg-rose-50 text-rose-600 rounded-xl border border-rose-100">
                <XCircle className="w-4 h-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-rose-700">{today.canceled + today.noShow}</div>
              <p className="text-xs text-slate-400 mt-1 font-medium">
                {today.canceled} cancelados • {today.noShow} faltas
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Totais do Sistema */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-5 bg-white rounded-3xl border border-slate-200 flex items-center gap-4 shadow-2xs">
            <div className="p-3 bg-teal-50 text-teal-700 rounded-2xl border border-teal-100">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Base de Pacientes</p>
              <p className="text-xl font-extrabold text-slate-900">{system.totalPatients}</p>
            </div>
          </div>

          <div className="p-5 bg-white rounded-3xl border border-slate-200 flex items-center gap-4 shadow-2xs">
            <div className="p-3 bg-blue-50 text-blue-700 rounded-2xl border border-blue-100">
              <Stethoscope className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Corpo Clínico Ativo</p>
              <p className="text-xl font-extrabold text-slate-900">{system.totalDoctors}</p>
            </div>
          </div>

          <div className="p-5 bg-white rounded-3xl border border-slate-200 flex items-center gap-4 shadow-2xs">
            <div className="p-3 bg-purple-50 text-purple-700 rounded-2xl border border-purple-100">
              <Activity className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Especialidades Médicas</p>
              <p className="text-xl font-extrabold text-slate-900">{system.totalSpecialties}</p>
            </div>
          </div>
        </div>

        {/* Lista de Atendimentos Recentes */}
        <Card className="rounded-3xl border-slate-200 shadow-2xs bg-white p-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">Próximos Atendimentos</h3>
              <p className="text-xs text-slate-400">Fluxo operacional agendado</p>
            </div>
          </div>

          {recentAppointments.length === 0 ? (
            <div className="text-center py-10 text-slate-400 text-sm">
              Nenhuma consulta recente registrada.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentAppointments.map((appt) => (
                <div key={appt.id} className="py-3 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 bg-slate-50 text-slate-600 rounded-xl border border-slate-200">
                      <Clock className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900 truncate">{appt.patient_name}</p>
                      <p className="text-xs text-slate-500 truncate">
                        {appt.doctor_name} • {appt.specialty_name || 'Geral'}
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-xs font-bold text-slate-700 block">
                      {appt.appointment_date ? appt.appointment_date.split('T')[0].split('-').reverse().join('/') : '-'}
                    </span>
                    <span className="text-xs text-slate-400 font-mono">
                      {appt.appointment_date ? appt.appointment_date.split('T')[1]?.substring(0, 5) : ''}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
