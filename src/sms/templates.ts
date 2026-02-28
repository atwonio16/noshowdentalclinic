import { formatDateForRo, formatTimeForRo } from '../utils/datetime';

export function buildConfirmRequestSms(input: {
  appointmentStartIso: string;
  timezone: string;
  deadlineHour: number;
  confirmLink: string;
  cancelLink: string;
}): string {
  const date = formatDateForRo(input.appointmentStartIso, input.timezone);
  const time = formatTimeForRo(input.appointmentStartIso, input.timezone);
  const deadline = `${String(input.deadlineHour).padStart(2, '0')}:00`;

  return [
    `Aveti programare la clinica pe ${date}, ora ${time}.`,
    `Confirmati pana azi la ${deadline}: ${input.confirmLink}`,
    `Anulare: ${input.cancelLink}`,
    'Neconfirmarea duce la anulare automata.'
  ].join('\n');
}

export function buildAutoCancelSms(input: {
  appointmentStartIso: string;
  timezone: string;
}): string {
  const date = formatDateForRo(input.appointmentStartIso, input.timezone);
  const time = formatTimeForRo(input.appointmentStartIso, input.timezone);

  return [
    `Programarea din ${date}, ora ${time} a fost anulata automat deoarece nu a fost confirmata pana la termen.`,
    'Pentru reprogramare, contactati clinica.'
  ].join('\n');
}

export function buildConfirmedAckSms(input: {
  appointmentStartIso: string;
  timezone: string;
}): string {
  const date = formatDateForRo(input.appointmentStartIso, input.timezone);
  const time = formatTimeForRo(input.appointmentStartIso, input.timezone);

  return `Programarea din ${date}, ora ${time} a fost confirmata. Va asteptam.`;
}