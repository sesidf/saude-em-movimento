import { chamarApiPost } from '@/lib/workerApi';
import { TimeSlot, SchedulePolicy, DoctorOption } from '@/types/appointments';
import { formatOperationalTime } from '@/lib/operationalDateTime';

/**
 * Busca e normaliza os horários (slots) disponíveis para um médico em uma determinada data.
 * Caso o procedimento RPC retorne vazio devido a divergências de instituição ou RLS,
 * gera sinteticamente a grade de horários com base na disponibilidade cadastrada do profissional.
 * 
 * @param doctorId - ID do profissional de saúde (UUID)
 * @param bookingDate - Data no formato YYYY-MM-DD
 * @param institutionId - ID da instituição (opcional)
 * @returns Lista de TimeSlot normalizada
 */
export async function buscarSlotsAgenda(
  doctorId: string,
  bookingDate: string,
  institutionId?: string | null,
  patientId?: string | null
): Promise<TimeSlot[]> {
  if (!doctorId || !bookingDate) return [];

  try {
    const { data, error } = await chamarApiPost<any[]>('/api/agenda/list_available_appointment_slots', {
      doctor_id: doctorId,
      booking_date: bookingDate,
      institution_id: institutionId || null,
      patient_id: patientId || null,
    });

    if (error) {
      console.warn('[buscarSlotsAgenda] Alerta ao chamar RPC list_available_appointment_slots:', (typeof error === 'string' ? error : (error as any)?.message || 'Erro desconhecido'));
    }

    const rawSlots = (data as unknown as any[] | null) || [];

    let normalizedSlots: TimeSlot[] = rawSlots.map((item) => {
      let startsAt = item.starts_at || item.slot_start || '';
      let endsAt = item.ends_at || item.slot_end || '';

      if (startsAt) {
        const d = new Date(startsAt);
        if (!isNaN(d.getTime())) startsAt = d.toISOString();
      }
      if (endsAt) {
        const d = new Date(endsAt);
        if (!isNaN(d.getTime())) endsAt = d.toISOString();
      }

      let timeStr = item.time || '';
      if (!timeStr && startsAt) {
        const dateObj = new Date(startsAt);
        if (!isNaN(dateObj.getTime())) {
          timeStr = dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
        }
      }

      let status = item.status;
      if (!status) {
        status = item.is_available ? 'free' : 'booked';
      }

      return {
        time: timeStr,
        starts_at: startsAt,
        ends_at: endsAt,
        status: status,
        block_reason: item.block_reason || null,
        appointment: item.appointment || (item.conflicts && item.conflicts[0] ? item.conflicts[0] : null),
        is_out_of_hours: item.is_out_of_hours || false,
      };
    });

    // Fallback de segurança se o RPC retornar vazio
    if (normalizedSlots.length === 0) {
      const [year, month, day] = bookingDate.split('-').map(Number);
      const localDate = new Date(year, month - 1, day, 12, 0, 0);
      const weekday = localDate.getDay(); // 0 (Dom) a 6 (Sáb)

      const [availRes, apptsRes] = await Promise.all([
        chamarApiPost<any[]>('/api/agenda/doctor_availability', {
          doctor_id: doctorId,
          weekday: weekday
        }),
        chamarApiPost<any[]>('/api/agenda/appointments', {
          doctor_id: doctorId,
          booking_date: bookingDate
        })
      ]);

      const availabilities = availRes.data || [];
      const appointments = apptsRes.data || [];

      if (availabilities.length > 0) {
        const generatedSlots: TimeSlot[] = [];
        for (const avail of availabilities) {
          const startHour = parseInt(avail.starts_at.slice(0, 2), 10);
          const startMin = parseInt(avail.starts_at.slice(3, 5), 10);
          const endHour = parseInt(avail.ends_at.slice(0, 2), 10);
          const endMin = parseInt(avail.ends_at.slice(3, 5), 10);

          let currentMinutes = startHour * 60 + startMin;
          const targetEndMinutes = endHour * 60 + endMin;
          const step = avail.slot_minutes || 5;

          while (currentMinutes + step <= targetEndMinutes) {
            const h = Math.floor(currentMinutes / 60);
            const m = currentMinutes % 60;
            const hhStr = String(h).padStart(2, '0');
            const mmStr = String(m).padStart(2, '0');
            const timeFormatted = `${hhStr}:${mmStr}`;

            const slotStartIso = `${bookingDate}T${hhStr}:${mmStr}:00.000Z`;
            const endCurrent = currentMinutes + step;
            const endH = Math.floor(endCurrent / 60);
            const endM = endCurrent % 60;
            const slotEndIso = `${bookingDate}T${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}:00.000Z`;

            const matchingAppt = appointments.find((a) => {
              const apptTime = new Date(a.appointment_date).toLocaleTimeString('pt-BR', {
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'America/Sao_Paulo'
              });
              return apptTime === timeFormatted;
            });

            generatedSlots.push({
              time: timeFormatted,
              starts_at: slotStartIso,
              ends_at: slotEndIso,
              status: matchingAppt ? 'booked' : 'free',
              appointment: matchingAppt ? {
                id: matchingAppt.id,
                patient_id: matchingAppt.patient_id,
                specialty_id: matchingAppt.specialty_id,
                specialty_name: matchingAppt.specialty?.name,
                institution_id: matchingAppt.institution_id,
                institution_name: matchingAppt.institution?.name,
                status: matchingAppt.status,
                appointment_date: matchingAppt.appointment_date,
                end_date: matchingAppt.end_date,
                reason: matchingAppt.reason,
                patient_name: matchingAppt.patient?.full_name,
                patient_cpf: matchingAppt.patient?.cpf,
                rescheduled_appointment_id: matchingAppt.rescheduled_appointment_id ?? null,
              } : null
            });

            currentMinutes += step;
          }
        }
        normalizedSlots = generatedSlots;
      }
    }

    // Garantir no front-end que qualquer slot de 10 minutos (do RPC antigo) seja desdobrado em sub-slots de 5 minutos
    const expandedSlots: TimeSlot[] = [];
    for (const slot of normalizedSlots) {
      if (!slot.starts_at || !slot.ends_at) {
        expandedSlots.push(slot);
        continue;
      }
      const startMs = new Date(slot.starts_at).getTime();
      const endMs = new Date(slot.ends_at).getTime();
      const diffMins = Math.round((endMs - startMs) / 60000);

      if (diffMins > 5 && diffMins % 5 === 0) {
        const numSubSlots = Math.floor(diffMins / 5);
        for (let i = 0; i < numSubSlots; i++) {
          const subStartMs = startMs + i * 5 * 60000;
          const subEndMs = subStartMs + 5 * 60000;
          const subStartDate = new Date(subStartMs);
          const subEndDate = new Date(subEndMs);

          const timeFormatted = subStartDate.toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'America/Sao_Paulo',
          });

          let subStatus = slot.status;
          let subAppt = slot.appointment;

          if (slot.appointment) {
            const apptStartMs = new Date(slot.appointment.appointment_date).getTime();
            if (apptStartMs >= subStartMs && apptStartMs < subEndMs) {
              subStatus = slot.status;
              subAppt = slot.appointment;
            } else {
              subStatus = 'free';
              subAppt = null;
            }
          }

          expandedSlots.push({
            ...slot,
            time: timeFormatted,
            starts_at: subStartDate.toISOString(),
            ends_at: subEndDate.toISOString(),
            status: subStatus,
            appointment: subAppt,
          });
        }
      } else {
        expandedSlots.push(slot);
      }
    }

    return expandedSlots;
  } catch (err) {
    console.error('[buscarSlotsAgenda] Erro ao buscar horários:', err);
    return [];
  }
}

