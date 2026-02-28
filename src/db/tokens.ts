import { randomBytes } from 'crypto';
import { DateTime } from 'luxon';
import { supabaseAdmin } from './supabase';
import type { TokenPurpose, TokenRow } from '../types/domain';

interface TokenWithAppointment extends TokenRow {
  appointments: {
    id: string;
    clinic_id: string;
    status: string;
    start_datetime: string;
    phone: string;
  } | null;
}

function generateTokenValue(): string {
  return randomBytes(24).toString('base64url');
}

export async function getValidTokenForAppointment(
  appointmentId: string,
  purpose: TokenPurpose,
  now: DateTime
): Promise<TokenRow | null> {
  const { data, error } = await supabaseAdmin
    .from('tokens')
    .select('*')
    .eq('appointment_id', appointmentId)
    .eq('purpose', purpose)
    .is('used_at', null)
    .gt('expires_at', now.toISO() ?? now.toUTC().toISO())
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as TokenRow | null) ?? null;
}

export async function createOrRotateToken(input: {
  appointmentId: string;
  purpose: TokenPurpose;
  expiresAtIso: string;
}): Promise<TokenRow> {
  const token = generateTokenValue();
  const { data, error } = await supabaseAdmin
    .from('tokens')
    .upsert(
      {
        appointment_id: input.appointmentId,
        purpose: input.purpose,
        token,
        expires_at: input.expiresAtIso,
        used_at: null
      },
      { onConflict: 'appointment_id,purpose' }
    )
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data as TokenRow;
}

export async function findTokenWithAppointment(token: string): Promise<TokenWithAppointment | null> {
  const { data, error } = await supabaseAdmin
    .from('tokens')
    .select(
      `
      *,
      appointments (
        id,
        clinic_id,
        status,
        start_datetime,
        phone
      )
    `
    )
    .eq('token', token)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as TokenWithAppointment | null) ?? null;
}

export async function markAllTokensUsedForAppointment(appointmentId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('appointment_id', appointmentId)
    .is('used_at', null);

  if (error) {
    throw error;
  }
}