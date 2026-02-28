import { env } from '../config/env';
import { logWarn } from '../utils/logger';
import { DummySmsProvider } from './dummyProvider';
import { TwilioSmsProvider } from './twilioProvider';
import type { SmsProvider } from './types';

let provider: SmsProvider | null = null;

export function getSmsProvider(): SmsProvider {
  if (provider) {
    return provider;
  }

  if (env.SMS_PROVIDER === 'twilio') {
    if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_FROM_PHONE) {
      logWarn('SMS_PROVIDER=twilio set, but Twilio env vars are incomplete. Falling back to Dummy provider.');
      provider = new DummySmsProvider();
      return provider;
    }

    provider = new TwilioSmsProvider(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN, env.TWILIO_FROM_PHONE);
    return provider;
  }

  provider = new DummySmsProvider();
  return provider;
}