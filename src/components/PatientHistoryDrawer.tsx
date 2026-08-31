import { useEffect, useState } from 'react';
import { patientService } from '@/servicos/patients';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  FileText, 
  Loader2, 
  Calendar, 
  Clock, 
  User, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  Activity,
  UserX
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import MedicalRecordDialog from '@/components/MedicalRecordDialog';

interface PatientHistoryDrawerProps {
  patientId?: string;
  patientIds?: string[];
  patientName: string;
  open?: boolean;
  isOpen?: boolean;
  onOpenChange: (open: boolean) => void;
}

export const PatientHistoryDrawer = ({
  patientId,
  patientIds,
  patientName,
  open,
  isOpen,
  onOpenChange,
}: PatientHistoryDrawerProps) => {
  const isDrawerOpen = open !== undefined ? open : (isOpen || false);
  const targetId = patientId || (patientIds && patientIds.length > 0 ? patientIds[0] : null);

  const [appointments, setAppointments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<any | null>(null);
  const [isProntuarioOpen, setIsProntuarioOpen] = useState(false);

  useEffect(() => {
    if (!isDrawerOpen || !targetId) return;

    let isMounted = true;
    const fetchHistory = async () => {
      try {
        setLoading(true);
        const data = await patientService.getHistory(targetId);
        if (isMounted) {
          setAppointments(data || []);
        }
      } catch (err) {
        console.error('Erro ao buscar histórico do paciente:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchHistory();
    return () => {
      isMounted = false;
    };
  }, [isDrawerOpen, targetId]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'finalizado':
        return (
          <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 flex items-center gap-1 font-semibold">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Atendido
          </Badge>
        );
      case 'em_atendimento':
        return (
          <Badge className="bg-amber-50 text-amber-700 border-amber-200 flex items-center gap-1 font-semibold">
            <Activity className="w-3 h-3 text-amber-600 animate-pulse" /> Em Atendimento
          </Badge>
        );
      case 'cancelado':
        return (
          <Badge className="bg-rose-50 text-rose-700 border-rose-200 flex items-center gap-1 font-semibold">
            <XCircle className="w-3 h-3 text-rose-600" /> Cancelado
          </Badge>
        );
      case 'nao_compareceu':
        return (
          <Badge className="bg-slate-100 text-slate-700 border-slate-300 flex items-center gap-1 font-semibold">
            <UserX className="w-3 h-3 text-slate-500" /> Falta
          </Badge>
        );
      default:
        return (
          <Badge className="bg-blue-50 text-blue-700 border-blue-200 flex items-center gap-1 font-semibold">
            <Clock className="w-3 h-3 text-blue-600" /> Agendado
          </Badge>
        );
    }
  };

  return (
    <>
      <Sheet open={isDrawerOpen} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-xl p-0 flex flex-col bg-slate-50 border-l border-slate-200">
          <SheetHeader className="p-6 pb-4 bg-white border-b border-slate-200/80 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-blue-50 border border-blue-100 rounded-xl text-blue-600">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <SheetTitle className="text-xl font-bold text-slate-900 leading-tight">
                  Prontuário & Histórico
                </SheetTitle>
                <p className="text-sm font-semibold text-slate-500 mt-0.5">
                  Paciente: <span className="text-blue-700 font-bold">{patientName}</span>
                </p>
              </div>
            </div>
          </SheetHeader>

          <ScrollArea className="flex-1 p-6">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                <span className="text-sm font-medium">Carregando histórico clínico...</span>
              </div>
            ) : appointments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-2 text-center text-slate-400">
                <AlertCircle className="w-10 h-10 stroke-1 text-slate-300" />
                <p className="text-sm font-semibold text-slate-600">Nenhum atendimento registrado</p>
                <p className="text-xs text-slate-400 max-w-[240px]">
                  Este paciente ainda não possui consultas no sistema.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {appointments.map((appt) => (
                  <div
                    key={appt.id}
                    onClick={() => {
                      setSelectedAppointment(appt);
                      setIsProntuarioOpen(true);
                    }}
                    className="p-4 bg-white rounded-2xl border border-slate-200/80 shadow-2xs hover:shadow-md hover:border-blue-300 transition-all cursor-pointer group"
                  >
                    <div className="flex items-center justify-between gap-2 mb-2.5">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-blue-600" />
                        <span className="text-xs font-bold text-slate-800">
                          {appt.appointment_date ? appt.appointment_date.split('T')[0].split('-').reverse().join('/') : '-'}
                        </span>
                        {appt.appointment_date && (
                          <span className="text-xs text-slate-400 font-medium">
                            às {appt.appointment_date.split('T')[1]?.substring(0, 5) || ''}
                          </span>
                        )}
                      </div>
                      {getStatusBadge(appt.status)}
                    </div>

                    <div className="flex flex-col gap-1 text-xs text-slate-600">
                      <div className="flex items-center gap-1.5 font-medium">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        <span className="font-semibold text-slate-800">{appt.doctor_name}</span>
                        {appt.specialty_name && (
                          <span className="text-slate-400">• {appt.specialty_name}</span>
                        )}
                      </div>
                      {appt.reason && (
                        <p className="text-slate-500 mt-1 line-clamp-2 italic">
                          "{appt.reason}"
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* Modal de Detalhes Clínicos da Consulta */}
      {selectedAppointment && (
        <MedicalRecordDialog
          isOpen={isProntuarioOpen}
          onOpenChange={setIsProntuarioOpen}
          appointment={selectedAppointment}
          onSaveSuccess={() => {
            if (targetId) {
              patientService.getHistory(targetId).then((data) => setAppointments(data || []));
            }
          }}
        />
      )}
    </>
  );
};
