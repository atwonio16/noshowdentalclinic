import { supabaseAdmin } from './supabase';
import type { ClinicRow } from '../types/domain';

export async function getClinicById(clinicId: string): Promise<ClinicRow | null> {
  const { data, error } = await supabaseAdmin
    .from('clinics')
    .select('*')
    .eq('id', clinicId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as ClinicRow | null) ?? null;
}

export async function listClinics(): Promise<ClinicRow[]> {
  const { data, error } = await supabaseAdmin.from('clinics').select('*');

  if (error) {
    throw error;
  }

  return (data as ClinicRow[]) ?? [];
}

export async function updateClinicSettings(input: {
  clinicId: string;
  name: string;
  timezone: string;
  exportHour: number;
  deadlineHour: number;
}): Promise<ClinicRow> {
  const { data, error } = await supabaseAdmin
    .from('clinics')
    .update({
      name: input.name,
      timezone: input.timezone,
      export_hour: input.exportHour,
      deadline_hour: input.deadlineHour
    })
    .eq('id', input.clinicId)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data as ClinicRow;
}