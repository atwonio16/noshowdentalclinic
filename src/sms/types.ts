export interface SmsSendInput {
  to: string;
  body: string;
}

export interface SmsSendResult {
  providerMessageId?: string;
  deliveryStatus: string;
  raw?: unknown;
}

export interface SmsProvider {
  send(input: SmsSendInput): Promise<SmsSendResult>;
}