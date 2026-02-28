import type { SmsProvider, SmsSendInput, SmsSendResult } from './types';
import { logInfo } from '../utils/logger';

export class DummySmsProvider implements SmsProvider {
  async send(input: SmsSendInput): Promise<SmsSendResult> {
    logInfo('Dummy SMS provider send', {
      to: input.to,
      body: input.body
    });

    return {
      providerMessageId: `dummy-${Date.now()}`,
      deliveryStatus: 'sent',
      raw: { provider: 'dummy' }
    };
  }
}