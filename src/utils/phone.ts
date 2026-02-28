const CLEAN_CHARS_REGEX = /[\s().-]/g;

export function normalizeRomanianPhone(input: string): string {
  const raw = input.trim().replace(CLEAN_CHARS_REGEX, '');

  if (raw.length === 0) {
    throw new Error('Phone number is empty');
  }

  if (raw.startsWith('+40')) {
    const digits = raw.slice(3);
    if (/^\d{9}$/.test(digits)) {
      return `+40${digits}`;
    }
    throw new Error(`Invalid Romanian phone number: ${input}`);
  }

  if (raw.startsWith('40')) {
    const digits = raw.slice(2);
    if (/^\d{9}$/.test(digits)) {
      return `+40${digits}`;
    }
    throw new Error(`Invalid Romanian phone number: ${input}`);
  }

  if (raw.startsWith('0')) {
    const digits = raw.slice(1);
    if (/^\d{9}$/.test(digits)) {
      return `+40${digits}`;
    }
    throw new Error(`Invalid Romanian phone number: ${input}`);
  }

  throw new Error(`Invalid Romanian phone number: ${input}`);
}