export interface ConsultaElegivelTransferencia {
  id: string;
  patient_id: string;
  patient_name: string;
  patient_cpf?: string | null;
  appointment_date: string;
  end_date: string;
  status: string;
  specialty_name?: string | null;
  institution_name?: string | null;
}

export interface ParametrosTransferencia {
  doctorOrigemId: string;
  doctorDestinoId: string;
  appointmentIds?: string[];
  dataInicio?: string | null;
  dataFim?: string | null;
  motivo?: string | null;
  idempotencyKey?: string | null;
}

export interface RespostaTransferencia {
  transferred_count: number;
  doctor_origem_id: string;
  doctor_destino_id: string;
  details: Array<{
    id: string;
    patient_name: string;
    appointment_date: string;
    status: string;
  }>;
}

/**
 * Busca todas as consultas ativas/elegíveis de um profissional de saúde em um determinado intervalo.
 * @param doctorId - ID do profissional de saúde de origem (UUID)
 * @param dataInicioIso - Data inicial em ISO (opcional)
 * @param dataFimIso - Data final em ISO (opcional)
 * @returns Lista de consultas elegíveis para transferência
 */
export async function buscarConsultasParaTransferencia(
  doctorId: string,
  dataInicioIso?: string | null,
  dataFimIso?: string | null
): Promise<ConsultaElegivelTransferencia[]> {
  if (!doctorId) return [];

  try {
    const { data, error } = await chamarApiPost<any[]>('/api/agenda/appointments_for_transfer', {
      doctor_id: doctorId,
      data_inicio: dataInicioIso || null,
      data_fim: dataFimIso || null
    });

    if (error) {
      console.error('[buscarConsultasParaTransferencia] Erro ao carregar consultas:', error);
      return [];
    }

    return (data || []).map((item: any) => ({
      id: item.id,
      patient_id: item.patient_id,
      patient_name: item.patient?.full_name || 'Paciente sem nome',
      patient_cpf: item.patient?.cpf || null,
      appointment_date: item.appointment_date,
      end_date: item.end_date,
      status: item.status,
      specialty_name: item.specialty?.name || null,
      institution_name: item.institution?.name || null,
    }));
  } catch (err) {
    console.error('[buscarConsultasParaTransferencia] Exceção:', err);
    return [];
  }
}

