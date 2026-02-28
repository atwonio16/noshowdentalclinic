import twilio from 'twilio';
import type { SmsProvider, SmsSendInput, SmsSendResult } from './types';

export class TwilioSmsProvider implements SmsProvider {
  private readonly client: ReturnType<typeof twilio>;
  private readonly fromPhone: string;

  constructor(accountSid: string, authToken: string, fromPhone: string) {
    this.client = twilio(accountSid, authToken);
    this.fromPhone = fromPhone;
  }

  async send(input: SmsSendInput): Promise<SmsSendResult> {
    const response = await this.client.messages.create({
      from: this.fromPhone,
      to: input.to,
      body: input.body
    });

    return {
      providerMessageId: response.sid,
      deliveryStatus: response.status ?? 'queued',
      raw: response
    };
  }
}