import { describe, expect, it } from 'vitest';
import { validateTokenRecord } from '../src/utils/tokenValidation';

describe('validateTokenRecord', () => {
  const nowIso = '2026-02-27T10:00:00.000Z';

  it('returns ok for valid token', () => {
    const result = validateTokenRecord({
      purpose: 'confirm',
      expectedPurpose: 'confirm',
      expiresAt: '2026-02-27T12:00:00.000Z',
      usedAt: null,
      nowIso
    });

    expect(result).toEqual({ ok: true });
  });

  it('rejects invalid purpose', () => {
    const result = validateTokenRecord({
      purpose: 'cancel',
      expectedPurpose: 'confirm',
      expiresAt: '2026-02-27T12:00:00.000Z',
      usedAt: null,
      nowIso
    });

    expect(result).toEqual({ ok: false, reason: 'invalid_purpose' });
  });

  it('rejects used token', () => {
    const result = validateTokenRecord({
      purpose: 'confirm',
      expectedPurpose: 'confirm',
      expiresAt: '2026-02-27T12:00:00.000Z',
      usedAt: '2026-02-27T09:00:00.000Z',
      nowIso
    });

    expect(result).toEqual({ ok: false, reason: 'used' });
  });

  it('rejects expired token', () => {
    const result = validateTokenRecord({
      purpose: 'confirm',
      expectedPurpose: 'confirm',
      expiresAt: '2026-02-27T08:00:00.000Z',
      usedAt: null,
      nowIso
    });

    expect(result).toEqual({ ok: false, reason: 'expired' });
  });
});