/**
 * Transfere agendamentos (em lote ou individuais) de um profissional de saúde origem para um destino.
 * @param params - Parâmetros da transferência
 * @returns Resposta com quantidade transferida e detalhes
 */
export async function transferirConsultasProfissional(
  params: ParametrosTransferencia
): Promise<RespostaTransferencia> {
  const { data, error } = await chamarApiPost<RespostaTransferencia>('/api/agenda/transferir_consultas_profissional', {
    doctor_id_origem: params.doctorOrigemId,
    doctor_id_destino: params.doctorDestinoId,
    appointment_ids: params.appointmentIds && params.appointmentIds.length > 0 ? params.appointmentIds : null,
    data_inicio: params.dataInicio || null,
    data_fim: params.dataFim || null,
    motivo: params.motivo || null,
    idempotency_key: params.idempotencyKey || null,
  });

  if (error) {
    throw new Error((typeof error === 'string' ? error : (error as any)?.message || 'Erro desconhecido') || 'Falha ao transferir consultas do profissional');
  }

  return data as RespostaTransferencia;
}

interface ItemAnaliseConflito {
  idConsulta: string;
  horario: string;
  startsAt: string;
  endsAt?: string;
  nomePacienteOrigem: string;
  temConflito: boolean;
  tipoConflito?: 'consulta' | 'bloqueio' | 'fora_escala';
  motivo?: string;
  consultaDestino?: {
    id: string;
    pacienteNome: string;
    horario: string;
    status: string;
  };
}

export interface ResultadoAnaliseConflito {
  totalSelecionadas: number;
  totalLivres: number;
  totalConflitos: number;
  detalhes: ItemAnaliseConflito[];
}

