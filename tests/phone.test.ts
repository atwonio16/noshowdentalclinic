import { describe, expect, it } from 'vitest';
import { normalizeRomanianPhone } from '../src/utils/phone';

describe('normalizeRomanianPhone', () => {
  it('normalizes +40 format', () => {
    expect(normalizeRomanianPhone('+40712345678')).toBe('+40712345678');
  });

  it('normalizes 0xxxxxxxxx format', () => {
    expect(normalizeRomanianPhone('0712345678')).toBe('+40712345678');
  });

  it('normalizes 40xxxxxxxxx format', () => {
    expect(normalizeRomanianPhone('40712345678')).toBe('+40712345678');
  });

  it('accepts separators and spaces', () => {
    expect(normalizeRomanianPhone('07 123 45 678')).toBe('+40712345678');
  });

  it('rejects invalid phone values', () => {
    expect(() => normalizeRomanianPhone('12345')).toThrow();
    expect(() => normalizeRomanianPhone('+401234')).toThrow();
  });
});