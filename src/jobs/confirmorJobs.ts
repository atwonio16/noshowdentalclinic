import { DateTime } from 'luxon';
import { env } from '../config/env';
import type { AppointmentRow, ClinicRow, TokenPurpose } from '../types/domain';
import { dayAfterTomorrowLocal, dayRangeUtc } from '../utils/datetime';
import { logError, logInfo, logWarn } from '../utils/logger';
import { getAppointmentsByStatusInRange, setAppointmentStatus } from '../db/appointments';
import { createOrRotateToken, getValidTokenForAppointment } from '../db/tokens';
import { finalizeMessage, reserveMessageSlot } from '../db/messages';
import { getSmsProvider } from '../sms/provider';
import { buildAutoCancelSms, buildConfirmRequestSms, buildConfirmedAckSms } from '../sms/templates';
import { sendEmail } from '../email/mailer';
import { buildClinicCancelNoticeEmail } from '../email/templates';
import { getManagerContactByClinicId } from '../db/users';

interface DayAfterTomorrowWindow {
  rangeStartUtcIso: string;
  rangeEndUtcIso: string;
  deadlineUtcIso: string;
  nowLocal: DateTime;
}

function getWindow(clinic: ClinicRow, now: DateTime = DateTime.now()): DayAfterTomorrowWindow {
  const nowLocal = now.setZone(clinic.timezone);
  const targetDayLocal = dayAfterTomorrowLocal(clinic.timezone, nowLocal);
  const range = dayRangeUtc(targetDayLocal);

  const deadlineLocal = nowLocal.startOf('day').set({
    hour: clinic.deadline_hour,
    minute: 0,
    second: 0,
    millisecond: 0
  });

  const deadlineUtcIso = deadlineLocal.toUTC().toISO();
  if (!deadlineUtcIso) {
    throw new Error('Could not compute deadline UTC timestamp');
  }

  return {
    rangeStartUtcIso: range.startUtcIso,
    rangeEndUtcIso: range.endUtcIso,
    deadlineUtcIso,
    nowLocal
  };
}

async function getOrCreateToken(input: {
  appointmentId: string;
  purpose: TokenPurpose;
  expiresAtIso: string;
  now: DateTime;
}): Promise<string> {
  const existing = await getValidTokenForAppointment(input.appointmentId, input.purpose, input.now);
  if (existing) {
    return existing.token;
  }

  const created = await createOrRotateToken({
    appointmentId: input.appointmentId,
    purpose: input.purpose,
    expiresAtIso: input.expiresAtIso
  });

  return created.token;
}

async function sendClinicCancellationNotice(input: {
  clinic: ClinicRow;
  appointment: AppointmentRow;
  reason: 'auto' | 'patient';
}): Promise<void> {
  const managerContact = await getManagerContactByClinicId(input.clinic.id);
  if (!managerContact?.email) {
    logWarn('Could not send clinic cancellation notice; manager email missing', {
      clinicId: input.clinic.id,
      appointmentId: input.appointment.id
    });
    return;
  }

  const slot = await reserveMessageSlot({
    appointmentId: input.appointment.id,
    channel: 'email',
    template: 'clinic_cancel_notice',
    to: managerContact.email
  });

  if (slot === 'skip') {
    return;
  }

  try {
    const template = buildClinicCancelNoticeEmail({
      clinicName: input.clinic.name,
      appointmentStartIso: input.appointment.start_datetime,
      timezone: input.clinic.timezone,
      patientName: input.appointment.patient_name,
      providerName: input.appointment.provider_name,
      appointmentType: input.appointment.appointment_type,
      reason: input.reason
    });

    const emailResult = await sendEmail({
      to: managerContact.email,
      subject: template.subject,
      text: template.text
    });

    await finalizeMessage({
      appointmentId: input.appointment.id,
      channel: 'email',
      template: 'clinic_cancel_notice',
      providerMessageId: emailResult.messageId,
      deliveryStatus: emailResult.status,
      raw: emailResult.raw
    });
  } catch (error) {
    await finalizeMessage({
      appointmentId: input.appointment.id,
      channel: 'email',
      template: 'clinic_cancel_notice',
      deliveryStatus: 'failed',
      raw: { error: String(error) }
    });
  }
}