/**
 * Analisa a agenda do médico de destino para detectar se existem conflitos
 * nos mesmos horários das consultas selecionadas para transferência.
 *
 * @param doctorDestinoId - ID do profissional de saúde de destino
 * @param dataConsulta - Data da consulta no formato YYYY-MM-DD
 * @param consultasOrigem - Lista de consultas selecionadas para transferir
 * @returns Resultado detalhado da análise preditiva de conflitos
 */
export async function analisarConflitosTransferencia(
  doctorDestinoId: string,
  dataConsulta: string,
  consultasOrigem: Array<{
    id: string;
    starts_at: string;
    ends_at?: string;
    patient_name?: string;
    time?: string;
  }>
): Promise<ResultadoAnaliseConflito> {
  if (!doctorDestinoId || !dataConsulta || consultasOrigem.length === 0) {
    return {
      totalSelecionadas: consultasOrigem.length,
      totalLivres: 0,
      totalConflitos: 0,
      detalhes: [],
    };
  }

  try {
    const dataInicioIso = `${dataConsulta}T00:00:00.000Z`;
    const dataFimIso = `${dataConsulta}T23:59:59.999Z`;

    // 1. Busca os agendamentos existentes do médico de destino nesta data
    const { data: apptsDestino, error } = await chamarApiPost<any[]>('/api/agenda/appointments', {
      doctor_id: doctorDestinoId,
      booking_date: dataConsulta
    });

    if (error) {
      console.warn('[analisarConflitosTransferencia] Erro ao buscar consultas do destino:', (typeof error === 'string' ? error : (error as any)?.message || 'Erro desconhecido'));
    }

    // 2. Busca também os horários e bloqueios do médico de destino
    let slotsBloqueados = new Set<string>();
    try {
      const slotsDestino = await buscarSlotsAgenda(doctorDestinoId, dataConsulta);
      slotsBloqueados = new Set(
        slotsDestino
          .filter((s) => s.status === 'blocked')
          .map((s) => s.starts_at)
      );
    } catch (slotErr) {
      console.warn('[analisarConflitosTransferencia] Não foi possível obter slots do destino:', slotErr);
    }

    const appointmentsDestino = (apptsDestino || []).map((a: any) => ({
      id: a.id,
      appointment_date: a.appointment_date,
      end_date: a.end_date,
      status: a.status,
      patient_name: a.patient?.full_name || 'Paciente',
    }));

    const detalhes: ItemAnaliseConflito[] = [];
    let totalLivres = 0;
    let totalConflitos = 0;

    for (const consulta of consultasOrigem) {
      const timeStr = consulta.time || (consulta.starts_at ? formatOperationalTime(consulta.starts_at) : '');

      // Verifica se há consulta no mesmo horário de início ou sobreposição
      const conflitoConsulta = appointmentsDestino.find((ad) => {
        if (ad.appointment_date === consulta.starts_at) return true;
        const horaAd = formatOperationalTime(ad.appointment_date);
        return horaAd === timeStr && Boolean(timeStr);
      });

      const isBloqueado = slotsBloqueados.has(consulta.starts_at);

      if (conflitoConsulta) {
        totalConflitos++;
        detalhes.push({
          idConsulta: consulta.id,
          horario: timeStr,
          startsAt: consulta.starts_at,
          endsAt: consulta.ends_at,
          nomePacienteOrigem: consulta.patient_name || 'Paciente',
          temConflito: true,
          tipoConflito: 'consulta',
          motivo: `Dr(a). destino já possui consulta agendada com "${conflitoConsulta.patient_name}" às ${timeStr}`,
          consultaDestino: {
            id: conflitoConsulta.id,
            pacienteNome: conflitoConsulta.patient_name,
            horario: timeStr,
            status: conflitoConsulta.status,
          },
        });
      } else if (isBloqueado) {
        totalConflitos++;
        detalhes.push({
          idConsulta: consulta.id,
          horario: timeStr,
          startsAt: consulta.starts_at,
          endsAt: consulta.ends_at,
          nomePacienteOrigem: consulta.patient_name || 'Paciente',
          temConflito: true,
          tipoConflito: 'bloqueio',
          motivo: `O horário ${timeStr} está bloqueado na grade do Dr(a). destino`,
        });
      } else {
        totalLivres++;
        detalhes.push({
          idConsulta: consulta.id,
          horario: timeStr,
          startsAt: consulta.starts_at,
          endsAt: consulta.ends_at,
          nomePacienteOrigem: consulta.patient_name || 'Paciente',
          temConflito: false,
          motivo: `Horário ${timeStr} 100% livre na agenda do Dr(a). destino`,
        });
      }
    }

    return {
      totalSelecionadas: consultasOrigem.length,
      totalLivres,
      totalConflitos,
      detalhes,
    };
  } catch (err) {
    console.error('[analisarConflitosTransferencia] Exceção:', err);
    return {
      totalSelecionadas: consultasOrigem.length,
      totalLivres: consultasOrigem.length,
      totalConflitos: 0,
      detalhes: consultasOrigem.map((c) => ({
        idConsulta: c.id,
        horario: c.time || (c.starts_at ? formatOperationalTime(c.starts_at) : ''),
        startsAt: c.starts_at,
        endsAt: c.ends_at,
        nomePacienteOrigem: c.patient_name || 'Paciente',
        temConflito: false,
      })),
    };
  }
}

