import { supabaseAdmin } from './supabase';
import type { MessageChannel, MessageRow, MessageTemplate } from '../types/domain';

function isUniqueConstraintError(error: { code?: string; message: string }): boolean {
  return error.code === '23505' || error.message.toLowerCase().includes('duplicate key');
}

export async function hasMessageForAppointment(
  appointmentId: string,
  channel: MessageChannel,
  template: MessageTemplate
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('messages')
    .select('id')
    .eq('appointment_id', appointmentId)
    .eq('channel', channel)
    .eq('template', template)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    throw error;
  }

  return Boolean(data);
}

export async function getMessageForAppointment(
  appointmentId: string,
  channel: MessageChannel,
  template: MessageTemplate
): Promise<MessageRow | null> {
  const { data, error } = await supabaseAdmin
    .from('messages')
    .select('*')
    .eq('appointment_id', appointmentId)
    .eq('channel', channel)
    .eq('template', template)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    throw error;
  }

  return (data as MessageRow | null) ?? null;
}

export async function reserveMessageSlot(input: {
  appointmentId: string;
  channel: MessageChannel;
  template: MessageTemplate;
  to: string;
}): Promise<'send' | 'skip'> {
  const existing = await getMessageForAppointment(input.appointmentId, input.channel, input.template);
  if (existing) {
    return existing.delivery_status === 'sent' ? 'skip' : 'send';
  }

  const { error } = await supabaseAdmin.from('messages').insert({
    appointment_id: input.appointmentId,
    channel: input.channel,
    template: input.template,
    to: input.to,
    sent_at: new Date().toISOString(),
    delivery_status: 'queued'
  });

  if (!error) {
    return 'send';
  }

  if (isUniqueConstraintError(error)) {
    const current = await getMessageForAppointment(input.appointmentId, input.channel, input.template);
    if (!current) {
      return 'skip';
    }

    return current.delivery_status === 'sent' ? 'skip' : 'send';
  }

  throw error;
}

export async function finalizeMessage(input: {
  appointmentId: string;
  channel: MessageChannel;
  template: MessageTemplate;
  providerMessageId?: string;
  deliveryStatus: string;
  raw?: unknown;
}): Promise<void> {
  const { error } = await supabaseAdmin
    .from('messages')
    .update({
      provider_message_id: input.providerMessageId ?? null,
      delivery_status: input.deliveryStatus,
      raw: input.raw ?? null,
      sent_at: new Date().toISOString()
    })
    .eq('appointment_id', input.appointmentId)
    .eq('channel', input.channel)
    .eq('template', input.template);

  if (error) {
    throw error;
  }
}

export async function listMessagesForAppointment(appointmentId: string): Promise<MessageRow[]> {
  const { data, error } = await supabaseAdmin
    .from('messages')
    .select('*')
    .eq('appointment_id', appointmentId)
    .order('sent_at', { ascending: false });

  if (error) {
    throw error;
  }

  return (data as MessageRow[]) ?? [];
}
