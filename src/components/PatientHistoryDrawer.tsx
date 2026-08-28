import { useEffect, useState } from 'react';
import { chamarApiPost, chamarApiGet } from '@/lib/workerApi';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatOperationalDate, formatOperationalTime } from '@/lib/operationalDateTime';
import { 
  FileText, 
  Loader2, 
  Calendar, 
  Clock, 
  User, 
  ChevronRight, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  Activity,
  RefreshCw,
  UserX
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { HistoryAppointment } from '@/types/history';
import MedicalRecordDialog from '@/components/MedicalRecordDialog';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

interface PatientHistoryDrawerProps {
  patientIds: string[];
  patientName: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Formata o registro do profissional omitindo valores inválidos ou não informados.
 */
function formatDoctorRegistration(council?: string | null, crm?: string | null): string | null {
  const isInvalid = (val?: string | null) => {
    if (!val) return true;
    const clean = val.trim().toUpperCase();
    return (
      clean === '' ||
      clean === '0' ||
      clean === '00' ||
      clean === '0000' ||
      clean.includes('NAO_INFORMADO') ||
      clean.includes('NÃO INFORMADO') ||
      clean.includes('NAO INFORMADO') ||
      clean === 'N/A' ||
      clean === 'NULL'
    );
  };

  const hasCrm = !isInvalid(crm);
  const hasCouncil = !isInvalid(council);

  if (!hasCrm && !hasCouncil) return null;

  if (hasCouncil && hasCrm) {
    return `${council!.trim().toUpperCase()} ${crm!.trim()}`;
  }
  if (hasCrm) {
    return `CRM ${crm!.trim()}`;
  }
  return council!.trim().toUpperCase();
}

/**
 * Higieniza o motivo da consulta removendo aspas extras e formatando o texto.
 */
function sanitizeReason(reason?: string | null): string | null {
  if (!reason) return null;
  let clean = reason.trim();

  // Remove aspas iniciais/finais redundantes
  while ((clean.startsWith('"') && clean.endsWith('"')) || (clean.startsWith("'") && clean.endsWith("'"))) {
    clean = clean.slice(1, -1).trim();
  }

  if (!clean) return null;

  // Se o texto estiver totalmente em maiúsculas ou minúsculas, ajusta para Sentence Case
  if (clean === clean.toUpperCase() || clean === clean.toLowerCase()) {
    return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
  }

  return clean;
}

export const PatientHistoryDrawer = ({ patientIds, patientName, isOpen, onOpenChange }: PatientHistoryDrawerProps) => {
  const { userRole, doctorId } = useAuth();
  const isSuperadmin = userRole === 'superadmin';
  const isOwnRecord = (apptDoctorId: string) => userRole === 'medico' && Boolean(doctorId) && apptDoctorId === doctorId;
  const [appointments, setAppointments] = useState<HistoryAppointment[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<HistoryAppointment | null>(null);
  const [isProntuarioOpen, setIsProntuarioOpen] = useState(false);

  useEffect(() => {
    if (!isOpen || !patientIds || patientIds.length === 0) return;

    const fetchHistory = async () => {
      setLoading(true);
      const allAppointments: HistoryAppointment[] = [];
      
      try {
        for (const pid of patientIds) {
          // Usa a versão atualizada da função RPC que aceita p_patient_id
          const { data, error } = await chamarApiPost('/api/rpc/list_history_snapshot', {
            p_status: null,
            p_date_from: null,
            p_date_to: null,
            p_search: null,
            p_limit: 500,
            p_patient_id: pid,
          });
          
          if (error) {
            // Fallback em caso da RPC não estar atualizada no BD
            console.warn('RPC list_history_snapshot com erro, tentando query direta:', error);
            const { data: fallbackData } = await chamarApiPost('/api/table/appointments/select', {});
              
            if (fallbackData) {
              const mapped = fallbackData.map((a: any) => ({
                id: a.id,
                appointment_id: a.id,
                patient_id: a.patient?.id,
                patient_name: a.patient?.full_name,
                patient_cpf: a.patient?.cpf,
                doctor_id: a.doctor?.id,
                doctor_name: a.doctor?.profiles?.full_name || 'Profissional',
                doctor_crm: a.doctor?.crm,
                doctor_council: a.doctor?.professional_council,
                doctor_registration_label: `${a.doctor?.professional_council || ''} ${a.doctor?.crm || ''}`,
                specialty_id: a.specialty?.id,
                specialty_name: a.specialty?.name || 'Geral',
                appointment_date: a.appointment_date,
                status: a.status,
                reason: a.reason || '',
                diagnosis: null,
                prescription: null,
                anamnesis: null,
                evolution: null,
                archived_at: a.appointment_date,
                blood_pressure: null,
                heart_rate: null,
                temperature: null,
                weight: null,
                height: null,
              }));
              allAppointments.push(...mapped);
            }
          } else {
            allAppointments.push(...((data as HistoryAppointment[]) || []));
          }
        }
        
        // Ordena tudo do mais recente para o mais antigo
        allAppointments.sort((a, b) => new Date(b.appointment_date).getTime() - new Date(a.appointment_date).getTime());
        setAppointments(allAppointments);
      } catch (err) {
        console.error('Erro ao buscar histórico:', err);
      } finally {
        setLoading(false);
      }
    };

    void fetchHistory();
  }, [isOpen, patientIds]);

  return (
    <>
      <Sheet open={isOpen} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-md flex flex-col p-0 border-l border-slate-200 shadow-2xl" aria-describedby={undefined}>
          <SheetHeader className="p-5 border-b border-slate-100 bg-slate-50/70">
            <div className="flex items-center justify-between pr-6">
              <SheetTitle className="text-base font-bold text-slate-900 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0 shadow-2xs">
                  <FileText className="h-5 w-5 text-blue-600" />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-slate-900 font-bold leading-tight">Histórico do Paciente</span>
                  <span className="text-xs font-semibold text-slate-500 truncate max-w-[220px] mt-0.5">
                    {patientName}
                  </span>
                </div>
              </SheetTitle>
              {appointments.length > 0 && (
                <Badge variant="outline" className="text-xs font-bold bg-white text-slate-600 border-slate-200 px-2.5 py-0.5 rounded-full shadow-2xs">
                  {appointments.length} {appointments.length === 1 ? 'registro' : 'registros'}
                </Badge>
              )}
            </div>
          </SheetHeader>

          <ScrollArea className="flex-1 p-5 bg-slate-50/30">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                <p className="text-sm font-medium text-slate-500">Buscando histórico médico...</p>
              </div>
            ) : appointments.length === 0 ? (
              <div className="text-center py-16 text-slate-500 bg-white rounded-2xl border border-dashed border-slate-200 p-6 shadow-2xs">
                <div className="w-12 h-12 rounded-2xl bg-blue-50/60 border border-blue-100 flex items-center justify-center mx-auto mb-3">
                  <FileText className="h-6 w-6 text-blue-500" />
                </div>
                <p className="font-bold text-slate-800 text-sm">Nenhum registro no histórico</p>
                <p className="text-xs text-slate-400 mt-1 max-w-[250px] mx-auto">
                  As consultas e atendimentos aparecerão registrados nesta linha do tempo.
                </p>
              </div>
            ) : (
              <div className="relative pl-10 space-y-5 before:absolute before:left-[19px] before:top-3.5 before:bottom-3.5 before:w-[2px] before:bg-slate-200/80">
                {appointments.map((apt) => {
                  const isSuperAdmin = userRole === 'superadmin';
                  const isOwnDoctor = Boolean(doctorId && apt.doctor_id && doctorId === apt.doctor_id);
                  const canViewMedicalRecord = isSuperAdmin || isOwnDoctor;

                  const getStatusConfig = (status: string) => {
                    switch (status) {
                      case 'concluido':
                        return {
                          label: 'Concluído',
                          badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200/90',
                          dotBg: 'bg-emerald-500 text-white ring-4 ring-emerald-100',
                          cardBorder: 'hover:border-emerald-300/80',
                          icon: CheckCircle2,
                        };
                      case 'cancelado':
                        return {
                          label: 'Cancelado',
                          badgeClass: 'bg-rose-50 text-rose-700 border-rose-200/90',
                          dotBg: 'bg-rose-500 text-white ring-4 ring-rose-100',
                          cardBorder: 'hover:border-rose-300/80',
                          icon: XCircle,
                        };
                      case 'nao_compareceu':
                        return {
                          label: 'Faltou',
                          badgeClass: 'bg-slate-50 text-slate-700 border-slate-200/90',
                          dotBg: 'bg-slate-500 text-white ring-4 ring-slate-100',
                          cardBorder: 'hover:border-slate-300/80',
                          icon: UserX,
                        };
                      case 'agendado':
                        return {
                          label: 'Agendado',
                          badgeClass: 'bg-amber-50 text-amber-700 border-amber-200/90',
                          dotBg: 'bg-amber-500 text-white ring-4 ring-amber-100',
                          cardBorder: 'hover:border-amber-300/80',
                          icon: Clock,
                        };
                      case 'confirmado':
                        return {
                          label: 'Confirmado',
                          badgeClass: 'bg-blue-50 text-blue-700 border-blue-200/90',
                          dotBg: 'bg-blue-500 text-white ring-4 ring-blue-100',
                          cardBorder: 'hover:border-blue-300/80',
                          icon: CheckCircle2,
                        };
                      case 'em_atendimento':
                        return {
                          label: 'Em Atendimento',
                          badgeClass: 'bg-purple-50 text-purple-700 border-purple-200/90',
                          dotBg: 'bg-purple-500 text-white ring-4 ring-purple-100',
                          cardBorder: 'hover:border-purple-300/80',
                          icon: Activity,
                        };
                      case 'reagendado':
                        return {
                          label: 'Reagendado',
                          badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200/90',
                          dotBg: 'bg-indigo-500 text-white ring-4 ring-indigo-100',
                          cardBorder: 'hover:border-indigo-300/80',
                          icon: RefreshCw,
                        };
                      default:
                        return {
                          label: status.replace('_', ' '),
                          badgeClass: 'bg-slate-50 text-slate-700 border-slate-200/90',
                          dotBg: 'bg-slate-400 text-white ring-4 ring-slate-100',
                          cardBorder: 'hover:border-slate-300/80',
                          icon: Calendar,
                        };
                    }
                  };

                  const statusConfig = getStatusConfig(apt.status);
                  const StatusIcon = statusConfig.icon;
                  const regLabel = formatDoctorRegistration(apt.doctor_council, apt.doctor_crm);
                  const cleanReason = sanitizeReason(apt.reason);

                  return (
                    <div key={apt.id} className="relative group">
                      {/* Timeline Node */}
                      <div className={cn(
                        "absolute -left-[32px] top-3.5 h-6 w-6 rounded-full flex items-center justify-center transition-transform duration-200 group-hover:scale-110 z-10 shadow-2xs",
                        statusConfig.dotBg
                      )}>
                        <StatusIcon className="h-3.5 w-3.5" />
                      </div>
                      
                      {/* Timeline Card */}
                      <div 
                        className={cn(
                          "bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs transition-all duration-200",
                          canViewMedicalRecord 
                            ? "hover:shadow-md hover:-translate-y-0.5 cursor-pointer" 
                            : "cursor-default",
                          statusConfig.cardBorder
                        )}
                        onClick={() => {
                          if (!canViewMedicalRecord) return;
                          setSelectedAppointment(apt);
                          setIsProntuarioOpen(true);
                        }}
                      >
                        {/* Top Row: Specialty + Status Badge */}
                        <div className="flex items-center justify-between gap-2 mb-2.5">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-blue-700 bg-blue-50/90 border border-blue-100 px-2.5 py-0.5 rounded-md">
                            {apt.specialty_name}
                          </span>

                          <Badge variant="outline" className={cn(
                            "text-[10px] uppercase font-bold px-2 py-0.5 rounded-full flex items-center gap-1 border shrink-0",
                            statusConfig.badgeClass
                          )}>
                            <StatusIcon className="h-3 w-3 shrink-0" />
                            {statusConfig.label}
                          </Badge>
                        </div>

                        {/* Date and Time Row */}
                        <div className="flex items-center gap-2 mb-3 text-slate-600 bg-slate-50/80 rounded-xl p-2 border border-slate-100">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                            <Calendar className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                            <span>{formatOperationalDate(apt.appointment_date)}</span>
                          </div>
                          <span className="text-slate-300 text-xs">•</span>
                          <div className="flex items-center gap-1 text-xs font-semibold text-slate-500">
                            <Clock className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                            <span>{formatOperationalTime(apt.appointment_date)}</span>
                          </div>
                        </div>

                        {/* Professional Info */}
                        <div className="flex items-center gap-2.5 text-xs text-slate-700">
                          <div className="w-7 h-7 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
                            <User className="h-3.5 w-3.5 text-slate-600" />
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                            <span className="font-bold text-slate-800 truncate">{apt.doctor_name}</span>
                            {regLabel && (
                              <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200/80 shrink-0">
                                {regLabel}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Motivo da Consulta */}
                        {cleanReason && (
                          <div className="mt-2.5 bg-slate-50/70 border-l-2 border-slate-300 rounded-r-xl p-2.5 text-xs text-slate-600">
                            <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-0.5 flex items-center gap-1">
                              <FileText className="h-3 w-3 text-slate-400" />
                              Motivo da Consulta
                            </div>
                            <p className="font-medium text-slate-700 italic">
                              {cleanReason}
                            </p>
                          </div>
                        )}

                        {/* Rodapé / Ação */}
                        {canViewMedicalRecord && (
                          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between">
                            <span className="text-[11px] text-slate-400 font-medium">
                              Prontuário médico
                            </span>
                            <span className="text-xs font-bold text-blue-600 group-hover:text-blue-700 flex items-center gap-1 transition-all group-hover:translate-x-0.5">
                              <span>Ver Prontuário</span>
                              <ChevronRight className="h-3.5 w-3.5" />
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {selectedAppointment && (
        <MedicalRecordDialog 
          open={isProntuarioOpen} 
          onClose={() => { setIsProntuarioOpen(false); setSelectedAppointment(null); }} 
          appointmentId={selectedAppointment.id} 
          initialData={selectedAppointment}
          mode={isSuperadmin || isOwnRecord(selectedAppointment.doctor_id) ? 'edit' : 'view'}
          allowClinicalActions={isSuperadmin || isOwnRecord(selectedAppointment.doctor_id)}
          onSuccess={() => {}}
        />
      )}
    </>
  );
};