export interface AjusteHorarioSugerido {
  idConsultaOrigem: string;
  nomePaciente: string;
  horarioOriginal: string;
  startsAtOriginal: string;
  horarioSugerido: string;
  startsAtSugerido: string;
  endsAtSugerido: string;
}

export interface SugestaoProfissionalDestino {
  doctor: DoctorOption;
  mesmaEspecialidade: boolean;
  totalLivres: number;
  totalConflitos: number;
  taxaCompatibilidade: number; // 0 a 100
  totalComAutoAjuste: number;
  ajustesSugeridos: AjusteHorarioSugerido[];
  motivoRecomendacao: string;
}

/**
 * Analisa autonomamente todos os profissionais de saúde disponíveis para identificar
 * os mais compatíveis com as consultas selecionadas para transferência.
 */
export async function buscarSugestoesProfissionaisCompativeis(
  doctorOrigemId: string,
  doctorOrigemEspecialidadeId: string | null | undefined,
  dataConsulta: string,
  consultasOrigem: Array<{
    id: string;
    starts_at: string;
    ends_at?: string;
    patient_name?: string;
    time?: string;
  }>,
  candidatos: DoctorOption[]
): Promise<SugestaoProfissionalDestino[]> {
  if (!dataConsulta || consultasOrigem.length === 0 || candidatos.length === 0) {
    return [];
  }

  // Filtra apenas médicos diferentes da origem
  const medicosCandidatos = candidatos.filter((c) => c.id !== doctorOrigemId);

  const sugestoes: SugestaoProfissionalDestino[] = [];

  // Analisa os candidatos
  await Promise.all(
    medicosCandidatos.map(async (medico) => {
      try {
        const analise = await analisarConflitosTransferencia(medico.id, dataConsulta, consultasOrigem);
        const mesmaEspecialidade = Boolean(
          doctorOrigemEspecialidadeId && medico.specialty_id === doctorOrigemEspecialidadeId
        );

        const totalSelecionadas = consultasOrigem.length;
        const taxaCompatibilidade = totalSelecionadas > 0
          ? Math.round((analise.totalLivres / totalSelecionadas) * 100)
          : 0;

        // Se houver conflitos, tenta encontrar vagas livres no médico destino para auto-ajuste inteligente
        const ajustesSugeridos: AjusteHorarioSugerido[] = [];
        if (analise.totalConflitos > 0) {
          try {
            const slotsDestino = await buscarSlotsAgenda(medico.id, dataConsulta);
            // Slots livres no destino que não coincidam com nenhuma consulta que já vai ser transferida
            const startsAtOcupadosPorTransferencia = new Set(
              analise.detalhes.filter((d) => !d.temConflito).map((d) => d.startsAt)
            );

            const slotsLivresDestino = slotsDestino.filter(
              (s) =>
                (s.status === 'free' || s.status === 'past') &&
                !s.block_reason &&
                !s.appointment &&
                !startsAtOcupadosPorTransferencia.has(s.starts_at)
            );

            const reservadosNoAjuste = new Set<string>();

            for (const itemConflito of analise.detalhes.filter((d) => d.temConflito)) {
              // Procura a vaga livre mais próxima do horário original
              const vagasDisponiveis = slotsLivresDestino.filter(
                (v) => !reservadosNoAjuste.has(v.starts_at)
              );

              if (vagasDisponiveis.length > 0) {
                // Ordena por proximidade absoluta em relação ao horário original
                vagasDisponiveis.sort((a, b) => {
                  const distA = Math.abs(new Date(a.starts_at).getTime() - new Date(itemConflito.startsAt).getTime());
                  const distB = Math.abs(new Date(b.starts_at).getTime() - new Date(itemConflito.startsAt).getTime());
                  return distA - distB;
                });

                const melhorVaga = vagasDisponiveis[0];
                reservadosNoAjuste.add(melhorVaga.starts_at);

                ajustesSugeridos.push({
                  idConsultaOrigem: itemConflito.idConsulta,
                  nomePaciente: itemConflito.nomePacienteOrigem,
                  horarioOriginal: itemConflito.horario,
                  startsAtOriginal: itemConflito.startsAt,
                  horarioSugerido: melhorVaga.time,
                  startsAtSugerido: melhorVaga.starts_at,
                  endsAtSugerido: melhorVaga.ends_at,
                });
              }
            }
          } catch (slotErr) {
            console.warn('[buscarSugestoesProfissionaisCompativeis] Erro ao buscar vagas para auto-ajuste:', slotErr);
          }
        }

        let motivo = '';
        if (taxaCompatibilidade === 100) {
          motivo = mesmaEspecialidade
            ? '100% dos horários livres na mesma especialidade (Recomendado)'
            : '100% dos horários livres na grade';
        } else if (analise.totalLivres + ajustesSugeridos.length === totalSelecionadas) {
          motivo = `${analise.totalLivres} horários livres diretos + ${ajustesSugeridos.length} com auto-ajuste de vaga`;
        } else {
          motivo = `${analise.totalLivres} de ${totalSelecionadas} horários compatíveis (${taxaCompatibilidade}%)`;
        }

        sugestoes.push({
          doctor: medico,
          mesmaEspecialidade,
          totalLivres: analise.totalLivres,
          totalConflitos: analise.totalConflitos,
          taxaCompatibilidade,
          totalComAutoAjuste: analise.totalLivres + ajustesSugeridos.length,
          ajustesSugeridos,
          motivoRecomendacao: motivo,
        });
      } catch (err) {
        console.warn('[buscarSugestoesProfissionaisCompativeis] Erro ao analisar candidato:', medico.id, err);
      }
    })
  );

  // Ordena por:
  // 1º Taxa de compatibilidade total (direta + auto-ajuste)
  // 2º Mesma especialidade
  // 3º Nome alfabético
  sugestoes.sort((a, b) => {
    if (b.totalComAutoAjuste !== a.totalComAutoAjuste) {
      return b.totalComAutoAjuste - a.totalComAutoAjuste;
    }
    if (b.taxaCompatibilidade !== a.taxaCompatibilidade) {
      return b.taxaCompatibilidade - a.taxaCompatibilidade;
    }
    if (a.mesmaEspecialidade !== b.mesmaEspecialidade) {
      return a.mesmaEspecialidade ? -1 : 1;
    }
    return (a.doctor.full_name || '').localeCompare(b.doctor.full_name || '');
  });

  return sugestoes;
}

