import { formatDateForRo, formatTimeForRo } from '../utils/datetime';

export function buildClinicCancelNoticeEmail(input: {
  clinicName: string;
  appointmentStartIso: string;
  timezone: string;
  patientName?: string | null;
  providerName?: string | null;
  appointmentType: string;
  reason: 'auto' | 'patient';
}): { subject: string; text: string } {
  const date = formatDateForRo(input.appointmentStartIso, input.timezone);
  const time = formatTimeForRo(input.appointmentStartIso, input.timezone);
  const reasonText =
    input.reason === 'auto'
      ? 'a fost anulata automat (neconfirmata la termen)'
      : 'a fost anulata de pacient';

  const lines = [
    `Programarea ${reasonText}.`,
    `Data: ${date}`,
    `Ora: ${time}`,
    `Tip: ${input.appointmentType}`
  ];

  if (input.patientName) {
    lines.push(`Pacient: ${input.patientName}`);
  }

  if (input.providerName) {
    lines.push(`Medic: ${input.providerName}`);
  }

  return {
    subject: `[Confirmor] Programare anulata - ${input.clinicName}`,
    text: lines.join('\n')
  };
}