import type { TokenPurpose } from '../types/domain';

export interface TokenValidationInput {
  purpose: TokenPurpose;
  expectedPurpose: TokenPurpose;
  expiresAt: string;
  usedAt: string | null;
  nowIso?: string;
}

export type TokenValidationResult =
  | { ok: true }
  | { ok: false; reason: 'invalid_purpose' | 'expired' | 'used' };

export function validateTokenRecord(input: TokenValidationInput): TokenValidationResult {
  if (input.purpose !== input.expectedPurpose) {
    return { ok: false, reason: 'invalid_purpose' };
  }

  if (input.usedAt) {
    return { ok: false, reason: 'used' };
  }

  const now = input.nowIso ? new Date(input.nowIso) : new Date();
  const expiresAt = new Date(input.expiresAt);

  if (Number.isNaN(now.getTime()) || Number.isNaN(expiresAt.getTime())) {
    return { ok: false, reason: 'expired' };
  }

  if (expiresAt.getTime() <= now.getTime()) {
    return { ok: false, reason: 'expired' };
  }

  return { ok: true };
}