export interface ParametrosTransferenciaComAutoAjuste {
  doctorOrigemId: string;
  doctorDestinoId: string;
  idsDiretos: string[];
  ajustesHorarios: AjusteHorarioSugerido[];
  motivo?: string | null;
  idempotencyKey?: string | null;
}

/**
 * Transfere agendamentos para o novo médico e auto-ajusta os horários conflitantes para as vagas livres mais próximas.
 */
export async function transferirConsultasComAutoAjuste(
  params: ParametrosTransferenciaComAutoAjuste
): Promise<{ totalTransferidas: number; totalAjustadas: number }> {
  const todosIds = [...params.idsDiretos, ...params.ajustesHorarios.map((a) => a.idConsultaOrigem)];

  if (todosIds.length === 0) {
    return { totalTransferidas: 0, totalAjustadas: 0 };
  }

  // 1. Executa a transferência de profissional para todas as consultas via RPC
  const resTransferencia = await transferirConsultasProfissional({
    doctorOrigemId: params.doctorOrigemId,
    doctorDestinoId: params.doctorDestinoId,
    appointmentIds: todosIds,
    motivo: params.motivo || 'Transferência inteligente de consultas com auto-ajuste',
    idempotencyKey: params.idempotencyKey,
  });

  let totalAjustadas = 0;

  // 2. Para as consultas que precisam de auto-ajuste de horário, reagenda para a nova vaga do médico destino
  for (const ajuste of params.ajustesHorarios) {
    try {
      const { error } = await chamarApiPost('/api/agenda/reschedule_appointment', {
        appointment_id: ajuste.idConsultaOrigem,
        start_at: ajuste.startsAtSugerido,
        end_at: ajuste.endsAtSugerido,
        reason: 'Auto-ajuste de horário durante transferência inteligente de agenda',
        idempotency_key: params.idempotencyKey
          ? `${params.idempotencyKey}_ajuste_${ajuste.idConsultaOrigem}`
          : null,
      });

      if (!error) {
        totalAjustadas++;
      } else {
        console.warn(`[transferirConsultasComAutoAjuste] Alerta ao auto-ajustar ${ajuste.idConsultaOrigem}:`, (typeof error === 'string' ? error : (error as any)?.message || 'Erro desconhecido'));
      }
    } catch (ajusteErr) {
      console.warn(`[transferirConsultasComAutoAjuste] Erro no ajuste de ${ajuste.idConsultaOrigem}:`, ajusteErr);
    }
  }

  return {
    totalTransferidas: resTransferencia.transferred_count,
    totalAjustadas,
  };
}

