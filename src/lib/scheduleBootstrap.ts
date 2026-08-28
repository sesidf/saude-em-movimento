import { chamarApiPost, chamarApiGet } from '@/lib/workerApi';
import { buildIdempotencyKey } from '@/lib/idempotency';

type DefaultDoctorAvailabilityInput = {
  doctorId: string;
  institutionId?: string | null;
  slotMinutes?: number | null;
  weekdays?: number[];
  startsAt?: string;
  endsAt?: string;
};

const DEFAULT_WEEKDAYS = [1, 2, 3, 4, 5];
const DEFAULT_START = '08:00';
const DEFAULT_END = '17:00';

export async function applyDefaultDoctorAvailability({
  doctorId,
  institutionId,
  slotMinutes,
  weekdays = DEFAULT_WEEKDAYS,
  startsAt = DEFAULT_START,
  endsAt = DEFAULT_END,
}: DefaultDoctorAvailabilityInput) {
  if (!doctorId) {
    throw new Error('Profissional obrigatorio para criar disponibilidade padrao.');
  }

  // Silenciar o warning do institutionId que se tornou desnecessário com escalas globais
  void institutionId;

  const normalizedSlotMinutes = Math.max(Number(slotMinutes || 5), 5);

  for (const weekday of weekdays) {
    const formattedStartsAt = startsAt.slice(0, 5).length === 5 ? `${startsAt.slice(0, 5)}:00` : startsAt;
    const formattedEndsAt = endsAt.slice(0, 5).length === 5 ? `${endsAt.slice(0, 5)}:00` : endsAt;

    // Forçamos o envio de institution_id como null na idempotência e na chamada ao RPC para remover qualquer vínculo institucional
    const p_idempotency_key = await buildIdempotencyKey('default_doctor_availability', {
      doctor_id: doctorId,
      institution_id: null,
      weekday,
      starts_at: formattedStartsAt,
      ends_at: formattedEndsAt,
      slot_minutes: normalizedSlotMinutes,
    });

    const { error } = await chamarApiPost('/api/rpc/api_set_doctor_availability', {
      p_institution_id: null,
      p_doctor_id: doctorId,
      p_weekday: weekday,
      p_starts_at: formattedStartsAt,
      p_ends_at: formattedEndsAt,
      p_slot_minutes: normalizedSlotMinutes,
      p_is_active: true,
      p_idempotency_key,
      p_availability_id: null,
    });

    if (error) throw error;
  }

  return {
    success: true,
    doctor_id: doctorId,
    institution_id: null,
    weekdays_applied: weekdays,
    starts_at: startsAt,
    ends_at: endsAt,
    slot_minutes: normalizedSlotMinutes,
  };
}
