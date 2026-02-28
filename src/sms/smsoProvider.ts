import type { SmsProvider, SmsSendInput, SmsSendResult } from './types';

type JsonRecord = Record<string, unknown>;

function readProviderMessageId(raw: unknown): string | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }

  const record = raw as JsonRecord;
  const candidate = record.responseToken ?? record.message_id ?? record.id ?? record.sms_id;
  return typeof candidate === 'string' ? candidate : typeof candidate === 'number' ? String(candidate) : undefined;
}

function readDeliveryStatus(raw: unknown): string {
  if (!raw || typeof raw !== 'object') {
    return 'queued';
  }

  const record = raw as JsonRecord;
  const status = record.status;
  if (typeof status === 'string' && status.trim()) {
    return status;
  }
  if (typeof status === 'boolean') {
    return status ? 'queued' : 'failed';
  }

  return 'queued';
}

function asErrorMessage(raw: unknown): string {
  if (!raw || typeof raw !== 'object') {
    return 'Unknown SMSO error';
  }

  const record = raw as JsonRecord;
  const message = record.messages ?? record.message ?? record.error ?? record.detail;
  if (typeof message === 'string' && message.trim()) {
    return message;
  }

  return 'Unknown SMSO error';
}

function toSenderValue(value: string): string | number {
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed);
  }
  return trimmed;
}

function toRecordArray(raw: unknown): JsonRecord[] {
  if (Array.isArray(raw)) {
    return raw.filter((item): item is JsonRecord => Boolean(item) && typeof item === 'object');
  }

  if (!raw || typeof raw !== 'object') {
    return [];
  }

  const record = raw as JsonRecord;
  const candidates = [record.data, record.senders, record.items];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter((item): item is JsonRecord => Boolean(item) && typeof item === 'object');
    }
  }

  return [];
}

function extractSenderId(raw: unknown): string | null {
  const rows = toRecordArray(raw);
  if (rows.length === 0) {
    return null;
  }

  const first = rows[0];
  const candidate = first.id ?? first.sender_id ?? first.senderId;
  if (typeof candidate === 'string' && candidate.trim()) {
    return candidate;
  }
  if (typeof candidate === 'number') {
    return String(candidate);
  }

  return null;
}

export class SmsoSmsProvider implements SmsProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly configuredSender: string | undefined;
  private discoveredSender: string | null = null;

  constructor(apiKey: string, sender?: string, baseUrl?: string) {
    this.apiKey = apiKey;
    this.configuredSender = sender?.trim() || undefined;
    this.baseUrl = (baseUrl?.trim() || 'https://app.smso.ro/api/v1').replace(/\/+$/, '');
  }

  private async fetchJson(path: string, init?: RequestInit): Promise<{ status: number; raw: unknown }> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        'X-Authorization': this.apiKey,
        ...(init?.headers ?? {})
      }
    });

    const text = await response.text();
    let raw: unknown = text;
    if (text) {
      try {
        raw = JSON.parse(text);
      } catch {
        raw = text;
      }
    }

    return { status: response.status, raw };
  }

  private async resolveSender(): Promise<string | number> {
    if (this.configuredSender) {
      return toSenderValue(this.configuredSender);
    }

    if (this.discoveredSender) {
      return toSenderValue(this.discoveredSender);
    }

    const { status, raw } = await this.fetchJson('/senders', { method: 'GET' });
    if (status < 200 || status >= 300) {
      throw new Error(`SMSO senders lookup failed (${status}): ${asErrorMessage(raw)}`);
    }

    const senderId = extractSenderId(raw);
    if (!senderId) {
      throw new Error('SMSO sender could not be auto-detected. Set SMSO_SENDER in environment.');
    }

    this.discoveredSender = senderId;
    return toSenderValue(senderId);
  }

  async send(input: SmsSendInput): Promise<SmsSendResult> {
    const sender = await this.resolveSender();

    const payload = new URLSearchParams();
    payload.set('sender', String(sender));
    payload.set('to', input.to);
    payload.set('body', input.body);

    const { status, raw } = await this.fetchJson('/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: payload.toString()
    });

    if (status < 200 || status >= 300) {
      throw new Error(`SMSO send failed (${status}): ${asErrorMessage(raw)}`);
    }

    return {
      providerMessageId: readProviderMessageId(raw),
      deliveryStatus: readDeliveryStatus(raw),
      raw
    };
  }
}