/**
 * Retorna a chave de query padronizada para os slots da agenda.
 */
export function obterChaveQueryAgenda(
  doctorId: string,
  bookingDate: string,
  institutionId?: string | null
) {
  return ['agendaSlots', doctorId, bookingDate, institutionId || ''] as const;
}

export interface RespostaDadosAgenda {
  slots: TimeSlot[];
  policy: SchedulePolicy | null;
}

/**
 * Busca slots da agenda e snapshot de política unificada em paralelo com tratamento de erros.
 */
export async function buscarDadosAgendaComPolitica(
  doctorId: string,
  bookingDate: string,
  institutionId?: string | null
): Promise<RespostaDadosAgenda> {
  if (!doctorId || !bookingDate) {
    return { slots: [], policy: null };
  }

  const [fetchedSlots, policyResult] = await Promise.all([
    buscarSlotsAgenda(
      doctorId,
      bookingDate,
      institutionId === '' ? null : (institutionId || null)
    ),
    chamarApiPost<SchedulePolicy | null>('/api/agenda/get_schedule_policy_snapshot', {
      doctor_id: doctorId,
      booking_date: bookingDate,
    }),
  ]);

  if (policyResult.error) {
    console.warn('[buscarDadosAgendaComPolitica] Snapshot de política indisponível:', (typeof policyResult.error === 'string' ? policyResult.error : (policyResult.error as any)?.message || 'Erro desconhecido'));
    return { slots: fetchedSlots, policy: null };
  }

  return {
    slots: fetchedSlots,
    policy: policyResult.data as SchedulePolicy | null,
  };
}


