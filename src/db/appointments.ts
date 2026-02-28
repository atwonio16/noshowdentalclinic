import { supabaseAdmin } from './supabase';
import type { AppointmentRow, AppointmentSource, AppointmentStatus } from '../types/domain';

export interface AppointmentUpsertInput {
  clinic_id: string;
  external_appointment_id: string;
  start_datetime: string;
  phone: string;
  appointment_type: string;
  patient_name: string | null;
  provider_name: string | null;
  source: AppointmentSource;
  status: AppointmentStatus;
}

export async function getAppointmentsInRange(
  clinicId: string,
  rangeStartUtcIso: string,
  rangeEndUtcIso: string
): Promise<AppointmentRow[]> {
  const { data, error } = await supabaseAdmin
    .from('appointments')
    .select('*')
    .eq('clinic_id', clinicId)
    .gte('start_datetime', rangeStartUtcIso)
    .lt('start_datetime', rangeEndUtcIso)
    .order('start_datetime', { ascending: true });

  if (error) {
    throw error;
  }

  return (data as AppointmentRow[]) ?? [];
}

export async function getAppointmentsByStatusInRange(
  clinicId: string,
  statuses: AppointmentStatus[],
  rangeStartUtcIso: string,
  rangeEndUtcIso: string
): Promise<AppointmentRow[]> {
  const { data, error } = await supabaseAdmin
    .from('appointments')
    .select('*')
    .eq('clinic_id', clinicId)
    .in('status', statuses)
    .gte('start_datetime', rangeStartUtcIso)
    .lt('start_datetime', rangeEndUtcIso)
    .order('start_datetime', { ascending: true });

  if (error) {
    throw error;
  }

  return (data as AppointmentRow[]) ?? [];
}

export async function upsertAppointments(rows: AppointmentUpsertInput[]): Promise<void> {
  if (rows.length === 0) {
    return;
  }

  const { error } = await supabaseAdmin
    .from('appointments')
    .upsert(rows, { onConflict: 'clinic_id,external_appointment_id,start_datetime' });

  if (error) {
    throw error;
  }
}

export async function markAppointmentsCanceledByPatient(ids: string[]): Promise<void> {
  if (ids.length === 0) {
    return;
  }

  const { error } = await supabaseAdmin
    .from('appointments')
    .update({ status: 'canceled_by_patient', updated_at: new Date().toISOString() })
    .in('id', ids)
    .eq('status', 'pending');

  if (error) {
    throw error;
  }
}

export async function setAppointmentStatus(
  appointmentId: string,
  status: AppointmentStatus,
  allowedCurrentStatuses?: AppointmentStatus[]
): Promise<AppointmentRow | null> {
  let query = supabaseAdmin
    .from('appointments')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', appointmentId);

  if (allowedCurrentStatuses && allowedCurrentStatuses.length > 0) {
    query = query.in('status', allowedCurrentStatuses);
  }

  const { data, error } = await query.select('*').maybeSingle();

  if (error) {
    throw error;
  }

  return (data as AppointmentRow | null) ?? null;
}

export async function getAppointmentById(appointmentId: string): Promise<AppointmentRow | null> {
  const { data, error } = await supabaseAdmin
    .from('appointments')
    .select('*')
    .eq('id', appointmentId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as AppointmentRow | null) ?? null;
}

export async function countAppointmentsByStatus(
  clinicId: string,
  rangeStartUtcIso: string,
  rangeEndUtcIso: string
): Promise<Record<AppointmentStatus, number> & { total: number }> {
  const appointments = await getAppointmentsInRange(clinicId, rangeStartUtcIso, rangeEndUtcIso);

  const counts: Record<AppointmentStatus, number> & { total: number } = {
    total: appointments.length,
    pending: 0,
    confirmed: 0,
    canceled_by_patient: 0,
    canceled_auto: 0
  };

  for (const appointment of appointments) {
    counts[appointment.status] += 1;
  }

  return counts;
}