export async function runConfirmRequestJobForClinic(clinic: ClinicRow): Promise<void> {
  const window = getWindow(clinic);
  const deadlineLocal = window.nowLocal.startOf('day').set({ hour: clinic.deadline_hour, minute: 0, second: 0, millisecond: 0 });

  if (window.nowLocal >= deadlineLocal) {
    logInfo('Skipping confirm request job because deadline already passed for today', { clinicId: clinic.id });
    return;
  }

  const pendingAppointments = await getAppointmentsByStatusInRange(
    clinic.id,
    ['pending'],
    window.rangeStartUtcIso,
    window.rangeEndUtcIso
  );

  const smsProvider = getSmsProvider();

  for (const appointment of pendingAppointments) {
    try {
      const slot = await reserveMessageSlot({
        appointmentId: appointment.id,
        channel: 'sms',
        template: 'confirm_request',
        to: appointment.phone
      });

      if (slot === 'skip') {
        continue;
      }

      const confirmToken = await getOrCreateToken({
        appointmentId: appointment.id,
        purpose: 'confirm',
        expiresAtIso: window.deadlineUtcIso,
        now: window.nowLocal
      });

      const cancelToken = await getOrCreateToken({
        appointmentId: appointment.id,
        purpose: 'cancel',
        expiresAtIso: window.deadlineUtcIso,
        now: window.nowLocal
      });

      const confirmLink = `${env.APP_BASE_URL}/c/${confirmToken}`;
      const cancelLink = `${env.APP_BASE_URL}/x/${cancelToken}`;

      const body = buildConfirmRequestSms({
        appointmentStartIso: appointment.start_datetime,
        timezone: clinic.timezone,
        deadlineHour: clinic.deadline_hour,
        confirmLink,
        cancelLink
      });

      const smsResult = await smsProvider.send({
        to: appointment.phone,
        body
      });

      await finalizeMessage({
        appointmentId: appointment.id,
        channel: 'sms',
        template: 'confirm_request',
        providerMessageId: smsResult.providerMessageId,
        deliveryStatus: smsResult.deliveryStatus,
        raw: smsResult.raw
      });
    } catch (error) {
      logError('Confirm request SMS failed', error);
      await finalizeMessage({
        appointmentId: appointment.id,
        channel: 'sms',
        template: 'confirm_request',
        deliveryStatus: 'failed',
        raw: { error: String(error) }
      });
    }
  }
}

export async function runAutoCancelJobForClinic(clinic: ClinicRow): Promise<void> {
  const window = getWindow(clinic);

  const pendingAppointments = await getAppointmentsByStatusInRange(
    clinic.id,
    ['pending'],
    window.rangeStartUtcIso,
    window.rangeEndUtcIso
  );

  const autoCanceledNow: AppointmentRow[] = [];
  for (const appointment of pendingAppointments) {
    const updated = await setAppointmentStatus(appointment.id, 'canceled_auto', ['pending']);
    if (updated) {
      autoCanceledNow.push(updated);
    }
  }

  if (autoCanceledNow.length > 0) {
    logInfo('Auto-canceled pending appointments', {
      clinicId: clinic.id,
      count: autoCanceledNow.length
    });
  }

  const allAutoCanceled = await getAppointmentsByStatusInRange(
    clinic.id,
    ['canceled_auto'],
    window.rangeStartUtcIso,
    window.rangeEndUtcIso
  );

  const smsProvider = getSmsProvider();

  for (const appointment of allAutoCanceled) {
    const slot = await reserveMessageSlot({
      appointmentId: appointment.id,
      channel: 'sms',
      template: 'auto_cancel_notice',
      to: appointment.phone
    });

    if (slot === 'send') {
      try {
        const body = buildAutoCancelSms({
          appointmentStartIso: appointment.start_datetime,
          timezone: clinic.timezone
        });

        const smsResult = await smsProvider.send({
          to: appointment.phone,
          body
        });

        await finalizeMessage({
          appointmentId: appointment.id,
          channel: 'sms',
          template: 'auto_cancel_notice',
          providerMessageId: smsResult.providerMessageId,
          deliveryStatus: smsResult.deliveryStatus,
          raw: smsResult.raw
        });
      } catch (error) {
        logError('Auto-cancel SMS failed', error);
        await finalizeMessage({
          appointmentId: appointment.id,
          channel: 'sms',
          template: 'auto_cancel_notice',
          deliveryStatus: 'failed',
          raw: { error: String(error) }
        });
      }
    }

    await sendClinicCancellationNotice({
      clinic,
      appointment,
      reason: 'auto'
    });
  }
}

export async function sendConfirmedAckIfEnabled(input: {
  clinic: ClinicRow;
  appointment: AppointmentRow;
}): Promise<void> {
  if (!env.SEND_CONFIRMED_ACK) {
    return;
  }

  const slot = await reserveMessageSlot({
    appointmentId: input.appointment.id,
    channel: 'sms',
    template: 'confirmed_ack',
    to: input.appointment.phone
  });

  if (slot === 'skip') {
    return;
  }

  try {
    const smsProvider = getSmsProvider();
    const body = buildConfirmedAckSms({
      appointmentStartIso: input.appointment.start_datetime,
      timezone: input.clinic.timezone
    });

    const smsResult = await smsProvider.send({
      to: input.appointment.phone,
      body
    });

    await finalizeMessage({
      appointmentId: input.appointment.id,
      channel: 'sms',
      template: 'confirmed_ack',
      providerMessageId: smsResult.providerMessageId,
      deliveryStatus: smsResult.deliveryStatus,
      raw: smsResult.raw
    });
  } catch (error) {
    await finalizeMessage({
      appointmentId: input.appointment.id,
      channel: 'sms',
      template: 'confirmed_ack',
      deliveryStatus: 'failed',
      raw: { error: String(error) }
    });
  }
}

export async function notifyClinicForPatientCancellation(input: {
  clinic: ClinicRow;
  appointment: AppointmentRow;
}): Promise<void> {
  await sendClinicCancellationNotice({
    clinic: input.clinic,
    appointment: input.appointment,
    reason: 'patient'
  });
}